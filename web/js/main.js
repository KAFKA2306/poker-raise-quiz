import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => document.querySelector(selector);
const markdown = window.markdownit({ html: false, linkify: true, breaks: true });
let activeQuiz = null;

const choiceText = (element, value) => {
  const choice = (element.choices || []).find((item) => item.value === value);
  return choice ? String(choice.text) : String(value ?? "");
};

const feedbackChoiceText = (element, value) => choiceText(element, value)
  .replace(/!\[[^\]]*\]\([^)]+\)/g, "図")
  .replace(/\s+/g, " ")
  .trim();

const feedbackText = (element, state) => {
  const mine = feedbackChoiceText(element, state.answer);
  const correct = feedbackChoiceText(element, element.correctAnswer);
  return `${state.correct ? "正解" : "不正解"}　自分の回答: ${state.answer} ${mine}　正答: ${element.correctAnswer} ${correct}`;
};

const updateSummary = (dataset, elements, state) => {
  const answered = elements.filter((element) => state[element.name]).length;
  const coverage = dataset.coverage;
  const coverageText = coverage?.total ? `収録 ${coverage.count} / ${coverage.total}問` : `${elements.length}問`;
  $("#summary").textContent = `回答済み ${answered} / ${elements.length}　${coverageText}`;
  $("#copy-all").disabled = answered === 0;
};

const showCopyStatus = (message) => {
  const status = $("#copy-status");
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 1600);
};

const toSurveyElement = (element) => {
  const { questionNo, provenance, category, subcategory, ...surveyElement } = element;
  return {
    ...surveyElement,
    title: `問${questionNo}　${element.title}`,
    choices: (element.choices || []).map((choice) => ({ value: choice.value, text: `${choice.value}　${choice.text}` })),
  };
};

const renderQuestions = (dataset, elements) => {
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  const storageKey = storageKeyFor(dataset);
  const state = loadSession(storageKey);
  activeQuiz = { dataset, elements, state };
  const quiz = $("#quiz");
  quiz.replaceChildren();

  const survey = new Survey.Model({
    elements: elements.map(toSurveyElement),
    showQuestionNumbers: "off",
    showCompleteButton: false,
    showNavigationButtons: false,
  });

  survey.onTextMarkdown.add((_sender, options) => {
    options.html = markdown.render(options.text);
  });

  for (const [name, cached] of Object.entries(state)) {
    const question = survey.getQuestionByName(name);
    const element = byName[name];
    if (!question || !element) continue;
    question.value = cached.answer;
    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
  }

  survey.onValueChanged.add((sender, options) => {
    const name = options.name;
    if (state[name]) return;
    const question = sender.getQuestionByName(name);
    const element = byName[name];
    if (!question || !element) return;
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

const renderExam = async (examEntry) => {
  $("#summary").textContent = "読み込み中";
  $("#copy-all").disabled = true;
  $("#quiz").replaceChildren();
  const { dataset, elements } = await loadQuiz(examEntry);
  document.title = dataset.title;
  $("#title").textContent = dataset.title;
  renderQuestions(dataset, elements);
};

const main = async () => {
  const catalog = await loadQuizCatalog();
  const select = $("#exam-select");
  for (const exam of catalog.exams) {
    const option = document.createElement("option");
    option.value = exam.id;
    option.textContent = exam.title;
    select.append(option);
  }

  const selectAndRender = async (examId) => {
    const exam = catalog.exams.find((item) => item.id === examId);
    if (exam) await renderExam(exam);
  };

  select.value = catalog.defaultExam;
  await selectAndRender(catalog.defaultExam);

  select.addEventListener("change", async () => {
    try {
      await selectAndRender(select.value);
    } catch (error) {
      console.error(error);
      activeQuiz = null;
      $("#summary").textContent = "読み込みに失敗しました";
      $("#copy-all").disabled = true;
      $("#quiz").textContent = "問題データを読み込めませんでした。";
    }
  });

  $("#copy-all").addEventListener("click", async () => {
    if (!activeQuiz) return;
    const { dataset, elements, state } = activeQuiz;
    const text = buildChatGptMarkdown(dataset, elements, state);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showCopyStatus("コピーしました");
    } catch (error) {
      console.error(error);
      showCopyStatus("コピーできませんでした");
    }
  });
};

main().catch((error) => {
  console.error(error);
  $("#summary").textContent = "読み込みに失敗しました";
  $("#quiz").textContent = "問題データを読み込めませんでした。";
});
