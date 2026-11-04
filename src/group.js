// Categorising news rows and merging repeated DR announcements (spec §6).
import { newsKey, uniqueItems } from './news.js';

export const DR_CATEGORY = 'DR แบบฟอร์ม';

/** Strip dates, ticker-like tokens and numbers so announcements of one template compare equal. */
export function normalizeHeadline(headline) {
  return headline
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, ' ')
    .replace(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*\b/g, ' ')
    .replace(/\d[\d,.]*/g, ' ')
    .replace(/\(\s*\)/g, ' ') // brackets emptied by the removals above
    .replace(/\s+/g, ' ')
    .trim();
}

const has = (text, ...words) => words.some((w) => text.includes(w));

/** Category of one row. Never returns DR แบบฟอร์ม: that category belongs to merged groups only. */
export function categorize(item) {
  const h = item.headline || '';
  if (item.tag === 'nav') return 'NAV ETF';
  if (item.tag === 'financial-statement' || has(h, 'งบการเงิน')) return 'งบการเงิน';
  if (has(h, 'ปันผล')) return 'ปันผล';
  if (has(h, 'ประชุม') && has(h, 'ผู้ถือหุ้น')) return 'ประชุมผู้ถือหุ้น';
  if (has(h, 'เพิ่มทุน', 'ควบรวม', 'เข้าซื้อ', 'ซื้อกิจการ', 'รับโอนกิจการ')) return 'เพิ่มทุน/M&A';
  if (has(h, 'กรรมการ', 'ผู้บริหาร', 'แต่งตั้ง', 'ลาออก')) return 'ฝ่ายบริหาร';
  return 'อื่นๆ';
}

/**
 * Merge DR rows that share one headline template when there are at least `groupMin` of them.
 * Only DR rows (product "X") are merged: stock and ETF filings are company-specific, so they
 * stay individual even when their headlines match.
 */
export function groupItems(items, { groupMin, groupSample }) {
  const rows = uniqueItems(items);
  const buckets = new Map();
  for (const row of rows) {
    if (row.product !== 'X') continue;
    const template = normalizeHeadline(row.headline || '');
    if (!template) continue;
    if (!buckets.has(template)) buckets.set(template, []);
    buckets.get(template).push(row);
  }
  const groups = [];
  const grouped = new Set();
  for (const [template, members] of buckets) {
    if (members.length < groupMin) continue;
    members.forEach((m) => grouped.add(newsKey(m)));
    groups.push({
      template,
      category: DR_CATEGORY,
      items: members,
      sampleIds: members.slice(0, groupSample).map(newsKey),
    });
  }
  return { groups, singles: rows.filter((r) => !grouped.has(newsKey(r))) };
}
