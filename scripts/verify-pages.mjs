import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const baseUrlText = process.argv[2];

if (!baseUrlText) {
  throw new Error("GitHub PagesのURLを指定してください");
}

const baseUrl = new URL(baseUrlText.endsWith("/") ? baseUrlText : `${baseUrlText}/`);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
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

const fetchProductionText = async (publicPath) => {
  const url = new URL(publicPath, baseUrl);
  url.searchParams.set("verify", process.env.GITHUB_SHA || String(Date.now()));

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`${url} の取得に失敗しました: HTTP ${response.status}`);
  }
  return response.text();
};

const verifyFile = async (filePath) => {
  const expected = await readFile(filePath, "utf8");
  const publicPath = publicPathFor(filePath);
  let lastError;

  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const actual = await fetchProductionText(publicPath);
      if (actual !== expected) {
        throw new Error(`公開内容がデプロイ元と一致しません: ${publicPath || "/"}`);
      }
      console.log(`確認: ${publicPath || "/"}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 12) await sleep(5000);
    }
  }

  throw lastError;
};

const files = [
  ...(await walk(path.join(root, "web"))),
  ...(await walk(path.join(root, "data"))),
].sort();

for (const file of files) {
  await verifyFile(file);
}

console.log(`GitHub Pagesの本番確認に成功しました: ${baseUrl}`);
