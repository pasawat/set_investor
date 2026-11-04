import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ymd, dmy } from '../src/listing.js';

test('date formats use the Bangkok calendar day, not UTC', () => {
  const lateUtc = new Date('2026-11-03T22:30:00Z'); // 05:30 on 4 Nov in Bangkok
  assert.equal(ymd(lateUtc), '2026-11-04');
  assert.equal(dmy(lateUtc), '04/11/2026');
});

test('dmy pads single-digit day and month', () => {
  assert.equal(dmy(new Date('2026-01-05T03:00:00Z')), '05/01/2026');
});
