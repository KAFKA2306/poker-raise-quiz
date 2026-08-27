import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { updateReferenceLink } from "./quiz/reference.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`DOM要素がありません: ${selector}`);
  return element;
};

if (typeof window.markdownit !== "function") throw new Error("Markdown表示ライブラリを読み込めません");
const markdownRenderer = window.markdownit({ html: false, linkify: true, breaks: true });
let activeQuiz = null;
let catalog = null;

const choiceText = (element, value) => {
  const choice = element.choices.find((item) => item.value === value);
  if (!choice) throw new Error(`選択肢が見つかりません: ${element.name}=${value}`);
  return String(choice.text);
};

const feedbackChoiceText = (element, value) => choiceText(element, value).replace(/!\[[^\]]*\]\([^)]+\)/g, "図").replace(/\s+/g, " ").trim();
const feedbackText = (element, state) => `${state.correct ? "正解" : "不正解"}　自分の回答: ${state.answer} ${feedbackChoiceText(element, state.answer)}　正答: ${element.correctAnswer} ${feedbackChoiceText(element, element.correctAnswer)}`;

const updateSummary = (dataset, elements, state) => {
  if (!dataset.coverage) throw new Error("coverage がありません");
  const answered = elements.filter((element) => state[element.name] !== undefined).length;
  $("#summary").textContent = `回答済み ${answered} / ${elements.length}　収録 ${dataset.coverage.count} / ${dataset.coverage.total}問`;
  $("#copy-all").disabled = answered === 0;
};

const showCopyStatus = (message) => {
  const status = $("#copy-status");
  status.textContent = message;
  window.setTimeout(() => { if (status.textContent === message) status.textContent = ""; }, 1600);
};

const toSurveyElement = (element) => {
  if (!Array.isArray(element.choices) || element.choices.length !== 4) throw new Error(`選択肢が4個ではありません: ${element.name}`);
  const { questionNo, provenance, category, subcategory, ...surveyElement } = element;
  return {
    ...surveyElement,
    title: `問${questionNo}　${element.title}`,
    choices: element.choices.map((choice) => ({ value: choice.value, text: `${choice.value}　${choice.text}` })),
  };
};

const renderQuestions = (dataset, elements) => {
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  if (Object.keys(byName).length !== elements.length) throw new Error("問題IDが重複しています");
  const storageKey = storageKeyFor(dataset);
  const state = loadSession(storageKey);
  activeQuiz = { dataset, elements, state };
  const quiz = $("#quiz");
  quiz.replaceChildren();

  if (!globalThis.Survey || typeof globalThis.Survey.Model !== "function") throw new Error("SurveyJSが読み込まれていません");
  const survey = new Survey.Model({ elements: elements.map(toSurveyElement), showQuestionNumbers: "off", showCompleteButton: false, showNavigationButtons: false });
  survey.onTextMarkdown.add((_sender, options) => { options.html = markdownRenderer.render(options.text); });

  for (const [name, cached] of Object.entries(state)) {
    const question = survey.getQuestionByName(name);
    const element = byName[name];
    if (!question || !element) throw new Error(`保存データが現行問題と一致しません: ${name}`);
    if (!cached || typeof cached !== "object" || typeof cached.correct !== "boolean") throw new Error(`保存データが不正です: ${name}`);
    choiceText(element, cached.answer);
    question.value = cached.answer;
    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
  }

  survey.onValueChanged.add((sender, options) => {
    const name = options.name;
    if (state[name] !== undefined) throw new Error(`回答済み問題が再更新されました: ${name}`);
    const question = sender.getQuestionByName(name);
    const element = byName[name];
    if (!question || !element) throw new Error(`問題が見つかりません: ${name}`);
    choiceText(element, options.value);
    const cached = { answer: options.value, correct: question.isAnswerCorrect() };
    state[name] = cached;
    saveSession(storageKey, state);
    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
    updateSummary(dataset, elements, state);
  });

  survey.render(quiz);
  updateSummary(dataset, elements, state);
};

