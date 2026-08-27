const requiredObject = (value, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}が不正です`);
  return value;
};

const requiredHttpsUrl = (value, label) => {
  if (typeof value !== "string" || !value.startsWith("https://")) throw new Error(`${label}がありません`);
  return value;
};

export const updateReferenceLink = (link, dataset) => {
  requiredObject(link, "参照リンク要素");
  requiredObject(dataset, "問題集");
  if (typeof dataset.referenceOnly !== "boolean") throw new Error(`referenceOnly が不正です: ${dataset.id}`);

  if (dataset.referenceOnly === false) {
    link.removeAttribute("href");
    link.hidden = true;
    return;
  }

  const source = requiredObject(dataset.source, `出典: ${dataset.id}`);
  link.href = requiredHttpsUrl(source.referenceUrl, `参照先URL: ${dataset.id}`);
  link.hidden = false;
};
