import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitMessages, pushLine } from '../src/line.js';

const OPTS = { maxChars: 5000, maxMessages: 5 };
const TAIL = '… ตัดท้าย ดูรายงานเต็มที่ลิงก์';
const lineOf = (n) => `บรรทัดข่าวที่ ${String(n).padStart(5, '0')} รายละเอียดสั้นๆ`; // ~35 chars
const blockOf = (chars) => {
  const lines = [];
  let total = 0;
  for (let i = 0; total < chars; i++) { const l = lineOf(i); lines.push(l); total += l.length + 1; }
  return lines.join('\n');
};

test('every message is within 5000 characters', () => {
  for (const size of [100, 4999, 5001, 12000, 40000]) {
    const out = splitMessages([blockOf(size)], OPTS, TAIL);
    assert.ok(out.every((m) => m.length <= 5000), `size ${size}`);
  }
});

test('12,000 characters of short lines become 3 messages', () => {
  assert.equal(splitMessages([blockOf(12000)], OPTS, TAIL).length, 3);
});

test('40,000 characters are cut to 5 messages ending with the tail note, still within 5000', () => {
  const out = splitMessages([blockOf(40000)], OPTS, TAIL);
  assert.equal(out.length, 5);
  assert.ok(out[4].endsWith(TAIL));
  assert.ok(out[4].length <= 5000);
});

test('messages are never cut in the middle of a line', () => {
  const block = blockOf(20000);
  const inputLines = new Set(block.split('\n'));
  const out = splitMessages([block], OPTS, TAIL);
  for (const m of out) for (const l of m.split('\n')) assert.ok(inputLines.has(l) || l === TAIL, `bad line: ${l.slice(0, 40)}`);
});

test('small blocks are kept together, separated by a blank line', () => {
  const out = splitMessages(['หัวเรื่อง\nบรรทัดสอง', '[หมวด] 1 ข่าว\n• x'], OPTS, TAIL);
  assert.equal(out.length, 1);
  assert.equal(out[0], 'หัวเรื่อง\nบรรทัดสอง\n\n[หมวด] 1 ข่าว\n• x');
});

test('a single line longer than the limit is split at the limit with no characters lost', () => {
  const long = 'ก'.repeat(12000);
  const out = splitMessages([long], OPTS, TAIL);
  assert.ok(out.every((m) => m.length <= 5000));
  assert.equal(out.join(''), long);
});

test('a hard cut never splits a surrogate pair', () => {
  const emoji = '😀'.repeat(3000); // 6000 UTF-16 units
  const out = splitMessages([emoji], OPTS, TAIL);
  assert.ok(out.every((m) => m.length <= 5000));
  assert.ok(out.every((m) => m === m.toWellFormed()));
  assert.equal(out.join(''), emoji);
});

test('no blocks, no messages', () => {
  assert.deepEqual(splitMessages([], OPTS, TAIL), []);
  assert.deepEqual(splitMessages(['', ''], OPTS, TAIL), []);
});

// ---- pushLine
function fakeFetch(statuses) {
  const calls = [];
  const queue = [...statuses];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const status = queue.length > 1 ? queue.shift() : queue[0];
    return { ok: status >= 200 && status < 300, status, text: async () => `body-${status}` };
  };
  fn.calls = calls;
  return fn;
}
const push = (f, extra = {}) => pushLine({ token: 'SECRET-TOKEN', userId: 'U123', messages: ['สวัสดี', 'สอง'], fetchImpl: f, retryDelayMs: 0, ...extra });

test('pushLine posts the push API with bearer token and text messages', async () => {
  const f = fakeFetch([200]);
  await push(f);
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://api.line.me/v2/bot/message/push');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer SECRET-TOKEN');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { to: 'U123', messages: [{ type: 'text', text: 'สวัสดี' }, { type: 'text', text: 'สอง' }] });
});

test('429 and 5xx are retried (same retry key), other errors are not', async () => {
  const f = fakeFetch([429, 503, 200]);
  await push(f);
  assert.equal(f.calls.length, 3);
  const keys = new Set(f.calls.map((c) => c.init.headers['X-Line-Retry-Key']));
  assert.equal(keys.size, 1);
  assert.ok([...keys][0]);

  const bad = fakeFetch([400]);
  await assert.rejects(() => push(bad), /400/);
  assert.equal(bad.calls.length, 1);
});

test('gives up after 3 attempts and the error never contains the token', async () => {
  const f = fakeFetch([500]);
  await assert.rejects(() => push(f), (e) => /500/.test(e.message) && !e.message.includes('SECRET-TOKEN'));
  assert.equal(f.calls.length, 3);
});

test('more than 5 messages is refused before any request', async () => {
  const f = fakeFetch([200]);
  await assert.rejects(() => push(f, { messages: ['1', '2', '3', '4', '5', '6'] }), /5/);
  assert.equal(f.calls.length, 0);
});

test('a network error is retried too', async () => {
  let n = 0;
  const f = async () => { n++; if (n < 2) throw new Error('ECONNRESET'); return { ok: true, status: 200, text: async () => '' }; };
  await push(f);
  assert.equal(n, 2);
});
