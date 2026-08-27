const readJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`読み込みに失敗しました: ${url} (${response.status})`);
  return response.json();
};

const link = document.querySelector("#reference-link");
const select = document.querySelector("#exam-select");
const dataRoot = new URL("./data/", document.baseURI);

const updateReferenceLink = async () => {
  link.hidden = true;
  link.removeAttribute("href");

  const catalog = await readJson(new URL("catalog.json", dataRoot));
  const examEntry = (catalog.exams || []).find((entry) => entry.id === select.value);
  if (!examEntry) return;

  const examUrl = new URL(examEntry.manifest, dataRoot);
  const exam = await readJson(examUrl);
  if (!exam.defaultSession) return;

  const sessionEntry = (exam.sessions || []).find((entry) => entry.id === exam.defaultSession);
  if (!sessionEntry) return;
  const session = await readJson(new URL(sessionEntry.manifest, examUrl));
  if (session.referenceOnly !== true || !session.source?.referenceUrl) return;

  link.href = session.source.referenceUrl;
  link.hidden = false;
};

select.addEventListener("change", () => {
  updateReferenceLink().catch(console.error);
});

queueMicrotask(() => updateReferenceLink().catch(console.error));
