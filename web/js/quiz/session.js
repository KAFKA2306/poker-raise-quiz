const STORAGE_PREFIX = "one-tap-quiz";

export const storageKeyFor = (dataset) =>
  `${STORAGE_PREFIX}:${dataset.id}:${dataset.version || "1"}`;

export const loadSession = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

export const saveSession = (key, state) => {
  localStorage.setItem(key, JSON.stringify(state));
};
