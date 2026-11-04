export function readWorkoutDraft(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 500000) return null;
    const value = JSON.parse(raw);
    if (
      value.version !== 1 ||
      !Number.isFinite(value.savedAt) ||
      Date.now() - value.savedAt > 7 * 86400000 ||
      value.savedAt > Date.now() + 60000
    )
      return null;
    if (
      typeof value.notes !== 'string' ||
      value.notes.length > 5000 ||
      (value.effort !== null &&
        (!Number.isInteger(value.effort) || value.effort < 1 || value.effort > 10))
    )
      return null;
    for (const field of ['sets', 'edits', 'meta'])
      if (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field]))
        return null;
    return value;
  } catch {
    return null;
  }
}
export function writeWorkoutDraft(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, version: 1, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}
