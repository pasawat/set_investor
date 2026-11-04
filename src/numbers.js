// Number verification: every figure in an AI summary must also appear in the source text.

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

const toArabic = (text) => text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

// Canonical form: no commas, no leading zeros, no trailing decimal zeros.
function canonical(raw) {
  let n = raw.replace(/,/g, '');
  if (n.includes('.')) n = n.replace(/0+$/, '').replace(/\.$/, '');
  return n.replace(/^0+(?=\d)/, '');
}

const countable = (c) => c.length > 1 || c.includes('.'); // skip single-digit integers

function scan(text) {
  return (toArabic(text).match(NUMBER) || []).map((raw) => ({ raw, canon: canonical(raw) })).filter((n) => countable(n.canon));
}

export const extractNumbers = (text) => scan(text).map((n) => n.canon);

/** Numbers in `summary` (as written) that do not occur in `source`; each reported once. */
export function findUnverified(summary, source) {
  const known = new Set(extractNumbers(source));
  const seen = new Set();
  const out = [];
  for (const { raw, canon } of scan(summary)) {
    if (known.has(canon) || seen.has(canon)) continue;
    seen.add(canon);
    out.push(raw);
  }
  return out;
}
