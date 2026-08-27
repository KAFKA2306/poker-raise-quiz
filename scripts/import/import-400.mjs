import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const examRoot = path.join(root, "data/exams/applied-information");
const sessionsRoot = path.join(examRoot, "sessions");
const sourceRoot = path.join(root, "data/sources/ipa");

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchText = async (url, { optional = false } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "KAFKA2306-poker-raise-quiz-importer" },
      });
      if (!response.ok) {
        if (optional && response.status === 404) return null;
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(500 * attempt);
    }
  }
  if (optional) return null;
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

const cleanOption = (value) => value
  .replace(/^[-*]\s+/, "")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const parseChoicesFromMarkers = (questionText) => {
  const text = questionText
    .replace(/^\s*[-*]\s+([アイウエ])(?=[.．:：)）\s　])/gm, "$1")
    .replaceAll("\r\n", "\n");
  const marker = /(^|\n|[ \t　]{2,})([アイウエ])(?:[.．:：)）])?[ \t　]+/gm;
  const found = [...text.matchAll(marker)].map((match) => ({
    label: match[2],
    markerStart: match.index,
    contentStart: match.index + match[0].length,
  }));
  const labels = ["ア", "イ", "ウ", "エ"];

  for (let index = 0; index <= found.length - 4; index += 1) {
    const candidate = found.slice(index, index + 4);
    if (!candidate.every((item, offset) => item.label === labels[offset])) continue;
    const choices = candidate.map((item, offset) => ({
      value: item.label,
      text: cleanOption(text.slice(item.contentStart, candidate[offset + 1]?.markerStart ?? text.length)),
    }));
    if (choices.every((choice) => choice.text)) {
      return { stem: text.slice(0, candidate[0].markerStart).trim(), choices };
    }
  }
  return null;
};

const parseChoicesFromTable = (questionText) => {
  const lines = questionText.replaceAll("\r\n", "\n").split("\n");
  const choices = [];
  let firstChoiceLine = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const match = line.match(/^\|\s*([アイウエ])\s*\|\s*(.*?)\s*\|?$/);
    if (!match) continue;
    if (firstChoiceLine < 0) firstChoiceLine = index;
    choices.push({
      value: match[1],
      text: match[2].replace(/\|\s*$/, "").trim(),
    });
  }
  if (choices.length !== 4 || choices.map((choice) => choice.value).join("") !== "アイウエ") return null;
  return {
    stem: lines.slice(0, firstChoiceLine).join("\n").trim(),
    choices,
  };
};

const parseChoices = (questionText) => parseChoicesFromMarkers(questionText) || parseChoicesFromTable(questionText);

