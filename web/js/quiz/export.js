const choiceText = (element, value) => {
  const choice = (element.choices || []).find((item) => item.value === value);
  return choice ? String(choice.text) : String(value ?? "");
};

const sourceLines = (source) => {
  if (!source) return [];
  return [
    "## 出典",
    source.publisher || "",
    source.questionPdfUrl || "",
    source.answerPdfUrl || "",
    "",
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "");
};

export const buildChatGptMarkdown = (dataset, elements, state) => {
  const answered = elements.filter((element) => state[element.name]);
  const correctCount = answered.filter((element) => state[element.name].correct).length;
  const coverage = dataset.coverage || {};

  const lines = [
    "# クイズ回答履歴",
    `問題集: ${dataset.title}`,
    `回答済み: ${answered.length}`,
    `正解: ${correctCount}`,
    `不正解: ${answered.length - correctCount}`,
    coverage.total ? `収録範囲: ${coverage.count}問 / 全${coverage.total}問` : "",
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
      ...(element.choices || []).map((choice) => `- ${choice.value}: ${choice.text}`),
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
