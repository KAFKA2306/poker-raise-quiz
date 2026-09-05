import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { clearSession, loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`DOM要素がありません: ${selector}`);
  return element;
};

const renderFatal = (error, context = {}) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  const output = document.createElement("pre");
  const details = Object.entries(context).map(([key, value]) => `${key}: ${value}`);
  output.className = "fatal-error";
  output.textContent = [
    "FATAL ERROR",
    "",
    `URL: ${window.location.href}`,
    ...details,
    "",
    failure.stack,
  ].join("\n");
  document.body.replaceChildren(output);
};

window.addEventListener("unhandledrejection", (event) => {
  renderFatal(event.reason, { 段階: "未処理Promise" });
});

window.addEventListener("error", (event) => {
  if (event.error instanceof Error) {
    renderFatal(event.error, { 段階: "JavaScript実行" });
    return;
  }
  renderFatal(new Error(event.message), { 段階: "JavaScript実行" });
});

let markdownRenderer = null;
let activeQuiz = null;
let catalog = null;
let renderGeneration = 0;

const choiceText = (element, value) => {
  const choice = element.choices.find((item) => item.value === value);
  if (!choice) throw new Error(`選択肢が見つかりません: ${element.name}=${value}`);
  return String(choice.text);
};

const feedbackChoiceText = (element, value) => choiceText(element, value).replace(/!\[[^\]]*\]\([^)]+\)/g, "図").replace(/\s+/g, " ").trim();
const feedbackText = (element, state) => `${state.correct ? "正解" : "不正解"}　自分の回答: ${state.answer} ${feedbackChoiceText(element, state.answer)}　正答: ${element.correctAnswer} ${feedbackChoiceText(element, element.correctAnswer)}`;

const answerSummary = (elements, state) => {
  let correct = 0;
  let incorrect = 0;
  for (const element of elements) {
    const answer = state[element.name];
    if (answer === undefined) continue;
    if (answer.correct) correct += 1;
    else incorrect += 1;
  }
  const answered = correct + incorrect;
  return { answered, correct, incorrect, unanswered: elements.length - answered };
};

const updateSummary = (dataset, elements, state) => {
  if (!dataset.coverage) throw new Error("coverage がありません");
  const summary = answerSummary(elements, state);
  $("#summary").textContent = `回答済み ${summary.answered} / ${elements.length}　正解 ${summary.correct}　不正解 ${summary.incorrect}　未回答 ${summary.unanswered}　収録 ${dataset.coverage.count} / ${dataset.coverage.total}問`;
  $("#copy-all").disabled = summary.answered === 0;
  $("#reset-session").disabled = summary.answered === 0;
};

const reviewFilterMatches = (filter, element, state) => {
  if (filter === "all") return true;
  const answer = state[element.name];
  if (filter === "unanswered") return answer === undefined;
  if (filter === "incorrect") return answer?.correct === false;
  throw new Error(`未知の復習フィルターです: ${filter}`);
};

const updateReviewControls = () => {
  for (const button of document.querySelectorAll("[data-review-filter]")) {
    button.disabled = activeQuiz === null;
    button.setAttribute("aria-pressed", String(activeQuiz !== null && button.dataset.reviewFilter === activeQuiz.filter));
  }
  $("#reset-session").disabled = activeQuiz === null || answerSummary(activeQuiz.elements, activeQuiz.state).answered === 0;
};

const applyReviewFilter = () => {
  if (!activeQuiz) return;
  for (const element of activeQuiz.elements) {
    const question = activeQuiz.survey.getQuestionByName(element.name);
    if (!question) throw new Error(`復習対象の問題が見つかりません: ${element.name}`);
    question.visible = reviewFilterMatches(activeQuiz.filter, element, activeQuiz.state);
  }
  updateReviewControls();
};

const resetReviewControls = () => {
  for (const button of document.querySelectorAll("[data-review-filter]")) {
    button.disabled = true;
    button.setAttribute("aria-pressed", String(button.dataset.reviewFilter === "all"));
  }
  $("#reset-session").disabled = true;
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

const resetReferenceLink = () => {
  const link = $("#reference-link");
  link.hidden = true;
  link.removeAttribute("href");
};

const renderReferenceLink = (dataset) => {
  resetReferenceLink();
  if (!dataset.referenceOnly) return;
  if (!dataset.source.referenceUrl) throw new Error(`参照専用なのに referenceUrl がありません: ${dataset.id}`);
  const link = $("#reference-link");
  link.href = dataset.source.referenceUrl;
  link.hidden = false;
};

const clearQuizRenderer = () => {
  const quiz = $("#quiz");
  window.SurveyUI.unmountComponentAtNode(quiz);
  quiz.replaceChildren();
};

const renderQuestions = (dataset, elements) => {
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  if (Object.keys(byName).length !== elements.length) throw new Error("問題IDが重複しています");
  const storageKey = storageKeyFor(dataset);
  const state = loadSession(storageKey);

  const survey = new Survey.Model({ elements: elements.map(toSurveyElement), showQuestionNumbers: "off", showCompleteButton: false, showNavigationButtons: false });
  activeQuiz = { dataset, elements, state, survey, filter: "all", storageKey };
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
    applyReviewFilter();
  });

  window.SurveyUI.renderSurvey(survey, $("#quiz"));
  updateSummary(dataset, elements, state);
  applyReviewFilter();
};

