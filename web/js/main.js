import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => document.querySelector(selector);

let activeQuiz = null;

const crash = (error) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  const output = document.createElement("pre");
  output.className = "fatal-error";
  output.textContent = `FATAL ERROR\n\n${failure.stack}`;
  document.body.replaceChildren(output);
  throw failure;
};

const choiceText = (element, value) => {
  const choice = element.choices.find((item) => item.value === value);
  if (!choice) throw new Error(`選択肢が見つかりません: ${element.name} / ${value}`);
  return String(choice.text);
};

const feedbackText = (element, state) => {
  const mine = choiceText(element, state.answer);
  const correct = choiceText(element, element.correctAnswer);
  return `${state.correct ? "正解" : "不正解"}　自分の回答: ${state.answer} ${mine}　正答: ${element.correctAnswer} ${correct}`;
};

const updateSummary = (dataset, elements, state) => {
  const answered = elements.filter((element) => state[element.name]).length;
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

const renderReferenceLink = (dataset) => {
  const link = $("#reference-link");
  link.hidden = true;
  link.removeAttribute("href");

  if (dataset.referenceOnly !== true) return;
  const url = dataset.source.referenceUrl;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new Error(`参照専用試験の公式問題URLがありません: ${dataset.id}`);
  }

  link.href = url;
  link.hidden = false;
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

  for (const [name, cached] of Object.entries(state)) {
    const question = survey.getQuestionByName(name);
    if (!question) throw new Error(`保存済み回答に対応するSurvey問題がありません: ${name}`);

    const element = byName[name];
    if (!element) throw new Error(`保存済み回答に対応する問題データがありません: ${name}`);

    question.value = cached.answer;
    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
  }

  survey.onValueChanged.add((sender, options) => {
    const name = options.name;
    if (state[name]) throw new Error(`回答済み問題が再度変更されました: ${name}`);

    const question = sender.getQuestionByName(name);
    if (!question) throw new Error(`Survey問題が見つかりません: ${name}`);

    const element = byName[name];
    if (!element) throw new Error(`問題データが見つかりません: ${name}`);

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
  if (elements.length === 0) throw new Error(`問題がありません: ${dataset.id}`);

  document.title = dataset.title;
  $("#title").textContent = dataset.title;
  renderReferenceLink(dataset);
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

  select.addEventListener("change", () => {
    selectAndRender(select.value).catch(crash);
  });

  $("#copy-all").addEventListener("click", () => {
    const copyAnswers = async () => {
      if (!activeQuiz) throw new Error("有効な問題集がありません");
      const { dataset, elements, state } = activeQuiz;
      const markdown = buildChatGptMarkdown(dataset, elements, state);
      if (!markdown) throw new Error("コピー対象が空です");
      await navigator.clipboard.writeText(markdown);
      showCopyStatus("コピーしました");
    };

    copyAnswers().catch(crash);
  });
};

main().catch(crash);
