const requiredText = (value, label) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}がありません`);
  return value;
};

const choiceText = (element, value) => {
  const choice = element.choices.find((item) => item.value === value);
  if (!choice) throw new Error(`選択肢が見つかりません: ${element.name} / ${value}`);
  return String(choice.text);
};

const sourceLines = (source) => [
  "## 出典",
  requiredText(source.publisher, "出典publisher"),
  requiredText(source.questionPdfUrl, "問題出典URL"),
  requiredText(source.answerPdfUrl, "正答出典URL"),
  "",
];

export const buildChatGptMarkdown = (dataset, elements, state) => {
  const answered = elements.filter((element) => state[element.name]);
  const correctCount = answered.filter((element) => state[element.name].correct).length;
  const coverage = dataset.coverage;

  const lines = [
    "# クイズ回答履歴",
    `問題集: ${dataset.title}`,
    `回答済み: ${answered.length}`,
    `正解: ${correctCount}`,
    `不正解: ${answered.length - correctCount}`,
    `収録範囲: ${coverage.count}問 / 全${coverage.total}問`,
    "",
    ...sourceLines(dataset.source),
  ].filter((line) => line !== "");

  for (const element of answered) {
    const result = state[element.name];
    lines.push(
      `## 問${element.questionNo}`,
      element.title,
      "",
      "### 選択肢",
      ...element.choices.map((choice) => `- ${choice.value}: ${choice.text}`),
      "",
      "### 自分の回答",
      `${result.answer}: ${choiceText(element, result.answer)}`,
      "",
      "### 正答",
      `${element.correctAnswer}: ${choiceText(element, element.correctAnswer)}`,
      "",
      "### 結果",
      result.correct ? "正解" : "不正解",
      "",
    );
  }

  return lines.join("\n").trim();
};
