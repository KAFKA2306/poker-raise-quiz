const LOAD_TIMEOUT_MS = 10_000;

const readJson = async (url) => {
  const request = fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
  });
  const response = await request.then(undefined, (error) => {
    throw new Error(`読み込みに失敗しました: ${url}\n${error.name}: ${error.message}`);
  });
  if (!response.ok) throw new Error(`読み込みに失敗しました: ${url} (${response.status})`);
  return response.json();
};

const requiredEntry = (entries, id, label) => {
  if (!Array.isArray(entries)) throw new Error(`${label}一覧が配列ではありません`);
  const entry = entries.find((item) => item.id === id);
  if (!entry) throw new Error(`${label}が見つかりません: ${id}`);
  return entry;
};

export const loadQuizCatalog = async () => {
  const dataRoot = new URL("./data/", document.baseURI);
  const catalog = await readJson(new URL("catalog.json", dataRoot));
  if (!Array.isArray(catalog.exams) || catalog.exams.length === 0) throw new Error("catalog.exams が空または不正です");
  if (!catalog.defaultExam) throw new Error("catalog.defaultExam がありません");

  const exams = await Promise.all(catalog.exams.map(async (entry) => {
    if (!entry.id || !entry.manifest) throw new Error("catalog の試験定義が不正です");
    const examUrl = new URL(entry.manifest, dataRoot);
    const exam = await readJson(examUrl);
    if (exam.id !== entry.id) throw new Error(`試験IDが一致しません: catalog=${entry.id}, manifest=${exam.id}`);
    return { id: entry.id, title: exam.title, exam, examUrl };
  }));

  requiredEntry(exams, catalog.defaultExam, "既定の試験");
  return { defaultExam: catalog.defaultExam, exams };
};

export const loadQuiz = async (examEntry, sessionId) => {
  const { exam, examUrl } = examEntry;
  if (!sessionId) throw new Error(`試験回が指定されていません: ${exam.id}`);
  const sessionEntry = requiredEntry(exam.sessions, sessionId, "試験回");
  const sessionUrl = new URL(sessionEntry.manifest, examUrl);
  const session = await readJson(sessionUrl);
  if (session.id !== sessionEntry.id) throw new Error(`試験回IDが一致しません: index=${sessionEntry.id}, manifest=${session.id}`);
  if (typeof session.referenceOnly !== "boolean") throw new Error(`referenceOnly を明示してください: ${session.id}`);
  if (!Array.isArray(session.modules) || session.modules.length === 0) throw new Error(`問題モジュールがありません: ${session.id}`);

  const elements = [];
  for (const modulePath of session.modules) {
    const module = await readJson(new URL(modulePath, sessionUrl));
    if (!Array.isArray(module.elements) || module.elements.length === 0) throw new Error(`問題がありません: ${modulePath}`);
    elements.push(...module.elements);
  }
  if (elements.length === 0) throw new Error(`回答できる問題がありません: ${session.id}`);

  return {
    dataset: {
      id: `${exam.id}:${session.id}`,
      title: `${exam.title} ${session.title}`,
      version: session.version,
      source: session.source,
      coverage: session.coverage,
      status: session.status,
      referenceOnly: session.referenceOnly,
    },
    elements,
  };
};