const sourceImageReferences = (imageSection, session, sourceBaseUrl) => {
  const withoutComments = imageSection.replace(/<!--[\s\S]*?-->/g, "");
  return [...withoutComments.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((match, index) => {
    const sourcePath = match[2].trim();
    const url = /^https?:\/\//.test(sourcePath)
      ? sourcePath
      : `${sourceBaseUrl}/${session.externalSlug}/${sourcePath.replace(/^\.\//, "")}`;
    return { alt: match[1] || `図${index + 1}`, url };
  });
};

const appendImages = (stem, images) => {
  if (!images.length) return stem.trim();
  const markdown = images.map((image) => `![${image.alt}](${image.url})`).join("\n\n");
  return `${stem.trim()}\n\n${markdown}`.trim();
};

const decodeAttribute = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&#39;", "'")
  .replaceAll("&quot;", '"');

const exactImageName = (questionNo, suffix = "") => {
  const number = String(questionNo);
  const padded = number.padStart(2, "0");
  return new RegExp(`^(?:${number}|${padded})${suffix}\\.(?:png|gif|jpe?g|webp)$`, "i");
};

const fetchVisualAssets = async (session, questionNo, visualBaseUrl) => {
  if (!session.apSikenSlug || !visualBaseUrl) return null;
  const pageUrl = `${visualBaseUrl}/${session.apSikenSlug}/q${questionNo}.html`;
  const html = await fetchText(pageUrl, { optional: true });
  if (!html) return null;

  const urls = [...html.matchAll(/<img\b[^>]*?src=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => {
      try {
        return new URL(decodeAttribute(match[1]), pageUrl).href;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const byFile = (pattern) => urls.find((url) => pattern.test(new URL(url).pathname.split("/").pop() || "")) || null;
  const main = byFile(exactImageName(questionNo));
  const suffixes = { ア: "a", イ: "i", ウ: "u", エ: "e" };
  const choiceImages = Object.fromEntries(
    Object.entries(suffixes).map(([label, suffix]) => [label, byFile(exactImageName(questionNo, suffix))]),
  );

  return {
    pageUrl,
    main,
    choiceImages,
    hasAllChoiceImages: Object.values(choiceImages).every(Boolean),
  };
};

const stripSyntheticGraphicalDescription = (stem) => stem
  .replace(/\n?（選択肢[\s\S]*?回路図）\s*$/u, "")
  .replace(/\n?（選択肢[\s\S]*?図）\s*$/u, "")
  .trim();

const pad = (number) => String(number).padStart(3, "0");
const sourcePad = (number) => String(number).padStart(2, "0");
const answerKeys = await readJson(path.join(sourceRoot, "official-answer-keys.json"));
const sourceConfig = await readJson(path.join(sourceRoot, "sessions.json"));
const sourceBaseUrl = sourceConfig.transcriptionInput.baseRawUrl;
const visualBaseUrl = sourceConfig.visualInput?.baseUrl || null;

const examSessions = [];
let totalQuestions = 0;
let graphicalChoiceQuestions = 0;
let visualStemQuestions = 0;

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
        const sourceUrl = `${sourceBaseUrl}/${session.externalSlug}/${sourceName}`;
        const markdown = await fetchText(sourceUrl);
        const { values, body } = parseFrontMatter(markdown);
        if (Number(values.question_no) !== questionNo) throw new Error("転記元の問題番号が一致しません");

        const officialAnswer = answerKey[questionNo - 1];
        if (values.answer !== officialAnswer) {
          throw new Error(`転記元正答 ${values.answer} とIPA公式正答 ${officialAnswer} が一致しません`);
        }

        const questionSection = section(body, "問題文", "参照画像");
        const imageSection = section(body, "参照画像", "正解");
        const parsed = parseChoices(questionSection);
        const sourceImages = sourceImageReferences(imageSection, session, sourceBaseUrl);
        const likelyVisual = /図|回路|グラフ|チャート|画像/u.test(questionSection);
        const shouldProbeVisuals = !parsed || (!sourceImages.length && likelyVisual);
        const visual = shouldProbeVisuals
          ? await fetchVisualAssets(session, questionNo, visualBaseUrl)
          : null;

        let stem = parsed ? parsed.stem : stripSyntheticGraphicalDescription(questionSection);
        if (sourceImages.length) {
          stem = appendImages(stem, sourceImages);
          visualStemQuestions += 1;
        } else if (visual?.main) {
          stem = appendImages(stem, [{ alt: `問${questionNo}の図`, url: visual.main }]);
          visualStemQuestions += 1;
        }

        let choices;
        if (visual?.hasAllChoiceImages) {
          choices = ["ア", "イ", "ウ", "エ"].map((value) => ({
            value,
            text: `![${value}](${visual.choiceImages[value]})`,
          }));
          graphicalChoiceQuestions += 1;
        } else if (parsed) {
          choices = parsed.choices;
        } else if (sourceImages.length) {
          choices = ["ア", "イ", "ウ", "エ"].map((value) => ({ value, text: value }));
          graphicalChoiceQuestions += 1;
        } else {
          throw new Error("図形選択肢を原問題の形で取得できません");
        }

        questions[questionNo - 1] = {
          type: "radiogroup",
          name: `q${pad(questionNo)}`,
          questionNo,
          title: stem,
          choices,
          correctAnswer: officialAnswer,
          category: values.category || null,
          subcategory: values.subcategory || null,
          provenance: {
            canonicalPublisher: "独立行政法人情報処理推進機構（IPA）",
            questionPdfUrl: session.questionPdfUrl,
            transcriptionInput: `sk0517/ExamPractice:${sourceName}`,
            visualInput: visual?.pageUrl || (sourceImages.length ? sourceUrl : null),
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
      note: "問題文と文字選択肢は公開転記を入力補助として正規化し、図表は公開過去問ページの元問題図を参照した。正答はIPA公式解答キーと全80問照合した。第三者の解説文・解説画像は収録していない。",
    },
    transcriptionInput: {
      repository: sourceConfig.transcriptionInput.repository,
      ref: sourceConfig.transcriptionInput.ref,
      path: `exam/${session.externalSlug}`,
    },
    modules: modulePaths,
  });

  examSessions.push({ id: session.id, manifest: `sessions/${session.id}/manifest.json` });
  totalQuestions += questions.length;
  console.log(`${session.id}: 80問 取込・IPA公式正答照合 完了`);
}

if (totalQuestions !== 400) throw new Error(`合計問題数が400ではありません: ${totalQuestions}`);

await writeJson(path.join(examRoot, "manifest.json"), {
  id: "ap",
  title: "応用情報技術者試験",
  defaultSession: "2025-autumn",
  sessions: examSessions,
});

console.log(`合計400問の本番データ生成に成功。図形選択肢=${graphicalChoiceQuestions}問、問題図=${visualStemQuestions}問`);
