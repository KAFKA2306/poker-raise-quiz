import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const examRoot = path.join(root, "data/exams/applied-information");
const sessionsRoot = path.join(examRoot, "sessions");
const sourceRoot = path.join(root, "data/sources/ipa");
const labels = ["ア", "イ", "ウ", "エ"];

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchText = async (url, optional = false) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "KAFKA2306-poker-raise-quiz-importer" } });
      if (!response.ok) {
        if (optional && response.status === 404) return null;
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(400 * attempt);
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

const parseMarkerChoices = (questionText) => {
  const text = questionText.replace(/^\s*[-*]\s+([アイウエ])(?=[.．:：)）\s　])/gm, "$1");
  const marker = /(^|\n|[ \t　]{2,})([アイウエ])(?:[.．:：)）])?[ \t　]+/gm;
  const found = [...text.matchAll(marker)].map((match) => ({
    value: match[2], markerStart: match.index, contentStart: match.index + match[0].length,
  }));
  for (let i = 0; i <= found.length - 4; i += 1) {
    const group = found.slice(i, i + 4);
    if (!group.every((item, j) => item.value === labels[j])) continue;
    const choices = group.map((item, j) => ({
      value: item.value,
      text: text.slice(item.contentStart, group[j + 1]?.markerStart ?? text.length).trim(),
    }));
    if (choices.every((choice) => choice.text)) return { stem: text.slice(0, group[0].markerStart).trim(), choices };
  }
  return null;
};

const parseTableChoices = (questionText) => {
  const lines = questionText.split("\n");
  const choices = [];
  let first = -1;
  lines.forEach((raw, index) => {
    const match = raw.trim().match(/^\|\s*([アイウエ])\s*\|\s*(.*?)\s*\|?$/);
    if (!match) return;
    if (first < 0) first = index;
    choices.push({ value: match[1], text: match[2].replace(/\|\s*$/, "").trim() });
  });
  if (choices.length !== 4 || choices.map((choice) => choice.value).join("") !== labels.join("")) return null;
  return { stem: lines.slice(0, first).join("\n").trim(), choices };
};

const parseChoices = (text) => parseMarkerChoices(text) || parseTableChoices(text);

const decodeHtml = (value) => String(value)
  .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
  .replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
  .replaceAll("&#39;", "'").replaceAll("&quot;", '"');

