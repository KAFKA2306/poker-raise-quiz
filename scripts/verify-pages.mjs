import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrlText = process.argv[2];
if (!baseUrlText) throw new Error("GitHub PagesのURLを指定してください");

const baseUrl = new URL(baseUrlText.endsWith("/") ? baseUrlText : `${baseUrlText}/`);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
};

const publicPathFor = (filePath) => {
  const relative = path.relative(root, filePath).split(path.sep).join("/");
  if (relative === "web/index.html") return "";
  if (relative.startsWith("web/")) return relative.slice("web/".length);
  return relative;
};

const fetchProductionBytes = async (publicPath) => {
  const url = new URL(publicPath, baseUrl);
  url.searchParams.set("verify", process.env.GITHUB_SHA || String(Date.now()));
  const response = await fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } });
  if (!response.ok) throw new Error(`${url} の取得に失敗しました: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const verifyFile = async (filePath) => {
  const expected = await readFile(filePath);
  const publicPath = publicPathFor(filePath);
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      const actual = await fetchProductionBytes(publicPath);
      if (!actual.equals(expected)) throw new Error(`公開内容がデプロイ元と一致しません: ${publicPath || "/"}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 8) await sleep(3000);
    }
  }
  throw lastError;
};

const files = [
  ...await walk(path.join(root, "web")),
  ...await walk(path.join(root, "data")),
].sort();

let cursor = 0;
const worker = async () => {
  while (cursor < files.length) {
    const index = cursor;
    cursor += 1;
    await verifyFile(files[index]);
  }
};

const workerCount = Math.min(16, files.length);
await Promise.all(Array.from({ length: workerCount }, () => worker()));

const manifest = JSON.parse(await readFile(path.join(root, "data/exams/applied-information/manifest.json"), "utf8"));
if (manifest.coverage?.sessions !== 21 || manifest.coverage?.questions !== 1680) {
  throw new Error("公開前データが21回・1680問ではありません");
}

console.log(`GitHub Pages本番確認に成功しました: ${files.length}ファイル、応用情報21回・1680問、${baseUrl}`);
