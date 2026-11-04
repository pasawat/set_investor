// Builds the full report (Markdown + HTML) and the LINE digest (spec §8).
import { categorize, DR_CATEGORY } from './group.js';
import { newsKey } from './news.js';

const BKK_MS = 7 * 3600 * 1000;
const ORDER = ['งบการเงิน', 'ปันผล', 'ประชุมผู้ถือหุ้น', 'เพิ่มทุน/M&A', 'ฝ่ายบริหาร', 'NAV ETF', DR_CATEGORY, 'อื่นๆ'];
const COLOR = { blue: '#306FC7', yellow: '#F6C24A', green: '#43938F', red: '#DA3832' };
const LINE_MAX_PER_CATEGORY = 15;
const NOTE_ATTACHMENT = 'เนื้อหาอยู่ในไฟล์แนบ — ไม่ได้อ่าน';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
const bkk = (d) => new Date(d.getTime() + BKK_MS);
const fmtDateTime = (d) => {
  const b = bkk(d);
  return `${pad(b.getUTCDate())}/${pad(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}`;
};
const timeOf = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '--:--';
  const b = bkk(new Date(t));
  return `${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}`;
};
const firstLine = (text, max = 140) => {
  const line = String(text).split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
};

function parseNav(text) {
  const nav = /มูลค่าหน่วย\s*\(บาทต่อหน่วย\)\s*:\s*([\d,]+(?:\.\d+)?)/.exec(text || '');
  const date = /ข้อมูล ณ วันที่\s*:\s*([^\n]+)/.exec(text || '');
  return nav && date ? { nav: nav[1], date: date[1].trim() } : null;
}

/** Normalise the input into sections and counts shared by every output format. */
function buildView(input) {
  const overflow = new Set(input.overflowIds || []);
  const sections = new Map(ORDER.map((c) => [c, { rows: [], groups: [], nav: [] }]));
  const counts = { total: input.items.length, ok: 0, attachment: 0, unreadable: 0, overflow: 0, unverified: 0 };

  for (const item of input.singles) {
    const key = newsKey(item);
    const summary = input.summaries[key];
    const detail = input.details[key];
    const state = overflow.has(key) ? 'overflow' : summary ? summary.status : 'unreadable';
    const category = categorize(item);
    const section = sections.get(category);
    if (state === 'ok') counts.ok++;
    else if (state === 'attachment_only') counts.attachment++;
    else if (state === 'overflow') counts.overflow++;
    else counts.unreadable++;
    if (summary && summary.unverified && summary.unverified.length) counts.unverified++;
    const navInfo = category === 'NAV ETF' && state === 'ok' ? parseNav(detail && detail.text) : null;
    if (navInfo) section.nav.push({ item, ...navInfo });
    else section.rows.push({ item, summary, detail, state });
  }

  for (const group of input.groups) {
    const summary = input.summaries[group.template];
    const n = group.items.length;
    const state = summary ? summary.status : 'unreadable';
    if (state === 'ok') counts.ok += n;
    else if (state === 'attachment_only') counts.attachment += n;
    else counts.unreadable += n;
    if (summary && summary.unverified && summary.unverified.length) counts.unverified++;
    sections.get(group.category).groups.push({ group, summary, state });
  }

  const used = ORDER.filter((c) => {
    const s = sections.get(c);
    return s.rows.length || s.groups.length || s.nav.length;
  }).map((c) => ({ category: c, ...sections.get(c) }));
  return { counts, sections: used };
}

const statusLine = (c) =>
  `ข่าวทั้งหมด ${c.total} | สรุปได้ ${c.ok} | อยู่ในไฟล์แนบ ${c.attachment} | อ่านไม่ได้ ${c.unreadable} | เกินเพดาน ${c.overflow} | ตัวเลขยังไม่ยืนยัน ${c.unverified}`;
const windowLine = (w) => `${fmtDateTime(w.from)} ถึง ${fmtDateTime(w.to)} (เวลาไทย)`;
const costLine = (cost) =>
  cost ? `ค่าใช้จ่ายโดยประมาณ: input ${cost.inputTokens.toLocaleString('en-US')} tokens / output ${cost.outputTokens.toLocaleString('en-US')} tokens` : '';

const rowCount = (s) => s.rows.length + s.nav.length + s.groups.reduce((a, g) => a + g.group.items.length, 0);

// ---------------------------------------------------------------- Markdown
function markdownRow({ item, summary, detail, state }) {
  const lines = [`- **${timeOf(item.datetime)} ${item.symbol}** — [${item.headline}](${item.url})`];
  if (state === 'overflow') lines.push('  - ไม่ได้อ่านเนื้อหา: เกินเพดานจำนวนหน้าที่อ่านต่อรอบ');
  else if (summary) lines.push(...summary.text.split('\n').map((l) => `  - ${l}`));
  else lines.push('  - ไม่มีผลสรุป');
  if (summary && summary.unverified.length) lines.push(`  - ⚠ ตัวเลขยังไม่ยืนยัน (ไม่พบในต้นฉบับ): ${summary.unverified.join(', ')}`);
  for (const a of (detail && detail.attachments) || []) lines.push(`  - ไฟล์แนบ: [${a.text}](${a.href})`);
  return lines.join('\n');
}

