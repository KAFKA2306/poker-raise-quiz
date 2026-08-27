import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
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

const renderFatal = (error) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  const output = document.createElement("pre");
  output.className = "fatal-error";
  output.textContent = `FATAL ERROR\n\n${failure.stack}`;
  document.body.replaceChildren(output);
};

window.addEventListener("unhandledrejection", (event) => {
  renderFatal(event.reason);
});

window.addEventListener("error", (event) => {
  if (event.error instanceof Error) {
    renderFatal(event.error);
    return;
  }
  throw new Error(event.message);
});

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

const renderReferenceLink = (dataset) => {
  const link = $("#reference-link");
  link.hidden = true;
  link.removeAttribute("href");
  if (!dataset.referenceOnly) return;
  if (!dataset.source.referenceUrl) throw new Error(`参照専用なのに referenceUrl がありません: ${dataset.id}`);
  link.href = dataset.source.referenceUrl;
  link.hidden = false;
};

const renderQuestions = (dataset, elements) => {
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  if (Object.keys(byName).length !== elements.length) throw new Error("問題IDが重複しています");
  const storageKey = storageKeyFor(dataset);
  const state = loadSession(storageKey);
  activeQuiz = { dataset, elements, state };
  const quiz = $("#quiz");
  quiz.replaceChildren();

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
  const exam = catalog.exams.find((item) => item.id === examId);
  if (!exam) throw new Error(`試験が見つかりません: ${examId}`);
  return exam;
};

const populateSessions = (examEntry) => {
  const select = $("#session-select");
  select.replaceChildren();
  for (const session of examEntry.exam.sessions) {
    if (!session.title) throw new Error(`試験回の表示名がありません: ${session.id}`);
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = session.title;
    select.append(option);
  }
  select.value = examEntry.exam.defaultSession;
  if (select.value !== examEntry.exam.defaultSession) throw new Error(`既定の試験回を選択できません: ${examEntry.exam.defaultSession}`);
  select.disabled = examEntry.exam.sessions.length <= 1;
};

const renderSelectedQuiz = async () => {
  const examEntry = currentExam();
  const sessionId = $("#session-select").value;
  if (!sessionId) throw new Error(`試験回が選択されていません: ${examEntry.id}`);
  $("#summary").textContent = "読み込み中";
  $("#copy-all").disabled = true;
  $("#quiz").replaceChildren();
  const { dataset, elements } = await loadQuiz(examEntry, sessionId);
  document.title = dataset.title;
  $("#title").textContent = dataset.title;
  renderReferenceLink(dataset);
  renderQuestions(dataset, elements);
};

const main = async () => {
  catalog = await loadQuizCatalog();
  const examSelect = $("#exam-select");
  for (const exam of catalog.exams) {
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
  $("#session-select").addEventListener("change", async () => {
    await renderSelectedQuiz();
  });

  $("#copy-all").addEventListener("click", async () => {
    if (!activeQuiz) throw new Error("有効な問題集がありません");
    const output = buildChatGptMarkdown(activeQuiz.dataset, activeQuiz.elements, activeQuiz.state);
    await navigator.clipboard.writeText(output);
    showCopyStatus("コピーしました");
  });
};

main();
