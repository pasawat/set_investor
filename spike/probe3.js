// THROWAWAY probe: behave like an ordinary visitor. Open pages, click UI controls,
// and only OBSERVE what the page itself loads. No header forging, no cookie reuse,
// no direct API calls. Low volume, paced.
const { chromium } = require('playwright');

const BASE = 'https://www.set.or.th';
const NEWS = BASE + '/th/market/news-and-alert/news';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 300) => String(s).replace(/\s+/g, ' ').slice(0, n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'th-TH' });
  const page = await ctx.newPage();

  // Observe the page's own news API responses.
  const seen = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!u.includes('/api/cms/v1/news/set')) return;
    let body = null;
    try { body = await res.json(); } catch {}
    seen.push({ at: Date.now(), status: res.status(), url: u, body });
  });
  const lastSeen = () => seen[seen.length - 1];
  const summarize = (r) => {
    if (!r) return 'none';
    const b = r.body || {};
    const groups = (b.newsGroups || []).map((g) => `${g.group}:${g.totalCount}`);
    const pn = b.paginateNews;
    return `[${r.status}] ${r.url.replace(BASE, '')}\n    groups=[${groups.join(' | ')}] paginate.totalCount=${pn && pn.totalCount} items=${pn && pn.newsInfoList ? pn.newsInfoList.length : 'n/a'}`;
  };

  // ---------- 1. open page like a visitor
  console.log('===== 1. open news page');
  const w = page.waitForResponse((r) => r.url().includes('/api/cms/v1/news/set'), { timeout: 60000 }).catch(() => null);
  await page.goto(NEWS, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err:', e.message.split('\n')[0]));
  await w;
  await page.waitForTimeout(4000);
  console.log('first load:', summarize(lastSeen()));
  const b0 = lastSeen() && lastSeen().body;
  if (b0) {
    console.log('top-level keys:', Object.keys(b0));
    if (b0.paginateNews) console.log('paginateNews keys:', Object.keys(b0.paginateNews));
    const first = (b0.paginateNews && b0.paginateNews.newsInfoList || [])[0];
    console.log('first item:', short(JSON.stringify(first), 800));
  }

  // accept the cookie banner like a normal visitor
  try {
    const ok = page.getByRole('button', { name: 'ยอมรับ', exact: true });
    if (await ok.isVisible({ timeout: 3000 })) { await ok.click({ timeout: 4000 }); console.log('cookie banner accepted'); await page.waitForTimeout(1500); }
  } catch (e) { console.log('cookie banner: none/skip'); }

  // ---------- 2. what filters does the UI offer?
  console.log('\n===== 2. visible filter controls');
  const ui = await page.evaluate(() => {
    const vis = (el) => !!(el.offsetWidth || el.offsetHeight);
    const pick = (sel) => [...document.querySelectorAll(sel)].filter(vis).map((e) => (e.innerText || e.value || e.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 50)).filter(Boolean);
    return {
      buttons: pick('button').slice(0, 40),
      selects: [...document.querySelectorAll('select')].filter(vis).map((s) => [...s.options].map((o) => o.text.trim()).slice(0, 15)),
      inputs: [...document.querySelectorAll('input')].filter(vis).map((i) => `${i.type}|${i.placeholder || i.name || ''}`).slice(0, 15),
      pagination: pick('[class*="pagination"] *, [class*="paging"] *, nav li').slice(0, 20),
    };
  });
  console.log(JSON.stringify(ui, null, 1));

  // ---------- 3. try clicking filter labels the way a person would; watch what the page requests
  console.log('\n===== 3. click security-type options (observe requests only)');
  for (const label of ['ETF', 'DR', 'หุ้น']) {
    const loc = page.getByRole('button', { name: label, exact: true }).first();
    const n = seen.length;
    try {
      await loc.click({ timeout: 6000 });
      await page.waitForTimeout(4000);
      console.log(`clicked button "${label}": new news calls=${seen.length - n}`);
      if (seen.length > n) console.log('   ', summarize(lastSeen()));
    } catch (e) { console.log(`"${label}" click failed:`, e.message.split('\n')[0]); }
    await sleep(2000);
  }
  // date-range presets a visitor can press
  for (const label of ['5D']) {
    const n = seen.length;
    try {
      await page.getByRole('button', { name: label, exact: true }).first().click({ timeout: 6000 });
      await page.waitForTimeout(4000);
      console.log(`clicked "${label}": new news calls=${seen.length - n}`);
      if (seen.length > n) console.log('   ', summarize(lastSeen()));
    } catch (e) { console.log(`"${label}" click failed:`, e.message.split('\n')[0]); }
  }

  // ---------- 4. pagination as a person would (next page / load more)
  console.log('\n===== 4. pagination');
  for (const label of ['2']) {
    const n = seen.length;
    try {
      await page.getByRole('button', { name: label, exact: true }).first().click({ timeout: 6000 });
      await page.waitForTimeout(4000);
      console.log(`clicked page "${label}": new news calls=${seen.length - n}`);
      if (seen.length > n) console.log('   ', summarize(lastSeen()));
    } catch (e) { console.log(`page "${label}" click failed:`, e.message.split('\n')[0]); }
  }

  // ---------- 5. open a detail page by navigating to a listed news link
  console.log('\n===== 5. detail page + attachments');
  // only SET's own news links (exclude share buttons to Facebook/LINE/X)
  const links = await page.$$eval('a[href*="newsdetails"]', (as) => as
    .filter((a) => a.href.startsWith('https://www.set.or.th/') && a.innerText.trim().length > 3)
    .slice(0, 40).map((a) => ({ t: a.innerText.trim().slice(0, 70), h: a.href })));
  console.log('detail links on page:', links.length);
  links.slice(0, 5).forEach((l) => console.log(' -', l.t, '=>', l.h));
  const targets = [links.find((l) => /งบการเงิน/.test(l.t)), links[0]].filter(Boolean);
  for (const t of targets.slice(0, 2)) {
    console.log(`\n--- ${t.t}\n    ${t.h}`);
    const dp = await ctx.newPage();
    const loaded = [];
    dp.on('response', (res) => {
      const ct = res.headers()['content-type'] || '';
      if (res.url().includes('set.or.th') && (res.url().includes('/api/') || ct.includes('pdf'))) loaded.push(`[${res.status()}] ${res.url().replace(BASE, '')} (${ct})`);
    });
    await dp.goto(t.h, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err:', e.message.split('\n')[0]));
    await dp.waitForTimeout(8000);
    console.log('page loaded these (api/pdf):'); loaded.filter((x) => /news|attach|pdf/i.test(x)).slice(0, 8).forEach((x) => console.log('   ', x));
    const body = (await dp.innerText('body').catch(() => '')).replace(/\s+/g, ' ');
    const i = body.indexOf(t.t.slice(0, 15));
    console.log('text near headline:', short(body.slice(Math.max(0, i), i + 700), 700));
    const att = await dp.$$eval('a', (as) => as.map((a) => ({ t: a.innerText.trim().slice(0, 60), h: a.href })).filter((x) => /pdf|download|attach|\.zip|\.xls|\.doc|\/data\/|file/i.test(x.h) || /pdf|ดาวน์โหลด|ไฟล์|แนบ|เอกสาร/i.test(x.t)));
    console.log('attachment-like links:', JSON.stringify(att.slice(0, 8)));

    // click the first attachment like a person would and see whether a PDF arrives
    if (att.length) {
      const target = att.find((a) => /pdf/i.test(a.h + a.t)) || att[0];
      try {
        const [dl] = await Promise.all([
          dp.waitForEvent('download', { timeout: 15000 }),
          dp.locator(`a[href="${target.h.replace(/"/g, '\\"')}"]`).first().click({ timeout: 5000 }),
        ]);
        const p = await dl.path();
        const fs = require('fs');
        const buf = fs.readFileSync(p);
        console.log(`download ok: name=${dl.suggestedFilename()} size=${buf.length} magic=${JSON.stringify(buf.slice(0, 5).toString())}`);
      } catch (e) {
        console.log('no download event (maybe opens inline/new tab):', e.message.split('\n')[0]);
      }
    }
    await dp.close();
    await sleep(2000);
  }

  console.log('\ntotal news API responses observed on listing page:', seen.length);
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