function markdownGroup({ group, summary }) {
  const lines = [`- **${group.template}** — ${group.items.length} ข่าว`];
  if (summary) lines.push(...summary.text.split('\n').map((l) => `  - ${l}`));
  if (summary && summary.unverified.length) lines.push(`  - ⚠ ตัวเลขยังไม่ยืนยัน (ไม่พบในต้นฉบับ): ${summary.unverified.join(', ')}`);
  lines.push(`  - รายชื่อทั้งหมด: ${group.items.map((i) => `[${i.symbol}](${i.url})`).join(', ')}`);
  return lines.join('\n');
}

function markdownNav(rows) {
  const head = '| เวลา | ชื่อย่อ | NAV/หน่วย (บาท) | ข้อมูล ณ วันที่ | ลิงก์ |\n|---|---|---|---|---|';
  return [head, ...rows.map((r) => `| ${timeOf(r.item.datetime)} | ${r.item.symbol} | ${r.nav} | ${r.date} | [ข่าว](${r.item.url}) |`)].join('\n');
}

function toMarkdown(input, view) {
  const out = [`# สรุปข่าว SET (หุ้น/ETF/DR)`, `ช่วงเวลา ${windowLine(input.window)}`, '', `> ${statusLine(view.counts)}`, ''];
  for (const s of view.sections) {
    out.push(`## ${s.category} (${rowCount(s)})`, '');
    if (s.nav.length) out.push(markdownNav(s.nav), '');
    for (const g of s.groups) out.push(markdownGroup(g));
    for (const r of s.rows) out.push(markdownRow(r));
    out.push('');
  }
  const cost = costLine(input.cost);
  if (cost) out.push('---', cost);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- HTML
const link = (url, text) => `<a href="${esc(url)}">${esc(text)}</a>`;
const lines = (text) => esc(text).split('\n').join('<br>');

function htmlRow({ item, summary, detail, state }) {
  const badge =
    state === 'attachment_only' ? ` <span class="badge" style="background:${COLOR.yellow};color:#222">ไฟล์แนบ</span>`
      : state === 'unreadable' ? ` <span class="badge" style="background:${COLOR.red};color:#fff">อ่านไม่ได้</span>`
        : state === 'overflow' ? ` <span class="badge" style="background:${COLOR.yellow};color:#222">เกินเพดาน</span>`
          : '';
  const body = state === 'overflow' ? 'ไม่ได้อ่านเนื้อหา: เกินเพดานจำนวนหน้าที่อ่านต่อรอบ' : summary ? summary.text : 'ไม่มีผลสรุป';
  const warn = summary && summary.unverified.length
    ? `<div style="color:${COLOR.red};font-weight:600">⚠ ตัวเลขยังไม่ยืนยัน (ไม่พบในต้นฉบับ): ${esc(summary.unverified.join(', '))}</div>` : '';
  const files = ((detail && detail.attachments) || [])
    .map((a) => `<div class="file" style="border-left:4px solid ${COLOR.yellow}">ไฟล์แนบ: ${link(a.href, a.text)} <span class="url">${esc(a.href)}</span></div>`).join('');
  return `<li><strong>${timeOf(item.datetime)} ${esc(item.symbol)}</strong> — ${link(item.url, item.headline)}${badge}<div>${lines(body)}</div>${warn}${files}</li>`;
}

function htmlGroup({ group, summary }) {
  const warn = summary && summary.unverified.length
    ? `<div style="color:${COLOR.red};font-weight:600">⚠ ตัวเลขยังไม่ยืนยัน: ${esc(summary.unverified.join(', '))}</div>` : '';
  const symbols = group.items.map((i) => link(i.url, i.symbol)).join(', ');
  return `<li><strong>${esc(group.template)}</strong> — ${group.items.length} ข่าว<div>${lines(summary ? summary.text : 'ไม่มีผลสรุป')}</div>${warn}<div class="symbols">รายชื่อทั้งหมด: ${symbols}</div></li>`;
}

function htmlNav(rows) {
  const body = rows.map((r) => `<tr><td>${timeOf(r.item.datetime)}</td><td>${esc(r.item.symbol)}</td><td>${esc(r.nav)}</td><td>${esc(r.date)}</td><td>${link(r.item.url, 'ข่าว')}</td></tr>`).join('');
  return `<table><thead><tr><th>เวลา</th><th>ชื่อย่อ</th><th>NAV/หน่วย (บาท)</th><th>ข้อมูล ณ วันที่</th><th>ลิงก์</th></tr></thead><tbody>${body}</tbody></table>`;
}

function toHtml(input, view) {
  const c = view.counts;
  const chip = (label, n, bg, fg) => `<span class="chip" style="background:${bg};color:${fg}">${label} ${n}</span>`;
  const status = [
    chip('ข่าวทั้งหมด', c.total, COLOR.blue, '#fff'),
    chip('สรุปได้', c.ok, COLOR.green, '#fff'),
    chip('อยู่ในไฟล์แนบ', c.attachment, COLOR.yellow, '#222'),
    chip('อ่านไม่ได้', c.unreadable, COLOR.red, '#fff'),
    chip('เกินเพดาน', c.overflow, COLOR.yellow, '#222'),
    chip('ตัวเลขยังไม่ยืนยัน', c.unverified, c.unverified ? COLOR.red : COLOR.green, '#fff'),
  ].join(' ');
  const sections = view.sections.map((s) => `<section><h2 style="color:${COLOR.blue};border-bottom:2px solid ${COLOR.blue}">${esc(s.category)} (${rowCount(s)})</h2>${s.nav.length ? htmlNav(s.nav) : ''}<ul>${s.groups.map(htmlGroup).join('')}${s.rows.map(htmlRow).join('')}</ul></section>`).join('\n');
  const cost = costLine(input.cost);
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>สรุปข่าว SET</title>
<style>
body{font-family:system-ui,"Noto Sans Thai",sans-serif;margin:0 auto;max-width:900px;padding:16px;color:#222;background:#fff;line-height:1.5}
h1{color:${COLOR.blue}} ul{padding-left:20px} li{margin:10px 0} .chip{display:inline-block;padding:2px 10px;border-radius:12px;margin:2px;font-size:14px}
.badge{padding:1px 8px;border-radius:10px;font-size:12px} .file{margin:4px 0;padding-left:8px} .url{color:#666;font-size:12px;word-break:break-all}
.symbols{color:#444;font-size:13px;word-break:break-word} table{border-collapse:collapse;width:100%} th{background:${COLOR.blue};color:#fff}
td,th{border:1px solid #ccc;padding:4px 8px;text-align:left} .cost{color:#666;font-size:12px}
</style></head><body>
<h1>สรุปข่าว SET (หุ้น/ETF/DR)</h1>
<p>ช่วงเวลา ${esc(windowLine(input.window))}</p>
<p>${status}</p>
${sections}
${cost ? `<p class="cost">${esc(cost)}</p>` : ''}
</body></html>
`;
}

export function composeReport(input) {
  const view = buildView(input);
  return { markdown: toMarkdown(input, view), html: toHtml(input, view) };
}

// ---------------------------------------------------------------- LINE
function lineBullet({ item, summary, state }) {
  if (state === 'overflow') return `• ${item.symbol}: ${item.headline} (ไม่ได้อ่านเนื้อหา)`;
  if (state === 'attachment_only') return `• ${item.symbol}: ${item.headline} (${NOTE_ATTACHMENT})`;
  if (state === 'unreadable' || !summary) return `• ${item.symbol}: ${item.headline} (อ่านไม่ได้)`;
  const flag = summary.unverified.length ? ' ⚠ตัวเลขยังไม่ยืนยัน' : '';
  return `• ${item.symbol}: ${firstLine(summary.text)}${flag}`;
}

function lineGroup({ group, summary, state }) {
  const names = group.items.slice(0, 5).map((i) => i.symbol).join(', ');
  const more = group.items.length > 5 ? ' ...' : '';
  const body = state === 'ok' && summary ? firstLine(summary.text, 100) : NOTE_ATTACHMENT;
  return `• ${group.template} — ${group.items.length} ข่าว: ${body} (เช่น ${names}${more})`;
}

export function composeLine(input, reportUrl) {
  const view = buildView(input);
  const c = view.counts;
  const head = [
    'สรุปข่าว SET (หุ้น/ETF/DR)',
    `ช่วง ${windowLine(input.window)}`,
    `ทั้งหมด ${c.total} ข่าว | สรุปได้ ${c.ok} | ไฟล์แนบ ${c.attachment} | อ่านไม่ได้ ${c.unreadable} | เกินเพดาน ${c.overflow}`,
  ];
  if (c.unverified) head.push(`⚠ ตัวเลขยังไม่ยืนยัน ${c.unverified} รายการ — ตรวจในรายงานเต็ม`);
  head.push(`รายงานเต็ม: ${reportUrl}`);

  const blocks = [head.join('\n')];
  for (const s of view.sections) {
    const bullets = [];
    if (s.nav.length) bullets.push(`• NAV ETF ${s.nav.length} กองทุน — ดูตารางในรายงานเต็ม`);
    for (const g of s.groups) bullets.push(lineGroup(g));
    for (const r of s.rows) bullets.push(lineBullet(r));
    const shown = bullets.slice(0, LINE_MAX_PER_CATEGORY);
    if (bullets.length > shown.length) shown.push(`… และอีก ${bullets.length - shown.length} รายการ (ดูรายงานเต็ม)`);
    blocks.push([`[${s.category}] ${rowCount(s)} ข่าว`, ...shown].join('\n'));
  }
  return blocks;
}

// No report file is written on an empty day, so the message carries no report link.
export function composeEmpty(input) {
  return [`ไม่มีข่าวใหม่\nช่วงเวลา ${windowLine(input.window)}`];
}
