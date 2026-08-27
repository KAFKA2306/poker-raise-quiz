const STORAGE_PREFIX = "one-tap-quiz";

export const storageKeyFor = (dataset) => {
  if (!dataset.id) throw new Error("dataset.id がありません");
  if (!dataset.version) throw new Error("dataset.version がありません");
  return `${STORAGE_PREFIX}:${dataset.id}:${dataset.version}`;
};

export const loadSession = (key) => {
  const raw = localStorage.getItem(key);
  if (raw === null) return {};

  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`保存データが不正です: ${key}`);
  }
  return value;
};

export const saveSession = (key, state) => {
  localStorage.setItem(key, JSON.stringify(state));
};
