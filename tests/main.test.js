import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/main.js';
import { newsKey } from '../src/news.js';

const NOW = new Date('2026-11-04T00:30:00Z'); // 07:30 Bangkok; window starts 2026-11-03T09:30Z
const config = {
  securityTypes: ['S', 'L', 'X'], groupMin: 5, groupSample: 3, maxDetailPages: 150, maxSummaryItems: 200, maxInputChars: 6000,
  retries: 3, delayMs: 0, lookbackDays: 5, sendWhenEmpty: true, models: { default: 'm', template: 't' },
  site: { baseUrl: 'https://www.set.or.th', newsUrl: 'https://www.set.or.th/th/market/news-and-alert/news' },
  reportBaseUrl: 'https://example.test/blob/data',
};
const row = (i, o = {}) => ({
  id: String(1000 + i), datetime: '2026-11-03T22:00:00+07:00', symbol: `S${i}`, headline: `ข่าวที่ ${i}`, tag: '', product: 'S',
  url: `https://www.set.or.th/th/market/news-and-alert/newsdetails?id=${1000 + i}&symbol=S${i}`, ...o,
});
const drRows = (n) => Array.from({ length: n }, (_, i) => row(500 + i, { id: '99', symbol: `DR${i}80`, product: 'X', headline: 'แจ้งข้อมูลการถือครองหลักทรัพย์อ้างอิงต่างประเทศ' }));

function makeDeps(over = {}) {
  const calls = { order: [], push: [], published: [], listingConfig: null, readTargets: null, itemSummaries: 0, groupSummaries: 0 };
  const rows = over.rows ?? [row(1), row(2)];
  const deps = {
    assertNewsPathAllowed: async () => { calls.order.push('robots'); },
    loadStateText: async () => over.stateText ?? '',
    now: () => NOW,
    fetchListing: async () => {
      calls.order.push('listing');
      if (over.listingError) throw new Error(over.listingError);
      return { items: rows, totalCount: over.totalCount ?? rows.length, complete: over.complete ?? true, method: 'url-query', rawResponses: [] };
    },
    readDetails: async (items) => {
      calls.readTargets = items;
      return items.map((it) => ({ id: newsKey(it), ok: !(over.failIds || []).includes(it.symbol), text: 'เนื้อหาข่าว', attachments: [], attachmentOnly: false, error: 'boom' }));
    },
    summarizeItem: async (item, detail) => {
      calls.itemSummaries++;
      return detail.ok
        ? { key: newsKey(item), status: 'ok', text: `สรุป ${item.symbol}`, unverified: [], usage: { inputTokens: 10, outputTokens: 5 } }
        : { key: newsKey(item), status: 'unreadable', text: `อ่านหน้าข่าวไม่สำเร็จ: ${detail.error}`, unverified: [], usage: { inputTokens: 0, outputTokens: 0 } };
    },
    summarizeGroup: async (group, details) => {
      calls.groupSummaries++;
      return { key: group.template, status: 'ok', text: `สรุปกลุ่ม\n(อ่านเนื้อหาจริง ${details.length} จาก ${group.items.length} ข่าว)`, unverified: [], usage: { inputTokens: 10, outputTokens: 5 } };
    },
    pushLine: async (messages) => {
      calls.order.push('push');
      if (over.pushError) throw new Error(over.pushError);
      calls.push.push(messages);
    },
    publishToDataBranch: async (args) => { calls.order.push(`publish:${Object.keys(args.files).join(',')}`); calls.published.push(args); },
    ...over.deps,
  };
  return { deps, calls };
}
const go = (over = {}, argv = [], cfg = {}) => {
  const { deps, calls } = makeDeps(over);
  return run({ config: { ...config, ...cfg }, deps, argv }).then((result) => ({ result, calls }));
};
const published = (calls) => Object.assign({}, ...calls.published.map((p) => p.files));

