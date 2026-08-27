import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const officialUrl = "https://www.jdla.org/certificate/general/issues/";

const catalog = await readJson("data/catalog.json");
assert(catalog.exams.some((entry) => entry.id === "g-test" && entry.manifest === "exams/g-test/manifest.json"), "G検定がcatalogにありません");

const exam = await readJson("data/exams/g-test/manifest.json");
assert(exam.id === "g-test" && exam.status === "active", "G検定manifestが不正です");
assert(exam.defaultSession === "official-past-questions", "G検定の既定試験回が不正です");

const session = await readJson("data/exams/g-test/sessions/official-past-questions/manifest.json");
assert(session.referenceOnly === true, "G検定がreferenceOnlyではありません");
assert(session.isFullExam === false, "G検定20問を1回分の本試験として扱っています");
assert(session.coverage?.count === 20 && session.coverage?.total === 20, "G検定の収録数が20ではありません");
assert(session.modules?.length === 2, "G検定のモジュール数が2ではありません");
assert(session.source?.referenceUrl === officialUrl, "G検定の公式参照URLが不正です");
assert(typeof session.source?.rightsNoticeUrl === "string" && session.source.rightsNoticeUrl.startsWith("https://www.jdla.org/"), "G検定の権利告知URLがありません");

const elements = [];
for (const modulePath of session.modules) {
  const module = await readJson(`data/exams/g-test/sessions/official-past-questions/${modulePath}`);
  elements.push(...module.elements);
}
assert(elements.length === 20, "G検定の回答欄が20問ではありません");
assert(elements.map((item) => item.questionNo).join(",") === Array.from({ length: 20 }, (_, i) => i + 1).join(","), "G検定の問題番号1〜20が揃っていません");
assert(elements.map((item) => item.correctAnswer).join("") === "ADACAADDACAABAACDDDC", "G検定の正答がJDLA公式Q1〜Q20と一致しません");

for (const question of elements) {
  assert(question.referenceOnly === true, `${question.name}: referenceOnlyがありません`);
  assert(question.questionTextStored === false, `${question.name}: 問題本文を保存しています`);
  assert(question.choiceTextStored === false, `${question.name}: 選択肢本文を保存しています`);
  assert(question.title === `Q${question.questionNo}（JDLA公式ページを確認して回答してください）`, `${question.name}: 公式問題本文が混入している可能性があります`);
  assert(question.choices?.length === 4, `${question.name}: 四択ではありません`);
  assert(question.choices.every((choice) => ["A", "B", "C", "D"].includes(choice.value) && choice.text === choice.value), `${question.name}: 公式選択肢本文が混入しています`);
  assert(typeof question.category === "string" && question.category, `${question.name}: 分野がありません`);
  assert(typeof question.sourceExam === "string" && question.sourceExam, `${question.name}: 元開催回がありません`);
  assert(question.sourceUrl === officialUrl, `${question.name}: JDLA公式URLが不正です`);
}

console.log("G検定20問の回答シート確認に成功しました");
