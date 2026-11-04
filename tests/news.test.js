import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewsResponse, newsKey, uniqueItems, computeWindow, inWindow } from '../src/news.js';

const spg = {
  id: '17937493938141',
  datetime: '2026-11-04T08:02:54+07:00',
  symbol: 'SPG',
  headline: 'งบการเงิน ไตรมาสที่ 3/2569 (สอบทานแล้ว)',
  tag: 'financial-statement',
  url: 'https://www.set.or.th/th/market/news-and-alert/newsdetails?id=17937493938141&symbol=SPG',
  product: 'S',
};
const untagged = { ...spg, id: '2', symbol: 'ABC', tag: '', headline: 'ข่าวอื่น', url: 'https://www.set.or.th/x?id=2' };

test('parseNewsResponse merges newsGroups and paginateNews lists', () => {
  const items = parseNewsResponse({
    newsGroups: [{ group: 'ข่าวงบการเงิน', totalCount: 1, newsInfoList: [spg] }],
    paginateNews: { totalCount: 1, newsInfoList: [untagged] },
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].id, '17937493938141');
  assert.equal(items[0].product, 'S');
  assert.equal(items[1].tag, '');
});

test('parseNewsResponse coerces fields to strings and tolerates null/empty input', () => {
  assert.deepEqual(parseNewsResponse(null), []);
  assert.deepEqual(parseNewsResponse({}), []);
  const [item] = parseNewsResponse({ paginateNews: { newsInfoList: [{ id: 123, headline: null }] } });
  assert.equal(item.id, '123');
  assert.equal(item.headline, '');
  assert.equal(item.tag, '');
});

test('newsKey combines id and symbol: one announcement id is published once per symbol', () => {
  assert.equal(newsKey({ id: '107312501', symbol: 'BIDU80' }), '107312501|BIDU80');
  assert.notEqual(newsKey({ id: '1', symbol: 'A' }), newsKey({ id: '1', symbol: 'B' }));
});

test('uniqueItems keeps one announcement for many symbols, drops exact repeats, keeps first and order', () => {
  const a = { ...spg, id: '107312501', symbol: 'BIDU80', url: 'u1' };
  const b = { ...spg, id: '107312501', symbol: 'BKNG80', url: 'u2' };
  const out = uniqueItems([a, untagged, b, { ...a, headline: 'dup' }]);
  assert.deepEqual(out.map((i) => i.symbol), ['BIDU80', 'ABC', 'BKNG80']);
  assert.equal(out[0].headline, spg.headline);
});

test('computeWindow on Monday 07:30 (Bangkok) starts Friday 16:30 (Bangkok)', () => {
  const now = new Date('2026-11-09T00:30:00Z'); // Mon 07:30 +07:00
  const w = computeWindow(now, null, 5);
  assert.equal(w.from.toISOString(), '2026-11-06T09:30:00.000Z'); // Fri 16:30 +07:00
  assert.equal(w.to.toISOString(), now.toISOString());
});

test('computeWindow on Wednesday starts Tuesday 16:30 (Bangkok)', () => {
  const w = computeWindow(new Date('2026-11-04T00:30:00Z'), null, 5);
  assert.equal(w.from.toISOString(), '2026-11-03T09:30:00.000Z');
});

test('computeWindow uses lastSuccess when recent, and caps at lookbackDays', () => {
  const now = new Date('2026-11-09T00:30:00Z');
  const recent = new Date('2026-11-07T10:00:00Z');
  assert.equal(computeWindow(now, recent, 5).from.toISOString(), recent.toISOString());
  const old = new Date('2026-10-01T00:00:00Z');
  assert.equal(computeWindow(now, old, 5).from.toISOString(), '2026-11-04T00:30:00.000Z');
});

test('inWindow compares instants across time zones and rejects bad dates', () => {
  const w = { from: new Date('2026-11-03T09:30:00Z'), to: new Date('2026-11-04T00:30:00Z') };
  assert.equal(inWindow({ datetime: '2026-11-03T22:21:00+07:00' }, w), true); // 15:21Z
  assert.equal(inWindow({ datetime: '2026-11-03T16:00:00+07:00' }, w), false); // 09:00Z, before close
  assert.equal(inWindow({ datetime: '2026-11-04T08:02:54+07:00' }, w), false); // 01:02Z, after run time
  assert.equal(inWindow({ datetime: 'not a date' }, w), false);
});
