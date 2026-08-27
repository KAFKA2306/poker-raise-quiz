const STORAGE_PREFIX = "one-tap-quiz";

const $ = (selector) => document.querySelector(selector);

const loadJson = async (path) => {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
  return response.json();
};

const choiceText = (element, value) => {
  const choice = (element.choices || []).find((item) =>
    typeof item === "object" ? item.value === value : item === value,
  );
  if (choice == null) return String(value ?? "");
  return typeof choice === "object" ? String(choice.text ?? choice.value) : String(choice);
};

const choiceLine = (choice) => {
  if (typeof choice === "object") return `- ${choice.value}: ${choice.text ?? choice.value}`;
  return `- ${choice}`;
};

const sourceText = (source) => {
  if (!source) return "";
  if (typeof source === "string") return source;
  return [source.title, source.url].filter(Boolean).join(" — ");
};

const feedbackText = (element, state) => {
  const mine = choiceText(element, state.answer);
  const correct = choiceText(element, element.correctAnswer);
  return `${state.correct ? "正解" : "不正解"}　自分の回答: ${mine}　正答: ${correct}`;
};

const loadState = (key) => {
  try {
    const state = JSON.parse(localStorage.getItem(key) || "{}");
    return state && typeof state === "object" && !Array.isArray(state) ? state : {};
  } catch {
    return {};
  }
};

const saveState = (key, state) => {
  localStorage.setItem(key, JSON.stringify(state));
};

const buildMarkdown = (dataset, elements, state) => {
  const answered = elements.filter((element) => state[element.name]);
  const correct = answered.filter((element) => state[element.name].correct).length;
  const lines = [
    "# Quiz session",
    `Dataset: ${dataset.title || dataset.id || "quiz"}`,
    `Version: ${dataset.version || "unknown"}`,
    `Answered: ${answered.length}`,
    `Correct: ${correct}`,
    `Wrong: ${answered.length - correct}`,
    "",
  ];

  for (const element of answered) {
    const answer = state[element.name];
    lines.push(
      `## ${element.name}`,
      "### Question",
      String(element.title || ""),
      "",
      "### Choices",
      ...(element.choices || []).map(choiceLine),
      "",
      "### My answer",
      `${answer.answer}: ${choiceText(element, answer.answer)}`,
      "",
      "### Correct answer",
      `${element.correctAnswer}: ${choiceText(element, element.correctAnswer)}`,
      "",
      "### Result",
      answer.correct ? "Correct" : "Incorrect",
      "",
    );

    if (element.explanation) lines.push("### Explanation", String(element.explanation), "");
    const source = sourceText(element.source);
    if (source) lines.push("### Source", source, "");
  }

  return lines.join("\n").trim();
};

const updateSummary = (elements, state) => {
  const answered = elements.filter((element) => state[element.name]).length;
  $("#summary").textContent = `回答済み ${answered} / ${elements.length}`;
  $("#copy-all").disabled = answered === 0;
};

const showStatus = (message) => {
  const status = $("#copy-status");
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) status.textContent = "";
  }, 1600);
};

const main = async () => {
  const raw = await loadJson("./data/questions.json");
  const dataset = raw.dataset || { id: "quiz", title: "Quiz", version: "1" };
  const elements = raw.elements || [];
  const byName = Object.fromEntries(elements.map((element) => [element.name, element]));
  const storageKey = `${STORAGE_PREFIX}:${dataset.id || "quiz"}:${dataset.version || "1"}`;
  const state = loadState(storageKey);

  document.title = dataset.title || "Quiz";
  $("#title").textContent = dataset.title || "Quiz";

  const { dataset: _dataset, elements: _elements, ...surveySettings } = raw;
  const surveyElements = elements.map(({ explanation: _explanation, source: _source, ...element }) => element);
  const survey = new Survey.Model({
    ...surveySettings,
    elements: surveyElements,
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
    saveState(storageKey, state);

    question.readOnly = true;
    question.description = feedbackText(element, cached);
    question.descriptionLocation = "underInput";
    updateSummary(elements, state);
  });

  survey.render(document.getElementById("quiz"));
  updateSummary(elements, state);

  $("#copy-all").addEventListener("click", async () => {
    const markdown = buildMarkdown(dataset, elements, state);
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      showStatus("コピーしました");
    } catch (error) {
      console.error(error);
      showStatus("コピーできませんでした");
    }
  });
};

main().catch((error) => {
  console.error(error);
  $("#quiz").textContent = "問題データを読み込めませんでした。";
});
