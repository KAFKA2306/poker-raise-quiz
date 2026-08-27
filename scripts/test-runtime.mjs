import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const importSource = async (relativePath) => {
  const source = await readFile(path.join(root, relativePath), "utf8");
  const encoded = Buffer.from(source).toString("base64");
  return import(`data:text/javascript;base64,${encoded}#${encodeURIComponent(relativePath)}`);
};

const fileResponse = async (input) => {
  const url = new URL(String(input));
  assert.equal(url.origin, "https://quiz.test", `想定外のfetch先です: ${url}`);
  assert.ok(url.pathname.startsWith("/data/"), `data以外をfetchしています: ${url}`);
  const relative = decodeURIComponent(url.pathname.slice(1));
  try {
    const text = await readFile(path.join(root, relative), "utf8");
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(text),
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return {
      ok: false,
      status: 404,
      json: async () => {
        throw new Error(`404をJSONとして読もうとしました: ${url}`);
      },
    };
  }
};

globalThis.document = { baseURI: "https://quiz.test/" };
globalThis.fetch = fileResponse;

const dataModule = await importSource("web/js/quiz/data.js");
const catalog = await dataModule.loadQuizCatalog();
assert.equal(catalog.defaultExam, "ap");
assert.ok(catalog.exams.length >= 6, "試験一覧が欠落しています");

const byId = Object.fromEntries(catalog.exams.map((exam) => [exam.id, exam]));
for (const id of ["ap", "g-test", "statistics-grade-2", "pds-management", "pds-data-ai", "pds-system"]) {
  assert.ok(byId[id], `試験一覧にありません: ${id}`);
}

const applied = await dataModule.loadQuiz(byId.ap);
assert.equal(applied.dataset.contentMode, "full-question");
assert.equal(applied.dataset.isFullExam, false);
assert.equal(applied.elements.length, 10);

const gTest = await dataModule.loadQuiz(byId["g-test"]);
assert.equal(gTest.dataset.contentMode, "reference-answer-sheet");
assert.equal(gTest.dataset.isFullExam, false);
assert.equal(gTest.elements.length, 20);
assert.deepEqual(gTest.elements.map((question) => question.questionNo), Array.from({ length: 20 }, (_, index) => index + 1));
assert.deepEqual(gTest.elements.map((question) => question.correctAnswer), ["A","D","A","C","A","A","D","D","A","C","A","A","B","A","A","C","D","D","D","C"]);
assert.ok(gTest.elements.every((question) => question.referenceOnly === true));
assert.ok(gTest.elements.every((question) => question.choices.map((choice) => choice.value).join("") === "ABCD"));

const statistics = await dataModule.loadQuiz(byId["statistics-grade-2"]);
assert.equal(statistics.dataset.status, "metadata-only");
assert.equal(statistics.elements.length, 0);

for (const id of ["pds-management", "pds-data-ai", "pds-system"]) {
  const upcoming = await dataModule.loadQuiz(byId[id]);
  assert.equal(upcoming.dataset.status, "upcoming");
  assert.equal(upcoming.elements.length, 0);
}

await assert.rejects(() => dataModule.loadQuiz({}), /試験manifestが不正です/);

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, value),
};

const sessionModule = await importSource("web/js/quiz/session.js");
const storageKey = sessionModule.storageKeyFor({ id: "g-test:official-past-questions", version: "v1" });
assert.deepEqual(sessionModule.loadSession(storageKey), {});

sessionModule.saveSession(storageKey, { gq001: { answer: "A", correct: true } });
assert.deepEqual(sessionModule.loadSession(storageKey), { gq001: { answer: "A", correct: true } });

storage.set(storageKey, "{broken-json");
assert.throws(() => sessionModule.loadSession(storageKey), SyntaxError);
storage.set(storageKey, "[]");
assert.throws(() => sessionModule.loadSession(storageKey), /保存済み回答が壊れています/);
assert.throws(() => sessionModule.storageKeyFor({ id: "x" }), /問題集versionがありません/);
assert.throws(() => sessionModule.saveSession(storageKey, []), /保存する回答状態が不正です/);

console.log("ブラウザ用ランタイムテストに成功しました");
