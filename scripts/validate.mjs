import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const exists = async (relativePath) => {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
};

const readJson = async (filePath) => {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
};

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

const isHttpsUrl = (value) => typeof value === "string" && value.startsWith("https://");

const requiredFiles = [
  "README.md",
  "web/index.html",
  "web/css/app.css",
  "web/js/main.js",
  "web/js/quiz/data.js",
  "web/js/quiz/session.js",
  "web/js/quiz/export.js",
  "data/catalog.json",
  "data/policies/qc.json",
  "scripts/verify-pages.mjs",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
];

for (const file of requiredFiles) {
  assert(await exists(file), `必要なファイルがありません: ${file}`);
}

const forbiddenFlatFiles = ["index.html", "app.js", "style.css", "data/questions.json"];
for (const file of forbiddenFlatFiles) {
  assert(!(await exists(file)), `古い平置きファイルが残っています: ${file}`);
}

const javaScriptFiles = [
  ...(await walk(path.join(root, "web/js"))).filter((file) => file.endsWith(".js")),
  ...(await walk(path.join(root, "scripts"))).filter((file) => file.endsWith(".mjs")),
];
for (const file of javaScriptFiles) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}

const allDataFiles = await walk(dataRoot);
for (const file of allDataFiles) {
  const relative = path.relative(dataRoot, file);
  assert(
    !/(^|[\\/])(sample|samples|fixture|fixtures|demo|demos|dummy|generated)([\\/]|$)/i.test(relative),
    `本番データ配下にサンプル用の名前があります: ${relative}`,
  );
  if (file.endsWith(".json")) await readJson(file);
}

const catalog = await readJson(path.join(dataRoot, "catalog.json"));
assert(Number.isInteger(catalog.version), "catalog.json の version が不正です");
assert(Array.isArray(catalog.exams) && catalog.exams.length > 0, "catalog.json に試験がありません");
assert(catalog.exams.some((exam) => exam.id === catalog.defaultExam), "既定の試験が catalog.json にありません");

const qcPolicy = await readJson(path.join(dataRoot, "policies/qc.json"));
assert(qcPolicy.version === 1, "QC検定ポリシーの version が不正です");
assert(qcPolicy.officialTitle === "品質管理検定（QC検定）", "QC検定の正式名称が不正です");
assert(typeof qcPolicy.redistributionApproved === "boolean", "QC検定の再配布可否が不正です");
assert(Array.isArray(qcPolicy.grades) && qcPolicy.grades.length === 4, "QC検定の級情報が不正です");
assert(new Set(qcPolicy.grades.map((item) => item.grade)).size === 4, "QC検定の級が重複しています");
assert(qcPolicy.grades.every((item) => [1, 2, 3, 4].includes(item.grade)), "QC検定の級が不正です");

const qcSourceUrls = [];
for (const value of Object.values(qcPolicy.sources || {})) {
  if (typeof value === "string") qcSourceUrls.push(value);
  else qcSourceUrls.push(...Object.values(value || {}));
}
assert(qcSourceUrls.length > 0 && qcSourceUrls.every(isHttpsUrl), "QC検定ポリシーの出典URLが不正です");

const qcCatalogEntries = catalog.exams.filter((exam) => /^qc(?:-|$)/.test(exam.id));
if (!qcPolicy.redistributionApproved) {
  assert(qcPolicy.catalogPolicy === "do-not-register", "再配布未承認時のQC検定catalog方針が不正です");
  assert(qcPolicy.grades.every((item) => item.publicQuizDataset === false), "再配布未承認なのに公開可能なQC検定級があります");
  assert(qcCatalogEntries.length === 0, "再配布許諾が確認できるまでQC検定を catalog.json に登録できません");
}

