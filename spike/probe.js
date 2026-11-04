// THROWAWAY: load the SET news page in a real browser and log API traffic.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'th-TH' });
  const page = await ctx.newPage();
  const calls = [];

  page.on('response', async (res) => {
    const url = res.url();
    const type = res.headers()['content-type'] || '';
    if (!url.includes('set.or.th')) return;
    if (type.includes('json') || url.includes('/api/')) {
      let sample = '';
      try { sample = (await res.text()).slice(0, 400); } catch {}
      calls.push({ status: res.status(), method: res.request().method(), url, type, sample });
    }
  });

  let status = 'n/a';
  try {
    const resp = await page.goto('https://www.set.or.th/th/market/news-and-alert/news',
      { waitUntil: 'networkidle', timeout: 60000 });
    status = resp ? resp.status() : 'no response';
  } catch (e) {
    console.log('GOTO ERROR:', e.message);
  }
  console.log('page status:', status, '| title:', await page.title().catch(() => '?'));

  const rows = await page.$$eval('a[href*="/news/"], a[href*="newsdetails"], a[href*="/market/news"]',
    (as) => as.slice(0, 15).map((a) => ({ text: a.innerText.trim().slice(0, 80), href: a.href })))
    .catch(() => []);
  console.log('news-like links found:', rows.length);
  rows.forEach((r) => console.log(' -', r.text, '=>', r.href));

  console.log('\nAPI/JSON calls captured:', calls.length);
  calls.forEach((c) => console.log(`[${c.status}] ${c.method} ${c.url}\n   type=${c.type}\n   sample=${c.sample.replace(/\s+/g, ' ')}\n`));

  const bodyText = (await page.innerText('body').catch(() => '')).slice(0, 500);
  console.log('body text head:', bodyText.replace(/\s+/g, ' '));
  await browser.close();
})();
