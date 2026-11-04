import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, filterNew, markSent, parseState, serializeState } from '../src/state.js';

const item = (id, symbol = 'S') => ({ id, datetime: '', symbol, headline: '', tag: '', url: '', product: '' });

test('emptyState has no sent keys and no last success', () => {
  assert.deepEqual(emptyState(), { sentIds: [], lastSuccessAt: null });
});

test('filterNew drops items whose id|symbol key was already sent', () => {
  const state = { sentIds: ['1|S', '3|S'], lastSuccessAt: null };
  assert.deepEqual(filterNew([item('1'), item('2'), item('3'), item('4')], state).map((i) => i.id), ['2', '4']);
});

test('filterNew keeps the same announcement id for a different symbol', () => {
  const state = { sentIds: ['1|A'], lastSuccessAt: null };
  assert.deepEqual(filterNew([item('1', 'A'), item('1', 'B')], state).map((i) => i.symbol), ['B']);
});

test('markSent returns a new state, leaves the input untouched, and stamps lastSuccessAt', () => {
  const before = { sentIds: ['1|S'], lastSuccessAt: null };
  const at = new Date('2026-11-04T00:31:00Z');
  const after = markSent(before, ['2|S', '3|S'], at);
  assert.deepEqual(before, { sentIds: ['1|S'], lastSuccessAt: null });
  assert.deepEqual(after.sentIds, ['1|S', '2|S', '3|S']);
  assert.equal(after.lastSuccessAt, '2026-11-04T00:31:00.000Z');
});

test('markSent does not store the same key twice', () => {
  const after = markSent({ sentIds: ['1|S'], lastSuccessAt: null }, ['1|S', '2|S', '2|S'], new Date());
  assert.deepEqual(after.sentIds, ['1|S', '2|S']);
});

test('markSent keeps only the newest 5000 keys', () => {
  const keys = Array.from({ length: 5000 }, (_, i) => `${i}|S`);
  const after = markSent({ sentIds: keys, lastSuccessAt: null }, ['a|S', 'b|S'], new Date());
  assert.equal(after.sentIds.length, 5000);
  assert.equal(after.sentIds[0], '2|S');
  assert.deepEqual(after.sentIds.slice(-2), ['a|S', 'b|S']);
});

test('parseState falls back to emptyState for empty, broken or malformed input', () => {
  assert.deepEqual(parseState(''), emptyState());
  assert.deepEqual(parseState('{not json'), emptyState());
  assert.deepEqual(parseState('{"sentIds":"oops"}'), emptyState());
  assert.deepEqual(parseState('null'), emptyState());
});

test('serializeState and parseState round-trip', () => {
  const s = { sentIds: ['9|S', '8|S'], lastSuccessAt: '2026-11-04T00:31:00.000Z' };
  assert.deepEqual(parseState(serializeState(s)), s);
});
