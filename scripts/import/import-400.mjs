import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const examRoot = path.join(root, "data/exams/applied-information");
const sessionsRoot = path.join(examRoot, "sessions");
const sourceRoot = path.join(root, "data/sources/ipa");
const cropRoot = path.join(root, ".cache/official-question-crops");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};

const fetchText = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "KAFKA2306-poker-raise-quiz-importer" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }
  throw new Error(`取得に失敗しました: ${url}: ${lastError}`);
};

const parseFrontMatter = (text) => {
  const normalized = text.replaceAll("\r\n", "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) throw new Error("front matter がありません");
  const values = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon >= 0) values[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { values, body: normalized.slice(match[0].length) };
};

const section = (body, heading, nextHeading) => {
  const startToken = `## ${heading}`;
  const start = body.indexOf(startToken);
  if (start < 0) throw new Error(`見出しがありません: ${heading}`);
  const contentStart = body.indexOf("\n", start + startToken.length) + 1;
  const end = nextHeading ? body.indexOf(`## ${nextHeading}`, contentStart) : body.length;
  return body.slice(contentStart, end < 0 ? body.length : end).trim();
};

const parseChoices = (questionText) => {
  const text = questionText.replace(/^\s*[-*]\s+([アイウエ])(?=[.．:：)）\s　])/gm, "$1");
  const marker = /(^|\n|[ \t　]{2,})([アイウエ])(?:[.．:：)）])?[ \t　]+/gm;
  const found = [...text.matchAll(marker)].map((match) => ({
    label: match[2],
    markerStart: match.index,
    contentStart: match.index + match[0].length,
  }));
  const labels = ["ア", "イ", "ウ", "エ"];
  for (let i = 0; i <= found.length - 4; i += 1) {
    const candidate = found.slice(i, i + 4);
    if (!candidate.every((item, index) => item.label === labels[index])) continue;
    const choices = candidate.map((item, index) => ({
      value: item.label,
      text: text.slice(item.contentStart, candidate[index + 1]?.markerStart ?? text.length).trim(),
    }));
    if (choices.every((choice) => choice.text)) {
      return { stem: text.slice(0, candidate[0].markerStart).trim(), choices, graphical: false };
    }
  }
  return {
    stem: questionText.trim(),
    choices: labels.map((value) => ({ value, text: value })),
    graphical: true,
  };
};

const hasRealImage = (imageSection) => {
  const withoutComments = imageSection.replace(/<!--[\s\S]*?-->/g, "");
  return /!\[[^\]]*\]\([^)]+\)/.test(withoutComments);
};

const appendOfficialCrop = async (stem, sessionId, questionNo, sessionDir) => {
  const source = path.join(cropRoot, sessionId, "questions", `q${String(questionNo).padStart(3, "0")}.png`);
  const assetDir = path.join(sessionDir, "assets");
  const fileName = `q${String(questionNo).padStart(3, "0")}.png`;
  await mkdir(assetDir, { recursive: true });
  await copyFile(source, path.join(assetDir, fileName));
  const url = `./data/exams/applied-information/sessions/${sessionId}/assets/${fileName}`;
  return `${stem}\n\n![IPA公式 問${questionNo}](${url})`.trim();
};

const pad = (number) => String(number).padStart(3, "0");
const sourcePad = (number) => String(number).padStart(2, "0");
const answerKeys = await readJson(path.join(sourceRoot, "official-answer-keys.json"));
const sourceConfig = await readJson(path.join(sourceRoot, "sessions.json"));
const sourceBaseUrl = sourceConfig.transcriptionInput.baseRawUrl;

const examSessions = [];
let totalQuestions = 0;
let graphicalQuestions = 0;

