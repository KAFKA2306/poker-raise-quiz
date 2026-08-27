const choiceText = (element, value) => {
  const choice = element.choices.find((item) => item.value === value);
  if (!choice) throw new Error(`選択肢が見つかりません: ${element.name}=${value}`);
  return String(choice.text);
};

const sourceLines = (source) => {
  if (!source?.publisher) throw new Error("出典 publisher がありません");
  if (!source.questionPdfUrl) throw new Error("出典 questionPdfUrl がありません");
  if (!source.answerPdfUrl) throw new Error("出典 answerPdfUrl がありません");

  return [
    "## 出典",
    source.publisher,
    source.questionPdfUrl,
    source.answerPdfUrl,
    "",
  ];
};

export const buildChatGptMarkdown = (dataset, elements, state) => {
  if (!dataset.coverage) throw new Error("coverage がありません");

  const answered = elements.filter((element) => state[element.name] !== undefined);
  const correctCount = answered.filter((element) => state[element.name].correct === true).length;
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
  ];

  for (const element of answered) {
    const result = state[element.name];
    if (!result || typeof result.correct !== "boolean") {
      throw new Error(`回答状態が不正です: ${element.name}`);
    }

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
