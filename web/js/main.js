import { loadQuiz } from "./quiz/data.js";
import { buildChatGptMarkdown } from "./quiz/export.js";
import { loadSession, saveSession, storageKeyFor } from "./quiz/session.js";

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
}[character]));

const choiceText = (element, value) => {
  const choice = (element.choices || []).find((item) => item.value === value);
  return choice ? String(choice.text) : String(value ?? "");
};

const feedbackText = (element, state) => {
  const mine = choiceText(element, state.answer);
  const correct = choiceText(element, element.correctAnswer);
  const result = `${state.correct ? "正解" : "不正解"}　自分の回答: ${state.answer} ${mine}　正答: ${element.correctAnswer} ${correct}`;
  return element.sourceAttribution ? `${result}\n${element.sourceAttribution}` : result;
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

const toSurveyElements = (element) => {
  const { questionNo, images = [], sourceAttribution, ...surveyElement } = element;
  const radio = {
    ...surveyElement,
    title: `問${questionNo}　${element.title}`,
    description: sourceAttribution || "",
    descriptionLocation: "underInput",
    choices: (element.choices || []).map((choice) => ({
      value: choice.value,
      text: choice.text ? `${choice.value}　${choice.text}` : choice.value,
    })),
  };

  if (!images.length) return [radio];
  const html = `<div class="question-images">${images.map((src) => `<img src="${escapeHtml(src)}" alt="問${questionNo}の図表" loading="lazy">`).join("")}</div>`;
  return [{ type: "html", name: `${element.name}-images`, html }, radio];
};

const configureSessionSelector = (sessions, selectedSessionId) => {
  const select = $("#session-select");
  select.replaceChildren(...sessions.map((session) => {
    const option = document.createElement("option");
    option.value = session.id;
    option.textContent = session.title || session.id;
    option.selected = session.id === selectedSessionId;
    return option;
  }));

  select.addEventListener("change", () => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", select.value);
    window.location.assign(url);
  });
};

const main = async () => {
  const requestedSessionId = new URL(window.location.href).searchParams.get("session");
  const { dataset, elements, sessions, selectedSessionId } = await loadQuiz(requestedSessionId);
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  const storageKey = storageKeyFor(dataset);
  const state = loadSession(storageKey);

  document.title = dataset.title;
  $("#title").textContent = dataset.title;
  configureSessionSelector(sessions, selectedSessionId);

  const sourceLink = $("#source-link");
  if (dataset.source?.sourcePageUrl) sourceLink.href = dataset.source.sourcePageUrl;
  else sourceLink.hidden = true;

  const survey = new Survey.Model({
    elements: elements.flatMap(toSurveyElements),
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

    const cached = { answer: options.value, correct: question.isAnswerCorrect() };
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
