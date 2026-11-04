import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHeadline, categorize, groupItems } from '../src/group.js';
import { newsKey } from '../src/news.js';

const item = (o) => ({ id: '1', datetime: '', symbol: 'S', headline: 'h', tag: '', url: '', product: 'S', ...o });
const DR_HEADLINE = 'แจ้งข้อมูลการถือครองหลักทรัพย์อ้างอิงต่างประเทศ (Underlying)';
const drItems = (n, headline = DR_HEADLINE, prefix = 'DR') =>
  Array.from({ length: n }, (_, i) => item({ id: '107312501', symbol: `${prefix}${i}80`, product: 'X', headline }));

test('normalizeHeadline strips ticker-like tokens, numbers and dates but keeps the wording', () => {
  assert.equal(
    normalizeHeadline('แจ้งข้อมูลการถือครอง ABBV80 ณ วันที่ 31/10/2569 จำนวน 1,234 หน่วย'),
    'แจ้งข้อมูลการถือครอง ณ วันที่ จำนวน หน่วย',
  );
  assert.equal(normalizeHeadline('แบบรายงานผลการใช้สิทธิของ TAKUNI-W2 (F53-5) ครั้งที่ 4'), 'แบบรายงานผลการใช้สิทธิของ ครั้งที่');
  assert.equal(normalizeHeadline(DR_HEADLINE), DR_HEADLINE);
});

test('categorize uses the tag first, then headline keywords, else อื่นๆ', () => {
  assert.equal(categorize(item({ tag: 'nav' })), 'NAV ETF');
  assert.equal(categorize(item({ tag: 'financial-statement' })), 'งบการเงิน');
  assert.equal(categorize(item({ headline: 'ประกาศจ่ายเงินปันผล ประจำปี 2569' })), 'ปันผล');
  assert.equal(categorize(item({ headline: 'มติที่ประชุมผู้ถือหุ้น (แก้ไข)' })), 'ประชุมผู้ถือหุ้น');
  assert.equal(categorize(item({ headline: 'แจ้งการเพิ่มทุนจดทะเบียน' })), 'เพิ่มทุน/M&A');
  assert.equal(categorize(item({ headline: 'แจ้งการเข้าซื้อกิจการ' })), 'เพิ่มทุน/M&A');
  assert.equal(categorize(item({ headline: 'แจ้งมติประชุมกรรมการ ครั้งที่ 4/2569' })), 'ฝ่ายบริหาร');
  assert.equal(categorize(item({ headline: 'แต่งตั้งผู้บริหารระดับสูง' })), 'ฝ่ายบริหาร');
});

test('empty tag and unmatched headline fall into อื่นๆ; a lone DR item is never "DR แบบฟอร์ม"', () => {
  assert.equal(categorize(item({ tag: '', headline: 'ข่าวทั่วไป' })), 'อื่นๆ');
  assert.equal(categorize(item({ product: 'X', headline: DR_HEADLINE })), 'อื่นๆ');
  assert.equal(categorize(item({ tag: '', headline: '' })), 'อื่นๆ');
});

test('groupItems merges 7 DR announcements with one template into one group, sampling 3', () => {
  const { groups, singles } = groupItems(drItems(7), { groupMin: 5, groupSample: 3 });
  assert.equal(singles.length, 0);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 7);
  assert.equal(groups[0].category, 'DR แบบฟอร์ม');
  assert.equal(groups[0].template, DR_HEADLINE);
  assert.deepEqual(groups[0].sampleIds, groups[0].items.slice(0, 3).map(newsKey));
});

test('a template with fewer than groupMin items stays as singles', () => {
  const { groups, singles } = groupItems(drItems(4), { groupMin: 5, groupSample: 3 });
  assert.equal(groups.length, 0);
  assert.equal(singles.length, 4);
});

test('only DR rows are grouped: same-headline stock rows stay individual', () => {
  const stocks = Array.from({ length: 8 }, (_, i) => item({ id: String(i), symbol: `ST${i}`, tag: 'financial-statement', headline: 'งบการเงิน ไตรมาสที่ 3/2569 (สอบทานแล้ว)' }));
  const { groups, singles } = groupItems(stocks, { groupMin: 5, groupSample: 3 });
  assert.equal(groups.length, 0);
  assert.equal(singles.length, 8);
});

test('different templates form separate groups; the order of first appearance is kept', () => {
  const other = 'แจ้งหลักทรัพย์อ้างอิงประกาศแตกหุ้น (Stock Split)';
  const mixed = [...drItems(5), ...drItems(6, other, 'SP'), item({ id: '9', symbol: 'ABC', headline: 'ข่าวหนึ่ง' })];
  const { groups, singles } = groupItems(mixed, { groupMin: 5, groupSample: 3 });
  assert.deepEqual(groups.map((g) => g.items.length), [5, 6]);
  assert.deepEqual(groups.map((g) => g.template), [DR_HEADLINE, other]);
  assert.deepEqual(singles.map((s) => s.symbol), ['ABC']);
});

test('the same id|symbol row repeated in the input is counted once', () => {
  const rows = drItems(5);
  const { groups } = groupItems([...rows, ...rows], { groupMin: 5, groupSample: 3 });
  assert.equal(groups[0].items.length, 5);
});

test('every input row ends up in exactly one group or in singles', () => {
  const mixed = [...drItems(6), ...drItems(2, 'หัวข้ออื่น', 'OT'), item({ id: '5', symbol: 'Z', headline: 'ข่าว' })];
  const { groups, singles } = groupItems(mixed, { groupMin: 5, groupSample: 3 });
  const out = [...groups.flatMap((g) => g.items), ...singles].map(newsKey).sort();
  assert.deepEqual(out, mixed.map(newsKey).sort());
});
