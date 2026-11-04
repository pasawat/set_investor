// THROWAWAY probe round 2. Answers: ETF/DR type ids, pagination, detail+PDF, rate behaviour.
const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BASE = 'https://www.set.or.th';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 300) => String(s).replace(/\s+/g, ' ').slice(0, n);

async function get(path) {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: BASE + '/th/market/news-and-alert/news' } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, type: res.headers.get('content-type'), text, json };
}
const items = (j) => {
  if (!j) return [];
  const a = (j.newsGroups || []).flatMap((g) => g.newsInfoList || []);
  const b = (j.paginateNews && j.paginateNews.newsInfoList) || [];
  return [...a, ...b];
};

(async () => {
  // Use the latest weekday that had news: date = yesterday (dd/mm/yyyy, Gregorian)
  const d = new Date(Date.now() + 7 * 3600 * 1000 - 24 * 3600 * 1000);
  const dd = (x) => String(x).padStart(2, '0');
  const D = `${dd(d.getUTCDate())}/${dd(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  console.log('probe date:', D);

  // ---- Q1: security types (ETF / DR ids)
  console.log('\n===== Q1: security types in stock list');
  const sl = await get('/api/set/stock/list');
  const syms = (sl.json && sl.json.securitySymbols) || [];
  const byType = {};
  for (const s of syms) {
    (byType[s.securityType] = byType[s.securityType] || []).push(s.symbol);
  }
  for (const [t, arr] of Object.entries(byType)) console.log(`type=${t} count=${arr.length} e.g. ${arr.slice(0, 5).join(', ')}`);

  console.log('\n-- news totalCount per securityTypeIds (sourceId=company)');
  for (const t of Object.keys(byType)) {
    const r = await get(`/api/cms/v1/news/set?sourceId=company&securityTypeIds=${encodeURIComponent(t)}&fromDate=${D}&toDate=${D}&perPage=5&orderBy=date&lang=th`);
    const groups = (r.json && r.json.newsGroups || []).map((g) => `${g.group}:${g.totalCount}`);
    const pn = r.json && r.json.paginateNews;
    console.log(`type=${t} http=${r.status} groups=[${groups.join(' | ')}] paginate.totalCount=${pn && pn.totalCount}`);
    await sleep(300);
  }
  const all = await get(`/api/cms/v1/news/set?fromDate=${D}&toDate=${D}&perPage=5&orderBy=date&lang=th`);
  console.log('no-type filter: paginate.totalCount =', all.json && all.json.paginateNews && all.json.paginateNews.totalCount);

  // ---- Q2: pagination
  console.log('\n===== Q2: pagination shape');
  const p1 = await get(`/api/cms/v1/news/set?sourceId=company&securityTypeIds=S&fromDate=${D}&toDate=${D}&perPage=5&orderBy=date&lang=th`);
  console.log('top-level keys:', p1.json && Object.keys(p1.json));
  console.log('paginateNews keys:', p1.json && p1.json.paginateNews && Object.keys(p1.json.paginateNews));
  console.log('first item full:', short(JSON.stringify(items(p1.json)[0] || {}), 900));
  for (const q of ['page=2', 'pageNo=2', 'pageIndex=2', 'offset=5']) {
    const r = await get(`/api/cms/v1/news/set?sourceId=company&securityTypeIds=S&fromDate=${D}&toDate=${D}&perPage=5&orderBy=date&lang=th&${q}`);
    const ids = items(r.json).map((x) => x.id);
    console.log(`${q}: http=${r.status} n=${ids.length} ids=${ids.join(',')}`);
    await sleep(300);
  }
  const big = await get(`/api/cms/v1/news/set?sourceId=company&securityTypeIds=S&fromDate=${D}&toDate=${D}&perPage=1000&orderBy=date&lang=th`);
  console.log(`perPage=1000: http=${big.status} items=${items(big.json).length} bytes=${big.text.length}`);

  // ---- Q3: detail page + PDF
  console.log('\n===== Q3: detail page and PDF');
  const pool = items(big.json);
  const byTag = {};
  for (const it of pool) byTag[it.tag] = (byTag[it.tag] || 0) + 1;
  console.log('tags in sample:', JSON.stringify(byTag));
  const targets = [pool.find((x) => /financial/.test(x.tag || '')), pool.find((x) => !/financial/.test(x.tag || ''))].filter(Boolean);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'th-TH', userAgent: UA });
  for (const t of targets) {
    console.log(`\n--- detail: ${t.url} (tag=${t.tag}) "${t.headline}"`);
    const page = await ctx.newPage();
    const calls = [];
    page.on('response', async (res) => {
      const u = res.url();
      if (!u.includes('set.or.th')) return;
      const ct = res.headers()['content-type'] || '';
      if (u.includes('/api/') || ct.includes('json') || ct.includes('pdf')) {
        let s = '';
        if (!ct.includes('pdf')) { try { s = (await res.text()).slice(0, 700); } catch {} }
        calls.push({ st: res.status(), u, ct, s });
      }
    });
    try { await page.goto(t.url, { waitUntil: 'networkidle', timeout: 60000 }); } catch (e) { console.log('goto err', e.message); }
    calls.filter((c) => /news|attach|pdf/i.test(c.u)).forEach((c) => console.log(`[${c.st}] ${c.u}\n   ${c.ct}\n   ${short(c.s, 700)}`));
    const links = await page.$$eval('a', (as) => as.map((a) => ({ t: a.innerText.trim().slice(0, 60), h: a.href }))
      .filter((x) => /pdf|download|attach|file|zip|\.xls|\.doc/i.test(x.h) || /pdf|ดาวน์โหลด|ไฟล์|แนบ/i.test(x.t)));
    console.log('attachment-like links:', JSON.stringify(links.slice(0, 10)));
    const body = (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ');
    const i = body.indexOf(t.headline);
    console.log('body around headline:', short(body.slice(Math.max(0, i), i + 600), 600));
    await page.close();

    for (const l of links.filter((x) => /pdf|download|attach/i.test(x.h)).slice(0, 2)) {
      try {
        const r = await fetch(l.h, { headers: { 'User-Agent': UA, Referer: t.url } });
        const buf = Buffer.from(await r.arrayBuffer());
        console.log(`PDF try ${l.h}\n   http=${r.status} type=${r.headers.get('content-type')} size=${buf.length} magic=${JSON.stringify(buf.slice(0, 5).toString())}`);
      } catch (e) { console.log('pdf fetch err', e.message); }
    }
  }
  await browser.close();

  // ---- Q4: rate behaviour (modest): 20 sequential calls, 250ms apart
  console.log('\n===== Q4: sequential call behaviour');
  const codes = {};
  for (let i = 0; i < 20; i++) {
    const r = await get(`/api/cms/v1/news/set?sourceId=company&securityTypeIds=S&fromDate=${D}&toDate=${D}&perPage=5&orderBy=date&lang=th`);
    codes[r.status] = (codes[r.status] || 0) + 1;
    await sleep(250);
  }
  console.log('status distribution over 20 calls:', JSON.stringify(codes));
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
