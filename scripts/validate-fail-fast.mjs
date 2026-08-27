import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const readJson = async (relativePath) => JSON.parse(await read(relativePath));

const sessionSource = await read("web/js/quiz/session.js");
assert.ok(!sessionSource.includes("catch"), "回答保存処理で例外を握りつぶしてはいけません");
assert.ok(!sessionSource.includes('dataset.version ||'), "問題集versionにfallbackを置いてはいけません");
assert.ok(!sessionSource.includes('localStorage.getItem(key) ||'), "壊れた保存状態を空状態へfallbackしてはいけません");
assert.match(sessionSource, /JSON\.parse\(raw\)/, "保存済みJSONはそのままparseして壊れていれば失敗させます");

const dataSource = await read("web/js/quiz/data.js");
for (const forbidden of [
  "catalog.exams || []",
  "exam.sessions || []",
  "session.modules || []",
  'scopeVersion || "metadata-only"',
  'plannedStart || "upcoming"',
  'contentMode || "full-question"',
  "isFullExam !== false",
  "officialUrls || {}",
]) {
  assert.ok(!dataSource.includes(forbidden), `データローダーにfallbackが残っています: ${forbidden}`);
}
assert.match(dataSource, /isFullExam がありません/, "isFullExam欠落時は失敗させる必要があります");

const mainSource = await read("web/js/main.js");
assert.ok(!mainSource.includes("try {"), "画面処理でtry/catchによる復旧をしてはいけません");
assert.ok(!mainSource.includes("catch ("), "画面処理で例外を握りつぶしてはいけません");
assert.ok(!mainSource.includes("if (!exam) return"), "未知の試験IDを無視してはいけません");
assert.ok(!mainSource.includes("? requestedExam : catalog.defaultExam"), "未知のURL試験IDを既定試験へfallbackしてはいけません");
assert.match(mainSource, /FATAL/, "例外時は画面上で明示的にクラッシュを表示する必要があります");
assert.match(mainSource, /URLで指定された試験が存在しません/, "未知の試験IDは明示的に失敗させる必要があります");

const catalog = await readJson("data/catalog.json");
for (const examEntry of catalog.exams) {
  const exam = await readJson(path.join("data", examEntry.manifest));
  if (exam.contentMode === "metadata-only" || exam.status === "upcoming") continue;
  assert.equal(typeof exam.defaultSession, "string", `既定の試験回がありません: ${exam.id}`);
  for (const sessionEntry of exam.sessions) {
    const sessionPath = path.join(path.dirname(path.join("data", examEntry.manifest)), sessionEntry.manifest);
    const session = await readJson(sessionPath);
    assert.ok(["full-question", "reference-answer-sheet"].includes(session.contentMode), `contentModeを明示してください: ${exam.id}:${session.id}`);
    assert.equal(typeof session.isFullExam, "boolean", `isFullExamを明示してください: ${exam.id}:${session.id}`);
  }
}

console.log("fail-fast契約の確認に成功しました");
