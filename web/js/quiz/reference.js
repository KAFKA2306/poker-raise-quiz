const readJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`読み込みに失敗しました: ${url} (${response.status})`);
  return response.json();
};

const requiredElement = (selector) => {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`DOM要素がありません: ${selector}`);
  return element;
};

const requiredEntry = (entries, id, label) => {
  if (!Array.isArray(entries)) throw new Error(`${label}一覧が配列ではありません`);
  const entry = entries.find((item) => item.id === id);
  if (!entry) throw new Error(`${label}が見つかりません: ${id}`);
  return entry;
};

const link = requiredElement("#reference-link");
const select = requiredElement("#exam-select");
const dataRoot = new URL("./data/", document.baseURI);

const updateReferenceLink = async () => {
  link.hidden = true;
  link.removeAttribute("href");

  const catalog = await readJson(new URL("catalog.json", dataRoot));
  const examEntry = requiredEntry(catalog.exams, select.value, "試験");
  const examUrl = new URL(examEntry.manifest, dataRoot);
  const exam = await readJson(examUrl);
  if (!exam.defaultSession) throw new Error(`既定の試験回がありません: ${exam.id}`);

  const sessionEntry = requiredEntry(exam.sessions, exam.defaultSession, "既定の試験回");
  const session = await readJson(new URL(sessionEntry.manifest, examUrl));

  if (session.referenceOnly !== true) return;
  if (!session.source?.referenceUrl) {
    throw new Error(`参照専用なのに referenceUrl がありません: ${session.id}`);
  }

  link.href = session.source.referenceUrl;
  link.hidden = false;
};

select.addEventListener("change", async () => {
  await updateReferenceLink();
});

queueMicrotask(async () => {
  await updateReferenceLink();
});