const examById = (examId) => {
  const exam = catalog.exams.find((item) => item.id === examId);
  if (!exam) throw new Error(`試験が見つかりません: ${examId}`);
  return exam;
};

const currentExam = () => examById($("#exam-select").value);

const populateSessions = (examEntry, selectedSessionId = examEntry.exam.defaultSession) => {
  const select = $("#session-select");
  select.replaceChildren();
  for (const session of examEntry.exam.sessions) {
    if (!session.title) throw new Error(`試験回の表示名がありません: ${session.id}`);
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = session.title;
    select.append(option);
  }
  const sessionExists = examEntry.exam.sessions.some((session) => session.id === selectedSessionId);
  select.value = sessionExists ? selectedSessionId : examEntry.exam.defaultSession;
  if (!select.value) throw new Error(`試験回を選択できません: ${examEntry.id}`);
  select.disabled = examEntry.exam.sessions.length <= 1;
};

const readSelectionFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const requestedExamId = params.get("exam");
  const examEntry = catalog.exams.find((item) => item.id === requestedExamId) ?? examById(catalog.defaultExam);
  const requestedSessionId = params.get("session");
  const sessionId = examEntry.exam.sessions.some((session) => session.id === requestedSessionId)
    ? requestedSessionId
    : examEntry.exam.defaultSession;
  return { examEntry, sessionId };
};

const syncSelectionUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("exam", $("#exam-select").value);
  url.searchParams.set("session", $("#session-select").value);
  window.history.replaceState(null, "", url);
};

const renderSelectedQuiz = async (generation, examEntry, sessionId) => {
  const sessionEntry = examEntry.exam.sessions.find((session) => session.id === sessionId);
  if (!sessionEntry) throw new Error(`試験回が見つかりません: ${examEntry.id}/${sessionId}`);

  activeQuiz = null;
  resetReferenceLink();
  resetReviewControls();
  clearQuizRenderer();
  $("#title").textContent = `${examEntry.title} ${sessionEntry.title}`;
  $("#summary").textContent = `読み込み中: ${examEntry.id} / ${sessionId}`;
  $("#copy-all").disabled = true;

  const { dataset, elements } = await loadQuiz(examEntry, sessionId);
  if (generation !== renderGeneration) return;

  document.title = dataset.title;
  $("#title").textContent = dataset.title;
  renderReferenceLink(dataset);
  renderQuestions(dataset, elements);
};

const startSelectedQuizRender = () => {
  const examEntry = currentExam();
  const sessionId = $("#session-select").value;
  if (!sessionId) throw new Error(`試験回が選択されていません: ${examEntry.id}`);
  syncSelectionUrl();

  const generation = ++renderGeneration;
  renderSelectedQuiz(generation, examEntry, sessionId).then(undefined, (error) => {
    if (generation !== renderGeneration) return;
    renderFatal(error, {
      段階: "問題データ読み込み・表示",
      試験: examEntry.id,
      試験回: sessionId,
    });
  });
};

const main = async () => {
  if (typeof window.markdownit !== "function") throw new Error("Markdown表示ライブラリを読み込めません");
  if (!window.Survey || typeof window.Survey.Model !== "function") throw new Error("SurveyJS coreを読み込めません");
  if (!window.SurveyUI || typeof window.SurveyUI.renderSurvey !== "function" || typeof window.SurveyUI.unmountComponentAtNode !== "function") throw new Error("SurveyJS UI rendererを読み込めません");
  markdownRenderer = window.markdownit({ html: false, linkify: true, breaks: true });

  resetReviewControls();
  catalog = await loadQuizCatalog();
  const examSelect = $("#exam-select");
  for (const exam of catalog.exams) {
    const option = document.createElement("option");
    option.value = exam.id;
    option.textContent = exam.title;
    examSelect.append(option);
  }

  const initialSelection = readSelectionFromUrl();
  examSelect.value = initialSelection.examEntry.id;
  if (examSelect.value !== initialSelection.examEntry.id) throw new Error(`試験を選択できません: ${initialSelection.examEntry.id}`);
  populateSessions(initialSelection.examEntry, initialSelection.sessionId);

  examSelect.addEventListener("change", () => {
    populateSessions(currentExam());
    startSelectedQuizRender();
  });
  $("#session-select").addEventListener("change", () => {
    startSelectedQuizRender();
  });

  for (const button of document.querySelectorAll("[data-review-filter]")) {
    button.addEventListener("click", () => {
      if (!activeQuiz) throw new Error("有効な問題集がありません");
      const filter = button.dataset.reviewFilter;
      if (!filter) throw new Error("復習フィルターがありません");
      activeQuiz.filter = filter;
      applyReviewFilter();
    });
  }

  $("#reset-session").addEventListener("click", () => {
    if (!activeQuiz) throw new Error("有効な問題集がありません");
    if (!window.confirm("この試験回の回答履歴だけを消して、最初からやり直しますか？")) return;
    clearSession(activeQuiz.storageKey);
    startSelectedQuizRender();
  });

  $("#copy-all").addEventListener("click", async () => {
    if (!activeQuiz) throw new Error("有効な問題集がありません");
    const output = buildChatGptMarkdown(activeQuiz.dataset, activeQuiz.elements, activeQuiz.state);
    await navigator.clipboard.writeText(output);
    showCopyStatus("コピーしました");
  });

  startSelectedQuizRender();
};

main().then(undefined, (error) => {
  renderFatal(error, { 段階: "起動" });
});
