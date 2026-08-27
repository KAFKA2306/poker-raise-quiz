import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`DOM要素がありません: ${selector}`);
  return element;
};

let activeQuiz = null;

const choiceText = (element, value) => {
  const choice = element.choices.find((item) => item.value === value);
  if (!choice) throw new Error(`選択肢が見つかりません: ${element.name}=${value}`);
  return String(choice.text);
};

const feedbackText = (element, state) => {
  const mine = choiceText(element, state.answer);
  const correct = choiceText(element, element.correctAnswer);
  return `${state.correct ? "正解" : "不正解"}　自分の回答: ${state.answer} ${mine}　正答: ${element.correctAnswer} ${correct}`;
};

const updateSummary = (dataset, elements, state) => {
  if (!dataset.coverage) throw new Error("coverage がありません");
  const answered = elements.filter((element) => state[element.name] !== undefined).length;
  const coverage = dataset.coverage;
  $("#summary").textContent = `回答済み ${answered} / ${elements.length}　収録 ${coverage.count} / ${coverage.total}問`;
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
  if (!Array.isArray(element.choices) || element.choices.length !== 4) {
    throw new Error(`選択肢が4個ではありません: ${element.name}`);
  }
  const { questionNo, ...surveyElement } = element;
  return {
    ...surveyElement,
    title: `問${questionNo}　${element.title}`,
    choices: element.choices.map((choice) => ({
      value: choice.value,
      text: `${choice.value}　${choice.text}`,
    })),
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

  const survey = new Survey.Model({
    elements: elements.map(toSurveyElement),
    showQuestionNumbers: "off",
    showCompleteButton: false,
    showNavigationButtons: false,
  });

  for (const [name, cached] of Object.entries(state)) {
    const question = survey.getQuestionByName(name);
    const element = byName[name];
    if (!question || !element) throw new Error(`保存データが現行問題と一致しません: ${name}`);
    if (!cached || typeof cached !== "object" || typeof cached.correct !== "boolean") {
      throw new Error(`保存データが不正です: ${name}`);
    }
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
    if (!exam) throw new Error(`試験が見つかりません: ${examId}`);
    await renderExam(exam);
  };

  select.value = catalog.defaultExam;
  await selectAndRender(catalog.defaultExam);

  select.addEventListener("change", async () => {
    await selectAndRender(select.value);
  });

  $("#copy-all").addEventListener("click", async () => {
    if (!activeQuiz) throw new Error("有効な問題集がありません");
    const { dataset, elements, state } = activeQuiz;
    const markdown = buildChatGptMarkdown(dataset, elements, state);
    await navigator.clipboard.writeText(markdown);
    showCopyStatus("コピーしました");
  });
};

main().catch((error) => {
  $("#summary").textContent = `致命的エラー: ${error.message}`;
  $("#copy-all").disabled = true;
  $("#quiz").textContent = "問題データが壊れています。開発者コンソールを確認してください。";
  throw error;
});