for (const session of sourceConfig.sessions) {
  const answerKey = [...answerKeys[session.id]];
  if (answerKey.length !== 80) throw new Error(`${session.id}: IPA公式解答キーが80問ではありません`);

  const sessionDir = path.join(sessionsRoot, session.id);
  await rm(sessionDir, { recursive: true, force: true });
  await mkdir(path.join(sessionDir, "modules"), { recursive: true });

  const questions = new Array(80);
  let cursor = 1;
  const worker = async () => {
    while (true) {
      const questionNo = cursor++;
      if (questionNo > 80) return;
      try {
        const sourceName = `ap_${session.externalSlug}_q${sourcePad(questionNo)}.md`;
        const markdown = await fetchText(`${sourceBaseUrl}/${session.externalSlug}/${sourceName}`);
        const { values, body } = parseFrontMatter(markdown);
        if (Number(values.question_no) !== questionNo) throw new Error("転記元の問題番号が一致しません");
        const officialAnswer = answerKey[questionNo - 1];
        if (values.answer !== officialAnswer) throw new Error(`転記元正答 ${values.answer} とIPA公式正答 ${officialAnswer} が一致しません`);

        const questionSection = section(body, "問題文", "参照画像");
        const imageSection = section(body, "参照画像", "正解");
        const parsed = parseChoices(questionSection);
        const needsOfficialImage = parsed.graphical || hasRealImage(imageSection);
        const title = needsOfficialImage
          ? await appendOfficialCrop(parsed.stem, session.id, questionNo, sessionDir)
          : parsed.stem;
        if (needsOfficialImage) graphicalQuestions += 1;

        questions[questionNo - 1] = {
          type: "radiogroup",
          name: `q${pad(questionNo)}`,
          questionNo,
          title,
          choices: parsed.choices,
          correctAnswer: officialAnswer,
          category: values.category || null,
          subcategory: values.subcategory || null,
          sourceImage: needsOfficialImage ? `assets/q${pad(questionNo)}.png` : null,
          provenance: {
            canonicalPublisher: "独立行政法人情報処理推進機構（IPA）",
            transcriptionInput: `sk0517/ExamPractice:${sourceName}`,
          },
        };
      } catch (error) {
        throw new Error(`${session.id} 問${questionNo}: ${error.message}`, { cause: error });
      }
    }
  };

  await Promise.all(Array.from({ length: 12 }, () => worker()));
  if (questions.some((question) => !question)) throw new Error(`${session.id}: 80問を取得できませんでした`);

  const modulePaths = [];
  for (let start = 1; start <= 80; start += 20) {
    const end = start + 19;
    const relative = `modules/q${pad(start)}-q${pad(end)}.json`;
    modulePaths.push(relative);
    await writeJson(path.join(sessionDir, relative), {
      id: `q${pad(start)}-q${pad(end)}`,
      elements: questions.slice(start - 1, end),
    });
  }

  await writeJson(path.join(sessionDir, "manifest.json"), {
    id: session.id,
    title: session.title,
    version: `${session.id}-80-v1`,
    status: "complete",
    coverage: { from: 1, to: 80, count: 80, total: 80 },
    source: {
      publisher: "独立行政法人情報処理推進機構（IPA）",
      questionPdfUrl: session.questionPdfUrl,
      answerPdfUrl: session.answerPdfUrl,
      note: "問題文と文字選択肢は公開転記を入力補助として正規化し、図表問題はIPA公式PDFの問題領域画像を保持した。正答はIPA公式解答キーと全80問照合した。第三者の解説文は収録していない。",
    },
    transcriptionInput: {
      repository: sourceConfig.transcriptionInput.repository,
      ref: sourceConfig.transcriptionInput.ref,
      path: `exam/${session.externalSlug}`,
    },
    modules: modulePaths,
  });

  examSessions.push({ id: session.id, manifest: `sessions/${session.id}/manifest.json` });
  totalQuestions += 80;
  console.log(`${session.id}: 80問 取込・正答照合 完了`);
}

if (totalQuestions !== 400) throw new Error(`合計問題数が400ではありません: ${totalQuestions}`);
await writeJson(path.join(examRoot, "manifest.json"), {
  id: "ap",
  title: "応用情報技術者試験",
  defaultSession: "2025-autumn",
  sessions: examSessions,
});
console.log(`合計400問の本番データ生成に成功。公式画像を使う問題: ${graphicalQuestions}問`);
