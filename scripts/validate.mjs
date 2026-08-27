import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");
const expectedSessions = ["2023-autumn", "2024-spring", "2024-autumn", "2025-spring", "2025-autumn"];

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const existsAbsolute = async (filePath) => {
  try { await access(filePath); return true; } catch { return false; }
};
const exists = async (relativePath) => existsAbsolute(path.join(root, relativePath));
const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));
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

const requiredFiles = [
  "README.md",
  "web/index.html",
  "web/css/app.css",
  "web/js/main.js",
  "web/js/quiz/data.js",
  "web/js/quiz/session.js",
  "web/js/quiz/export.js",
  "data/catalog.json",
  "data/sources/ipa/official-answer-keys.json",
  "data/sources/ipa/sessions.json",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
];
for (const file of requiredFiles) assert(await exists(file), `必要なファイルがありません: ${file}`);

for (const file of ["index.html", "app.js", "style.css", "data/questions.json"]) {
  assert(!(await exists(file)), `古い平置きファイルが残っています: ${file}`);
}

for (const file of (await walk(path.join(root, "web/js"))).filter((item) => item.endsWith(".js"))) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const allDataFiles = await walk(dataRoot);
for (const file of allDataFiles) {
  const relative = path.relative(dataRoot, file);
  assert(!/(^|[\\/])(sample|samples|fixture|fixtures|demo|demos|dummy)([\\/]|$)/i.test(relative), `本番データ配下にサンプル用の名前があります: ${relative}`);
  if (file.endsWith(".json")) await readJson(file);
}

const answerKeys = await readJson(path.join(dataRoot, "sources/ipa/official-answer-keys.json"));
for (const sessionId of expectedSessions) {
  assert(typeof answerKeys[sessionId] === "string" && [...answerKeys[sessionId]].length === 80, `IPA公式解答キーが80問ではありません: ${sessionId}`);
}

const catalog = await readJson(path.join(dataRoot, "catalog.json"));
assert(Number.isInteger(catalog.version), "catalog.json の version が不正です");
assert(Array.isArray(catalog.exams) && catalog.exams.length > 0, "catalog.json に試験がありません");
assert(catalog.exams.some((exam) => exam.id === catalog.defaultExam), "既定の試験が catalog.json にありません");

let totalQuestions = 0;
for (const examEntry of catalog.exams) {
  assert(examEntry.id && examEntry.manifest, "試験一覧の id または manifest がありません");
  const examPath = path.join(dataRoot, examEntry.manifest);
  const exam = await readJson(examPath);
  assert(exam.id === examEntry.id, `試験IDが一致しません: ${examEntry.id}`);
  assert(exam.title, `試験名がありません: ${exam.id}`);
  assert(Array.isArray(exam.sessions), `試験回一覧がありません: ${exam.id}`);

  if (exam.id === "ap") {
    assert(exam.sessions.length === 5, `応用情報の試験回が5回ではありません: ${exam.sessions.length}`);
    assert(JSON.stringify(exam.sessions.map((item) => item.id)) === JSON.stringify(expectedSessions), "応用情報の収録試験回が想定と一致しません");
  }
  assert(exam.sessions.some((session) => session.id === exam.defaultSession), `既定の試験回がありません: ${exam.id}`);

  for (const sessionEntry of exam.sessions) {
    const sessionPath = path.resolve(path.dirname(examPath), sessionEntry.manifest);
    const session = await readJson(sessionPath);
    assert(session.id === sessionEntry.id, `試験回IDが一致しません: ${sessionEntry.id}`);
    assert(session.title && session.version, `試験回の title または version がありません: ${session.id}`);
    assert(session.status === "complete", `試験回が全問収録になっていません: ${session.id}`);
    assert(session.coverage?.from === 1 && session.coverage?.to === 80 && session.coverage?.count === 80 && session.coverage?.total === 80, `収録範囲が1〜80ではありません: ${session.id}`);
    assert(session.source?.questionPdfUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式の問題冊子URLではありません: ${session.id}`);
    assert(session.source?.answerPdfUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式の解答例URLではありません: ${session.id}`);
    assert(Array.isArray(session.modules) && session.modules.length === 4, `問題モジュールが4個ではありません: ${session.id}`);

    const names = new Set();
    const questionNumbers = new Set();
    let sessionQuestionCount = 0;
    const officialAnswers = [...answerKeys[session.id]];

    for (const modulePath of session.modules) {
      const fullModulePath = path.resolve(path.dirname(sessionPath), modulePath);
      const module = await readJson(fullModulePath);
      assert(module.id, `問題モジュールの id がありません: ${modulePath}`);
      assert(Array.isArray(module.elements) && module.elements.length === 20, `モジュールが20問ではありません: ${session.id}/${modulePath}`);

      for (const question of module.elements) {
        sessionQuestionCount += 1;
        totalQuestions += 1;
        assert(question.type === "radiogroup", `四択以外の問題があります: ${session.id}/${question.name}`);
        assert(question.name && !names.has(question.name), `問題IDが重複しています: ${session.id}/${question.name}`);
        names.add(question.name);
        assert(Number.isInteger(question.questionNo) && question.questionNo >= 1 && question.questionNo <= 80 && !questionNumbers.has(question.questionNo), `問題番号が不正または重複しています: ${session.id}/${question.name}`);
        questionNumbers.add(question.questionNo);
        assert(typeof question.title === "string" && question.title.trim(), `問題文がありません: ${session.id}/${question.name}`);
        assert(Array.isArray(question.choices) && question.choices.length === 4, `選択肢が4個ではありません: ${session.id}/${question.name}`);
        const choiceValues = new Set(question.choices.map((choice) => choice.value));
        assert(choiceValues.size === 4 && ["ア", "イ", "ウ", "エ"].every((value) => choiceValues.has(value)), `選択肢がア・イ・ウ・エではありません: ${session.id}/${question.name}`);
        assert(question.choices.every((choice) => typeof choice.text === "string" && choice.text.trim()), `選択肢本文がありません: ${session.id}/${question.name}`);
        assert(choiceValues.has(question.correctAnswer), `正答が選択肢にありません: ${session.id}/${question.name}`);
        assert(question.correctAnswer === officialAnswers[question.questionNo - 1], `IPA公式正答と一致しません: ${session.id}/問${question.questionNo}`);
        assert(question.provenance?.canonicalPublisher?.includes("IPA"), `正準出典がIPAではありません: ${session.id}/${question.name}`);
        if (question.sourceImage) {
          assert(await existsAbsolute(path.resolve(path.dirname(sessionPath), question.sourceImage)), `公式問題画像がありません: ${session.id}/${question.sourceImage}`);
        }
      }
    }

    assert(sessionQuestionCount === 80, `試験回が80問ではありません: ${session.id}=${sessionQuestionCount}`);
    assert([...questionNumbers].sort((a, b) => a - b).every((value, index) => value === index + 1), `問1〜80が連続していません: ${session.id}`);
  }
}

assert(totalQuestions === 400, `合計問題数が400ではありません: ${totalQuestions}`);
console.log("自動確認に成功しました: 5回 × 80問 = 400問、IPA公式正答と一致");
