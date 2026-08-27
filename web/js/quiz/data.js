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

const officialTitle = {
  reform: "制度見直し",
  examPlan: "試験構成と開始予定",
  syllabus: "シラバス",
  sampleQuestions: "サンプル問題",
};

export const loadQuizCatalog = async () => {
  const dataRoot = new URL("./data/", document.baseURI);
  const catalog = await readJson(new URL("catalog.json", dataRoot));
  const exams = await Promise.all((catalog.exams || []).map(async (entry) => {
    const examUrl = new URL(entry.manifest, dataRoot);
    const exam = await readJson(examUrl);
    return { id: entry.id, title: exam.title, exam, examUrl };
  }));
  requiredEntry(exams, catalog.defaultExam, "既定の試験");
  return { defaultExam: catalog.defaultExam, exams };
};

export const loadQuiz = async (examEntry, requestedSessionId = null) => {
  const { exam, examUrl } = examEntry;

  if (exam.contentMode === "metadata-only") {
    return {
      dataset: {
        id: exam.id,
        title: exam.title,
        version: exam.examInfo?.scopeVersion || "metadata-only",
        status: "metadata-only",
        examInfo: exam.examInfo,
        questionPolicy: exam.questionPolicy,
        sources: exam.sources || [],
      },
      sessions: [],
      selectedSessionId: null,
      elements: [],
    };
  }

  if (exam.status === "upcoming") {
    return {
      dataset: {
        id: exam.id,
        title: exam.title,
        version: exam.syllabus?.version || exam.plannedStart || "upcoming",
        status: "upcoming",
        plannedStart: exam.plannedStart,
        delivery: exam.delivery,
        examPlan: exam.examPlan,
        syllabus: exam.syllabus,
        sampleQuestions: exam.sampleQuestions,
        sources: Object.entries(exam.officialUrls || {}).map(([key, url]) => ({ title: officialTitle[key] || key, url })),
      },
      sessions: [],
      selectedSessionId: null,
      elements: [],
    };
  }

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