const catalogIds = new Set();
for (const examEntry of catalog.exams) {
  assert(examEntry.id && examEntry.manifest, "試験一覧の id または manifest がありません");
  assert(!catalogIds.has(examEntry.id), `catalog.json の試験IDが重複しています: ${examEntry.id}`);
  catalogIds.add(examEntry.id);

  const examPath = path.join(dataRoot, examEntry.manifest);
  const exam = await readJson(examPath);
  assert(exam.id === examEntry.id, `試験IDが一致しません: ${examEntry.id}`);
  assert(exam.title, `試験名がありません: ${exam.id}`);

  const examStatus = exam.status ?? "active";
  assert(["active", "upcoming"].includes(examStatus), `試験の status が不正です: ${exam.id}`);
  assert(Array.isArray(exam.sessions), `sessions が配列ではありません: ${exam.id}`);

  if (examStatus === "upcoming") {
    assert(exam.sessions.length === 0, `未実施の試験に本番問題の試験回があります: ${exam.id}`);
    assert(!exam.defaultSession, `未実施の試験に既定の試験回があります: ${exam.id}`);
    assert(typeof exam.tentativeName === "boolean", `仮称かどうかがありません: ${exam.id}`);
    assert(typeof exam.plannedStart === "string" && exam.plannedStart, `開始予定がありません: ${exam.id}`);
    assert(typeof exam.delivery === "string" && exam.delivery, `試験方式がありません: ${exam.id}`);
    assert(exam.examPlan && typeof exam.examPlan === "object", `科目構成がありません: ${exam.id}`);
    assert(exam.sampleQuestions?.officialExam === false, `サンプル問題を本試験として扱っています: ${exam.id}`);
    assert(["preparing", "published"].includes(exam.sampleQuestions?.status), `サンプル問題の公開状況が不正です: ${exam.id}`);
    assert(isHttpsUrl(exam.sampleQuestions?.url), `サンプル問題の公式URLがありません: ${exam.id}`);
    assert(["preparing", "draft", "final"].includes(exam.syllabus?.status), `シラバスの状態が不正です: ${exam.id}`);
    if (exam.syllabus?.status === "draft") {
      assert(exam.syllabus.version, `シラバス案の版がありません: ${exam.id}`);
    }
    assert(isHttpsUrl(exam.syllabus?.url), `シラバスの公式URLがありません: ${exam.id}`);
    const requiredOfficialUrls = ["reform", "examPlan", "syllabus", "sampleQuestions"];
    assert(
      requiredOfficialUrls.every((key) => isHttpsUrl(exam.officialUrls?.[key])),
      `公式URLが不足しています: ${exam.id}`,
    );
    continue;
  }

  assert(exam.sessions.length > 0, `試験回がありません: ${exam.id}`);
  assert(exam.sessions.some((session) => session.id === exam.defaultSession), `既定の試験回がありません: ${exam.id}`);

  for (const sessionEntry of exam.sessions) {
    assert(sessionEntry.id && sessionEntry.manifest, `試験回の id または manifest がありません: ${exam.id}`);
    const sessionPath = path.resolve(path.dirname(examPath), sessionEntry.manifest);
    const session = await readJson(sessionPath);
    assert(session.id === sessionEntry.id, `試験回IDが一致しません: ${sessionEntry.id}`);
    assert(session.title && session.version, `試験回の title または version がありません: ${session.id}`);
    assert(["partial", "complete"].includes(session.status), `試験回の status が不正です: ${session.id}`);
    assert(session.source?.questionPdfUrl?.startsWith("https://"), `問題冊子URLがありません: ${session.id}`);
    assert(session.source?.answerPdfUrl?.startsWith("https://"), `解答例URLがありません: ${session.id}`);
    assert(Array.isArray(session.modules) && session.modules.length > 0, `問題モジュールがありません: ${session.id}`);

    const names = new Set();
    const questionNumbers = new Set();
    let questionCount = 0;

    for (const modulePath of session.modules) {
      const fullModulePath = path.resolve(path.dirname(sessionPath), modulePath);
      const module = await readJson(fullModulePath);
      assert(module.id, `問題モジュールの id がありません: ${modulePath}`);
      assert(Array.isArray(module.elements) && module.elements.length > 0, `問題がありません: ${modulePath}`);

      for (const question of module.elements) {
        questionCount += 1;
        assert(question.type === "radiogroup", `四択以外の問題があります: ${question.name}`);
        assert(question.name && !names.has(question.name), `問題IDが重複しています: ${question.name}`);
        names.add(question.name);
        assert(Number.isInteger(question.questionNo) && !questionNumbers.has(question.questionNo), `問題番号が不正または重複しています: ${question.name}`);
        questionNumbers.add(question.questionNo);
        assert(typeof question.title === "string" && question.title.trim(), `問題文がありません: ${question.name}`);
        assert(Array.isArray(question.choices) && question.choices.length === 4, `選択肢が4個ではありません: ${question.name}`);
        const choiceValues = new Set(question.choices.map((choice) => choice.value));
        assert(choiceValues.size === 4, `選択肢の値が重複しています: ${question.name}`);
        assert(question.choices.every((choice) => choice.value && typeof choice.text === "string" && choice.text.trim()), `選択肢が不正です: ${question.name}`);
        assert(choiceValues.has(question.correctAnswer), `正答が選択肢にありません: ${question.name}`);
        if (exam.id.startsWith("pds-")) {
          assert(question.officialExam === true, `新制度の問題が本試験問題として確認されていません: ${question.name}`);
        }
      }
    }

    assert(session.coverage?.count === questionCount, `収録問題数と coverage.count が一致しません: ${session.id}`);
    if (session.status === "complete") {
      assert(session.coverage?.count === session.coverage?.total, `complete なのに全問収録ではありません: ${session.id}`);
    }
  }
}

console.log("自動確認に成功しました");
