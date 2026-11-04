import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeReport, composeLine, composeEmpty } from '../src/compose.js';
import { newsKey } from '../src/news.js';

const URL = (id, sym) => `https://www.set.or.th/th/market/news-and-alert/newsdetails?id=${id}&symbol=${sym}`;
const row = (o) => ({ id: '1', datetime: '2026-11-04T08:02:54+07:00', symbol: 'AAA', headline: 'ข่าวทั่วไป', tag: '', product: 'S', ...o, url: URL(o.id || '1', o.symbol || 'AAA') });
const ZIP = 'https://weblink.set.or.th/dat/news/202611/fin.zip';

const fin = row({ id: '10', symbol: 'SPG', tag: 'financial-statement', headline: 'งบการเงิน ไตรมาสที่ 3/2569 (สอบทานแล้ว)' });
const gen = row({ id: '11', symbol: 'GEN', headline: 'ข่าวทั่วไป ราคา 7.25' });
const nav = row({ id: '12', symbol: 'CHINA', tag: 'nav', product: 'L', headline: 'รายงานมูลค่าสินทรัพย์สุทธิ', datetime: '2026-11-03T22:21:00+07:00' });
const bad = row({ id: '13', symbol: 'BAD', headline: 'ข่าวอ่านไม่ได้' });
const ovf = row({ id: '14', symbol: 'OVF', headline: 'ข่าวเกินเพดาน' });
const xss = row({ id: '15', symbol: 'XSS', headline: '<script>alert(1)</script> & "q"' });
const DR_T = 'แจ้งข้อมูลการถือครองหลักทรัพย์อ้างอิงต่างประเทศ';
const drs = Array.from({ length: 7 }, (_, i) => row({ id: '99', symbol: `DR${i}80`, product: 'X', headline: DR_T }));
const group = { template: DR_T, category: 'DR แบบฟอร์ม', items: drs, sampleIds: drs.slice(0, 3).map(newsKey) };

const sum = (key, status, text, unverified = []) => ({ key, status, text, unverified, usage: { inputTokens: 10, outputTokens: 5 } });
const det = (key, o = {}) => ({ id: key, ok: true, text: '', attachments: [], attachmentOnly: false, ...o });

function input(over = {}) {
  const singles = [fin, gen, nav, bad, ovf, xss];
  return {
    window: { from: new Date('2026-11-03T09:30:00Z'), to: new Date('2026-11-04T00:30:00Z') },
    runAt: new Date('2026-11-04T00:30:00Z'),
    items: [...singles, ...drs],
    groups: [group],
    singles,
    summaries: {
      [newsKey(fin)]: sum(newsKey(fin), 'attachment_only', 'งบการเงิน — เนื้อหาอยู่ในไฟล์แนบ — ไม่ได้อ่าน'),
      [newsKey(gen)]: sum(newsKey(gen), 'ok', 'สรุปข่าวทั่วไป ราคา 7.25 บาท', ['7.25']),
      [newsKey(nav)]: sum(newsKey(nav), 'ok', 'NAV 6.71 บาทต่อหน่วย'),
      [newsKey(bad)]: sum(newsKey(bad), 'unreadable', 'อ่านหน้าข่าวไม่สำเร็จ: timeout'),
      [newsKey(xss)]: sum(newsKey(xss), 'ok', 'สรุป <b>x</b>'),
      [DR_T]: sum(DR_T, 'ok', 'ประกาศแบบฟอร์มเดียวกัน\n(อ่านเนื้อหาจริง 3 จาก 7 ข่าว)'),
    },
    details: {
      [newsKey(fin)]: det(newsKey(fin), { attachmentOnly: true, attachments: [{ text: 'รายละเอียดแบบเต็ม', href: ZIP }] }),
      [newsKey(nav)]: det(newsKey(nav), { text: 'ชื่อ : กองทุนเปิด จีน (CHINA)\nข้อมูล ณ วันที่ : 03 พ.ย. 2569\nมูลค่าหน่วย (บาทต่อหน่วย) : 6.7100\nมูลค่าทรัพย์สินสุทธิ (บาท) : 242,243,547.33' }),
    },
    overflowIds: [newsKey(ovf)],
    cost: { inputTokens: 1000, outputTokens: 200 },
    ...over,
  };
}
const REPORT = 'https://github.com/pasawat/set_investor/blob/data/reports/2026-11-04.md';

