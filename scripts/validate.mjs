import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

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
  "web/js/quiz/reference.js",
  "data/catalog.json",
  "scripts/validate.mjs",
  "scripts/verify-pages.mjs",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
];
for (const file of requiredFiles) await access(path.join(root, file));

const rootEntries = new Set(await readdir(root));
for (const file of ["index.html", "app.js", "style.css"]) {
  assert(!rootEntries.has(file), `古い平置きファイルが残っています: ${file}`);
}
const dataEntries = new Set(await readdir(dataRoot));
assert(!dataEntries.has("questions.json"), "古い平置きファイルが残っています: data/questions.json");

const javaScriptFiles = [
  ...(await walk(path.join(root, "web/js"))).filter((file) => file.endsWith(".js")),
  ...(await walk(path.join(root, "scripts"))).filter((file) => file.endsWith(".mjs")),
];
for (const file of javaScriptFiles) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });

for (const file of await walk(dataRoot)) {
  const relative = path.relative(dataRoot, file);
  assert(!/(^|[\\/])(sample|samples|fixture|fixtures|demo|demos|dummy|generated)([\\/]|$)/i.test(relative), `本番データ配下にサンプル用の名前があります: ${relative}`);
  if (file.endsWith(".json")) await readJson(file);
}

const catalog = await readJson(path.join(dataRoot, "catalog.json"));
assert(Number.isInteger(catalog.version), "catalog.json の version が不正です");
assert(Array.isArray(catalog.exams) && catalog.exams.length > 0, "catalog.json に試験がありません");
assert(typeof catalog.defaultExam === "string" && catalog.defaultExam, "catalog.json に既定の試験がありません");
assert(catalog.exams.some((exam) => exam.id === catalog.defaultExam), "既定の試験が catalog.json にありません");

