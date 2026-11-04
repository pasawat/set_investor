import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, filterNew, markSent, parseState, serializeState } from '../src/state.js';

const item = (id) => ({ id, datetime: '', symbol: '', headline: '', tag: '', url: '', product: '' });

test('emptyState has no sent ids and no last success', () => {
  assert.deepEqual(emptyState(), { sentIds: [], lastSuccessAt: null });
});

test('filterNew drops ids already sent', () => {
  const state = { sentIds: ['1', '3'], lastSuccessAt: null };
  assert.deepEqual(filterNew([item('1'), item('2'), item('3'), item('4')], state).map((i) => i.id), ['2', '4']);
});

test('markSent returns a new state, leaves the input untouched, and stamps lastSuccessAt', () => {
  const before = { sentIds: ['1'], lastSuccessAt: null };
  const at = new Date('2026-11-04T00:31:00Z');
  const after = markSent(before, ['2', '3'], at);
  assert.deepEqual(before, { sentIds: ['1'], lastSuccessAt: null });
  assert.deepEqual(after.sentIds, ['1', '2', '3']);
  assert.equal(after.lastSuccessAt, '2026-11-04T00:31:00.000Z');
});

test('markSent does not store the same id twice', () => {
  const after = markSent({ sentIds: ['1'], lastSuccessAt: null }, ['1', '2', '2'], new Date());
  assert.deepEqual(after.sentIds, ['1', '2']);
});

test('markSent keeps only the newest 5000 ids', () => {
  const ids = Array.from({ length: 5000 }, (_, i) => String(i));
  const after = markSent({ sentIds: ids, lastSuccessAt: null }, ['a', 'b'], new Date());
  assert.equal(after.sentIds.length, 5000);
  assert.equal(after.sentIds[0], '2');
  assert.deepEqual(after.sentIds.slice(-2), ['a', 'b']);
});

test('parseState falls back to emptyState for empty, broken or malformed input', () => {
  assert.deepEqual(parseState(''), emptyState());
  assert.deepEqual(parseState('{not json'), emptyState());
  assert.deepEqual(parseState('{"sentIds":"oops"}'), emptyState());
  assert.deepEqual(parseState('null'), emptyState());
});

test('serializeState and parseState round-trip', () => {
  const s = { sentIds: ['9', '8'], lastSuccessAt: '2026-11-04T00:31:00.000Z' };
  assert.deepEqual(parseState(serializeState(s)), s);
});
