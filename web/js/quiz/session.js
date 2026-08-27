const STORAGE_PREFIX = "one-tap-quiz";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const storageKeyFor = (dataset) => {
  assert(typeof dataset.id === "string" && dataset.id, "問題集IDがありません");
  assert(typeof dataset.version === "string" && dataset.version, "問題集versionがありません");
  return `${STORAGE_PREFIX}:${dataset.id}:${dataset.version}`;
};

export const loadSession = (key) => {
  const raw = localStorage.getItem(key);
  if (raw === null) return {};

  const value = JSON.parse(raw);
  assert(value && typeof value === "object" && !Array.isArray(value), `回答履歴が壊れています: ${key}`);
  return value;
};

export const saveSession = (key, state) => {
  localStorage.setItem(key, JSON.stringify(state));
};