test('happy path: robots → listing → report published → LINE → state published (in that order)', async () => {
  const { result, calls } = await go();
  assert.deepEqual(result, { sent: true, itemCount: 2, exitCode: 0 });
  const o = calls.order;
  assert.equal(o[0], 'robots');
  assert.equal(o[1], 'listing');
  const iReport = o.findIndex((x) => x.startsWith('publish:reports/'));
  const iPush = o.indexOf('push');
  const iState = o.findIndex((x) => x.includes('state/state.json'));
  assert.ok(iReport > 0 && iReport < iPush && iPush < iState, o.join(' > '));
  const files = published(calls);
  assert.ok(files['reports/2026-11-04.md'] && files['reports/2026-11-04.html']);
  const state = JSON.parse(files['state/state.json']);
  assert.deepEqual(state.sentIds.sort(), ['1001|S1', '1002|S2']);
  assert.equal(state.lastSuccessAt, NOW.toISOString());
  assert.match(calls.push[0].join('\n'), /https:\/\/example\.test\/blob\/data\/reports\/2026-11-04\.md/);
});

test('rows already sent or outside the window are skipped', async () => {
  const stale = row(3, { datetime: '2026-11-03T10:00:00+07:00' }); // before Friday... before 16:30 close
  const { result, calls } = await go({ rows: [row(1), row(2), stale], stateText: JSON.stringify({ sentIds: ['1001|S1'], lastSuccessAt: null }) });
  assert.equal(result.itemCount, 1);
  assert.deepEqual(calls.readTargets.map((r) => r.symbol), ['S2']);
});

test('no new news: one short message when sendWhenEmpty, none when disabled; state still advances', async () => {
  const on = await go({ rows: [] });
  assert.equal(on.calls.push.length, 1);
  assert.match(on.calls.push[0][0], /ไม่มีข่าวใหม่/);
  assert.equal(on.result.exitCode, 0);
  assert.ok(published(on.calls)['state/state.json']);
  const off = await go({ rows: [] }, [], { sendWhenEmpty: false });
  assert.equal(off.calls.push.length, 0);
  assert.equal(off.result.exitCode, 0);
});

test('--dry-run never sends LINE nor writes anything', async () => {
  const { result, calls } = await go({}, ['--dry-run']);
  assert.equal(calls.push.length, 0);
  assert.equal(calls.published.length, 0);
  assert.equal(result.sent, false);
  assert.equal(result.exitCode, 0);
});

test('--dry-run --capture publishes the report files only (no state, no LINE)', async () => {
  const { calls } = await go({}, ['--dry-run', '--capture']);
  assert.equal(calls.push.length, 0);
  const files = published(calls);
  assert.ok(files['reports/dry-run/2026-11-04.md'], 'dry-run must not overwrite the real daily report');
  assert.equal('reports/2026-11-04.md' in files, false);
  assert.equal('state/state.json' in files, false);
});

test('a page that fails to read does not stop the run and is named in the report', async () => {
  const { result, calls } = await go({ failIds: ['S2'] });
  assert.equal(result.exitCode, 0);
  assert.equal(calls.push.length, 1);
  assert.match(published(calls)['reports/2026-11-04.md'], /อ่านไม่ได้ 1/);
});

test('listing failure: LINE alert with the reason, exit 1, state untouched', async () => {
  const { result, calls } = await go({ listingError: 'หน้าเว็บเปลี่ยนโครงสร้าง' });
  assert.equal(result.exitCode, 1);
  assert.equal(result.sent, false);
  assert.match(calls.push[0].join(' '), /หน้าเว็บเปลี่ยนโครงสร้าง/);
  assert.equal('state/state.json' in published(calls), false);
});

test('LINE failure: exit 1 and state is NOT advanced (the next run re-sends)', async () => {
  const { result, calls } = await go({ pushError: 'HTTP 500' });
  assert.equal(result.exitCode, 1);
  assert.equal('state/state.json' in published(calls), false);
  assert.ok(published(calls)['reports/2026-11-04.md'], 'report is still saved');
});

test('robots.txt refusal stops before the browser is used', async () => {
  const { result, calls } = await go({ deps: { assertNewsPathAllowed: async () => { throw new Error('robots.txt now disallows'); } } });
  assert.equal(result.exitCode, 1);
  assert.equal(calls.order.includes('listing'), false);
  assert.match(calls.push[0].join(' '), /robots/);
});

