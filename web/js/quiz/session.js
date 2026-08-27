const STORAGE_PREFIX = "one-tap-quiz";

const requiredString = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}がありません`);
  }
  return value;
};

export const storageKeyFor = (dataset) => {
  const id = requiredString(dataset?.id, "問題集ID");
  const version = requiredString(dataset?.version, "問題集version");
  return `${STORAGE_PREFIX}:${id}:${version}`;
};

export const loadSession = (key) => {
  requiredString(key, "保存キー");
  const raw = localStorage.getItem(key);
  if (raw === null) return {};

  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`保存済み回答が壊れています: ${key}`);
  }
  return value;
};

export const saveSession = (key, state) => {
  requiredString(key, "保存キー");
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error(`保存する回答状態が不正です: ${key}`);
  }
  localStorage.setItem(key, JSON.stringify(state));
};