const catalogIds = new Set();
for (const examEntry of catalog.exams) {
  assert(typeof examEntry.id === "string" && examEntry.id, "試験一覧の id がありません");
  assert(typeof examEntry.manifest === "string" && examEntry.manifest, `manifest がありません: ${examEntry.id}`);
  assert(!catalogIds.has(examEntry.id), `catalog.json の試験IDが重複しています: ${examEntry.id}`);
  catalogIds.add(examEntry.id);

  const examPath = path.join(dataRoot, examEntry.manifest);
  const exam = await readJson(examPath);
  assert(exam.id === examEntry.id, `試験IDが一致しません: ${examEntry.id}`);
  assert(typeof exam.title === "string" && exam.title.trim(), `試験名がありません: ${exam.id}`);
  assert(exam.status === "active", `試験 status は active を明示してください: ${exam.id}`);
  assert(exam.contentMode !== "metadata-only", `metadata-only の試験をcatalogへ登録できません: ${exam.id}`);
  assert(Array.isArray(exam.sessions) && exam.sessions.length > 0, `試験回がありません: ${exam.id}`);
  assert(typeof exam.defaultSession === "string" && exam.defaultSession, `既定の試験回がありません: ${exam.id}`);
  assert(exam.sessions.some((session) => session.id === exam.defaultSession), `既定の試験回が一覧にありません: ${exam.id}`);
  if (exam.expectedQuestionCount !== undefined) {
    assert(Number.isInteger(exam.expectedQuestionCount) && exam.expectedQuestionCount > 0, `expectedQuestionCount が不正です: ${exam.id}`);
  }

  const sessionIds = new Set();
  let examQuestionCount = 0;

  for (const sessionEntry of exam.sessions) {
    assert(typeof sessionEntry.id === "string" && sessionEntry.id, `試験回の id がありません: ${exam.id}`);
    assert(typeof sessionEntry.manifest === "string" && sessionEntry.manifest, `試験回 manifest がありません: ${sessionEntry.id}`);
    assert(!sessionIds.has(sessionEntry.id), `試験回IDが重複しています: ${sessionEntry.id}`);
    sessionIds.add(sessionEntry.id);

    const sessionPath = path.resolve(path.dirname(examPath), sessionEntry.manifest);
    const session = await readJson(sessionPath);
    assert(session.id === sessionEntry.id, `試験回IDが一致しません: ${sessionEntry.id}`);
    assert(typeof session.title === "string" && session.title.trim(), `試験回 title がありません: ${session.id}`);
    assert(typeof session.version === "string" && session.version.trim(), `試験回 version がありません: ${session.id}`);
    assert(["partial", "complete"].includes(session.status), `試験回の status が不正です: ${session.id}`);
    assert(session.source && typeof session.source === "object", `source がありません: ${session.id}`);
    assert(typeof session.source.publisher === "string" && session.source.publisher, `出典 publisher がありません: ${session.id}`);
    assert(typeof session.source.questionPdfUrl === "string" && session.source.questionPdfUrl.startsWith("https://"), `問題出典URLがありません: ${session.id}`);
    assert(typeof session.source.answerPdfUrl === "string" && session.source.answerPdfUrl.startsWith("https://"), `正答出典URLがありません: ${session.id}`);
    assert(session.coverage && typeof session.coverage === "object", `coverage がありません: ${session.id}`);
    assert(Number.isInteger(session.coverage.from), `coverage.from が不正です: ${session.id}`);
    assert(Number.isInteger(session.coverage.to), `coverage.to が不正です: ${session.id}`);
    assert(Number.isInteger(session.coverage.count) && session.coverage.count > 0, `coverage.count が不正です: ${session.id}`);
    assert(Number.isInteger(session.coverage.total) && session.coverage.total > 0, `coverage.total が不正です: ${session.id}`);
    assert(session.coverage.from <= session.coverage.to, `coverage の範囲が逆です: ${session.id}`);
    assert(session.coverage.to - session.coverage.from + 1 === session.coverage.count, `coverage の範囲と count が一致しません: ${session.id}`);
    assert(Array.isArray(session.modules) && session.modules.length > 0, `問題モジュールがありません: ${session.id}`);
    if (session.answerKey !== undefined) {
      assert(typeof session.answerKey === "string" && [...session.answerKey].length === session.coverage.count, `answerKey が収録問題数と一致しません: ${session.id}`);
    }

    if (session.referenceOnly === true) {
      assert(session.isFullExam === false, `参照専用データは本試験扱いにできません: ${session.id}`);
      assert(typeof session.answerKey === "string" && session.answerKey.length === session.coverage.count, `answerKey が不正です: ${session.id}`);
      assert(typeof session.questionTitleTemplate === "string" && session.questionTitleTemplate.includes("{questionNo}"), `questionTitleTemplate が不正です: ${session.id}`);
      assert(typeof session.source.referenceUrl === "string" && session.source.referenceUrl.startsWith("https://"), `参照先URLがありません: ${session.id}`);
      assert(typeof session.source.rightsNoticeUrl === "string" && session.source.rightsNoticeUrl.startsWith("https://"), `権利告知URLがありません: ${session.id}`);
    }

    const names = new Set();
    const questionNumbers = new Set();
    const questions = [];

    for (const modulePath of session.modules) {
      assert(typeof modulePath === "string" && modulePath, `問題モジュールpathが不正です: ${session.id}`);
      const fullModulePath = path.resolve(path.dirname(sessionPath), modulePath);
      assert(fullModulePath.startsWith(`${path.dirname(sessionPath)}${path.sep}`), `問題モジュールが試験回ディレクトリ外を参照しています: ${modulePath}`);
      const module = await readJson(fullModulePath);
      assert(typeof module.id === "string" && module.id, `問題モジュールの id がありません: ${modulePath}`);
      assert(Array.isArray(module.elements) && module.elements.length > 0, `問題がありません: ${modulePath}`);

      for (const question of module.elements) {
        questions.push(question);
        assert(question.type === "radiogroup", `四択以外の問題があります: ${question.name}`);
        assert(typeof question.name === "string" && question.name, `問題IDがありません: ${module.id}`);
        assert(!names.has(question.name), `問題IDが重複しています: ${question.name}`);
        names.add(question.name);
        assert(Number.isInteger(question.questionNo), `問題番号が不正です: ${question.name}`);
        assert(!questionNumbers.has(question.questionNo), `問題番号が重複しています: ${question.name}`);
        questionNumbers.add(question.questionNo);
        assert(typeof question.title === "string" && question.title.trim(), `問題文または回答欄名がありません: ${question.name}`);
        assert(Array.isArray(question.choices) && question.choices.length === 4, `選択肢が4個ではありません: ${question.name}`);
        const choiceValues = new Set(question.choices.map((choice) => choice.value));
        assert(choiceValues.size === 4, `選択肢の値が重複しています: ${question.name}`);
        assert(question.choices.every((choice) => typeof choice.value === "string" && choice.value && typeof choice.text === "string" && choice.text.trim()), `選択肢が不正です: ${question.name}`);
        assert(choiceValues.has(question.correctAnswer), `正答が選択肢にありません: ${question.name}`);

        if (session.referenceOnly === true) {
          assert(question.referenceOnly === true, `参照専用問題ではありません: ${question.name}`);
          assert(question.questionTextStored === false, `問題本文を保存しています: ${question.name}`);
          assert(question.choiceTextStored === false, `選択肢本文を保存しています: ${question.name}`);
          assert(typeof question.category === "string" && question.category, `分野がありません: ${question.name}`);
          assert(typeof question.sourceExam === "string" && question.sourceExam, `元開催回がありません: ${question.name}`);
          assert(question.sourceUrl === session.source.referenceUrl, `問題の参照先URLが試験回と一致しません: ${question.name}`);
          assert(question.choices.map((choice) => choice.value).join("") === "ABCD", `参照専用問題の選択肢は A/B/C/D 固定です: ${question.name}`);
          assert(question.choices.every((choice) => choice.text === choice.value), `参照専用問題に選択肢本文が混入しています: ${question.name}`);
          const expectedTitle = session.questionTitleTemplate.replace("{questionNo}", String(question.questionNo));
          assert(question.title === expectedTitle, `参照専用問題の表示文が不正です: ${question.name}`);
        }
      }
    }

    assert(questions.length === session.coverage.count, `収録問題数と coverage.count が一致しません: ${session.id}`);
    const expectedQuestionNumbers = Array.from({ length: session.coverage.count }, (_, index) => session.coverage.from + index);
    assert(questions.map((question) => question.questionNo).join(",") === expectedQuestionNumbers.join(","), `問題番号が coverage の連番と一致しません: ${session.id}`);

    if (session.answerKey !== undefined) {
      assert(questions.map((question) => question.correctAnswer).join("") === session.answerKey, `正答が answerKey と一致しません: ${session.id}`);
    }
    if (session.status === "complete") assert(session.coverage.count === session.coverage.total, `complete なのに全問収録ではありません: ${session.id}`);
    examQuestionCount += questions.length;
  }

  if (exam.expectedQuestionCount !== undefined) {
    assert(examQuestionCount === exam.expectedQuestionCount, `試験全体の問題数が expectedQuestionCount と一致しません: ${exam.id} (${examQuestionCount}/${exam.expectedQuestionCount})`);
  }
}

console.log("自動確認に成功しました");
