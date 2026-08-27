import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const isHttpsUrl = (value) => typeof value === "string" && value.startsWith("https://");

const exists = async (relativePath) => {
  try { await access(path.join(root, relativePath)); return true; } catch { return false; }
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

for (const file of [
  "README.md", "web/index.html", "web/css/app.css", "web/js/main.js",
  "web/js/quiz/data.js", "web/js/quiz/session.js", "web/js/quiz/export.js",
  "data/catalog.json", "data/policies/qc.json", "scripts/verify-pages.mjs",
  ".github/workflows/ci.yml", ".github/workflows/pages.yml",
]) assert(await exists(file), `必要なファイルがありません: ${file}`);

for (const file of ["index.html", "app.js", "style.css", "data/questions.json"]) {
  assert(!(await exists(file)), `古い平置きファイルが残っています: ${file}`);
}

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
if (!qcPolicy.redistributionApproved) {
  assert(qcPolicy.catalogPolicy === "do-not-register", "再配布未承認時のQC検定catalog方針が不正です");
  assert(qcPolicy.grades.every((item) => item.publicQuizDataset === false), "再配布未承認なのに公開可能なQC検定級があります");
  assert(catalog.exams.every((exam) => !/^qc(?:-|$)/.test(exam.id)), "再配布許諾が確認できるまでQC検定を catalog.json に登録できません");
}

const gTestOfficialPageUrl = "https://www.jdla.org/certificate/general/issues/";
const gTestExpectedAnswers = ["A","D","A","C","A","A","D","D","A","C","A","A","B","A","A","C","D","D","D","C"];
const gTestAllowedFields = new Set(["type","name","questionNo","title","choices","correctAnswer","referenceOnly","topic","examOccurrence","sourceUrl"]);

const catalogIds = new Set();
for (const examEntry of catalog.exams) {
  assert(examEntry.id && examEntry.manifest, "試験一覧の id または manifest がありません");
  assert(!catalogIds.has(examEntry.id), `catalog.json の試験IDが重複しています: ${examEntry.id}`);
  catalogIds.add(examEntry.id);

  const examPath = path.join(dataRoot, examEntry.manifest);
  const exam = await readJson(examPath);
  assert(exam.id === examEntry.id, `試験IDが一致しません: ${examEntry.id}`);
  assert(exam.title, `試験名がありません: ${exam.id}`);
  assert(Array.isArray(exam.sessions), `sessions が配列ではありません: ${exam.id}`);

  const examStatus = exam.status ?? "active";
  const contentMode = exam.contentMode ?? "questions";
  assert(["active", "upcoming"].includes(examStatus), `試験の status が不正です: ${exam.id}`);
  assert(["questions", "metadata-only"].includes(contentMode), `contentMode が不正です: ${exam.id}`);

  if (exam.questionPolicy) {
    assert(["authorized", "not-authorized"].includes(exam.questionPolicy.publication), `問題公開方針が不正です: ${exam.id}`);
    assert(isHttpsUrl(exam.questionPolicy.termsUrl), `問題利用条件URLがありません: ${exam.id}`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(exam.questionPolicy.checkedAt || ""), `問題利用条件の確認日が不正です: ${exam.id}`);
    assert(typeof exam.questionPolicy.note === "string" && exam.questionPolicy.note.trim(), `問題利用条件の説明がありません: ${exam.id}`);
  }

  if (contentMode === "metadata-only") {
    assert(exam.sessions.length === 0, `metadata-only に本番問題の試験回があります: ${exam.id}`);
    assert(!exam.defaultSession, `metadata-only に既定の試験回があります: ${exam.id}`);
    assert(exam.examInfo?.method, `受験方法がありません: ${exam.id}`);
    assert(exam.examInfo?.questionFormat, `出題形式がありません: ${exam.id}`);
    assert(exam.examInfo?.questionCount, `問題数がありません: ${exam.id}`);
    assert(Number.isInteger(exam.examInfo?.durationMinutes), `試験時間が不正です: ${exam.id}`);
    assert(exam.examInfo?.passScore, `合格水準がありません: ${exam.id}`);
    assert(exam.examInfo?.scopeVersion, `出題範囲の版がありません: ${exam.id}`);
    assert(isHttpsUrl(exam.examInfo?.scopeUrl), `出題範囲URLがありません: ${exam.id}`);
    assert(Array.isArray(exam.examInfo?.topics) && exam.examInfo.topics.length > 0, `出題範囲がありません: ${exam.id}`);
    assert(exam.questionPolicy?.publication === "not-authorized", `metadata-only の問題公開方針が不正です: ${exam.id}`);
    assert(exam.questionPolicy?.requirePerQuestionEvidence === true, `問題ごとの再利用根拠を必須にしていません: ${exam.id}`);
    assert(Array.isArray(exam.sources) && exam.sources.length > 0, `公式情報の出典がありません: ${exam.id}`);
    assert(exam.sources.every((source) => source.title && isHttpsUrl(source.url)), `公式情報の出典が不正です: ${exam.id}`);
    continue;
  }

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
    if (exam.syllabus?.status === "draft") assert(exam.syllabus.version, `シラバス案の版がありません: ${exam.id}`);
    assert(isHttpsUrl(exam.syllabus?.url), `シラバスの公式URLがありません: ${exam.id}`);
    assert(["reform", "examPlan", "syllabus", "sampleQuestions"].every((key) => isHttpsUrl(exam.officialUrls?.[key])), `公式URLが不足しています: ${exam.id}`);
    continue;
  }

  if (exam.questionPolicy) assert(exam.questionPolicy.publication === "authorized", `問題公開が許可されていない試験に問題データがあります: ${exam.id}`);
  assert(exam.sessions.length > 0, `試験回がありません: ${exam.id}`);
  assert(exam.sessions.some((session) => session.id === exam.defaultSession), `既定の試験回がありません: ${exam.id}`);

  const sessionIds = new Set();
  for (const sessionEntry of exam.sessions) {
    assert(sessionEntry.id && sessionEntry.manifest, `試験回の id または manifest がありません: ${exam.id}`);
    assert(!sessionIds.has(sessionEntry.id), `試験回IDが重複しています: ${exam.id}:${sessionEntry.id}`);
    sessionIds.add(sessionEntry.id);

    const sessionPath = path.resolve(path.dirname(examPath), sessionEntry.manifest);
    const session = await readJson(sessionPath);
    assert(session.id === sessionEntry.id, `試験回IDが一致しません: ${sessionEntry.id}`);
    assert(session.title && session.version, `試験回の title または version がありません: ${session.id}`);
    assert(["partial", "complete"].includes(session.status), `試験回の status が不正です: ${session.id}`);

    const sessionMode = session.contentMode ?? "full-question";
    assert(["full-question", "reference-answer-sheet"].includes(sessionMode), `試験回の contentMode が不正です: ${session.id}`);
    if (sessionMode === "reference-answer-sheet") {
      assert(session.isFullExam === false, `参照回答シートを本試験全体として扱っています: ${session.id}`);
      assert(isHttpsUrl(session.source?.pageUrl), `参照回答シートの公式ページURLがありません: ${session.id}`);
    } else {
      assert(isHttpsUrl(session.source?.questionPdfUrl), `問題冊子URLがありません: ${session.id}`);
      assert(isHttpsUrl(session.source?.answerPdfUrl), `解答例URLがありません: ${session.id}`);
    }
    assert(Array.isArray(session.modules) && session.modules.length > 0, `問題モジュールがありません: ${session.id}`);

    const names = new Set();
    const questionNumbers = new Set();
    const orderedAnswers = [];
    let questionCount = 0;

    for (const modulePath of session.modules) {
      const module = await readJson(path.resolve(path.dirname(sessionPath), modulePath));
      assert(module.id, `問題モジュールの id がありません: ${modulePath}`);
      assert(Array.isArray(module.elements) && module.elements.length > 0, `問題がありません: ${modulePath}`);

      for (const question of module.elements) {
        questionCount += 1;
        assert(question.type === "radiogroup", `四択以外の問題があります: ${question.name}`);
        assert(question.name && !names.has(question.name), `問題IDが重複しています: ${question.name}`);
        names.add(question.name);
        assert(Number.isInteger(question.questionNo) && !questionNumbers.has(question.questionNo), `問題番号が不正または重複しています: ${question.name}`);
        questionNumbers.add(question.questionNo);
        assert(typeof question.title === "string" && question.title.trim(), `問題文または表示名がありません: ${question.name}`);
        assert(Array.isArray(question.choices) && question.choices.length === 4, `選択肢が4個ではありません: ${question.name}`);
        const choiceValues = new Set(question.choices.map((choice) => choice.value));
        assert(choiceValues.size === 4, `選択肢の値が重複しています: ${question.name}`);
        assert(question.choices.every((choice) => choice.value && typeof choice.text === "string" && choice.text.trim()), `選択肢が不正です: ${question.name}`);
        assert(choiceValues.has(question.correctAnswer), `正答が選択肢にありません: ${question.name}`);

        if (exam.questionPolicy?.requirePerQuestionEvidence) {
          assert(question.examId === exam.id, `問題の試験IDがありません: ${question.name}`);
          assert(String(question.grade) === String(exam.grade), `問題の級が一致しません: ${question.name}`);
          assert(isHttpsUrl(question.provenance?.sourceUrl), `問題の出典URLがありません: ${question.name}`);
          assert(typeof question.provenance?.reuseBasis === "string" && question.provenance.reuseBasis.trim(), `問題の再利用根拠がありません: ${question.name}`);
          assert(question.provenance?.reuseVerified === true, `問題の再利用確認が完了していません: ${question.name}`);
        }

        if (sessionMode === "reference-answer-sheet") {
          assert(question.referenceOnly === true, `参照回答シートに referenceOnly がありません: ${question.name}`);
          assert(question.topic && question.examOccurrence, `参照回答シートに分野または出題回がありません: ${question.name}`);
          assert(question.sourceUrl === session.source.pageUrl, `参照回答シートの公式URLが一致しません: ${question.name}`);
          assert(question.title === `JDLA公式Q${question.questionNo}`, `参照回答シートの表示名が不正です: ${question.name}`);
          assert(JSON.stringify(question.choices.map((choice) => choice.value)) === JSON.stringify(["A","B","C","D"]), `参照回答シートの選択肢はA〜Dだけにしてください: ${question.name}`);
          assert(question.choices.every((choice) => choice.text === choice.value), `参照回答シートに選択肢本文を保存しないでください: ${question.name}`);
          assert(Object.keys(question).every((key) => gTestAllowedFields.has(key)), `参照回答シートに不要なフィールドがあります: ${question.name}`);
          orderedAnswers[question.questionNo - 1] = question.correctAnswer;
        }

        if (exam.id.startsWith("pds-")) assert(question.officialExam === true, `新制度の問題が本試験問題として確認されていません: ${question.name}`);
      }
    }

    assert(session.coverage?.count === questionCount, `収録問題数と coverage.count が一致しません: ${session.id}`);
    if (session.status === "complete") assert(session.coverage?.count === session.coverage?.total, `complete なのに対象集合を全件収録していません: ${session.id}`);

    if (exam.id === "g-test" && session.id === "official-past-questions") {
      assert(sessionMode === "reference-answer-sheet", "G検定公式20問は参照回答シートでなければなりません");
      assert(session.source.pageUrl === gTestOfficialPageUrl, "G検定の公式ページURLが不正です");
      assert(session.modules.length === 2, "G検定公式20問は10問ずつ2モジュールに分けてください");
      assert(questionCount === 20, `G検定公式回答シートは20問必要です: ${questionCount}`);
      assert(session.coverage?.count === 20 && session.coverage?.total === 20, "G検定公式公開20問のcoverageが不正です");
      const sortedNumbers = [...questionNumbers].sort((a, b) => a - b);
      assert(sortedNumbers.every((number, index) => number === index + 1), "G検定の問題番号は1〜20を重複なく揃えてください");
      assert(JSON.stringify(orderedAnswers) === JSON.stringify(gTestExpectedAnswers), "G検定20問の正答がJDLA公式正答と一致しません");
    }
  }
}

assert(catalogIds.has("g-test"), "G検定が catalog.json に登録されていません");
console.log("自動確認に成功しました");
