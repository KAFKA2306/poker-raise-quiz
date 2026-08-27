import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");
const expectedAnswers = ["ア", "イ", "ウ", "エ"];
const expectedAnswerSet = new Set(expectedAnswers);

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const exists = async (target) => { try { await access(target); return true; } catch { return false; } };
const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

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

const requiredFiles = [
  "README.md", "web/index.html", "web/css/app.css", "web/js/main.js",
  "web/js/quiz/data.js", "web/js/quiz/session.js", "web/js/quiz/export.js",
  "data/catalog.json", "data/sources/sk0517-repositories.json",
  "data/sources/ap-morning-import.json", "data/exams/applied-information/manifest.json",
  "scripts/prepare-data.mjs", ".github/workflows/ci.yml", ".github/workflows/pages.yml",
];
for (const relativePath of requiredFiles) {
  assert(await exists(path.join(root, relativePath)), `必要なファイルがありません: ${relativePath}`);
}
for (const relativePath of ["index.html", "app.js", "style.css", "data/questions.json"]) {
  assert(!(await exists(path.join(root, relativePath))), `古い平置きファイルが残っています: ${relativePath}`);
}

const webJavaScriptFiles = (await walk(path.join(root, "web/js"))).filter((file) => file.endsWith(".js"));
for (const file of webJavaScriptFiles) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
execFileSync(process.execPath, ["--check", path.join(root, "scripts/prepare-data.mjs")], { stdio: "inherit" });

for (const file of await walk(dataRoot)) {
  const relative = path.relative(dataRoot, file);
  assert(!/(^|[\\/])(sample|samples|fixture|fixtures|demo|demos|dummy|generated)([\\/]|$)/i.test(relative), `本番データ配下に禁止された名前があります: ${relative}`);
  if (file.endsWith(".json")) await readJson(file);
}

const importSpec = await readJson(path.join(dataRoot, "sources/ap-morning-import.json"));
assert(importSpec.expected?.sessions === 21, "応用情報の試験回数は21回である必要があります");
assert(importSpec.expected?.questionsPerSession === 80, "各試験回は80問である必要があります");
assert(importSpec.expected?.questions === 1680, "応用情報の合計は1680問である必要があります");
assert(importSpec.expected?.moduleSize === 20, "問題モジュールは20問単位である必要があります");
assert(/^[0-9a-f]{40}$/.test(importSpec.upstream?.commit || ""), "外部入力commitは40桁SHAで固定してください");
assert(importSpec.official?.publisher?.includes("情報処理推進機構"), "公式確認元はIPAである必要があります");
assert(importSpec.periods?.length === 21, "入力契約の試験回が21回ではありません");
assert(!importSpec.periods.some((period) => period.id === "2020-spring"), "中止された2020年度春期を含めないでください");

const audit = await readJson(path.join(dataRoot, "sources/sk0517-repositories.json"));
assert(Array.isArray(audit.repositories) && audit.repositories.length === 5, "sk0517の公開リポジトリ棚卸しが5件ではありません");
assert(audit.repositories.some((entry) => entry.repository === "sk0517/oyojoho_am" && entry.questionCount === 1680 && entry.decision === "採用"), "1680問の入力候補が棚卸しにありません");
assert(audit.repositories.some((entry) => entry.repository === "sk0517/PmExam" && entry.decision.includes("収録しない")), "午後問題を四択へ変換しない判断がありません");

const catalog = await readJson(path.join(dataRoot, "catalog.json"));
assert(Number.isInteger(catalog.version), "catalog.json の version が不正です");
assert(Array.isArray(catalog.exams) && catalog.exams.length > 0, "catalog.json に試験がありません");
assert(catalog.exams.some((exam) => exam.id === catalog.defaultExam), "既定の試験が catalog.json にありません");

