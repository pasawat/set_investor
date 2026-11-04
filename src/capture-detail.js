// TEMPORARY (deleted in Task 12): diagnose how a real detail page differs from the fixture.
// Opens ONE SET news detail page like a visitor and prints counts/structure of the news block.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { assertNewsPathAllowed } from './robots.js';
import { isSetNewsUrl } from './guards.js';

await assertNewsPathAllowed();
execFileSync('git', ['fetch', 'origin', '+refs/heads/data:refs/remotes/origin/data'], { stdio: 'inherit' });
const listing = JSON.parse(execFileSync('git', ['show', 'origin/data:fixtures/listing.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const item = listing.items.find((i) => i.tag === 'financial-statement');
if (!isSetNewsUrl(item.url)) throw new Error('refused url');

const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ locale: 'th-TH' })).newPage();
  await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.card-content .raw-html', { timeout: 20000 });
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const short = (e) => `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 4).join('.')}`;
    return {
      divNews: [...document.querySelectorAll('div.news')].map((e) => ({ el: short(e), hasH2: !!e.querySelector('.title h2'), h2: (e.querySelector('.title h2') || {}).textContent, btnDownload: e.querySelectorAll('a.btn-download').length, textHead: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 70) })),
      cardContent: document.querySelectorAll('.card-content').length,
      btnDownloadAnywhere: [...document.querySelectorAll('a.btn-download')].map((a) => ({ text: a.textContent.trim(), inDivNews: !!a.closest('div.news'), parent: short(a.parentElement) })),
      rawHtml: [...document.querySelectorAll('.raw-html')].map((e) => ({ inCard: !!e.closest('.card-content'), len: (e.innerText || '').length })),
      h2s: [...document.querySelectorAll('h2')].map((e) => (e.textContent || '').trim().slice(0, 60)),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.close();
}
