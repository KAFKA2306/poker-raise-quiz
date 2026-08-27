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
const examSelect = requiredElement("#exam-select");
const sessionSelect = requiredElement("#session-select");
const dataRoot = new URL("./data/", document.baseURI);

const updateReferenceLink = async () => {
  link.hidden = true;
  link.removeAttribute("href");
  const catalog = await readJson(new URL("catalog.json", dataRoot));
  const examEntry = requiredEntry(catalog.exams, examSelect.value, "試験");
  const examUrl = new URL(examEntry.manifest, dataRoot);
  const exam = await readJson(examUrl);
  const sessionId = sessionSelect.value || exam.defaultSession;
  const sessionEntry = requiredEntry(exam.sessions, sessionId, "試験回");
  const session = await readJson(new URL(sessionEntry.manifest, examUrl));
  if (session.referenceOnly !== true) return;
  if (!session.source?.referenceUrl) throw new Error(`参照専用なのに referenceUrl がありません: ${session.id}`);
  link.href = session.source.referenceUrl;
  link.hidden = false;
};

examSelect.addEventListener("change", () => queueMicrotask(updateReferenceLink));
sessionSelect.addEventListener("change", updateReferenceLink);
queueMicrotask(updateReferenceLink);
