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

export const loadQuizCatalog = async () => {
  const dataRoot = new URL("./data/", document.baseURI);
  const catalog = await readJson(new URL("catalog.json", dataRoot));

  const exams = await Promise.all(
    catalog.exams.map(async (entry) => {
      const examUrl = new URL(entry.manifest, dataRoot);
      const exam = await readJson(examUrl);
      return {
        id: entry.id,
        title: exam.title,
        exam,
        examUrl,
      };
    }),
  );

  requiredEntry(exams, catalog.defaultExam, "既定の試験");

  return {
    defaultExam: catalog.defaultExam,
    exams,
  };
};

export const loadQuiz = async (examEntry) => {
  const { exam, examUrl } = examEntry;
  const sessionEntry = requiredEntry(exam.sessions, exam.defaultSession, "既定の試験回");
  const sessionUrl = new URL(sessionEntry.manifest, examUrl);
  const session = await readJson(sessionUrl);

  const elements = [];
  for (const modulePath of session.modules) {
    const module = await readJson(new URL(modulePath, sessionUrl));
    elements.push(...module.elements);
  }

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
