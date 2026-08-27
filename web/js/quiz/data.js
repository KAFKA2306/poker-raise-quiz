const fail = (message) => {
  throw new Error(message);
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || value.length === 0) fail(`${label}がありません`);
  return value;
};

const requiredArray = (value, label) => {
  if (!Array.isArray(value)) fail(`${label}が配列ではありません`);
  return value;
};

const requiredObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}が不正です`);
  return value;
};

const readJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) fail(`読み込みに失敗しました: ${url} (${response.status})`);
  return response.json();
};

const requiredEntry = (entries, id, label) => {
  requiredArray(entries, `${label}一覧`);
  requiredString(id, `${label}ID`);
  const entry = entries.find((item) => item.id === id);
  if (!entry) fail(`${label}が見つかりません: ${id}`);
  return entry;
};

const officialTitle = {
  reform: "制度見直し",
  examPlan: "試験構成と開始予定",
  syllabus: "シラバス",
  sampleQuestions: "サンプル問題",
};

export const loadQuizCatalog = async () => {
  const dataRoot = new URL("./data/", document.baseURI);
  const catalog = requiredObject(await readJson(new URL("catalog.json", dataRoot)), "catalog.json");
  const catalogEntries = requiredArray(catalog.exams, "catalog.json exams");
  if (catalogEntries.length === 0) fail("catalog.json に試験がありません");

  const exams = await Promise.all(
    catalogEntries.map(async (entry) => {
      requiredObject(entry, "試験一覧要素");
      const id = requiredString(entry.id, "試験ID");
      const manifest = requiredString(entry.manifest, `試験manifest: ${id}`);
      const examUrl = new URL(manifest, dataRoot);
      const exam = requiredObject(await readJson(examUrl), `試験manifest: ${id}`);
      if (exam.id !== id) fail(`catalogとmanifestの試験IDが一致しません: ${id}`);
      const title = requiredString(exam.title, `試験名: ${id}`);
      requiredArray(exam.sessions, `sessions: ${id}`);
      return { id, title, exam, examUrl };
    }),
  );

  const defaultExam = requiredString(catalog.defaultExam, "既定の試験ID");
  requiredEntry(exams, defaultExam, "既定の試験");
  return { defaultExam, exams };
};

export const loadQuiz = async (examEntry) => {
  requiredObject(examEntry, "試験エントリ");
  const exam = requiredObject(examEntry.exam, "試験manifest");
  const examUrl = examEntry.examUrl;
  const examId = requiredString(exam.id, "試験ID");
  const examTitle = requiredString(exam.title, `試験名: ${examId}`);

  if (exam.contentMode === "metadata-only") {
    const examInfo = requiredObject(exam.examInfo, `試験情報: ${examId}`);
    const questionPolicy = requiredObject(exam.questionPolicy, `問題公開方針: ${examId}`);
    const sources = requiredArray(exam.sources, `公式情報: ${examId}`);
    return {
      dataset: {
        id: examId,
        title: examTitle,
        version: requiredString(examInfo.scopeVersion, `出題範囲version: ${examId}`),
        status: "metadata-only",
        examInfo,
        questionPolicy,
        sources,
      },
      elements: [],
    };
  }

  if (exam.status === "upcoming") {
    const plannedStart = requiredString(exam.plannedStart, `開始予定: ${examId}`);
    const officialUrls = requiredObject(exam.officialUrls, `公式URL: ${examId}`);
    const sources = Object.entries(officialUrls).map(([key, url]) => ({
      title: requiredString(officialTitle[key], `公式URL種別: ${key}`),
      url: requiredString(url, `公式URL: ${examId}/${key}`),
    }));
    return {
      dataset: {
        id: examId,
        title: examTitle,
        version: plannedStart,
        status: "upcoming",
        plannedStart,
        delivery: requiredString(exam.delivery, `試験方式: ${examId}`),
        examPlan: requiredObject(exam.examPlan, `試験構成: ${examId}`),
        syllabus: requiredObject(exam.syllabus, `シラバス: ${examId}`),
        sampleQuestions: requiredObject(exam.sampleQuestions, `サンプル問題: ${examId}`),
        sources,
      },
      elements: [],
    };
  }

  const sessions = requiredArray(exam.sessions, `sessions: ${examId}`);
  const sessionEntry = requiredEntry(sessions, requiredString(exam.defaultSession, `既定の試験回: ${examId}`), "既定の試験回");
  const sessionUrl = new URL(requiredString(sessionEntry.manifest, `試験回manifest: ${sessionEntry.id}`), examUrl);
  const session = requiredObject(await readJson(sessionUrl), `試験回manifest: ${sessionEntry.id}`);
  if (session.id !== sessionEntry.id) fail(`試験回IDが一致しません: ${sessionEntry.id}`);

  const modules = requiredArray(session.modules, `問題モジュール: ${session.id}`);
  if (modules.length === 0) fail(`問題モジュールがありません: ${session.id}`);

  const elements = [];
  for (const modulePath of modules) {
    const moduleUrl = new URL(requiredString(modulePath, `問題モジュールpath: ${session.id}`), sessionUrl);
    const module = requiredObject(await readJson(moduleUrl), `問題モジュール: ${modulePath}`);
    const moduleElements = requiredArray(module.elements, `問題一覧: ${modulePath}`);
    if (moduleElements.length === 0) fail(`問題がありません: ${modulePath}`);
    elements.push(...moduleElements);
  }

  return {
    dataset: {
      id: `${examId}:${requiredString(session.id, "試験回ID")}`,
      title: `${examTitle} ${requiredString(session.title, `試験回名: ${session.id}`)}`,
      version: requiredString(session.version, `試験回version: ${session.id}`),
      source: requiredObject(session.source, `出典: ${session.id}`),
      coverage: requiredObject(session.coverage, `収録範囲: ${session.id}`),
      status: requiredString(session.status, `試験回status: ${session.id}`),
      contentMode: requiredString(session.contentMode, `contentMode: ${session.id}`),
      isFullExam: typeof session.isFullExam === "boolean"
        ? session.isFullExam
        : fail(`isFullExam がありません: ${session.id}`),
    },
    elements,
  };
};
