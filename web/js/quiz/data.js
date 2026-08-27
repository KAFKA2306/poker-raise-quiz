const readJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`読み込みに失敗しました: ${url} (${response.status})`);
  return response.json();
};

const requiredEntry = (entries, id, label) => {
  const entry = entries.find((item) => item.id === id);
  if (!entry) throw new Error(`${label}が見つかりません: ${id}`);
  return entry;
};

export const loadQuiz = async (requestedSessionId = null) => {
  const dataRoot = new URL("./data/", document.baseURI);
  const catalog = await readJson(new URL("catalog.json", dataRoot));
  const examEntry = requiredEntry(catalog.exams || [], catalog.defaultExam, "既定の試験");
  const examUrl = new URL(examEntry.manifest, dataRoot);
  const exam = await readJson(examUrl);

  const sessionId = requestedSessionId || exam.defaultSession;
  const sessionEntry = requiredEntry(exam.sessions || [], sessionId, "試験回");
  const sessionUrl = new URL(sessionEntry.manifest, examUrl);
  const session = await readJson(sessionUrl);

  const elements = [];
  for (const modulePath of session.modules || []) {
    const moduleUrl = new URL(modulePath, sessionUrl);
    const module = await readJson(moduleUrl);
    for (const element of module.elements || []) {
      elements.push({
        ...element,
        images: (element.images || []).map((imagePath) => new URL(imagePath, moduleUrl).href),
      });
    }
  }

  return {
    dataset: {
      id: `${exam.id}:${session.id}`,
      title: `${exam.title} ${session.title}`,
      version: session.version,
      source: session.source,
      coverage: session.coverage,
      status: session.status,
    },
    sessions: exam.sessions || [],
    selectedSessionId: session.id,
    elements,
  };
};
