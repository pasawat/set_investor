// Cross-run state: which news rows (id|symbol keys) were already sent, and when the last run succeeded.
import { newsKey } from './news.js';

const MAX_IDS = 5000;

export const emptyState = () => ({ sentIds: [], lastSuccessAt: null });

export function filterNew(items, state) {
  const sent = new Set(state.sentIds);
  return items.filter((item) => !sent.has(newsKey(item)));
}

/** Returns a new state; the input is never mutated. */
export function markSent(state, keys, at) {
  const merged = [...state.sentIds];
  const have = new Set(merged);
  for (const key of keys) {
    if (!have.has(key)) {
      have.add(key);
      merged.push(key);
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
