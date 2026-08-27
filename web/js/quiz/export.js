const choiceText = (element, value) => {
  const choice = (element.choices || []).find((item) => item.value === value);
  return choice ? String(choice.text) : String(value ?? "");
};

const answerLabel = (element, value) => {
  const text = choiceText(element, value);
  return text === String(value) ? String(value) : `${value}: ${text}`;
};

const sourceLines = (source) => {
  if (!source) return [];
  const lines = ["## 出典"];
  if (source.publisher) lines.push(source.publisher);
  for (const [label, url] of [
    ["公式ページ", source.pageUrl],
    ["問題冊子", source.questionPdfUrl],
    ["解答", source.answerPdfUrl],
    ["試験概要", source.examUrl],
  ]) {
    if (url) lines.push(`${label}: ${url}`);
  }
  lines.push("");
  return lines;
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
    coverage.label || (coverage.total ? `収録範囲: ${coverage.count}問 / 全${coverage.total}問` : ""),
    "",
    ...sourceLines(dataset.source),
  ].filter((line) => line !== "");

  for (const element of answered) {
    const result = state[element.name];
    if (element.referenceOnly) {
      lines.push(
        `## 公式Q${element.questionNo}`,
        `分野: ${element.topic}`,
        `出題回: ${element.examOccurrence}`,
        `公式問題: ${element.sourceUrl}`,
        "",
        "### 自分の回答",
        String(result.answer),
        "",
        "### 正答",
        String(element.correctAnswer),
        "",
        "### 結果",
        result.correct ? "正解" : "不正解",
        "",
      );
      continue;
    }

    lines.push(
      `## 問${element.questionNo}`,
      element.title,
      "",
      "### 選択肢",
      ...(element.choices || []).map((choice) => `- ${choice.value}: ${choice.text}`),
      "",
      "### 自分の回答",
      answerLabel(element, result.answer),
      "",
      "### 正答",
      answerLabel(element, element.correctAnswer),
      "",
      "### 結果",
      result.correct ? "正解" : "不正解",
      "",
    );
  }

  return lines.join("\n").trim();
};