test('more singles than maxDetailPages: the extra ones are listed as overflow, not read', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => row(i));
  const { calls } = await go({ rows });
  assert.equal(calls.readTargets.length, 150);
  assert.match(published(calls)['reports/2026-11-04.md'], /เกินเพดาน 50/);
});

test('DR announcements are merged: only the samples are read and one group summary is made', async () => {
  const rows = [row(1), ...drRows(7)];
  const { calls } = await go({ rows });
  assert.equal(calls.groupSummaries, 1);
  assert.equal(calls.readTargets.length, 1 + 3); // 1 single + 3 samples
  assert.equal(calls.itemSummaries, 1);
});

test('maxSummaryItems caps AI calls; the rest are reported as overflow', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => row(i));
  const { calls } = await go({ rows }, [], { maxSummaryItems: 2 });
  assert.equal(calls.itemSummaries, 2);
  assert.match(published(calls)['reports/2026-11-04.md'], /เกินเพดาน 3/);
});

test('an incomplete listing is flagged at the top of the LINE digest', async () => {
  const { calls } = await go({ complete: false, totalCount: 464 });
  assert.match(calls.push[0][0], /อ่านรายการข่าวได้ไม่ครบ/);
});

test('cost estimate is added to the report', async () => {
  const { calls } = await go();
  assert.match(published(calls)['reports/2026-11-04.md'], /ค่าใช้จ่ายโดยประมาณ/);
});

test('readDetails failing as a whole: digest still goes out, but the run fails and the state is not advanced', async () => {
  const { result, calls } = await go({ deps: { readDetails: async () => { throw new Error('chromium crashed'); } } });
  assert.equal(result.exitCode, 1);
  assert.equal(calls.push.length, 1);
  assert.equal('state/state.json' in published(calls), false);
});

test('every attempted page unreadable counts as a failed run too', async () => {
  const { result, calls } = await go({ failIds: ['S1', 'S2'] });
  assert.equal(result.exitCode, 1);
  assert.equal('state/state.json' in published(calls), false);
});

test('unparsable datetimes in the whole listing are a listing failure, not "no news"', async () => {
  const bad = [row(1, { datetime: '04/11/2569 08:02' }), row(2, { datetime: '04/11/2569 08:03' })];
  const { result, calls } = await go({ rows: bad });
  assert.equal(result.exitCode, 1);
  assert.match(calls.push[0].join(' '), /วันที่/);
  assert.equal('state/state.json' in published(calls), false);
  assert.equal(calls.push.flat().some((m) => /ไม่มีข่าวใหม่/.test(m)), false);
});

test('an incomplete listing keeps the previous lastSuccessAt so the missed rows are re-read next run', async () => {
  const { calls } = await go({ complete: false, totalCount: 464, stateText: JSON.stringify({ sentIds: ['9|Z'], lastSuccessAt: '2026-11-03T00:30:00.000Z' }) });
  const state = JSON.parse(published(calls)['state/state.json']);
  assert.equal(state.lastSuccessAt, '2026-11-03T00:30:00.000Z');
  assert.ok(state.sentIds.includes('1001|S1') && state.sentIds.includes('9|Z'));
});

test('pages skipped by the time budget are reported as overflow and not summarized', async () => {
  const rows = [row(1), row(2), row(3), row(4), row(5)];
  const readDetails = async (items) => items.map((it, i) => (i < 2
    ? { id: newsKey(it), ok: true, text: 'เนื้อหา', attachments: [], attachmentOnly: false }
    : { id: newsKey(it), ok: false, skipped: true, text: '', attachments: [], attachmentOnly: false, error: 'budget' }));
  const { result, calls } = await go({ rows, deps: { readDetails } });
  assert.equal(result.exitCode, 0);
  assert.equal(calls.itemSummaries, 2);
  assert.match(published(calls)['reports/2026-11-04.md'], /เกินเพดาน 3/);
});
