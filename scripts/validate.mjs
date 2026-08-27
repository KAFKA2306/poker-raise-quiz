import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const dataRoot = path.join(root, "data");
const apAnswerSymbols = ["ア", "イ", "ウ", "エ"];

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const exists = async (relativePath) => { try { await access(path.join(root, relativePath)); return true; } catch { return false; } };
const pathExists = async (target) => { try { await access(target); return true; } catch { return false; } };
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
const isHttpsUrl = (value) => typeof value === "string" && value.startsWith("https://");

const requiredFiles = [
  "README.md", "web/index.html", "web/css/app.css", "web/js/main.js",
  "web/js/quiz/data.js", "web/js/quiz/session.js", "web/js/quiz/export.js",
  "data/catalog.json", "data/policies/qc.json", "data/sources/sk0517-repositories.json",
  "data/sources/ap-morning-import.json", "scripts/prepare-data.mjs", "scripts/verify-pages.mjs",
  ".github/workflows/ci.yml", ".github/workflows/pages.yml",
];
for (const file of requiredFiles) assert(await exists(file), `必要なファイルがありません: ${file}`);
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
  assert(!/(^|[\\/])(sample|samples|fixture|fixtures|demo|demos|dummy|generated)([\\/]|$)/i.test(relative), `本番データ配下に禁止された名前があります: ${relative}`);
  if (file.endsWith(".json")) await readJson(file);
}

const importSpec = await readJson(path.join(dataRoot, "sources/ap-morning-import.json"));
assert(importSpec.expected?.sessions === 21, "応用情報の試験回数は21回である必要があります");
assert(importSpec.expected?.questionsPerSession === 80, "応用情報の各試験回は80問である必要があります");
assert(importSpec.expected?.questions === 1680, "応用情報の合計は1680問である必要があります");
assert(importSpec.expected?.moduleSize === 20, "応用情報は20問単位のモジュールに分ける必要があります");
assert(/^[0-9a-f]{40}$/.test(importSpec.upstream?.commit || ""), "外部入力commitを40桁SHAで固定してください");
assert(importSpec.official?.publisher?.includes("情報処理推進機構"), "応用情報の公式確認元はIPAである必要があります");
assert(Array.isArray(importSpec.periods) && importSpec.periods.length === 21, "応用情報の入力契約が21回ではありません");
assert(!importSpec.periods.some((period) => period.id === "2020-spring"), "中止された2020年度春期を含めないでください");
assert(importSpec.periods.every((period) => isHttpsUrl(period.officialPageUrl)), "応用情報の公式ページURLが不足しています");

