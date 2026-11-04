// THROWAWAY: ordinary visitor. Open the listing, accept cookies, read the per-page control,
// then open 3 news detail pages via their normal links and see how attachments/PDFs appear.
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
    seen.push({ url: res.url(), body });
  });

  console.log('===== 1. listing + per-page control');
  const w = page.waitForResponse((r) => r.url().includes('/api/cms/v1/news/set'), { timeout: 60000 }).catch(() => null);
  await page.goto(NEWS, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', e.message.split('\n')[0]));
  await w; await page.waitForTimeout(3000);
  try { const ok = page.getByRole('button', { name: 'ยอมรับ', exact: true }); if (await ok.isVisible({ timeout: 2500 })) await ok.click(); } catch {}
  await page.waitForTimeout(1500);
  try {
    const html = await page.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find((e) => (e.innerText || '').trim().startsWith('แสดง') && e.querySelector('select, ul, [role="listbox"], button') && e.innerText.length < 80);
      return el ? el.outerHTML.replace(/\s+/g, ' ').slice(0, 1200) : 'per-page control not found';
    });
    console.log(html);
  } catch (e) { console.log('dump failed', e.message.split('\n')[0]); }

  // pick three items: one financial statement, plus two others
  const b = seen[0] && seen[0].body || {};
  const items = [...(b.newsGroups || []).flatMap((g) => g.newsInfoList || []), ...((b.paginateNews && b.paginateNews.newsInfoList) || [])];
  const tags = {}; for (const i of items) tags[i.tag] = (tags[i.tag] || 0) + 1;
  console.log('tags today (stocks):', JSON.stringify(tags));
  const pick = [];
  const addBy = (fn) => { const it = items.find((x) => fn(x) && !pick.includes(x)); if (it) pick.push(it); };
  addBy((x) => /financial/.test(x.tag || ''));
  addBy((x) => !/financial/.test(x.tag || ''));
  addBy((x) => !/financial/.test(x.tag || ''));
  console.log('picked:', pick.map((p) => `${p.symbol}|${p.tag}|${p.headline.slice(0, 40)}`).join(' ;; '));

  // ---------- 2. detail pages via their normal links
  for (const it of pick) {
    console.log(`\n===== detail: ${it.symbol} / ${it.tag}\n    ${it.url}`);
    const dp = await ctx.newPage();
    const calls = [];
    dp.on('response', (r) => {
      const ct = r.headers()['content-type'] || '';
      const u = r.url();
      if (/set\.or\.th/.test(u) && !/index\/info|breadcrumb|googleads|doubleclick/.test(u) && (u.includes('/api/') || ct.includes('pdf') || /\.pdf/i.test(u))) calls.push(`[${r.status()}] ${u.replace(BASE, '')} (${ct})`);
    });
    await dp.goto(it.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', e.message.split('\n')[0]));
    await dp.waitForTimeout(9000);
    console.log('title:', await dp.title().catch(() => '?'));
    console.log('calls:'); calls.slice(0, 8).forEach((c) => console.log('   ', c));
    const body = (await dp.innerText('body').catch(() => '')).replace(/\s+/g, ' ');
    const i = body.indexOf(it.headline.slice(0, 12));
    console.log('text near headline:', short(body.slice(Math.max(0, i), i + 900), 900));
    const links = await dp.$$eval('a', (as) => as.map((a) => ({ t: a.innerText.trim().slice(0, 70), h: a.href })));
    const interesting = links.filter((x) => /\.pdf|download|attach|\/file|weblink|portal|\.zip|\.xlsx?|\.docx?/i.test(x.h) || /pdf|ดาวน์โหลด|ไฟล์|แนบ|เอกสาร|รายงาน|ฉบับเต็ม/i.test(x.t))
      .filter((x) => !/listedCompanies_th_TH\.xls/.test(x.h));
    console.log('attachment-like links:', JSON.stringify(interesting.slice(0, 10)));

    const target = interesting.find((x) => /pdf/i.test(x.h + x.t)) || interesting[0];
    if (target) {
      const sel = `a[href="${target.h.replace(/"/g, '\\"')}"]`;
      try {
        const result = await Promise.race([
          dp.waitForEvent('download', { timeout: 15000 }).then((d) => ({ kind: 'download', d })),
          dp.waitForEvent('popup', { timeout: 15000 }).then((p) => ({ kind: 'popup', p })),
          dp.locator(sel).first().click({ timeout: 6000 }).then(() => new Promise((r) => setTimeout(() => r({ kind: 'clicked-only' }), 12000))),
        ]);
        if (result.kind === 'download') {
          const buf = fs.readFileSync(await result.d.path());
          console.log(`download: name=${result.d.suggestedFilename()} size=${buf.length} magic=${JSON.stringify(buf.slice(0, 5).toString())}`);
        } else if (result.kind === 'popup') {
          await result.p.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          console.log('popup url:', result.p.url());
        } else console.log('clicked, no download/popup');
      } catch (e) { console.log('attachment click failed:', e.message.split('\n')[0]); }
    } else console.log('no attachment link found on this page');
    await dp.close();
    await new Promise((r) => setTimeout(r, 2500));
  }
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