const htmlChoiceTexts = (html) => {
  const marked = html
    .replace(/<input\b[^>]*(?:value|aria-label|data-answer)=["']([アイウエ])["'][^>]*>/gi, "\n@@$1@@ ")
    .replace(/<button\b[^>]*>\s*([アイウエ])\s*<\/button>/gi, "\n@@$1@@ ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:li|p|div|tr|td|dd|dt|section)>/gi, "\n")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "");
  const text = decodeHtml(marked).replace(/[ \t　]+/g, " ");
  const direct = text.split("\n").map((line) => line.trim()).map((line) => {
    const match = line.match(/^@@([アイウエ])@@\s*(.+)$/);
    return match ? { value: match[1], text: match[2].trim() } : null;
  }).filter(Boolean);
  for (let i = 0; i <= direct.length - 4; i += 1) {
    const group = direct.slice(i, i + 4);
    if (group.every((choice, j) => choice.value === labels[j])) return group;
  }
  return null;
};

const sourceImages = (imageSection, session, sourceBaseUrl) => {
  const text = imageSection.replace(/<!--[\s\S]*?-->/g, "");
  return [...text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((match, index) => {
    const sourcePath = match[2].trim();
    return {
      alt: match[1] || `図${index + 1}`,
      url: /^https?:\/\//.test(sourcePath) ? sourcePath : `${sourceBaseUrl}/${session.externalSlug}/${sourcePath.replace(/^\.\//, "")}`,
    };
  });
};

const appendImages = (stem, images) => images.length
  ? `${stem.trim()}\n\n${images.map((image) => `![${image.alt}](${image.url})`).join("\n\n")}`.trim()
  : stem.trim();

const exactImageName = (questionNo, suffix = "") => {
  const n = String(questionNo);
  const p = n.padStart(2, "0");
  return new RegExp(`^(?:${n}|${p})${suffix}\\.(?:png|gif|jpe?g|webp)$`, "i");
};

const fetchQuestionPage = async (session, questionNo, visualBaseUrl) => {
  if (!visualBaseUrl || !session.apSikenSlug) return null;
  const pageUrl = `${visualBaseUrl}/${session.apSikenSlug}/q${questionNo}.html`;
  const html = await fetchText(pageUrl, true);
  if (!html) return null;
  const urls = [...html.matchAll(/<img\b[^>]*?src=["']([^"']+)["'][^>]*>/gi)].map((match) => {
    try { return new URL(decodeHtml(match[1]), pageUrl).href; } catch { return null; }
  }).filter(Boolean);
  const byFile = (pattern) => urls.find((url) => pattern.test(new URL(url).pathname.split("/").pop() || "")) || null;
  const suffixes = { ア: "a", イ: "i", ウ: "u", エ: "e" };
  const choiceImages = Object.fromEntries(Object.entries(suffixes).map(([label, suffix]) => [label, byFile(exactImageName(questionNo, suffix))]));
  const choiceTexts = htmlChoiceTexts(html);
  return {
    pageUrl,
    main: byFile(exactImageName(questionNo)),
    choiceImages,
    choiceTexts,
    allChoiceImages: Object.values(choiceImages).every(Boolean),
    allChoiceTexts: Array.isArray(choiceTexts) && choiceTexts.length === 4,
  };
};

const stripSyntheticVisualDescription = (text) => text
  .replace(/\n?（選択肢[\s\S]*?回路図）\s*$/u, "")
  .replace(/\n?（選択肢[\s\S]*?図）\s*$/u, "")
  .trim();

const pad = (n) => String(n).padStart(3, "0");
const sourcePad = (n) => String(n).padStart(2, "0");
const answerKeys = await readJson(path.join(sourceRoot, "official-answer-keys.json"));
const config = await readJson(path.join(sourceRoot, "sessions.json"));
const sourceBaseUrl = config.transcriptionInput.baseRawUrl;
const visualBaseUrl = config.visualInput?.baseUrl || null;

const examSessions = [];
let totalQuestions = 0;
let sourceAnswerMismatches = 0;
let graphicalChoices = 0;
let recoveredChoices = 0;
let visualStems = 0;

for (const session of config.sessions) {
  const official = [...answerKeys[session.id]];
  if (official.length !== 80) throw new Error(`${session.id}: IPA公式解答キーが80問ではありません`);
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
        const correctAnswer = official[questionNo - 1];
        if (values.answer !== correctAnswer) {
          sourceAnswerMismatches += 1;
          console.warn(`${session.id} 問${questionNo}: 転記元正答=${values.answer}, IPA公式正答=${correctAnswer}。IPA公式を採用`);
        }

        const questionSection = section(body, "問題文", "参照画像");
        const imageSection = section(body, "参照画像", "正解");
        const parsed = parseChoices(questionSection);
        const images = sourceImages(imageSection, session, sourceBaseUrl);
        const likelyVisual = /図|回路|グラフ|チャート|画像/u.test(questionSection);
        const page = (!parsed || (!images.length && likelyVisual)) ? await fetchQuestionPage(session, questionNo, visualBaseUrl) : null;

        let title = parsed ? parsed.stem : stripSyntheticVisualDescription(questionSection);
        if (images.length) {
          title = appendImages(title, images);
          visualStems += 1;
        } else if (page?.main) {
          title = appendImages(title, [{ alt: `問${questionNo}の図`, url: page.main }]);
          visualStems += 1;
        }

        let choices;
        if (page?.allChoiceImages) {
          choices = labels.map((value) => ({ value, text: `![${value}](${page.choiceImages[value]})` }));
          graphicalChoices += 1;
        } else if (parsed) {
          choices = parsed.choices;
        } else if (page?.allChoiceTexts) {
          choices = page.choiceTexts;
          recoveredChoices += 1;
        } else if (images.length) {
          choices = labels.map((value) => ({ value, text: value }));
          graphicalChoices += 1;
        } else {
          throw new Error("選択肢を原問題の形で取得できません");
        }

        questions[questionNo - 1] = {
          type: "radiogroup",
          name: `q${pad(questionNo)}`,
          questionNo,
          title,
          choices,
          correctAnswer,
          category: values.category || null,
          subcategory: values.subcategory || null,
          provenance: {
            canonicalPublisher: "独立行政法人情報処理推進機構（IPA）",
            questionPdfUrl: session.questionPdfUrl,
            transcriptionInput: `sk0517/ExamPractice:${sourceName}`,
            visualInput: page?.pageUrl || (images.length ? sourceUrl : null),
            transcriptionAnswer: values.answer || null,
            transcriptionAnswerMatchesOfficial: values.answer === correctAnswer,
          },
        };
      } catch (error) {
        throw new Error(`${session.id} 問${questionNo}: ${error.message}`, { cause: error });
      }
    }
  };

  await Promise.all(Array.from({ length: 12 }, () => worker()));
  if (questions.some((question) => !question)) throw new Error(`${session.id}: 80問を取得できませんでした`);

  const modules = [];
  for (let start = 1; start <= 80; start += 20) {
    const end = start + 19;
    const relative = `modules/q${pad(start)}-q${pad(end)}.json`;
    modules.push(relative);
    await writeJson(path.join(sessionDir, relative), { id: `q${pad(start)}-q${pad(end)}`, elements: questions.slice(start - 1, end) });
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
      note: "問題文と文字選択肢は公開転記又は公開過去問ページの問題欄だけを入力補助として正規化し、図表は元問題図を参照した。正答はIPA公式解答キーを正準とし全80問に適用した。第三者の解説文・解説画像は収録していない。",
    },
    transcriptionInput: { repository: config.transcriptionInput.repository, ref: config.transcriptionInput.ref, path: `exam/${session.externalSlug}` },
    modules,
  });
  examSessions.push({ id: session.id, manifest: `sessions/${session.id}/manifest.json` });
  totalQuestions += 80;
  console.log(`${session.id}: 80問 取込・IPA公式正答適用 完了`);
}

if (totalQuestions !== 400) throw new Error(`合計問題数が400ではありません: ${totalQuestions}`);
await writeJson(path.join(examRoot, "manifest.json"), {
  id: "ap",
  title: "応用情報技術者試験",
  defaultSession: "2025-autumn",
  sessions: examSessions,
});
console.log(`合計400問生成成功。転記元正答不一致=${sourceAnswerMismatches}、図形選択肢=${graphicalChoices}、欠落選択肢復元=${recoveredChoices}、問題図=${visualStems}`);
