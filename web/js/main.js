import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const fail = (message) => {
  throw new Error(message);
};

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) fail(`DOM要素がありません: ${selector}`);
  return element;
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || value.length === 0) fail(`${label}がありません`);
  return value;
};

const requiredObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}が不正です`);
  return value;
};

const requiredArray = (value, label) => {
  if (!Array.isArray(value)) fail(`${label}が配列ではありません`);
  return value;
};

const renderCrash = (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  document.documentElement.dataset.appState = "crashed";
  document.body.replaceChildren();
  document.body.style.margin = "0";
  document.body.style.padding = "24px";
  document.body.style.background = "#2b0000";
  document.body.style.color = "#ffffff";
  const pre = document.createElement("pre");
  pre.id = "fatal-error";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.font = "700 16px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace";
  pre.textContent = `FATAL\n\n${error.stack || error.message}`;
  document.body.append(pre);
};

window.addEventListener("error", (event) => renderCrash(event.error || new Error(event.message)));
window.addEventListener("unhandledrejection", (event) => renderCrash(event.reason));

let activeQuiz = null;

const choiceText = (element, value) => {
  const choices = requiredArray(element.choices, `選択肢: ${element.name}`);
  const choice = choices.find((item) => item.value === value);
  if (!choice) fail(`選択肢が見つかりません: ${element.name}/${value}`);
  return requiredString(choice.text, `選択肢本文: ${element.name}/${value}`);
};

const answerLabel = (element, value) => {
  const text = choiceText(element, value);
  return text === String(value) ? String(value) : `${value} ${text}`;
};

const feedbackText = (element, state) => {
  requiredObject(state, `回答状態: ${element.name}`);
  if (typeof state.correct !== "boolean") fail(`正誤状態が不正です: ${element.name}`);
  return `${state.correct ? "正解" : "不正解"}　自分の回答: ${answerLabel(element, state.answer)}　正答: ${answerLabel(element, element.correctAnswer)}`;
};

const updateSummary = (dataset, elements, state) => {
  const coverage = requiredObject(dataset.coverage, `収録範囲: ${dataset.id}`);
  if (!Number.isInteger(coverage.count) || !Number.isInteger(coverage.total)) {
    fail(`収録問題数が不正です: ${dataset.id}`);
  }
  const answered = elements.filter((element) => state[element.name]).length;
  const coverageText = typeof coverage.label === "string" && coverage.label.length > 0
    ? coverage.label
    : `収録 ${coverage.count} / ${coverage.total}問`;
  $("#summary").textContent = `回答済み ${answered} / ${elements.length}　${coverageText}`;
  $("#copy-all").disabled = answered === 0;
};

const showCopyStatus = (message) => {
  const status = $("#copy-status");
  status.textContent = requiredString(message, "コピー状態");
  window.setTimeout(() => {
    status.textContent = "";
  }, 1600);
};

const toSurveyElement = (element) => {
  requiredObject(element, "問題");
  const questionNo = element.questionNo;
  if (!Number.isInteger(questionNo)) fail(`問題番号が不正です: ${element.name}`);
  const choices = requiredArray(element.choices, `選択肢: ${element.name}`);
  if (choices.length !== 4) fail(`選択肢が4個ではありません: ${element.name}`);

  const { referenceOnly, topic, examOccurrence, sourceUrl, ...surveyElement } = element;
  if (referenceOnly === true) {
    requiredString(topic, `分野: ${element.name}`);
    requiredString(examOccurrence, `出題回: ${element.name}`);
    requiredString(sourceUrl, `公式URL: ${element.name}`);
  }

  return {
    ...surveyElement,
    title: `問${questionNo}　${requiredString(element.title, `表示名: ${element.name}`)}`,
    description: referenceOnly === true
      ? `${topic} / ${examOccurrence}。問題文と選択肢はJDLA公式ページで確認してください。`
      : surveyElement.description,
    descriptionLocation: referenceOnly === true ? "underTitle" : surveyElement.descriptionLocation,
    choices: choices.map((choice) => {
      requiredObject(choice, `選択肢: ${element.name}`);
      const value = requiredString(choice.value, `選択肢値: ${element.name}`);
      const text = requiredString(choice.text, `選択肢本文: ${element.name}/${value}`);
      return { value, text: text === value ? value : `${value}　${text}` };
    }),
  };
};

const addTextRow = (list, label, value) => {
  requiredString(label, "表示項目名");
  if (value === undefined || value === null || value === "") fail(`表示値がありません: ${label}`);
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = String(value);
  list.append(term, description);
};

const examPlanText = (plan) => {
  requiredObject(plan, "試験構成");
  const a1 = requiredObject(plan.a1, "科目A-1");
  const a2 = requiredObject(plan.a2, "科目A-2");
  const b = requiredObject(plan.b, "科目B");
  if (!Number.isInteger(a1.minutes) || !Number.isInteger(a1.questionCount)) fail("科目A-1の時間または問題数が不正です");
  if (!Number.isInteger(a2.questionCount) || !Number.isInteger(b.questionCount)) fail("科目A-2または科目Bの問題数が不正です");
  if (!Number.isInteger(plan.a2AndBMinutes)) fail("科目A-2・Bの試験時間が不正です");
  return `${requiredString(a1.title, "科目A-1名")} ${a1.questionCount}問/${a1.minutes}分、${requiredString(a2.title, "科目A-2名")} ${a2.questionCount}問、${requiredString(b.title, "科目B名")} ${b.questionCount}問、A-2・B 合計${plan.a2AndBMinutes}分`;
};

const syllabusText = (syllabus) => {
  requiredObject(syllabus, "シラバス");
  const status = requiredString(syllabus.status, "シラバスstatus");
  if (status === "preparing") {
    if (syllabus.version !== null) fail("準備中シラバスのversionはnullである必要があります");
    return "preparing";
  }
  return `${status} / ${requiredString(syllabus.version, "シラバスversion")}`;
};

const renderInformation = (dataset) => {
  activeQuiz = null;
  $("#copy-all").disabled = true;
  const quiz = $("#quiz");
  quiz.replaceChildren();

  const card = document.createElement("section");
  card.className = "notice-card";
  const heading = document.createElement("h2");
  const note = document.createElement("p");
  const details = document.createElement("dl");
  details.className = "exam-details";

  if (dataset.status === "upcoming") {
    $("#summary").textContent = "本試験前のため問題は収録していません";
    heading.textContent = "公式に確認できる予定情報だけを掲載しています";
    const plannedStart = requiredString(dataset.plannedStart, "開始予定");
    note.textContent = `この試験は未実施です。開始予定は ${plannedStart} です。サンプル問題を本試験問題として扱いません。`;
    addTextRow(details, "開始予定", plannedStart);
    addTextRow(details, "試験方式", requiredString(dataset.delivery, "試験方式"));
    addTextRow(details, "科目構成", examPlanText(dataset.examPlan));
    addTextRow(details, "シラバス", syllabusText(dataset.syllabus));
    addTextRow(details, "サンプル問題", requiredString(dataset.sampleQuestions?.status, "サンプル問題status"));
  } else if (dataset.status === "metadata-only") {
    $("#summary").textContent = "問題本文は収録していません";
    heading.textContent = "公開できる試験情報だけを掲載しています";
    const policy = requiredObject(dataset.questionPolicy, "問題公開方針");
    note.textContent = requiredString(policy.note, "問題公開方針の説明");
    const info = requiredObject(dataset.examInfo, "試験情報");
    addTextRow(details, "受験方法", requiredString(info.method, "受験方法"));
    addTextRow(details, "出題形式", requiredString(info.questionFormat, "出題形式"));
    addTextRow(details, "問題数", requiredString(info.questionCount, "問題数"));
    if (!Number.isInteger(info.durationMinutes)) fail("試験時間が不正です");
    addTextRow(details, "試験時間", `${info.durationMinutes}分`);
    addTextRow(details, "合格水準", requiredString(info.passScore, "合格水準"));
    addTextRow(details, "出題範囲", requiredString(info.scopeVersion, "出題範囲version"));

    const topics = requiredArray(info.topics, "出題範囲");
    if (topics.length === 0) fail("出題範囲がありません");
    const topicsHeading = document.createElement("h3");
    topicsHeading.textContent = "主な出題範囲";
    const list = document.createElement("ul");
    for (const topic of topics) {
      const item = document.createElement("li");
      item.textContent = requiredString(topic, "出題範囲項目");
      list.append(item);
    }
    card.append(heading, note, details, topicsHeading, list);
  } else {
    fail(`情報表示できないstatusです: ${dataset.status}`);
  }

  if (dataset.status === "upcoming") card.append(heading, note, details);

  const sources = requiredArray(dataset.sources, `公式情報: ${dataset.id}`);
  if (sources.length === 0) fail(`公式情報がありません: ${dataset.id}`);
  const sourcesHeading = document.createElement("h3");
  sourcesHeading.textContent = "公式情報";
  const sourceList = document.createElement("ul");
  sourceList.className = "source-list";
  for (const source of sources) {
    requiredObject(source, "公式情報");
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = requiredString(source.url, "公式情報URL");
    link.textContent = requiredString(source.title, "公式情報名");
    link.target = "_blank";
    link.rel = "noreferrer";
    item.append(link);
    sourceList.append(item);
  }
  card.append(sourcesHeading, sourceList);
  quiz.append(card);
};

const appendReferenceNotice = (quiz, dataset) => {
  if (dataset.contentMode === "full-question") return;
  if (dataset.contentMode !== "reference-answer-sheet") fail(`未知のcontentModeです: ${dataset.contentMode}`);

  const source = requiredObject(dataset.source, "G検定出典");
  const links = [
    [requiredString(source.pageUrl, "JDLA公式問題URL"), "JDLA公式問題を開く"],
    [requiredString(source.examUrl, "G検定試験概要URL"), "G検定の試験概要を開く"],
    [requiredString(source.copyrightPolicyUrl, "JDLA著作権告知URL"), "著作権に関するJDLA公式告知を開く"],
  ];

  const card = document.createElement("section");
  card.className = "notice-card";
  const heading = document.createElement("h2");
  heading.textContent = "JDLA公式ページと一緒に使う回答シートです";
  const note = document.createElement("p");
  note.textContent = requiredString(source.note, "G検定出典説明");
  const list = document.createElement("ul");
  list.className = "source-list";
  for (const [url, label] of links) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = url;
    link.textContent = label;
    link.target = "_blank";
    link.rel = "noreferrer";
    item.append(link);
    list.append(item);
  }
  card.append(heading, note, list);
  quiz.append(card);
};

const renderQuestions = (dataset, elements) => {
  if (!["partial", "complete"].includes(dataset.status)) fail(`問題表示できないstatusです: ${dataset.status}`);
  if (!["full-question", "reference-answer-sheet"].includes(dataset.contentMode)) fail(`問題表示できないcontentModeです: ${dataset.contentMode}`);
  requiredArray(elements, `問題一覧: ${dataset.id}`);
  if (elements.length === 0) fail(`問題がありません: ${dataset.id}`);

  const names = elements.map((element) => requiredString(element.name, "問題ID"));
  if (new Set(names).size !== names.length) fail(`問題IDが重複しています: ${dataset.id}`);
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  const storageKey = storageKeyFor(dataset);
  const state = loadSession(storageKey);
  activeQuiz = { dataset, elements, state };

  const quiz = $("#quiz");
  quiz.replaceChildren();
  appendReferenceNotice(quiz, dataset);
  const surveyHost = document.createElement("div");
  quiz.append(surveyHost);

  if (!globalThis.Survey || typeof globalThis.Survey.Model !== "function") fail("SurveyJSが読み込まれていません");
  const survey = new Survey.Model({
    elements: elements.map(toSurveyElement),
    showQuestionNumbers: "off",
    showCompleteButton: false,
    showNavigationButtons: false,
  });

  for (const [name, cached] of Object.entries(state)) {
    const element = byName[name];
    if (!element) fail(`保存済み回答に現在存在しない問題があります: ${name}`);
    const question = survey.getQuestionByName(name);
    if (!question) fail(`SurveyJSに問題がありません: ${name}`);
    requiredObject(cached, `保存済み回答: ${name}`);
    question.value = cached.answer;
    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
  }

  survey.onValueChanged.add((sender, options) => {
    const name = requiredString(options.name, "回答問題ID");
    if (state[name]) fail(`回答済み問題が再回答されました: ${name}`);
    const element = byName[name];
    if (!element) fail(`回答対象の問題データがありません: ${name}`);
    const question = sender.getQuestionByName(name);
    if (!question) fail(`SurveyJSに回答対象がありません: ${name}`);

    const cached = { answer: options.value, correct: question.isAnswerCorrect() };
    state[name] = cached;
    saveSession(storageKey, state);
    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
    updateSummary(dataset, elements, state);
  });

  survey.render(surveyHost);
  updateSummary(dataset, elements, state);
};

const renderExam = async (examEntry) => {
  $("#summary").textContent = "読み込み中";
  $("#copy-all").disabled = true;
  $("#quiz").replaceChildren();

  const { dataset, elements } = await loadQuiz(examEntry);
  document.title = requiredString(dataset.title, "問題集名");
  $("#title").textContent = dataset.title;

  if (dataset.status === "metadata-only" || dataset.status === "upcoming") {
    renderInformation(dataset);
    return;
  }
  renderQuestions(dataset, elements);
};

const main = async () => {
  const catalog = await loadQuizCatalog();
  const select = $("#exam-select");

  for (const exam of catalog.exams) {
    const option = document.createElement("option");
    option.value = requiredString(exam.id, "試験ID");
    option.textContent = requiredString(exam.title, `試験名: ${exam.id}`);
    select.append(option);
  }

  const selectAndRender = async (examId) => {
    const exam = catalog.exams.find((item) => item.id === examId);
    if (!exam) fail(`試験が見つかりません: ${examId}`);
    await renderExam(exam);
  };

  const requestedExam = new URL(window.location.href).searchParams.get("exam");
  const initialExam = requestedExam === null ? catalog.defaultExam : requestedExam;
  if (!catalog.exams.some((item) => item.id === initialExam)) fail(`URLで指定された試験が存在しません: ${initialExam}`);
  select.value = initialExam;
  await selectAndRender(initialExam);

  select.addEventListener("change", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("exam", select.value);
    window.history.replaceState(null, "", url);
    void selectAndRender(select.value);
  });

  $("#copy-all").addEventListener("click", () => {
    if (!activeQuiz) fail("コピー対象の問題集がありません");
    const { dataset, elements, state } = activeQuiz;
    const markdown = buildChatGptMarkdown(dataset, elements, state);
    if (typeof markdown !== "string" || markdown.length === 0) fail("ChatGPT向け回答履歴が空です");
    void navigator.clipboard.writeText(markdown).then(() => showCopyStatus("コピーしました"));
  });
};

void main();
