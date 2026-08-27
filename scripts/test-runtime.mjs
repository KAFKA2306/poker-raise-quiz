import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const importSource = async (relativePath) => {
  const source = await readFile(path.join(root, relativePath), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${encodeURIComponent(relativePath)}`);
};

const fileFetch = async (input) => {
  const url = new URL(String(input));
  assert.equal(url.origin, "https://quiz.test", `想定外のfetch先です: ${url}`);
  assert.ok(url.pathname.startsWith("/data/"), `data以外へfetchしています: ${url}`);
  const relativePath = decodeURIComponent(url.pathname.slice(1));
  try {
    const text = await readFile(path.join(root, relativePath), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { ok: false, status: 404, json: async () => { throw new Error(`404: ${url}`); } };
  }
};

globalThis.document = { baseURI: "https://quiz.test/" };
globalThis.fetch = fileFetch;

const data = await importSource("web/js/quiz/data.js");
const catalog = await data.loadQuizCatalog();
assert.equal(catalog.defaultExam, "ap");
assert.deepEqual(catalog.exams.map((exam) => exam.id), ["ap", "g-test"]);

const applied = catalog.exams.find((exam) => exam.id === "ap");
assert.ok(applied);
assert.equal(applied.exam.sessions.length, 5);
let appliedQuestionCount = 0;
for (const sessionEntry of applied.exam.sessions) {
  assert.equal(typeof sessionEntry.title, "string", `試験回名がありません: ${sessionEntry.id}`);
  const quiz = await data.loadQuiz(applied, sessionEntry.id);
  assert.equal(quiz.dataset.referenceOnly, false);
  assert.equal(quiz.elements.length, 80, `応用情報が80問ではありません: ${sessionEntry.id}`);
  appliedQuestionCount += quiz.elements.length;
}
assert.equal(appliedQuestionCount, 400);

const gExam = catalog.exams.find((exam) => exam.id === "g-test");
assert.ok(gExam);
assert.equal(gExam.exam.sessions.length, 1);
assert.equal(gExam.exam.sessions[0].title, "JDLA公式公開20問");
const gTest = await data.loadQuiz(gExam, "official-past-questions");
assert.equal(gTest.dataset.referenceOnly, true);
assert.equal(gTest.dataset.source.referenceUrl, "https://www.jdla.org/certificate/general/issues/");
assert.equal(gTest.elements.length, 20);
assert.deepEqual(gTest.elements.map((question) => question.questionNo), Array.from({ length: 20 }, (_, index) => index + 1));
assert.equal(gTest.elements.map((question) => question.correctAnswer).join(""), "ADACAADDACAABAACDDDC");
assert.ok(gTest.elements.every((question) => question.referenceOnly === true));
assert.ok(gTest.elements.every((question) => question.choices.map((choice) => choice.value).join("") === "ABCD"));

await assert.rejects(() => data.loadQuiz(gExam), /試験回が指定されていません/);
await assert.rejects(() => data.loadQuiz(gExam, "missing"), /試験回が見つかりません/);

const dataSource = await readFile(path.join(root, "web/js/quiz/data.js"), "utf8");
assert.ok(!dataSource.includes("sessionId = examEntry.exam.defaultSession"), "試験回の暗黙fallbackを戻してはいけません");
assert.ok(!dataSource.includes("session.referenceOnly === true"), "referenceOnly欠落をfalse扱いしてはいけません");

const referenceSource = await readFile(path.join(root, "web/js/quiz/reference.js"), "utf8");
for (const forbidden of ["querySelector", "fetch(", "queueMicrotask", "addEventListener"]) {
  assert.ok(!referenceSource.includes(forbidden), `reference.js が独立実行処理を持っています: ${forbidden}`);
}
const reference = await importSource("web/js/quiz/reference.js");
const fakeLink = {
  hidden: true,
  href: "",
  removeAttribute(name) {
    if (name !== "href") throw new Error(`想定外の属性削除: ${name}`);
    this.href = "";
  },
};
reference.updateReferenceLink(fakeLink, gTest.dataset);
assert.equal(fakeLink.hidden, false);
assert.equal(fakeLink.href, "https://www.jdla.org/certificate/general/issues/");
const appliedDefault = await data.loadQuiz(applied, applied.exam.defaultSession);
reference.updateReferenceLink(fakeLink, appliedDefault.dataset);
assert.equal(fakeLink.hidden, true);
assert.equal(fakeLink.href, "");
assert.throws(() => reference.updateReferenceLink(fakeLink, { id: "broken", referenceOnly: true, source: {} }), /参照先URL/);
assert.throws(() => reference.updateReferenceLink(fakeLink, { id: "broken", source: {} }), /referenceOnly/);

const index = await readFile(path.join(root, "web/index.html"), "utf8");
assert.equal((index.match(/<script type="module"/g) || []).length, 1, "アプリのmodule entrypointは1つだけにしてください");
assert.ok(index.includes('src="./js/main.js"'));
assert.ok(!index.includes('src="./js/quiz/reference.js"'), "reference.jsを独立entrypointに戻してはいけません");

const mainSource = await readFile(path.join(root, "web/js/main.js"), "utf8");
assert.ok(!mainSource.includes("session.title || session.id"), "試験回名のfallbackを戻してはいけません");
assert.ok(mainSource.includes("FATAL"), "致命的エラーは画面全体で明示してください");

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, value),
};
const session = await importSource("web/js/quiz/session.js");
const storageKey = session.storageKeyFor(gTest.dataset);
assert.deepEqual(session.loadSession(storageKey), {});
session.saveSession(storageKey, { q001: { answer: "A", correct: true } });
assert.deepEqual(session.loadSession(storageKey), { q001: { answer: "A", correct: true } });
storage.set(storageKey, "{broken");
assert.throws(() => session.loadSession(storageKey), SyntaxError);

console.log("全試験回とG検定のランタイムテストに成功しました");