let allQuestionCount = 0;
for (const examEntry of catalog.exams) {
  assert(examEntry.id && examEntry.manifest, "試験一覧の id または manifest がありません");
  const examPath = path.join(dataRoot, examEntry.manifest);
  const exam = await readJson(examPath);
  assert(exam.id === examEntry.id, `試験IDが一致しません: ${examEntry.id}`);
  assert(exam.title, `試験名がありません: ${exam.id}`);
  assert(Array.isArray(exam.sessions) && exam.sessions.length > 0, `試験回がありません: ${exam.id}`);
  assert(exam.sessions.some((session) => session.id === exam.defaultSession), `既定の試験回がありません: ${exam.id}`);
  if (exam.id === "ap") {
    assert(exam.sessions.length === 21, "応用情報の試験回は21回必要です");
    assert(exam.coverage?.sessions === 21 && exam.coverage?.questions === 1680, "応用情報manifestの収録数が21回・1680問ではありません");
    assert(exam.inputAssistCommit === importSpec.upstream.commit, "応用情報manifestと入力契約のcommitが一致しません");
  }

  for (const sessionEntry of exam.sessions) {
    assert(sessionEntry.id && sessionEntry.manifest, `試験回の id または manifest がありません: ${exam.id}`);
    const sessionPath = path.resolve(path.dirname(examPath), sessionEntry.manifest);
    const session = await readJson(sessionPath);
    assert(session.id === sessionEntry.id, `試験回IDが一致しません: ${sessionEntry.id}`);
    assert(session.title && session.version, `試験回の title または version がありません: ${session.id}`);
    assert(["partial", "complete"].includes(session.status), `試験回の status が不正です: ${session.id}`);
    assert(session.source?.sourcePageUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式ページURLがありません: ${session.id}`);
    assert(session.source?.questionPdfUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式問題PDFがありません: ${session.id}`);
    assert(session.source?.answerPdfUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式解答PDFがありません: ${session.id}`);
    assert(session.source?.inputAssistCommit === importSpec.upstream.commit, `入力元commitが一致しません: ${session.id}`);
    assert(["pdf-text-auto", "official-pdf-manual-transcription"].includes(session.source?.answerVerification), `解答照合方法が不正です: ${session.id}`);
    assert(Array.isArray(session.modules) && session.modules.length > 0, `問題モジュールがありません: ${session.id}`);
    if (exam.id === "ap") {
      assert(session.status === "complete", `応用情報の試験回がcompleteではありません: ${session.id}`);
      assert(session.coverage?.count === 80 && session.coverage?.total === 80, `80問収録されていません: ${session.id}`);
      assert(session.modules.length === 4, `20問×4モジュールではありません: ${session.id}`);
    }

    const names = new Set();
    const questionNumbers = new Set();
    let questionCount = 0;
    for (const modulePath of session.modules) {
      const fullModulePath = path.resolve(path.dirname(sessionPath), modulePath);
      const module = await readJson(fullModulePath);
      assert(module.id, `問題モジュールの id がありません: ${modulePath}`);
      assert(Array.isArray(module.elements) && module.elements.length > 0, `問題がありません: ${modulePath}`);
      if (exam.id === "ap") assert(module.elements.length === 20, `20問モジュールではありません: ${modulePath}`);

      for (const question of module.elements) {
        questionCount += 1;
        allQuestionCount += 1;
        assert(question.type === "radiogroup", `四択以外の問題があります: ${question.name}`);
        assert(question.name && !names.has(question.name), `問題IDが重複しています: ${question.name}`);
        names.add(question.name);
        assert(Number.isInteger(question.questionNo) && !questionNumbers.has(question.questionNo), `問題番号が不正または重複しています: ${question.name}`);
        questionNumbers.add(question.questionNo);
        assert(typeof question.title === "string" && question.title.trim(), `問題文がありません: ${question.name}`);
        assert(Array.isArray(question.choices) && question.choices.length === 4, `選択肢が4個ではありません: ${question.name}`);
        assert(question.choices.every((choice, index) => choice.value === expectedAnswers[index] && typeof choice.text === "string"), `選択肢がア・イ・ウ・エではありません: ${question.name}`);
        assert(expectedAnswerSet.has(question.correctAnswer), `正答がア・イ・ウ・エではありません: ${question.name}`);
        assert(typeof question.sourceAttribution === "string" && question.sourceAttribution.startsWith("出典：") && question.sourceAttribution.includes(`問${question.questionNo}`), `問題ごとの出典表記がありません: ${question.name}`);
        for (const forbiddenField of ["explanation", "difficulty", "importance", "tags"]) {
          assert(!(forbiddenField in question), `第三者の付加情報を本番問題へ入れないでください: ${question.name}.${forbiddenField}`);
        }
        const images = Array.isArray(question.images) ? question.images : [];
        assert(question.choices.every((choice) => choice.text.trim() || images.length > 0), `選択肢本文も画像もありません: ${session.id}/${question.name}`);
        for (const imagePath of images) {
          assert(/^\.\.\/assets\//.test(imagePath), `画像参照がassets配下ではありません: ${session.id}/${question.name}`);
          assert(await exists(path.resolve(path.dirname(fullModulePath), imagePath)), `参照画像がありません: ${session.id}/${question.name}/${imagePath}`);
        }
      }
    }
    assert(session.coverage?.count === questionCount, `収録問題数と coverage.count が一致しません: ${session.id}`);
    if (session.status === "complete") assert(session.coverage?.count === session.coverage?.total, `complete なのに全問収録ではありません: ${session.id}`);
    if (exam.id === "ap") assert([...questionNumbers].sort((a, b) => a - b).every((number, index) => number === index + 1), `問1〜80が揃っていません: ${session.id}`);
  }
}

assert(allQuestionCount === 1680, `本番問題の合計が1680問ではありません: ${allQuestionCount}`);
console.log("自動確認に成功しました: 応用情報 午前 21回・1680問");
