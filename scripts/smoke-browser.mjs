import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const chromePath = "/usr/bin/google-chrome";
const screenshotDirectory = path.join(root, "artifacts", "browser-smoke");
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

const stopChrome = async (chrome) => {
  if (chrome.exitCode !== null || chrome.signalCode !== null) return;
  const exited = new Promise((resolve) => chrome.once("exit", resolve));
  chrome.kill("SIGKILL");
  await exited;
};

const runBrowserSmoke = async (baseUrl) => {
  await mkdir(screenshotDirectory, { recursive: true });
  const runLabel = new URL(baseUrl).hostname === "127.0.0.1" ? "local" : "production";
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
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

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

    const captureScreenshot = async (name) => {
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      });
      const filePath = path.join(screenshotDirectory, `${runLabel}-${name}.png`);
      await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
      console.log(`スクリーンショット: ${filePath}`);
    };

    await client.send("Page.navigate", { url: baseUrl });
    await eventually("応用情報80問の初期表示", async () => (
      await evaluate("document.querySelectorAll('.sd-question').length") === 80
    ));

    const initial = await evaluate(`(() => ({
      title: document.querySelector('#title').textContent,
      exam: document.querySelector('#exam-select').value,
      session: document.querySelector('#session-select').value,
      exams: Array.from(document.querySelector('#exam-select').options).map((option) => option.value),
      sessions: Array.from(document.querySelector('#session-select').options).map((option) => option.value),
      referenceHidden: document.querySelector('#reference-link').hidden,
      summary: document.querySelector('#summary').textContent
    }))()`);
    assert(initial.title.includes("応用情報技術者試験") && initial.title.includes("2025年度秋期"), `応用情報2025年度秋期が表示されていません: ${initial.title}`);
    assert(initial.exam === "ap" && initial.session === "2025-autumn", `初期選択が不正です: ${initial.exam}/${initial.session}`);
    assert(initial.exams.join(",") === "ap,g-test", `試験一覧が不正です: ${initial.exams.join(",")}`);
    assert(initial.sessions.join(",") === "2023-autumn,2024-spring,2024-autumn,2025-spring,2025-autumn", `応用情報の試験回一覧が不正です: ${initial.sessions.join(",")}`);
    assert(initial.referenceHidden === true, "応用情報で公式問題リンクが誤表示されています");
    assert(initial.summary.includes("収録 80 / 80問"), `応用情報の収録数表示が不正です: ${initial.summary}`);
    await captureScreenshot("01-ap-2025-autumn");

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
      exam: document.querySelector('#exam-select').value,
      session: document.querySelector('#session-select').value,
      sessionTitle: document.querySelector('#session-select').selectedOptions[0].textContent,
      referenceHidden: document.querySelector('#reference-link').hidden,
      referenceUrl: document.querySelector('#reference-link').href
    }))()`);
    assert(gTest.title.includes("G検定"), `G検定へ切り替わっていません: ${gTest.title}`);
    assert(gTest.exam === "g-test" && gTest.session === "official-past-questions", `G検定の選択状態が不正です: ${gTest.exam}/${gTest.session}`);
    assert(gTest.sessionTitle === "JDLA公式公開20問 回答シート", `G検定の試験回表示が不正です: ${gTest.sessionTitle}`);
    assert(gTest.referenceHidden === false, "G検定の公式問題リンクが表示されていません");
    assert(gTest.referenceUrl === "https://www.jdla.org/certificate/general/issues/", `G検定の公式問題リンクが不正です: ${gTest.referenceUrl}`);
    await captureScreenshot("02-g-test");

    await evaluate(`(() => {
      const select = document.querySelector('#exam-select');
      select.value = 'ap';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("G検定から応用情報2025年度秋期へ戻る切替", async () => (
      (await evaluate("document.querySelectorAll('.sd-question').length")) === 80
      && (await evaluate("document.querySelector('#title').textContent")).includes("2025年度秋期")
    ));
    const returned = await evaluate(`(() => ({
      exam: document.querySelector('#exam-select').value,
      session: document.querySelector('#session-select').value,
      title: document.querySelector('#title').textContent
    }))()`);
    assert(returned.exam === "ap" && returned.session === "2025-autumn", `応用情報へ戻った選択状態が不正です: ${returned.exam}/${returned.session}`);
    assert(returned.title.includes("応用情報技術者試験") && returned.title.includes("2025年度秋期"), `応用情報2025年度秋期へ戻っていません: ${returned.title}`);
    await captureScreenshot("03-ap-returned-2025-autumn");

    await evaluate(`(() => {
      const select = document.querySelector('#session-select');
      select.value = '2024-spring';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("応用情報2024年度春期への試験回切替", async () => (
      (await evaluate("document.querySelectorAll('.sd-question').length")) === 80
      && (await evaluate("document.querySelector('#title').textContent")).includes("2024年度春期")
    ));
    const spring2024 = await evaluate(`(() => ({
      exam: document.querySelector('#exam-select').value,
      session: document.querySelector('#session-select').value,
      title: document.querySelector('#title').textContent
    }))()`);
    assert(spring2024.exam === "ap" && spring2024.session === "2024-spring", `試験回切替後の選択状態が不正です: ${spring2024.exam}/${spring2024.session}`);
    assert(spring2024.title.includes("2024年度春期"), `2024年度春期へ切り替わっていません: ${spring2024.title}`);
    await captureScreenshot("04-ap-2024-spring");

    await evaluate(`(() => {
      const select = document.querySelector('#session-select');
      select.value = '2023-autumn';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.value = '2025-spring';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("連続切替後に最後の2025年度春期を表示", async () => (
      (await evaluate("document.querySelector('#session-select').value")) === "2025-spring"
      && (await evaluate("document.querySelector('#title').textContent")).includes("2025年度春期")
      && (await evaluate("document.querySelectorAll('.sd-question').length")) === 80
    ));
    await captureScreenshot("05-ap-fast-switch-2025-spring");

    assert(!requestedUrls.some((url) => url.includes("/js/quiz/reference.js")), "削除済みreference.jsがブラウザから要求されています");
    assert(runtimeExceptions.length === 0, `通常操作中にJavaScript例外が発生しました:\n${runtimeExceptions.join("\n")}`);
    assert(networkFailures.length === 0, `通常操作中にネットワーク失敗が発生しました:\n${networkFailures.join("\n")}`);

    await client.send("Network.setBlockedURLs", { urls: ["*2023-autumn/manifest.json*"] });
    await evaluate(`(() => {
      const select = document.querySelector('#session-select');
      select.value = '2023-autumn';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("読み込み失敗のFATAL表示", async () => (
      (await evaluate("document.body.innerText")).startsWith("FATAL ERROR")
    ));
    const loadFatalText = await evaluate("document.body.innerText");
    assert(loadFatalText.includes("試験: ap"), `FATAL画面に試験IDがありません:\n${loadFatalText}`);
    assert(loadFatalText.includes("試験回: 2023-autumn"), `FATAL画面に試験回IDがありません:\n${loadFatalText}`);
    assert(loadFatalText.includes("読み込みに失敗しました"), `読み込み失敗理由がFATAL画面にありません:\n${loadFatalText}`);
    assert(loadFatalText.includes("2023-autumn/manifest.json"), `失敗URLがFATAL画面にありません:\n${loadFatalText}`);
    await captureScreenshot("06-load-fatal");

    await client.send("Network.setBlockedURLs", { urls: [] });
    await client.send("Page.navigate", { url: baseUrl });
    await eventually("FATAL後の再読込", async () => (
      (await evaluate("document.querySelectorAll('.sd-question').length")) === 80
      && (await evaluate("document.querySelector('#session-select').value")) === "2025-autumn"
    ));

    await evaluate(`(() => {
      localStorage.setItem(${JSON.stringify(apStorageKey)}, '{');
      window.location.reload();
      return true;
    })()`);
    await eventually("壊れた保存データのFATAL表示", async () => (
      (await evaluate("document.body.innerText")).startsWith("FATAL ERROR")
    ));
    const fatalText = await evaluate("document.body.innerText");
    assert(fatalText.includes("SyntaxError"), `壊れた保存データが派手に失敗していません:\n${fatalText}`);
    await captureScreenshot("07-storage-fatal");

    console.log(`ブラウザ実動作確認に成功しました: ${baseUrl}`);
  } finally {
    if (client) client.close();
    await stopChrome(chrome);
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
