import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const chromePath = "/usr/bin/google-chrome";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const contentTypeFor = (filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  const contentType = contentTypes[extension];
  if (!contentType) throw new Error(`Content-Type未定義です: ${filePath}`);
  return contentType;
};

const startLocalSite = async () => {
  const server = createServer((request, response) => {
    const serve = async () => {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
      }

      let baseDirectory;
      let relativePath;
      if (pathname === "/") {
        baseDirectory = path.join(root, "web");
        relativePath = "index.html";
      } else if (pathname.startsWith("/data/")) {
        baseDirectory = root;
        relativePath = pathname.slice(1);
      } else {
        baseDirectory = path.join(root, "web");
        relativePath = pathname.slice(1);
      }

      const filePath = path.resolve(baseDirectory, relativePath);
      assert(
        filePath === baseDirectory || filePath.startsWith(`${baseDirectory}${path.sep}`),
        `公開ディレクトリ外を参照しています: ${pathname}`,
      );
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentTypeFor(filePath), "cache-control": "no-store" });
      response.end(body);
    };

    serve().catch((error) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error.stack);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "ローカルHTTPサーバのポートを取得できません");
  return { server, url: `http://127.0.0.1:${address.port}/` };
};

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) throw new Error(`未知のCDP応答です: ${message.id}`);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        else pending.resolve(message.result);
        return;
      }
      const handlers = this.listeners.get(message.method);
      if (!handlers) return;
      for (const handler of handlers) handler(message.params);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  on(method, handler) {
    const handlers = this.listeners.get(method);
    if (handlers) handlers.push(handler);
    else this.listeners.set(method, [handler]);
  }

  close() {
    this.socket.close();
  }
}

const waitForChrome = async () => {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:9222/json/list");
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page");
        if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Chrome DevTools Protocolへ接続できません${lastError ? `: ${lastError.message}` : ""}`);
};

const eventually = async (label, callback, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await callback()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`${label}を確認できません${lastError ? `: ${lastError.message}` : ""}`);
};

const runBrowserSmoke = async (baseUrl) => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "one-tap-quiz-chrome-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });

  let client;
  try {
    const webSocketUrl = await waitForChrome();
    client = new CdpClient(webSocketUrl);
    const runtimeExceptions = [];
    const networkFailures = [];
    const requestedUrls = [];

    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      runtimeExceptions.push(exceptionDetails.exception?.description || exceptionDetails.text);
    });
    client.on("Network.requestWillBeSent", ({ request }) => {
      requestedUrls.push(request.url);
    });
    client.on("Network.responseReceived", ({ response }) => {
      if (response.status >= 400 && !response.url.endsWith("/favicon.ico")) {
        networkFailures.push(`HTTP ${response.status}: ${response.url}`);
      }
    });
    client.on("Network.loadingFailed", ({ errorText, canceled, requestId }) => {
      if (!canceled) networkFailures.push(`読み込み失敗 ${requestId}: ${errorText}`);
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      }
      return result.result.value;
    };

    await client.send("Page.navigate", { url: baseUrl });
    await eventually("応用情報80問の初期表示", async () => (
      await evaluate("document.querySelectorAll('.sd-question').length") === 80
    ));

    const initial = await evaluate(`(() => ({
      title: document.querySelector('#title').textContent,
      exams: Array.from(document.querySelector('#exam-select').options).map((option) => option.value),
      sessions: Array.from(document.querySelector('#session-select').options).map((option) => option.value),
      referenceHidden: document.querySelector('#reference-link').hidden,
      summary: document.querySelector('#summary').textContent
    }))()`);
    assert(initial.title.includes("応用情報技術者試験"), `応用情報が表示されていません: ${initial.title}`);
    assert(initial.exams.join(",") === "ap,g-test", `試験一覧が不正です: ${initial.exams.join(",")}`);
    assert(initial.sessions.join(",") === "2023-autumn,2024-spring,2024-autumn,2025-spring,2025-autumn", `応用情報の試験回一覧が不正です: ${initial.sessions.join(",")}`);
    assert(initial.referenceHidden === true, "応用情報で公式問題リンクが誤表示されています");
    assert(initial.summary.includes("収録 80 / 80問"), `応用情報の収録数表示が不正です: ${initial.summary}`);

    await evaluate(`(() => {
      localStorage.clear();
      const choice = document.querySelector('.sd-selectbase__label');
      if (!choice) throw new Error('回答選択肢がありません');
      choice.click();
      return true;
    })()`);
    await eventually("1タップ回答", async () => (
      (await evaluate("document.querySelector('#summary').textContent")).includes("回答済み 1 / 80")
    ));
    const apStorageKeys = await evaluate("Object.keys(localStorage)");
    assert(apStorageKeys.length === 1, `応用情報の保存キー数が不正です: ${apStorageKeys.length}`);
    const apStorageKey = apStorageKeys[0];

    await client.send("Page.reload", { ignoreCache: true });
    await eventually("再読み込み後の回答復元", async () => (
      (await evaluate("document.querySelector('#summary')?.textContent || ''")).includes("回答済み 1 / 80")
    ));

    await evaluate(`(() => {
      const select = document.querySelector('#exam-select');
      select.value = 'g-test';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("G検定20問への切替", async () => (
      await evaluate("document.querySelectorAll('.sd-question').length") === 20
    ));
    const gTest = await evaluate(`(() => ({
      title: document.querySelector('#title').textContent,
      sessionTitle: document.querySelector('#session-select').selectedOptions[0].textContent,
      referenceHidden: document.querySelector('#reference-link').hidden,
      referenceUrl: document.querySelector('#reference-link').href
    }))()`);
    assert(gTest.title.includes("G検定"), `G検定へ切り替わっていません: ${gTest.title}`);
    assert(gTest.sessionTitle === "JDLA公式公開20問 回答シート", `G検定の試験回表示が不正です: ${gTest.sessionTitle}`);
    assert(gTest.referenceHidden === false, "G検定の公式問題リンクが表示されていません");
    assert(gTest.referenceUrl === "https://www.jdla.org/certificate/general/issues/", `G検定の公式問題リンクが不正です: ${gTest.referenceUrl}`);
    assert(!requestedUrls.some((url) => url.includes("/js/quiz/reference.js")), "削除済みreference.jsがブラウザから要求されています");
    assert(runtimeExceptions.length === 0, `通常操作中にJavaScript例外が発生しました:\n${runtimeExceptions.join("\n")}`);
    assert(networkFailures.length === 0, `通常操作中にネットワーク失敗が発生しました:\n${networkFailures.join("\n")}`);

    await evaluate(`(() => {
      localStorage.setItem(${JSON.stringify(apStorageKey)}, '{');
      const select = document.querySelector('#exam-select');
      select.value = 'ap';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await eventually("壊れた保存データのFATAL表示", async () => (
      (await evaluate("document.body.innerText")).startsWith("FATAL ERROR")
    ));
    const fatalText = await evaluate("document.body.innerText");
    assert(fatalText.includes("SyntaxError"), `壊れた保存データが派手に失敗していません:\n${fatalText}`);

    console.log(`ブラウザ実動作確認に成功しました: ${baseUrl}`);
  } finally {
    if (client) client.close();
    chrome.kill("SIGKILL");
    await rm(profile, { recursive: true, force: true });
  }
};

let localSite;
try {
  let baseUrl = process.argv[2];
  if (!baseUrl) {
    localSite = await startLocalSite();
    baseUrl = localSite.url;
  }
  await runBrowserSmoke(baseUrl);
} finally {
  if (localSite) await new Promise((resolve, reject) => localSite.server.close((error) => error ? reject(error) : resolve()));
}
