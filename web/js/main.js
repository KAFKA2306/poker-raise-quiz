import { loadQuiz, loadQuizCatalog } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => document.querySelector(selector);

let activeQuiz = null;

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

const addTextRow = (list, label, value) => {
  if (value === undefined || value === null || value === "") return;
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = String(value);
  list.append(term, description);
};

const examPlanText = (plan) => {
  if (!plan || typeof plan !== "object") return "";
  const parts = [];
  for (const [key, value] of Object.entries(plan)) {
    if (key.endsWith("Minutes")) {
      parts.push(`${key}: ${value}分`);
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const detail = [value.title, value.questionCount ? `${value.questionCount}問` : "", value.minutes ? `${value.minutes}分` : ""]
      .filter(Boolean)
      .join(" / ");
    if (detail) parts.push(detail);
  }
  return parts.join("、");
};

const renderInformation = (dataset) => {
  activeQuiz = null;
  $("#copy-all").disabled = true;

  const isUpcoming = dataset.status === "upcoming";
  $("#summary").textContent = isUpcoming ? "本試験前のため問題は収録していません" : "問題本文は収録していません";

  const quiz = $("#quiz");
  quiz.replaceChildren();

  const card = document.createElement("section");
  card.className = "notice-card";

  const heading = document.createElement("h2");
  heading.textContent = isUpcoming
    ? "公式に確認できる予定情報だけを掲載しています"
    : "公開できる試験情報だけを掲載しています";

  const note = document.createElement("p");
  note.textContent = isUpcoming
    ? `この試験は未実施です。開始予定は ${dataset.plannedStart || "未定"} です。サンプル問題を本試験問題として扱いません。`
    : dataset.questionPolicy?.note || "公開可能な問題本文が確認できていないため、問題は収録していません。";

  const details = document.createElement("dl");
  details.className = "exam-details";

  if (isUpcoming) {
    addTextRow(details, "開始予定", dataset.plannedStart);
    addTextRow(details, "試験方式", dataset.delivery);
    addTextRow(details, "科目構成", examPlanText(dataset.examPlan));
    addTextRow(details, "シラバス", [dataset.syllabus?.status, dataset.syllabus?.version].filter(Boolean).join(" / "));
    addTextRow(details, "サンプル問題", dataset.sampleQuestions?.status);
  } else {
    const info = dataset.examInfo || {};
    addTextRow(details, "受験方法", info.method);
    addTextRow(details, "出題形式", info.questionFormat);
    addTextRow(details, "問題数", info.questionCount);
    addTextRow(details, "試験時間", info.durationMinutes ? `${info.durationMinutes}分` : "");
    addTextRow(details, "合格水準", info.passScore);
    addTextRow(details, "出題範囲", info.scopeVersion);
  }

  card.append(heading, note, details);

  const topics = dataset.examInfo?.topics || [];
  if (topics.length > 0) {
    const topicsHeading = document.createElement("h3");
    topicsHeading.textContent = "主な出題範囲";
    const list = document.createElement("ul");
    for (const topic of topics) {
      const item = document.createElement("li");
      item.textContent = topic;
      list.append(item);
    }
    card.append(topicsHeading, list);
  }

  if ((dataset.sources || []).length > 0) {
    const sourcesHeading = document.createElement("h3");
    sourcesHeading.textContent = "公式情報";
    const sources = document.createElement("ul");
    sources.className = "source-list";
    for (const source of dataset.sources) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.title;
      link.target = "_blank";
      link.rel = "noreferrer";
      item.append(link);
      sources.append(item);
    }
    card.append(sourcesHeading, sources);
  }

  quiz.append(card);
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

  if (["metadata-only", "upcoming"].includes(dataset.status)) {
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
    option.value = exam.id;
    option.textContent = exam.title;
    select.append(option);
  }

  const selectAndRender = async (examId) => {
    const exam = catalog.exams.find((item) => item.id === examId);
    if (!exam) return;
    await renderExam(exam);
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
  $("#summary").textContent = "読み込みに失敗しました";
  $("#quiz").textContent = "問題データを読み込めませんでした。";
});