const sourceAudit = await readJson(path.join(dataRoot, "sources/sk0517-repositories.json"));
assert(Array.isArray(sourceAudit.repositories) && sourceAudit.repositories.length === 5, "sk0517の公開リポジトリ棚卸しが5件ではありません");
assert(sourceAudit.repositories.some((entry) => entry.repository === "sk0517/oyojoho_am" && entry.questionCount === 1680 && entry.decision === "採用"), "1680問の入力候補が棚卸しにありません");
assert(sourceAudit.repositories.some((entry) => entry.repository === "sk0517/ExamPractice" && entry.questionCount === 400 && entry.decision.includes("重複")), "既存400問との重複判断がありません");
assert(sourceAudit.repositories.some((entry) => entry.repository === "sk0517/PmExam" && entry.decision.includes("収録しない")), "午後問題を無理に四択化しない判断がありません");

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
let apQuestionCount = 0;
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

  const contentMode = exam.contentMode ?? "questions";
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

  if (exam.id === "ap") {
    assert(exam.sessions.length === 21, "応用情報の試験回は21回必要です");
    assert(exam.coverage?.sessions === 21 && exam.coverage?.questions === 1680, "応用情報manifestが21回・1680問ではありません");
    assert(exam.inputAssistCommit === importSpec.upstream.commit, "応用情報manifestと入力契約のcommitが一致しません");
  }

  for (const sessionEntry of exam.sessions) {
    assert(sessionEntry.id && sessionEntry.manifest, `試験回の id または manifest がありません: ${exam.id}`);
    const sessionPath = path.resolve(path.dirname(examPath), sessionEntry.manifest);
    const session = await readJson(sessionPath);
    assert(session.id === sessionEntry.id, `試験回IDが一致しません: ${sessionEntry.id}`);
    assert(session.title && session.version, `試験回の title または version がありません: ${session.id}`);
    assert(["partial", "complete"].includes(session.status), `試験回の status が不正です: ${session.id}`);
    assert(isHttpsUrl(session.source?.questionPdfUrl), `問題冊子URLがありません: ${session.id}`);
    assert(isHttpsUrl(session.source?.answerPdfUrl), `解答例URLがありません: ${session.id}`);
    assert(Array.isArray(session.modules) && session.modules.length > 0, `問題モジュールがありません: ${session.id}`);

    if (exam.id === "ap") {
      assert(session.status === "complete", `応用情報の試験回がcompleteではありません: ${session.id}`);
      assert(session.coverage?.count === 80 && session.coverage?.total === 80, `応用情報が80問ではありません: ${session.id}`);
      assert(session.modules.length === 4, `応用情報が20問×4モジュールではありません: ${session.id}`);
      assert(session.source?.sourcePageUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式ページURLがありません: ${session.id}`);
      assert(session.source?.questionPdfUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式問題PDFではありません: ${session.id}`);
      assert(session.source?.answerPdfUrl?.startsWith("https://www.ipa.go.jp/"), `IPA公式解答PDFではありません: ${session.id}`);
      assert(session.source?.inputAssistCommit === importSpec.upstream.commit, `入力元commitが一致しません: ${session.id}`);
      assert(["pdf-text-auto", "official-pdf-manual-transcription"].includes(session.source?.answerVerification), `解答照合方法が不正です: ${session.id}`);
    }

    const names = new Set();
    const questionNumbers = new Set();
    let questionCount = 0;
    for (const modulePath of session.modules) {
      const fullModulePath = path.resolve(path.dirname(sessionPath), modulePath);
      const module = await readJson(fullModulePath);
      assert(module.id, `問題モジュールの id がありません: ${modulePath}`);
      assert(Array.isArray(module.elements) && module.elements.length > 0, `問題がありません: ${modulePath}`);
      if (exam.id === "ap") assert(module.elements.length === 20, `応用情報のモジュールが20問ではありません: ${modulePath}`);

      for (const question of module.elements) {
        questionCount += 1;
        if (exam.id === "ap") apQuestionCount += 1;
        assert(question.type === "radiogroup", `四択以外の問題があります: ${question.name}`);
        assert(question.name && !names.has(question.name), `問題IDが重複しています: ${question.name}`);
        names.add(question.name);
        assert(Number.isInteger(question.questionNo) && !questionNumbers.has(question.questionNo), `問題番号が不正または重複しています: ${question.name}`);
        questionNumbers.add(question.questionNo);
        assert(typeof question.title === "string" && question.title.trim(), `問題文がありません: ${question.name}`);
        assert(Array.isArray(question.choices) && question.choices.length === 4, `選択肢が4個ではありません: ${question.name}`);
        const choiceValues = new Set(question.choices.map((choice) => choice.value));
        assert(choiceValues.size === 4, `選択肢の値が重複しています: ${question.name}`);
        assert(question.choices.every((choice) => choice.value && typeof choice.text === "string"), `選択肢が不正です: ${question.name}`);
        assert(choiceValues.has(question.correctAnswer), `正答が選択肢にありません: ${question.name}`);

        if (exam.questionPolicy?.requirePerQuestionEvidence) {
          assert(question.examId === exam.id, `問題の試験IDがありません: ${question.name}`);
          assert(String(question.grade) === String(exam.grade), `問題の級が一致しません: ${question.name}`);
          assert(isHttpsUrl(question.provenance?.sourceUrl), `問題の出典URLがありません: ${question.name}`);
          assert(typeof question.provenance?.reuseBasis === "string" && question.provenance.reuseBasis.trim(), `問題の再利用根拠がありません: ${question.name}`);
          assert(question.provenance?.reuseConfirmed === true, `問題の再利用確認が完了していません: ${question.name}`);
        }

        if (exam.id === "ap") {
          assert(question.choices.every((choice, index) => choice.value === apAnswerSymbols[index]), `応用情報の選択肢がア・イ・ウ・エではありません: ${question.name}`);
          assert(typeof question.sourceAttribution === "string" && question.sourceAttribution.startsWith("出典：") && question.sourceAttribution.includes(`問${question.questionNo}`), `問題ごとの出典表記がありません: ${session.id}/${question.name}`);
          for (const forbiddenField of ["explanation", "difficulty", "importance", "tags"]) assert(!(forbiddenField in question), `第三者の付加情報を収録しないでください: ${session.id}/${question.name}.${forbiddenField}`);
          const images = Array.isArray(question.images) ? question.images : [];
          assert(question.choices.every((choice) => choice.text.trim() || images.length > 0), `選択肢本文も画像もありません: ${session.id}/${question.name}`);
          for (const imagePath of images) {
            assert(/^\.\.\/assets\//.test(imagePath), `画像参照がassets配下ではありません: ${session.id}/${question.name}`);
            assert(await pathExists(path.resolve(path.dirname(fullModulePath), imagePath)), `参照画像がありません: ${session.id}/${question.name}/${imagePath}`);
          }
        } else {
          assert(question.choices.every((choice) => choice.text.trim()), `選択肢本文がありません: ${question.name}`);
        }

        if (exam.id.startsWith("pds-")) assert(question.officialExam === true, `新制度の問題が本試験問題として確認されていません: ${question.name}`);
      }
    }

    assert(session.coverage?.count === questionCount, `収録問題数と coverage.count が一致しません: ${session.id}`);
    if (session.status === "complete") assert(session.coverage?.count === session.coverage?.total, `complete なのに全問収録ではありません: ${session.id}`);
    if (exam.id === "ap") assert([...questionNumbers].sort((a, b) => a - b).every((number, index) => number === index + 1), `問1〜80が揃っていません: ${session.id}`);
  }
}

assert(apQuestionCount === 1680, `応用情報の本番問題が1680問ではありません: ${apQuestionCount}`);
console.log("自動確認に成功しました: 応用情報 午前 21回・1680問");
