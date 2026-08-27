const readJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`読み込みに失敗しました: ${url} (${response.status})`);
  }
  return response.json();
};

const requiredEntry = (entries, id, label) => {
  const entry = entries.find((item) => item.id === id);
  if (!entry) throw new Error(`${label}が見つかりません: ${id}`);
  return entry;
};

export const loadDefaultQuiz = async () => {
  const dataRoot = new URL("./data/", document.baseURI);
  const catalogUrl = new URL("catalog.json", dataRoot);
  const catalog = await readJson(catalogUrl);

  const examEntry = requiredEntry(catalog.exams || [], catalog.defaultExam, "既定の試験");
  const examUrl = new URL(examEntry.manifest, dataRoot);
  const exam = await readJson(examUrl);

  const sessionEntry = requiredEntry(exam.sessions || [], exam.defaultSession, "既定の試験回");
  const sessionUrl = new URL(sessionEntry.manifest, examUrl);
  const session = await readJson(sessionUrl);

  const elements = [];
  for (const modulePath of session.modules || []) {
    const moduleUrl = new URL(modulePath, sessionUrl);
    const module = await readJson(moduleUrl);
    elements.push(...(module.elements || []));
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
    elements,
  };
};
