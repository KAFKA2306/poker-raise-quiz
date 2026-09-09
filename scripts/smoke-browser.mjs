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
      assert(filePath === baseDirectory || filePath.startsWith(`${baseDirectory}${path.sep}`), `公開ディレクトリ外を参照しています: ${pathname}`);
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
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
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

    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => runtimeExceptions.push(exceptionDetails.exception?.description || exceptionDetails.text));
    client.on("Network.requestWillBeSent", ({ request }) => requestedUrls.push(request.url));
    client.on("Network.responseReceived", ({ response }) => {
      if (response.status >= 400 && !response.url.endsWith("/favicon.ico")) networkFailures.push(`HTTP ${response.status}: ${response.url}`);
    });
    client.on("Network.loadingFailed", ({ errorText, canceled, requestId }) => {
      if (!canceled) networkFailures.push(`読み込み失敗 ${requestId}: ${errorText}`);
    });

    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Network.enable");
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    const evaluate = async (expression) => {
      const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };

    const captureScreenshot = async (name) => {
      const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const filePath = path.join(screenshotDirectory, `${runLabel}-${name}.png`);
      await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
      console.log(`スクリーンショット: ${filePath}`);
    };

    await client.send("Page.navigate", { url: baseUrl });
    await eventually("応用情報の最初の問題範囲", async () => await evaluate("document.querySelectorAll('.sd-question').length") === 20);

    const initial = await evaluate(`(() => ({
      title: document.querySelector('#title').textContent,
      exam: document.querySelector('#exam-select').value,
      session: document.querySelector('#session-select').value,
      modules: Array.from(document.querySelector('#module-select').options).map((option) => option.textContent),
      module: document.querySelector('#module-select').value,
      summary: document.querySelector('#summary').textContent
    }))()`);
    assert(initial.title.includes("応用情報技術者試験") && initial.title.includes("2025年度秋期"), `初期タイトルが不正です: ${initial.title}`);
    assert(initial.exam === "ap" && initial.session === "2025-autumn", `初期選択が不正です: ${initial.exam}/${initial.session}`);
    assert(initial.modules.join(",") === "問1〜20,問21〜40,問41〜60,問61〜80", `問題範囲が不正です: ${initial.modules.join(",")}`);
    assert(initial.module === "0", `初期問題範囲が不正です: ${initial.module}`);
    assert(initial.summary.includes("回答済み 0 / 80") && initial.summary.includes("収録 80 / 80問"), `初期集計が不正です: ${initial.summary}`);
    assert(requestedUrls.some((url) => url.includes("q001-q020.json")), "初期問題範囲が読み込まれていません");
    assert(!requestedUrls.some((url) => /q0(21-40|41-60|61-80)\.json/.test(url)), "初期表示で後続モジュールまで読み込んでいます");
    await captureScreenshot("01-ap-first-range");

    await evaluate(`(() => {
      localStorage.clear();
      const choice = document.querySelector('.sd-selectbase__label');
      if (!choice) throw new Error('回答選択肢がありません');
      choice.click();
      return true;
    })()`);
    await eventually("1タップ回答", async () => (await evaluate("document.querySelector('#summary').textContent")).includes("回答済み 1 / 80"));
    const apStorageKeys = await evaluate("Object.keys(localStorage)");
    assert(apStorageKeys.length === 1, `保存キー数が不正です: ${apStorageKeys.length}`);

    await evaluate(`(() => {
      const select = document.querySelector('#module-select');
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("問21〜40への切替", async () => (
      await evaluate("document.querySelectorAll('.sd-question').length") === 20
      && (await evaluate("document.querySelector('#module-select').value")) === "1"
    ));
    const secondRange = await evaluate(`(() => ({
      summary: document.querySelector('#summary').textContent,
      firstQuestion: document.querySelector('.sd-question__title')?.textContent || ''
    }))()`);
    assert(secondRange.summary.includes("回答済み 1 / 80"), `範囲切替で回答集計が失われました: ${secondRange.summary}`);
    assert(secondRange.firstQuestion.includes("問21"), `問21から始まっていません: ${secondRange.firstQuestion}`);
    assert(requestedUrls.some((url) => url.includes("q021-q040.json")), "選択した第2モジュールが読み込まれていません");
    assert(!requestedUrls.some((url) => url.includes("q041-q060.json") || url.includes("q061-q080.json")), "未選択モジュールまで読み込んでいます");
    await captureScreenshot("02-ap-second-range");

    await client.send("Page.reload", { ignoreCache: true });
    await eventually("再読み込み後の回答復元", async () => (
      (await evaluate("document.querySelectorAll('.sd-question').length")) === 20
      && (await evaluate("document.querySelector('#summary')?.textContent || ''")).includes("回答済み 1 / 80")
    ));

    await evaluate(`(() => {
      const select = document.querySelector('#exam-select');
      select.value = 'g-test';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("G検定の最初の10問への切替", async () => await evaluate("document.querySelectorAll('.sd-question').length") === 10);
    const gTest = await evaluate(`(() => ({
      title: document.querySelector('#title').textContent,
      session: document.querySelector('#session-select').value,
      modules: Array.from(document.querySelector('#module-select').options).map((option) => option.textContent),
      referenceHidden: document.querySelector('#reference-link').hidden,
      referenceUrl: document.querySelector('#reference-link').href
    }))()`);
    assert(gTest.title.includes("G検定"), `G検定へ切り替わっていません: ${gTest.title}`);
    assert(gTest.session === "official-past-questions", `G検定の試験回が不正です: ${gTest.session}`);
    assert(gTest.modules.join(",") === "問1〜10,問11〜20", `G検定の問題範囲が不正です: ${gTest.modules.join(",")}`);
    assert(gTest.referenceHidden === false && gTest.referenceUrl === "https://www.jdla.org/certificate/general/issues/", "G検定の公式問題リンクが不正です");
    await captureScreenshot("03-g-test-first-range");

    await evaluate(`(() => {
      const select = document.querySelector('#exam-select');
      select.value = 'ap';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("応用情報へ戻る", async () => (
      (await evaluate("document.querySelectorAll('.sd-question').length")) === 20
      && (await evaluate("document.querySelector('#title').textContent")).includes("2025年度秋期")
    ));

    await client.send("Network.setBlockedURLs", { urls: ["*q021-q040.json*"] });
    await evaluate(`(() => {
      const select = document.querySelector('#module-select');
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("モジュール単位の失敗表示", async () => await evaluate("Boolean(document.querySelector('.module-error'))"));
    const localizedFailure = await evaluate(`(() => ({
      fatal: document.body.innerText.startsWith('FATAL ERROR'),
      text: document.querySelector('.module-error').innerText,
      moduleSelect: Boolean(document.querySelector('#module-select'))
    }))()`);
    assert(localizedFailure.fatal === false, "1モジュールの失敗でページ全体がFATALになりました");
    assert(localizedFailure.text.includes("問21〜40を読み込めませんでした") && localizedFailure.text.includes("再読み込み"), `局所エラー表示が不十分です: ${localizedFailure.text}`);
    assert(localizedFailure.moduleSelect, "モジュール失敗時に問題範囲切替が失われました");
    await captureScreenshot("04-module-error");

    await client.send("Network.setBlockedURLs", { urls: [] });
    await evaluate(`(() => {
      const select = document.querySelector('#module-select');
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()`);
    await eventually("別範囲への復旧", async () => (
      (await evaluate("document.querySelectorAll('.sd-question').length")) === 20
      && (await evaluate("document.querySelector('#module-select').value")) === "2"
    ));

    assert(!requestedUrls.some((url) => url.includes("/js/quiz/reference.js")), "削除済みreference.jsがブラウザから要求されています");
    assert(runtimeExceptions.length === 0, `通常操作中にJavaScript例外が発生しました:\n${runtimeExceptions.join("\n")}`);
    const unexpectedNetworkFailures = networkFailures.filter((failure) => !failure.includes("q021-q040.json"));
    assert(unexpectedNetworkFailures.length === 0, `通常操作中にネットワーク失敗が発生しました:\n${unexpectedNetworkFailures.join("\n")}`);

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
