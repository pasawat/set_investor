import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay } from '../src/retry.js';

test('delay doubles with every attempt', () => {
  assert.equal(backoffDelay(1, 1000), 1000);
  assert.equal(backoffDelay(2, 1000), 2000);
  assert.equal(backoffDelay(3, 1000), 4000);
});

test('a zero base means no waiting (used by tests)', () => {
  assert.equal(backoffDelay(3, 0), 0);
});

test('a retry-after header from the server is honoured when it asks for longer', () => {
  const error = { headers: { get: (name) => (name === 'retry-after' ? '5' : null) } };
  assert.equal(backoffDelay(1, 1000, error), 5000);
  assert.equal(backoffDelay(3, 1000, error), 5000);
});

test('retry-after never stalls the run for more than a minute', () => {
  const error = { headers: { get: () => '3600' } };
  assert.equal(backoffDelay(1, 1000, error), 60000);
});

test('missing or malformed headers are ignored', () => {
  assert.equal(backoffDelay(2, 1000, new Error('x')), 2000);
  assert.equal(backoffDelay(2, 1000, { headers: { get: () => 'soon' } }), 2000);
});
