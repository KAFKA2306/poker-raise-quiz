import { loadDefaultQuiz } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => document.querySelector(selector);

const choiceText = (element, value) => {
  const choice = (element.choices || []).find((item) => item.value === value);
  return choice ? String(choice.text) : String(value ?? "");
};

const feedbackText = (element, state) => {
  const mine = choiceText(element, state.answer);
  const correct = choiceText(element, element.correctAnswer);
  return `${state.correct ? "正解" : "不正解"}　自分の回答: ${state.answer} ${mine}　正答: ${element.correctAnswer} ${correct}`;
};

const updateSummary = (dataset, elements, state) => {
  const answered = elements.filter((element) => state[element.name]).length;
  const coverage = dataset.coverage;
  const coverageText = coverage?.total
    ? `収録 ${coverage.count} / ${coverage.total}問`
    : `${elements.length}問`;
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
  const { questionNo, ...surveyElement } = element;
  return {
    ...surveyElement,
    title: `問${questionNo}　${element.title}`,
    choices: (element.choices || []).map((choice) => ({
      value: choice.value,
      text: `${choice.value}　${choice.text}`,
    })),
  };
};

const main = async () => {
  const { dataset, elements } = await loadDefaultQuiz();
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  const storageKey = storageKeyFor(dataset);
  const state = loadSession(storageKey);

  document.title = dataset.title;
  $("#title").textContent = dataset.title;

  const survey = new Survey.Model({
    elements: elements.map(toSurveyElement),
    showQuestionNumbers: "off",
    showCompleteButton: false,
    showNavigationButtons: false,
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

    const cached = {
      answer: options.value,
      correct: question.isAnswerCorrect(),
    };

    state[name] = cached;
    saveSession(storageKey, state);

    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
    updateSummary(dataset, elements, state);
  });

  survey.render(document.getElementById("quiz"));
  updateSummary(dataset, elements, state);

  $("#copy-all").addEventListener("click", async () => {
    const markdown = buildChatGptMarkdown(dataset, elements, state);
    if (!markdown) return;

    try {
      await navigator.clipboard.writeText(markdown);
      showCopyStatus("コピーしました");
    } catch (error) {
      console.error(error);
      showCopyStatus("コピーできませんでした");
    }
  });
};

main().catch((error) => {
  console.error(error);
  $("#quiz").textContent = "問題データを読み込めませんでした。";
});
