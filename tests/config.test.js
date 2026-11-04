import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('defaults match the spec constraints', () => {
  const c = loadConfig({});
  assert.deepEqual(c.securityTypes, ['S', 'L', 'X']);
  assert.equal(c.groupMin, 5);
  assert.equal(c.groupSample, 3);
  assert.equal(c.maxDetailPages, 150);
  assert.equal(c.maxSummaryItems, 200);
  assert.equal(c.maxInputChars, 6000);
  assert.equal(c.retries, 3);
  assert.equal(c.lookbackDays, 5);
  assert.ok(c.delayMs >= 2500);
  assert.equal(c.sendWhenEmpty, true);
  assert.equal(c.site.baseUrl, 'https://www.set.or.th');
  assert.equal(c.site.newsUrl, 'https://www.set.or.th/th/market/news-and-alert/news');
  assert.ok(c.models.default && c.models.template);
});

test('env overrides numeric settings', () => {
  assert.equal(loadConfig({ GROUP_MIN: '8' }).groupMin, 8);
});

test('non-numeric value in a numeric env var throws', () => {
  assert.throws(() => loadConfig({ GROUP_MIN: 'abc' }), /GROUP_MIN/);
});

test('secrets are read from env and optional', () => {
  const c = loadConfig({ ANTHROPIC_API_KEY: 'k', LINE_CHANNEL_ACCESS_TOKEN: 't', LINE_USER_ID: 'u' });
  assert.equal(c.anthropicKey, 'k');
  assert.equal(c.lineToken, 't');
  assert.equal(c.lineUserId, 'u');
  assert.equal(loadConfig({}).lineToken, undefined);
});

test('SEND_WHEN_EMPTY=false disables empty-day message', () => {
  assert.equal(loadConfig({ SEND_WHEN_EMPTY: 'false' }).sendWhenEmpty, false);
});
