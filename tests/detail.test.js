import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractDetail, readDetails } from '../src/detail.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/detail-${name}.html`, import.meta.url), 'utf8');

test('financial statement: only the disclaimer is on the page, so the content is attachment-only (zip)', () => {
  const d = extractDetail(fixture('financial'));
  assert.equal(d.title, 'งบการเงิน ไตรมาสที่ 3/2569 (สอบทานแล้ว)');
  assert.equal(d.text, '');
  assert.equal(d.attachmentOnly, true);
  assert.equal(d.attachments.length, 1);
  assert.equal(d.attachments[0].text, 'รายละเอียดแบบเต็ม');
  assert.match(d.attachments[0].href, /\.zip$/);
});

test('NAV report: body text is on the page, disclaimer and menus are excluded, link kept as text', () => {
  const d = extractDetail(fixture('nav'));
  assert.equal(d.attachmentOnly, false);
  assert.match(d.text, /มูลค่าหน่วย \(บาทต่อหน่วย\) : 6\.7100/);
  assert.match(d.text, /242,243,547\.33/);
  assert.doesNotMatch(d.text, /ข้อสงวนสิทธิ์/);
  assert.doesNotMatch(d.text, /สารสนเทศฉบับนี้จัดทำและเผยแพร่/);
  assert.doesNotMatch(d.text, /เว็บไซต์ในกลุ่ม/);
  assert.match(d.attachments[0].href, /\.pdf$/);
});

test('DR announcement: disclaimer only, attachment-only', () => {
  const d = extractDetail(fixture('dr'));
  assert.equal(d.text, '');
  assert.equal(d.attachmentOnly, true);
  assert.match(d.attachments[0].href, /\.pdf$/);
});

test('ordinary announcement: full body on the page', () => {
  const d = extractDetail(fixture('other'));
  assert.equal(d.attachmentOnly, false);
  assert.match(d.text, /TAKUNI-W2/);
  assert.match(d.text, /ราคาการใช้สิทธิ/);
});

test('attachments exclude share buttons and site-wide files outside the news block', () => {
  for (const name of ['financial', 'nav', 'dr', 'other']) {
    const hrefs = extractDetail(fixture(name)).attachments.map((a) => a.href);
    assert.equal(hrefs.some((h) => /facebook|listedCompanies/.test(h)), false, name);
  }
});

// ---- readDetails with a fake browser: no network
const item = (url, id = '1', symbol = 'S') => ({ id, symbol, url, datetime: '', headline: 'h', tag: '', product: 'S' });
const cfg = { delayMs: 0, retries: 3, retryDelayMs: 0 };
const GOOD = 'https://www.set.or.th/th/market/news-and-alert/newsdetails?id=1&symbol=S';

function fakeLaunch({ html = fixture('nav'), failTimes = 0 } = {}) {
  const calls = { goto: [] };
  let fails = failTimes;
  const page = {
    goto: async (url) => {
      calls.goto.push(url);
      if (fails > 0) { fails--; throw new Error('timeout'); }
    },
    waitForSelector: async () => {},
    content: async () => html,
    close: async () => {},
  };
  const browser = {
    newContext: async () => ({ newPage: async () => page }),
    close: async () => {},
  };
  return { launch: async () => browser, calls };
}

test('readDetails refuses non-SET-news urls without opening a page', async () => {
  const f = fakeLaunch();
  const [r] = await readDetails([item('https://www.facebook.com/sharer.php?u=x')], cfg, { launch: f.launch });
  assert.equal(r.ok, false);
  assert.match(r.error, /refus/i);
  assert.equal(f.calls.goto.length, 0);
});

test('readDetails returns the parsed page for a valid url', async () => {
  const f = fakeLaunch();
  const [r] = await readDetails([item(GOOD)], cfg, { launch: f.launch });
  assert.equal(r.ok, true);
  assert.equal(r.id, '1|S');
  assert.match(r.text, /242,243,547\.33/);
  assert.deepEqual(f.calls.goto, [GOOD]);
});

test('readDetails retries a failing page up to 3 times then succeeds', async () => {
  const f = fakeLaunch({ failTimes: 2 });
  const [r] = await readDetails([item(GOOD)], cfg, { launch: f.launch });
  assert.equal(r.ok, true);
  assert.equal(f.calls.goto.length, 3);
});

test('readDetails reports ok:false after retries are exhausted, without throwing', async () => {
  const f = fakeLaunch({ failTimes: 9 });
  const [r] = await readDetails([item(GOOD)], cfg, { launch: f.launch });
  assert.equal(r.ok, false);
  assert.match(r.error, /timeout/);
  assert.equal(f.calls.goto.length, 3);
});

test('an unrelated .raw-html earlier on the page (e.g. cookie banner) is not mistaken for the news body', () => {
  const banner = '<div class="cookie"><div class="raw-html">เว็บไซต์นี้ใช้คุกกี้เพื่อพัฒนาประสบการณ์ของผู้ใช้งาน</div></div>';
  const d = extractDetail(fixture('nav').replace('<body>', `<body>${banner}`));
  assert.match(d.text, /242,243,547\.33/);
  assert.doesNotMatch(d.text, /คุกกี้/);
});

test('readDetails waits for the news block itself, not just any .raw-html', async () => {
  const waited = [];
  const f = fakeLaunch();
  const browser = await f.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const original = page.waitForSelector;
  page.waitForSelector = async (sel, opts) => { waited.push(sel); return original(sel, opts); };
  await readDetails([item(GOOD)], cfg, { launch: async () => ({ newContext: async () => ({ newPage: async () => page }), close: async () => {} }) });
  assert.ok(waited.some((s) => /\.card-content \.raw-html/.test(s)), `waited for: ${waited.join(' | ')}`);
  assert.ok(waited.some((s) => /div\.news/.test(s)), `waited for: ${waited.join(' | ')}`);
});

test('an empty div.news before the real news block (seen on the live page) does not hide title or attachments', () => {
  const decoy = '<div class="news"></div>';
  for (const name of ['financial', 'nav']) {
    const d = extractDetail(fixture(name).replace('<body>', `<body>${decoy}`));
    assert.notEqual(d.title, '', name);
    assert.equal(d.attachments.length, 1, name);
  }
});

test('a retry never comes sooner than the pacing delay between page loads', async () => {
  const f = fakeLaunch({ failTimes: 1 });
  const t0 = Date.now();
  await readDetails([item(GOOD)], { ...cfg, delayMs: 60 }, { launch: f.launch });
  assert.ok(Date.now() - t0 >= 55, `waited ${Date.now() - t0}ms`);
});

test('when the time budget runs out the remaining pages are skipped, not read', async () => {
  const calls = [];
  const slow = {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({
          goto: async (url) => { calls.push(url); await new Promise((r) => setTimeout(r, 80)); },
          waitForSelector: async () => {},
          content: async () => fixture('nav'),
          close: async () => {},
        }),
      }),
      close: async () => {},
    }),
  };
  const items = [1, 2, 3].map((n) => item(`https://www.set.or.th/th/market/news-and-alert/newsdetails?id=${n}&symbol=S${n}`, String(n), `S${n}`));
  const out = await readDetails(items, { ...cfg, detailBudgetMs: 30 }, slow);
  assert.equal(calls.length, 1);
  assert.equal(out[0].ok, true);
  assert.deepEqual(out.slice(1).map((r) => [r.ok, r.skipped]), [[false, true], [false, true]]);
});