test('status header counts every class of news', () => {
  const { markdown } = composeReport(input());
  assert.match(markdown, /ข่าวทั้งหมด 13/);          // 6 singles + 7 DR
  assert.match(markdown, /สรุปได้ 10/);              // gen + nav + xss + 7 DR
  assert.match(markdown, /อยู่ในไฟล์แนบ 1/);
  assert.match(markdown, /อ่านไม่ได้ 1/);
  assert.match(markdown, /เกินเพดาน 1/);
  assert.match(markdown, /ตัวเลขยังไม่ยืนยัน 1/);
});

test('only categories that have news appear; empty tag lands in อื่นๆ', () => {
  const { markdown } = composeReport(input());
  for (const c of ['งบการเงิน', 'อื่นๆ', 'NAV ETF', 'DR แบบฟอร์ม']) assert.match(markdown, new RegExp(`## ${c}`));
  assert.doesNotMatch(markdown, /## ปันผล/);
});

test('every news row appears with its link, including the DR rows, the overflow row and the unreadable row', () => {
  const { markdown, html } = composeReport(input());
  for (const r of input().items) {
    assert.ok(markdown.includes(r.url), `markdown missing ${r.url}`);
    assert.ok(html.includes(r.url.replaceAll('&', '&amp;')), `html missing ${r.url}`);
  }
  for (const r of drs) assert.ok(markdown.includes(r.symbol));
});

test('every standalone row shows its time and symbol', () => {
  const { markdown } = composeReport(input());
  assert.match(markdown, /22:21/);
  assert.match(markdown, /08:02/);
  assert.match(markdown, /SPG/);
});

test('overflow rows are listed as headline + link with an explanation', () => {
  const { markdown } = composeReport(input());
  assert.match(markdown, /ข่าวเกินเพดาน/);
  assert.match(markdown, /เกินเพดาน/);
  assert.match(markdown, /ไม่ได้อ่านเนื้อหา/);
});

test('unverified numbers are shown in red with a warning; attachment-only news in yellow with the file link as text', () => {
  const { html } = composeReport(input());
  assert.match(html, /#DA3832/);
  assert.match(html, /ตัวเลขยังไม่ยืนยัน/);
  assert.match(html, /7\.25/);
  assert.match(html, /#F6C24A/);
  assert.ok(html.includes(ZIP));
});

test('html uses the corporate palette', () => {
  const { html } = composeReport(input());
  for (const c of ['#306FC7', '#43938F', '#F6C24A', '#DA3832']) assert.ok(html.includes(c), c);
});

test('dynamic text is HTML-escaped', () => {
  const { html } = composeReport(input());
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('NAV ETF rows become a table of symbol, NAV per unit and data date taken from the page text', () => {
  const { markdown } = composeReport(input());
  assert.match(markdown, /\|\s*CHINA\s*\|\s*6\.7100\s*\|\s*03 พ\.ย\. 2569\s*\|/);
});

test('the DR group states how many were read and lists every symbol', () => {
  const { markdown } = composeReport(input());
  assert.match(markdown, /7 ข่าว/);
  assert.match(markdown, /อ่านเนื้อหาจริง 3 จาก 7 ข่าว/);
});

test('cost estimate is printed at the end of the report', () => {
  const { markdown } = composeReport(input());
  assert.match(markdown, /input 1,?000/i);
});

test('composeEmpty is a short message with the Thai-time window', () => {
  const [msg] = composeEmpty(input(), REPORT);
  assert.match(msg, /ไม่มีข่าวใหม่/);
  assert.match(msg, /03\/11\/2026 16:30/);
  assert.match(msg, /04\/11\/2026 07:30/);
});

test('composeLine puts counts, the report link, categories and the unverified warning in the digest', () => {
  const blocks = composeLine(input(), REPORT);
  const all = blocks.join('\n');
  assert.ok(Array.isArray(blocks) && blocks.length >= 1);
  assert.ok(blocks[0].includes(REPORT));
  assert.match(blocks[0], /ทั้งหมด 13/);
  assert.match(all, /DR แบบฟอร์ม/);
  assert.match(all, /อื่นๆ/);
  assert.match(all, /ตัวเลขยังไม่ยืนยัน/);
  assert.match(all, /ไฟล์แนบ — ไม่ได้อ่าน|เนื้อหาอยู่ในไฟล์แนบ/);
});