const currentExam = () => {
  const examId = $("#exam-select").value;
  if (typeof examId !== "string" || examId.length === 0) throw new Error("試験IDが選択されていません");
  const exam = catalog.exams.find((item) => item.id === examId);
  if (!exam) throw new Error(`試験が見つかりません: ${examId}`);
  return exam;
};

const populateSessions = (examEntry) => {
  if (!Array.isArray(examEntry.exam.sessions) || examEntry.exam.sessions.length === 0) throw new Error(`試験回がありません: ${examEntry.id}`);
  const select = $("#session-select");
  select.replaceChildren();
  for (const session of examEntry.exam.sessions) {
    if (typeof session.id !== "string" || session.id.length === 0) throw new Error(`試験回IDがありません: ${examEntry.id}`);
    if (typeof session.title !== "string" || session.title.length === 0) throw new Error(`試験回名がありません: ${examEntry.id}:${session.id}`);
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = session.title;
    select.append(option);
  }
  if (typeof examEntry.exam.defaultSession !== "string" || examEntry.exam.defaultSession.length === 0) throw new Error(`既定の試験回がありません: ${examEntry.id}`);
  if (!examEntry.exam.sessions.some((session) => session.id === examEntry.exam.defaultSession)) throw new Error(`既定の試験回が一覧にありません: ${examEntry.id}`);
  select.value = examEntry.exam.defaultSession;
  if (select.value !== examEntry.exam.defaultSession) throw new Error(`既定の試験回を選択できません: ${examEntry.id}:${examEntry.exam.defaultSession}`);
  select.disabled = examEntry.exam.sessions.length === 1;
};

const renderSelectedQuiz = async () => {
  const examEntry = currentExam();
  const sessionId = $("#session-select").value;
  if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error(`試験回が選択されていません: ${examEntry.id}`);
  $("#summary").textContent = "読み込み中";
  $("#copy-all").disabled = true;
  $("#quiz").replaceChildren();
  const { dataset, elements } = await loadQuiz(examEntry, sessionId);
  document.title = dataset.title;
  $("#title").textContent = dataset.title;
  updateReferenceLink($("#reference-link"), dataset);
  renderQuestions(dataset, elements);
};

const main = async () => {
  catalog = await loadQuizCatalog();
  const examSelect = $("#exam-select");
  for (const exam of catalog.exams) {
    if (typeof exam.id !== "string" || exam.id.length === 0) throw new Error("試験IDがありません");
    if (typeof exam.title !== "string" || exam.title.length === 0) throw new Error(`試験名がありません: ${exam.id}`);
    const option = document.createElement("option");
    option.value = exam.id;
    option.textContent = exam.title;
    examSelect.append(option);
  }
  examSelect.value = catalog.defaultExam;
  if (examSelect.value !== catalog.defaultExam) throw new Error(`既定の試験を選択できません: ${catalog.defaultExam}`);
  populateSessions(currentExam());
  await renderSelectedQuiz();

  examSelect.addEventListener("change", async () => {
    populateSessions(currentExam());
    await renderSelectedQuiz();
  });
  $("#session-select").addEventListener("change", renderSelectedQuiz);

  $("#copy-all").addEventListener("click", async () => {
    if (!activeQuiz) throw new Error("有効な問題集がありません");
    const output = buildChatGptMarkdown(activeQuiz.dataset, activeQuiz.elements, activeQuiz.state);
    if (typeof output !== "string" || output.length === 0) throw new Error("コピーする回答履歴がありません");
    await navigator.clipboard.writeText(output);
    showCopyStatus("コピーしました");
  });
};

main().catch((error) => {
  document.body.replaceChildren();
  document.body.style.margin = "0";
  document.body.style.padding = "24px";
  document.body.style.background = "#2b0000";
  document.body.style.color = "#ffffff";
  const fatal = document.createElement("pre");
  fatal.id = "fatal-error";
  fatal.style.whiteSpace = "pre-wrap";
  fatal.style.font = "700 16px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace";
  fatal.textContent = `FATAL\n\n${error.stack}`;
  document.body.append(fatal);
  throw error;
});
