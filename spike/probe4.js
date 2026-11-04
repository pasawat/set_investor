// THROWAWAY: ordinary-visitor browsing. Dump real DOM structure, press Search like a person,
// click a headline to open the detail page, and try the attachment link like a person.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'https://www.set.or.th';
const NEWS = BASE + '/th/market/news-and-alert/news';
const short = (s, n = 300) => String(s).replace(/\s+/g, ' ').slice(0, n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'th-TH', acceptDownloads: true });
  const page = await ctx.newPage();

  const seen = [];
  page.on('response', async (res) => {
    if (!res.url().includes('/api/cms/v1/news/set')) return;
    let body = null; try { body = await res.json(); } catch {}
    seen.push({ status: res.status(), url: res.url(), body });
  });
  const last = () => seen[seen.length - 1];
  const sum = (r) => {
    if (!r) return 'none';
    const b = r.body || {};
    const g = (b.newsGroups || []).map((x) => `${x.group || '(no name)'}:${x.totalCount}`);
    const pn = b.paginateNews || {};
    return `[${r.status}] ${r.url.replace(BASE, '')}\n    groups=[${g.join(' | ')}] paginate.totalCount=${pn.totalCount} items=${(pn.newsInfoList || []).length}`;
  };

  console.log('===== 1. open + accept cookies');
  const w = page.waitForResponse((r) => r.url().includes('/api/cms/v1/news/set'), { timeout: 60000 }).catch(() => null);
  await page.goto(NEWS, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', e.message.split('\n')[0]));
  await w; await page.waitForTimeout(3000);
  try { const ok = page.getByRole('button', { name: 'ยอมรับ', exact: true }); if (await ok.isVisible({ timeout: 2500 })) await ok.click(); } catch {}
  await page.waitForTimeout(1500);
  console.log('initial:', sum(last()));

  // find a real headline from the data the page itself loaded
  const b0 = last() && last().body || {};
  const all = [...(b0.newsGroups || []).flatMap((g) => g.newsInfoList || []), ...((b0.paginateNews && b0.paginateNews.newsInfoList) || [])];
  console.log('items in first response:', all.length);
  if (all[0]) console.log('first item keys:', Object.keys(all[0]).join(','), '\n  sample:', short(JSON.stringify(all[0]), 600));

  console.log('\n===== 2. DOM of a news row');
  const head = (all.find((x) => /งบการเงิน/.test(x.headline)) || all[0] || {}).headline;
  console.log('looking for headline text:', head);
  if (head) {
    const loc = page.getByText(head, { exact: false }).first();
    try {
      await loc.waitFor({ timeout: 8000 });
      const info = await loc.evaluate((el) => {
        const chain = []; let n = el;
        for (let i = 0; i < 5 && n; i++, n = n.parentElement) chain.push(`${n.tagName.toLowerCase()}${n.className ? '.' + String(n.className).split(' ').slice(0, 3).join('.') : ''}${n.getAttribute('href') ? ' href=' + n.getAttribute('href') : ''}${n.getAttribute('role') ? ' role=' + n.getAttribute('role') : ''}`);
        let row = el; for (let i = 0; i < 3 && row.parentElement; i++) row = row.parentElement;
        return { chain, html: row.outerHTML.replace(/\s+/g, ' ').slice(0, 1400) };
      });
      console.log('ancestor chain:', info.chain.join('  <  '));
      console.log('row html:', info.html);
    } catch (e) { console.log('headline element not found:', e.message.split('\n')[0]); }
  }

  console.log('\n===== 3. pagination DOM');
  try {
    const pg = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => e.children.length > 3 && /^\s*1\s+2\s+3/.test(e.innerText || '') && e.innerText.length < 60);
      return el ? el.outerHTML.replace(/\s+/g, ' ').slice(0, 1200) : 'not found';
    });
    console.log(pg);
  } catch (e) { console.log('pagination dump failed', e.message.split('\n')[0]); }

  console.log('\n===== 4. press filter then Search like a person');
  for (const label of ['ETF', 'DR']) {
    const n = seen.length;
    try {
      await page.getByRole('button', { name: label, exact: true }).first().click({ timeout: 6000 });
      await page.getByRole('button', { name: 'ค้นหา', exact: true }).first().click({ timeout: 6000 });
      await page.waitForTimeout(5000);
      console.log(`${label} + ค้นหา: new calls=${seen.length - n}`);
      if (seen.length > n) console.log('   ', sum(last()));
    } catch (e) { console.log(`${label} flow failed:`, e.message.split('\n')[0]); }
  }
  // back to stocks, widen the range with a preset, then search
  try {
    const n = seen.length;
    await page.getByRole('button', { name: 'หุ้น', exact: true }).first().click({ timeout: 6000 });
    await page.getByRole('button', { name: '5D', exact: true }).first().click({ timeout: 6000 });
    await page.getByRole('button', { name: 'ค้นหา', exact: true }).first().click({ timeout: 6000 });
    await page.waitForTimeout(5000);
    console.log(`หุ้น + 5D + ค้นหา: new calls=${seen.length - n}`);
    if (seen.length > n) console.log('   ', sum(last()));
  } catch (e) { console.log('stock/5D flow failed:', e.message.split('\n')[0]); }

  console.log('\n===== 5. open a news item by clicking its headline');
  const res = last() && last().body || {};
  const items = [...(res.newsGroups || []).flatMap((g) => g.newsInfoList || []), ...((res.paginateNews && res.paginateNews.newsInfoList) || [])];
  const target = items.find((x) => /งบการเงิน/.test(x.headline)) || items[0];
  if (!target) { console.log('no item to open'); }
  else {
    console.log('opening:', target.symbol, '-', target.headline);
    const calls = [];
    page.on('response', (r) => { const ct = r.headers()['content-type'] || ''; if (r.url().includes('set.or.th') && (r.url().includes('/api/') || ct.includes('pdf')) && !r.url().includes('/news/set?')) calls.push(`[${r.status()}] ${r.url().replace(BASE, '')} (${ct})`); });
    try {
      await Promise.all([
        page.waitForURL(/newsdetails/, { timeout: 20000 }),
        page.getByText(target.headline, { exact: false }).first().click({ timeout: 8000 }),
      ]);
    } catch (e) { console.log('click-through failed:', e.message.split('\n')[0]); }
    await page.waitForTimeout(8000);
    console.log('current url:', page.url());
    console.log('calls on detail page:'); calls.slice(0, 10).forEach((c) => console.log('   ', c));
    const body = (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ');
    const i = body.indexOf(target.headline.slice(0, 12));
    console.log('text near headline:', short(body.slice(Math.max(0, i), i + 800), 800));
    const att = await page.$$eval('a', (as) => as.filter((a) => a.href.startsWith('https://www.set.or.th/') || a.href.startsWith('https://weblink')).map((a) => ({ t: a.innerText.trim().slice(0, 60), h: a.href }))
      .filter((x) => /pdf|download|attach|\.zip|\.xls|\.doc|file/i.test(x.h) || /pdf|ดาวน์โหลด|ไฟล์|แนบ|เอกสาร|รายงาน/i.test(x.t)));
    console.log('attachment-like links (SET domain only):', JSON.stringify(att.slice(0, 8)));
    if (att.length) {
      const a = att.find((x) => /pdf/i.test(x.h + x.t)) || att[0];
      try {
        const [dl] = await Promise.all([
          page.waitForEvent('download', { timeout: 15000 }),
          page.locator(`a[href="${a.h.replace(/"/g, '\\"')}"]`).first().click({ timeout: 6000 }),
        ]);
        const buf = fs.readFileSync(await dl.path());
        console.log(`download ok: name=${dl.suggestedFilename()} size=${buf.length} magic=${JSON.stringify(buf.slice(0, 5).toString())}`);
      } catch (e) { console.log('no download event:', e.message.split('\n')[0]); }
    }
  }
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
