// Cross-run state: which news ids were already sent, and when the last run succeeded.

const MAX_IDS = 5000;

export const emptyState = () => ({ sentIds: [], lastSuccessAt: null });

export function filterNew(items, state) {
  const sent = new Set(state.sentIds);
  return items.filter((item) => !sent.has(item.id));
}

/** Returns a new state; the input is never mutated. */
export function markSent(state, ids, at) {
  const merged = [...state.sentIds];
  const have = new Set(merged);
  for (const id of ids) {
    if (!have.has(id)) {
      have.add(id);
      merged.push(id);
    }
  }
  return { sentIds: merged.slice(-MAX_IDS), lastSuccessAt: at.toISOString() };
}

export function parseState(text) {
  try {
    const raw = JSON.parse(text);
    if (!raw || !Array.isArray(raw.sentIds)) return emptyState();
    const last = typeof raw.lastSuccessAt === 'string' ? raw.lastSuccessAt : null;
    return { sentIds: raw.sentIds.map(String), lastSuccessAt: last };
  } catch {
    return emptyState();
  }
}

export const serializeState = (state) => JSON.stringify(state, null, 2) + '\n';
