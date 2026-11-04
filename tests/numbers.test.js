import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractNumbers, findUnverified } from '../src/numbers.js';

test('extractNumbers canonicalises: commas removed, trailing decimal zeros dropped, Thai digits converted', () => {
  assert.deepEqual(extractNumbers('NAV 6.7100 บาท มูลค่า 242,243,547.33'), ['6.71', '242243547.33']);
  assert.deepEqual(extractNumbers('จำนวน ๑๒๓ หน่วย'), ['123']);
  assert.deepEqual(extractNumbers('ปี 2569 และ 100.00 บาท'), ['2569', '100']);
});

test('single-digit integers (list numbers, "ครั้งที่ 4") are not counted', () => {
  assert.deepEqual(extractNumbers('ข้อ 1) 2) 3) ครั้งที่ 4 ร้อยละ 5%'), []);
  assert.deepEqual(extractNumbers(''), []);
});

test('findUnverified returns [] when every number in the summary is in the source', () => {
  assert.deepEqual(findUnverified('NAV 6.7100 บาทต่อหน่วย', 'มูลค่าหน่วย (บาทต่อหน่วย) : 6.7100'), []);
});

test('findUnverified returns the summary numbers that are missing from the source, as written', () => {
  assert.deepEqual(findUnverified('NAV 7.2500 บาทต่อหน่วย', 'มูลค่าหน่วย (บาทต่อหน่วย) : 6.7100'), ['7.2500']);
});

test('equivalent spellings match: commas, trailing zeros, Thai digits', () => {
  assert.deepEqual(findUnverified('มูลค่า 242,243,547.33 บาท', 'มูลค่าทรัพย์สินสุทธิ (บาท) : 242243547.33'), []);
  assert.deepEqual(findUnverified('NAV 6.71', 'มูลค่า 6.7100'), []);
  assert.deepEqual(findUnverified('จำนวน ๑๒๓ หน่วย', 'จำนวน 123 หน่วย'), []);
});

test('a number repeated in the summary is reported once', () => {
  assert.deepEqual(findUnverified('7.25 และ 7.25 อีกครั้ง', 'ไม่มีตัวเลข'), ['7.25']);
});

test('a Buddhist-era year rewritten as a Gregorian year is flagged', () => {
  assert.deepEqual(findUnverified('วันที่ 04 พ.ย. 2026', 'วันที่ 04 พ.ย. 2569'), ['2026']);
});

test('summary without numbers is trivially verified', () => {
  assert.deepEqual(findUnverified('ไม่มีตัวเลข', 'อะไรก็ได้ 12345'), []);
});
