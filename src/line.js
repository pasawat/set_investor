// LINE Messaging API: split the digest into allowed message sizes and push it (spec §8).
import { randomUUID } from 'node:crypto';

const PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const MAX_PER_PUSH = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hard-split text into chunks of at most `max` UTF-16 units without splitting a surrogate pair.
function chunk(text, max) {
  const out = [];
  for (let i = 0; i < text.length; ) {
    let end = Math.min(i + max, text.length);
    if (end < text.length) {
      const c = text.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end--; // do not end on a high surrogate
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function toPieces(blocks, max) {
  const pieces = [];
  let firstBlock = true;
  for (const block of blocks) {
    if (!block.trim()) continue;
    let firstLine = true;
    for (const line of block.split('\n')) {
      const sep = pieces.length === 0 ? '' : firstLine && !firstBlock ? '\n\n' : '\n';
      const parts = chunk(line, max);
      parts.forEach((text, i) => pieces.push({ text, sep: i === 0 ? sep : '' }));
      firstLine = false;
    }
    firstBlock = false;
  }
  return pieces;
}

/** Pack blocks into messages of at most `maxChars`; beyond `maxMessages` cut the end and append `tailNote`. */
export function splitMessages(blocks, { maxChars = 5000, maxMessages = 5 } = {}, tailNote = '') {
  const messages = [];
  let current = '';
  for (const piece of toPieces(blocks, maxChars)) {
    const addition = (current ? piece.sep : '') + piece.text;
    if (current && current.length + addition.length > maxChars) {
      messages.push(current);
      current = piece.text;
    } else {
      current += addition;
    }
  }
  if (current) messages.push(current);
  if (messages.length <= maxMessages) return messages;

  const kept = messages.slice(0, maxMessages);
  const room = maxChars - tailNote.length - 1;
  let last = kept[maxMessages - 1];
  while (last.length > room && last.includes('\n')) last = last.slice(0, last.lastIndexOf('\n'));
  if (last.length > room) last = chunk(last, Math.max(room, 1))[0];
  kept[maxMessages - 1] = `${last}\n${tailNote}`;
  return kept;
}

/** Push text messages to one LINE user. Retries 429/5xx/network errors with one idempotency key. */
export async function pushLine({ token, userId, messages, fetchImpl = fetch, retryDelayMs = 1000, retries = 3 }) {
  if (messages.length > MAX_PER_PUSH) throw new Error(`LINE allows at most ${MAX_PER_PUSH} messages per push (got ${messages.length})`);
  const clean = (s) => String(s).split(token).join('***');
  const body = JSON.stringify({ to: userId, messages: messages.map((text) => ({ type: 'text', text })) });
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Line-Retry-Key': randomUUID() };
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetchImpl(PUSH_URL, { method: 'POST', headers, body });
    } catch (e) {
      last = new Error(`LINE push failed: ${clean(e.message)}`);
      await sleep(retryDelayMs);
      continue;
    }
    if (res.ok) return;
    const detail = clean(await res.text()).slice(0, 300);
    const error = new Error(`LINE push failed: HTTP ${res.status} ${detail}`);
    if (res.status !== 429 && res.status < 500) throw error;
    last = error;
    await sleep(retryDelayMs);
  }
  throw last;
}
