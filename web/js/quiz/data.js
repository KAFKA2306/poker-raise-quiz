const readJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`読み込みに失敗しました: ${url} (${response.status})`);
  return response.json();
};

const requiredEntry = (entries, id, label) => {
  if (!Array.isArray(entries)) throw new Error(`${label}一覧が配列ではありません`);
  if (typeof id !== "string" || id.length === 0) throw new Error(`${label}IDがありません`);
  const entry = entries.find((item) => item.id === id);
  if (!entry) throw new Error(`${label}が見つかりません: ${id}`);
  return entry;
};

export const loadQuizCatalog = async () => {
  const dataRoot = new URL("./data/", document.baseURI);
  const catalog = await readJson(new URL("catalog.json", dataRoot));
  if (!Array.isArray(catalog.exams) || catalog.exams.length === 0) throw new Error("catalog.exams が空または不正です");
  if (typeof catalog.defaultExam !== "string" || catalog.defaultExam.length === 0) throw new Error("catalog.defaultExam がありません");

  const exams = await Promise.all(catalog.exams.map(async (entry) => {
    if (!entry || typeof entry !== "object" || !entry.id || !entry.manifest) throw new Error("catalog の試験定義が不正です");
    const examUrl = new URL(entry.manifest, dataRoot);
    const exam = await readJson(examUrl);
    if (exam.id !== entry.id) throw new Error(`試験IDが一致しません: catalog=${entry.id}, manifest=${exam.id}`);
    if (typeof exam.title !== "string" || exam.title.length === 0) throw new Error(`試験名がありません: ${exam.id}`);
    if (!Array.isArray(exam.sessions) || exam.sessions.length === 0) throw new Error(`試験回がありません: ${exam.id}`);
    if (typeof exam.defaultSession !== "string" || exam.defaultSession.length === 0) throw new Error(`既定の試験回がありません: ${exam.id}`);
    requiredEntry(exam.sessions, exam.defaultSession, "既定の試験回");
    return { id: entry.id, title: exam.title, exam, examUrl };
  }));

  requiredEntry(exams, catalog.defaultExam, "既定の試験");
  return { defaultExam: catalog.defaultExam, exams };
};

export const loadQuiz = async (examEntry, sessionId) => {
  if (!examEntry || typeof examEntry !== "object") throw new Error("試験定義がありません");
  const { exam, examUrl } = examEntry;
  if (!exam || typeof exam !== "object") throw new Error("試験manifestがありません");
  if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error(`試験回が指定されていません: ${exam.id}`);

  const sessionEntry = requiredEntry(exam.sessions, sessionId, "試験回");
  if (typeof sessionEntry.manifest !== "string" || sessionEntry.manifest.length === 0) throw new Error(`試験回manifestがありません: ${sessionId}`);
  const sessionUrl = new URL(sessionEntry.manifest, examUrl);
  const session = await readJson(sessionUrl);
  if (session.id !== sessionEntry.id) throw new Error(`試験回IDが一致しません: index=${sessionEntry.id}, manifest=${session.id}`);
  if (typeof session.referenceOnly !== "boolean") throw new Error(`referenceOnly が明示されていません: ${session.id}`);
  if (!Array.isArray(session.modules) || session.modules.length === 0) throw new Error(`問題モジュールがありません: ${session.id}`);

  const elements = [];
  for (const modulePath of session.modules) {
    if (typeof modulePath !== "string" || modulePath.length === 0) throw new Error(`問題モジュールpathが不正です: ${session.id}`);
    const module = await readJson(new URL(modulePath, sessionUrl));
    if (!Array.isArray(module.elements) || module.elements.length === 0) throw new Error(`問題がありません: ${modulePath}`);
    elements.push(...module.elements);
  }
  if (elements.length === 0) throw new Error(`回答できる問題がありません: ${session.id}`);
  if (!session.coverage || typeof session.coverage !== "object") throw new Error(`coverage がありません: ${session.id}`);
  if (!session.source || typeof session.source !== "object") throw new Error(`source がありません: ${session.id}`);
  if (typeof session.version !== "string" || session.version.length === 0) throw new Error(`version がありません: ${session.id}`);
  if (typeof session.title !== "string" || session.title.length === 0) throw new Error(`試験回名がありません: ${session.id}`);

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
