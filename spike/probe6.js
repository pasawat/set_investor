// THROWAWAY: ordinary visitor. Open 2 financial-statement news pages via their normal links,
// download the attachment like a person (click), and LIST the ZIP contents. Nothing else.
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = 'https://www.set.or.th';
const NEWS = BASE + '/th/market/news-and-alert/news';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'th-TH', acceptDownloads: true });
  const page = await ctx.newPage();
  const seen = [];
  page.on('response', async (res) => {
    if (!res.url().includes('/api/cms/v1/news/set')) return;
    let body = null; try { body = await res.json(); } catch {}
    seen.push({ body });
  });
  const w = page.waitForResponse((r) => r.url().includes('/api/cms/v1/news/set'), { timeout: 60000 }).catch(() => null);
  await page.goto(NEWS, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', e.message.split('\n')[0]));
  await w; await page.waitForTimeout(3000);
  try { const ok = page.getByRole('button', { name: 'ยอมรับ', exact: true }); if (await ok.isVisible({ timeout: 2500 })) await ok.click(); } catch {}

  const b = seen[0] && seen[0].body || {};
  const items = [...(b.newsGroups || []).flatMap((g) => g.newsInfoList || []), ...((b.paginateNews && b.paginateNews.newsInfoList) || [])];
  const fins = items.filter((x) => /financial/.test(x.tag || '')).slice(0, 2);
  console.log('financial-statement items found:', fins.length, '| all items:', items.length);

  const dir = fs.mkdtempSync('/tmp/dl-');
  let n = 0;
  for (const it of fins) {
    console.log(`\n===== ${it.symbol}: ${it.headline}\n    ${it.url}`);
    const dp = await ctx.newPage();
    await dp.goto(it.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', e.message.split('\n')[0]));
    await dp.waitForTimeout(8000);
    const body = (await dp.innerText('body').catch(() => '')).replace(/\s+/g, ' ');
    const i = body.indexOf(it.headline.slice(0, 12));
    console.log('page text (before disclaimer):', body.slice(Math.max(0, i), i + 400));
    const links = await dp.$$eval('a', (as) => as.map((a) => ({ t: a.innerText.trim().slice(0, 60), h: a.href })).filter((x) => /weblink\.set\.or\.th/.test(x.h)));
    console.log('weblink attachments:', JSON.stringify(links));
    if (links[0]) {
      try {
        const [dl] = await Promise.all([
          dp.waitForEvent('download', { timeout: 20000 }),
          dp.locator(`a[href="${links[0].h.replace(/"/g, '\\"')}"]`).first().click({ timeout: 6000 }),
        ]);
        const p = `${dir}/f${++n}-${dl.suggestedFilename()}`;
        await dl.saveAs(p);
        const buf = fs.readFileSync(p);
        console.log(`saved ${dl.suggestedFilename()} size=${buf.length} magic=${JSON.stringify(buf.slice(0, 4).toString('latin1'))}`);
        if (buf.slice(0, 2).toString() === 'PK') {
          const listing = execFileSync('python3', ['-I', '-m', 'zipfile', '-l', p], { encoding: 'utf8' });
          console.log('zip listing:\n' + listing.split('\n').slice(0, 30).join('\n'));
        }
      } catch (e) { console.log('download failed:', e.message.split('\n')[0]); }
    }
    await dp.close();
    await new Promise((r) => setTimeout(r, 2500));
  }
  await browser.close();
})().catch((e) => { console.log('FATAL', e); process.exit(1); });
