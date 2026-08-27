import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "data/sources/ap-morning-import.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const answers = ["ア", "イ", "ウ", "エ"];

const fail = (message) => {
  throw new Error(message);
};

const assert = (condition, message) => {
  if (!condition) fail(message);
};

const pad3 = (value) => String(value).padStart(3, "0");

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "poker-raise-quiz-data-builder" },
  });
  if (!response.ok) fail(`取得に失敗しました: ${url} (${response.status})`);
  return response.text();
};

const fetchBuffer = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "poker-raise-quiz-data-builder" },
  });
  if (!response.ok) fail(`取得に失敗しました: ${url} (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
};

const clonePinnedUpstream = async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ap-morning-source-"));
  execFileSync("git", ["init", directory], { stdio: "inherit" });
  execFileSync("git", ["-C", directory, "remote", "add", "origin", `${config.upstream.url}.git`], { stdio: "inherit" });
  execFileSync("git", ["-C", directory, "fetch", "--depth=1", "origin", config.upstream.commit], { stdio: "inherit" });
  execFileSync("git", ["-C", directory, "checkout", "--detach", "FETCH_HEAD"], { stdio: "inherit" });
  const actual = execFileSync("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert(actual === config.upstream.commit, `外部入力のcommitが一致しません: ${actual}`);
  return directory;
};

const parsePeriods = async (upstreamRoot) => {
  const source = await readFile(path.join(upstreamRoot, config.upstream.dataFile), "utf8");
  const start = source.indexOf("[");
  const end = source.lastIndexOf("]");
  assert(start >= 0 && end > start, "viewer/data.js の PERIODS を読めません");
  const periods = JSON.parse(source.slice(start, end + 1));
  assert(Array.isArray(periods), "PERIODS が配列ではありません");
  return periods;
};

const normalizeChoiceText = (text) => text
  .replace(/^\s+|\s+$/g, "")
  .replace(/\n{3,}/g, "\n\n");

const splitQuestionAndChoices = (rawText) => {
  const text = String(rawText || "").replace(/\r/g, "").trim();
  const matches = [...text.matchAll(/(?:^|\n)[ \t　]*([アイウエ])[ \t　]+/g)];

  for (let index = 0; index <= matches.length - 4; index += 1) {
    const group = matches.slice(index, index + 4);
    if (!group.every((match, offset) => match[1] === answers[offset])) continue;

    const choices = group.map((match, offset) => {
      const start = match.index + match[0].length;
      const end = offset < 3 ? group[offset + 1].index : text.length;
      return {
        value: match[1],
        text: normalizeChoiceText(text.slice(start, end)),
      };
    });

    const title = text.slice(0, group[0].index).trim();
    if (title && choices.every((choice) => choice.text)) {
      return { title, choices };
    }
  }

  return {
    title: text,
    choices: answers.map((value) => ({ value, text: "" })),
  };
};

const pageCache = new Map();

const officialLinksFor = async (period, answerFileName) => {
  let html = pageCache.get(period.officialPageUrl);
  if (!html) {
    html = await fetchText(period.officialPageUrl);
    pageCache.set(period.officialPageUrl, html);
  }

  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1].replaceAll("&amp;", "&"));

  const findByFileName = (fileName) => {
    const href = hrefs.find((candidate) => {
      try {
        const decoded = decodeURIComponent(candidate);
        return decoded.endsWith(`/${fileName}`) || decoded.endsWith(fileName);
      } catch {
        return candidate.endsWith(fileName);
      }
    });
    return href ? new URL(href, period.officialPageUrl).href : null;
  };

  const questionFileName = answerFileName.replace(/_ans\.pdf$/, "_qs.pdf");
  const questionPdfUrl = findByFileName(questionFileName);
  const answerPdfUrl = findByFileName(answerFileName);
  assert(questionPdfUrl, `IPA公式問題PDFを見つけられません: ${period.id} / ${questionFileName}`);
  assert(answerPdfUrl, `IPA公式解答PDFを見つけられません: ${period.id} / ${answerFileName}`);

  return { questionPdfUrl, answerPdfUrl };
};

const extractAnswersFromPdf = async (pdfUrl, workDirectory) => {
  const pdfPath = path.join(workDirectory, "answer.pdf");
  await writeFile(pdfPath, await fetchBuffer(pdfUrl));

  const extracted = new Map();
  for (const args of [["-layout", pdfPath, "-"], [pdfPath, "-"]]) {
    let text = "";
    try {
      text = execFileSync("pdftotext", args, {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch {
      continue;
    }
    for (const match of text.matchAll(/問\s*(\d{1,2})\s+([アイウエ])/g)) {
      extracted.set(Number(match[1]), match[2]);
    }
    if (extracted.size === 80) break;
  }
  return extracted;
};

const answerFileForPeriod = (answerMap, period) => {
  const marker = period.season === "spring" ? "h" : "a";
  const candidates = Object.keys(answerMap).filter((fileName) => (
    fileName.startsWith(String(period.year)) && fileName.endsWith(`${marker}_ap_am_ans.pdf`)
  ));
  assert(candidates.length === 1, `解答ファイルを一意に特定できません: ${period.id} (${candidates.join(", ")})`);
  return candidates[0];
};

const verifyOfficialAnswers = async ({ period, importedAnswerMap, answerPdfUrl, workDirectory }) => {
  const official = await extractAnswersFromPdf(answerPdfUrl, workDirectory);

  if (official.size === 80) {
    for (let number = 1; number <= 80; number += 1) {
      assert(official.get(number) === importedAnswerMap[String(number)], `IPA公式解答と不一致です: ${period.id} 問${number}`);
    }
    return "pdf-text-auto";
  }

  // 画像PDFなど、pdftotextで表を抽出できない回は、公式PDFの存在を確認した上で
  // upstreamの answers.json（同PDFを目視照合した転記）を使う。該当方法はmanifestへ明記する。
  assert(importedAnswerMap && Object.keys(importedAnswerMap).length === 80, `解答80問を確認できません: ${period.id}`);
  console.warn(`警告: ${period.id} はIPA解答PDFを文字抽出できないため、目視転記済みanswer mapを使用します`);
  return "official-pdf-manual-transcription";
};

const copyImages = async ({ rawQuestion, upstreamRoot, sessionDirectory, questionNumber }) => {
  const imagePaths = Array.isArray(rawQuestion.images) ? rawQuestion.images : [];
  if (imagePaths.length === 0) return [];

  const assetDirectory = path.join(sessionDirectory, "assets");
  await mkdir(assetDirectory, { recursive: true });
  const output = [];

  for (const [index, imagePath] of imagePaths.entries()) {
    const sourcePath = path.resolve(path.join(upstreamRoot, "viewer"), imagePath);
    const extension = path.extname(sourcePath) || ".bin";
    const fileName = `q${pad3(questionNumber)}-${String(index + 1).padStart(2, "0")}${extension.toLowerCase()}`;
    const destination = path.join(assetDirectory, fileName);
    await copyFile(sourcePath, destination);
    output.push(`../assets/${fileName}`);
  }

  return output;
};

const build = async () => {
  const upstreamRoot = await clonePinnedUpstream();
  const workDirectory = await mkdtemp(path.join(os.tmpdir(), "ap-official-"));

  try {
    const periods = await parsePeriods(upstreamRoot);
    const periodsByKey = new Map(periods.map((period) => [period.key, period]));
    const answerMap = await readJson(path.join(upstreamRoot, config.upstream.answerMapFile));

    assert(config.periods.length === config.expected.sessions, "設定した試験回数が expected.sessions と一致しません");

    const examRoot = path.join(root, "data/exams/applied-information");
    await rm(path.join(examRoot, "sessions"), { recursive: true, force: true });
    await mkdir(path.join(examRoot, "sessions"), { recursive: true });

    const sessionEntries = [];
    let totalQuestions = 0;

    for (const period of config.periods) {
      const rawPeriod = periodsByKey.get(period.upstreamKey);
      assert(rawPeriod, `upstreamに試験回がありません: ${period.upstreamKey}`);
      assert(Array.isArray(rawPeriod.questions), `questions がありません: ${period.upstreamKey}`);
      assert(rawPeriod.questions.length === config.expected.questionsPerSession, `80問ではありません: ${period.id}`);

      const answerFileName = answerFileForPeriod(answerMap, period);
      const importedAnswerMap = answerMap[answerFileName];
      const officialLinks = await officialLinksFor(period, answerFileName);
      const answerVerification = await verifyOfficialAnswers({
        period,
        importedAnswerMap,
        answerPdfUrl: officialLinks.answerPdfUrl,
        workDirectory,
      });

      const sessionDirectory = path.join(examRoot, "sessions", period.id);
      const modulesDirectory = path.join(sessionDirectory, "modules");
      await mkdir(modulesDirectory, { recursive: true });

      const modules = [];
      const preparedQuestions = [];

      for (const rawQuestion of rawPeriod.questions) {
        const number = Number(rawQuestion.n);
        assert(Number.isInteger(number) && number >= 1 && number <= 80, `問題番号が不正です: ${period.id}`);
        const parsed = splitQuestionAndChoices(rawQuestion.question);
        const images = await copyImages({ rawQuestion, upstreamRoot, sessionDirectory, questionNumber: number });
        const correctAnswer = String(rawQuestion.answer || "");
        assert(answers.includes(correctAnswer), `正答が不正です: ${period.id} 問${number}`);
        assert(importedAnswerMap[String(number)] === correctAnswer, `upstream answer map と問題データの正答が一致しません: ${period.id} 問${number}`);
        assert(parsed.title, `問題文がありません: ${period.id} 問${number}`);
        assert(parsed.choices.length === 4, `四択ではありません: ${period.id} 問${number}`);
        assert(parsed.choices.every((choice) => choice.text || images.length > 0), `選択肢本文も画像もありません: ${period.id} 問${number}`);

        preparedQuestions.push({
          type: "radiogroup",
          name: `q${pad3(number)}`,
          questionNo: number,
          title: parsed.title,
          choices: parsed.choices,
          correctAnswer,
          ...(images.length ? { images } : {}),
          sourceAttribution: `出典：${period.sourceLabel} 問${number}`,
        });
      }

      preparedQuestions.sort((a, b) => a.questionNo - b.questionNo);
      assert(preparedQuestions.every((question, index) => question.questionNo === index + 1), `問1〜80が連番ではありません: ${period.id}`);

      for (let start = 0; start < 80; start += config.expected.moduleSize) {
        const elements = preparedQuestions.slice(start, start + config.expected.moduleSize);
        const from = elements[0].questionNo;
        const to = elements[elements.length - 1].questionNo;
        const id = `q${pad3(from)}-q${pad3(to)}`;
        const fileName = `${id}.json`;
        await writeJson(path.join(modulesDirectory, fileName), { id, elements });
        modules.push(`modules/${fileName}`);
      }

      await writeJson(path.join(sessionDirectory, "manifest.json"), {
        id: period.id,
        title: period.title,
        version: `${period.id}-80-${config.upstream.commit.slice(0, 12)}`,
        status: "complete",
        coverage: { from: 1, to: 80, count: 80, total: 80 },
        source: {
          publisher: config.official.publisher,
          sourcePageUrl: period.officialPageUrl,
          questionPdfUrl: officialLinks.questionPdfUrl,
          answerPdfUrl: officialLinks.answerPdfUrl,
          usageTermsUrl: config.official.usageTermsUrl,
          inputAssistRepository: config.upstream.url,
          inputAssistCommit: config.upstream.commit,
          answerVerification,
          note: "問題文・選択肢・図表は固定した外部入力を機械変換し、第三者の解説・難易度・タグは除外。正答はIPA公式解答PDFと照合する。",
        },
        modules,
      });

      totalQuestions += preparedQuestions.length;
      sessionEntries.push({ id: period.id, manifest: `sessions/${period.id}/manifest.json` });
      console.log(`${period.id}: 80問を生成`);
    }

    assert(totalQuestions === config.expected.questions, `合計問題数が${config.expected.questions}ではありません: ${totalQuestions}`);

    await writeJson(path.join(examRoot, "manifest.json"), {
      id: config.exam.id,
      title: config.exam.title,
      defaultSession: config.exam.defaultSession,
      generatedBy: "scripts/prepare-data.mjs",
      inputAssistCommit: config.upstream.commit,
      coverage: { sessions: config.expected.sessions, questions: totalQuestions },
      sessions: sessionEntries,
    });

    console.log(`応用情報 午前 ${config.expected.sessions}回・${totalQuestions}問の生成に成功しました`);
  } finally {
    await rm(upstreamRoot, { recursive: true, force: true });
    await rm(workDirectory, { recursive: true, force: true });
  }
};

await build();
