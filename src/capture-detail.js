// TEMPORARY (deleted in Task 12): captures rendered HTML of four kinds of news detail pages
// as fixtures, and prints a structural digest to find the content container.
// Opens only SET news detail URLs (guarded); never clicks or downloads attachments.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { loadConfig } from './config.js';
import { assertNewsPathAllowed } from './robots.js';
import { isSetNewsUrl } from './guards.js';
import { publishToDataBranch } from './publish.js';

const config = loadConfig();
await assertNewsPathAllowed();

execFileSync('git', ['fetch', 'origin', '+refs/heads/data:refs/remotes/origin/data'], { stdio: 'inherit' });
const listing = JSON.parse(execFileSync('git', ['show', 'origin/data:fixtures/listing.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const items = listing.items;

const picks = {
  financial: items.find((i) => i.tag === 'financial-statement'),
  nav: items.find((i) => i.tag === 'nav'),
  dr: items.find((i) => i.product === 'X'),
  other: items.find((i) => i.product === 'S' && i.tag === ''),
};

const files = {};
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ locale: 'th-TH' });
  for (const [kind, item] of Object.entries(picks)) {
    if (!item) { console.log(`[${kind}] no sample item found`); continue; }
    if (!isSetNewsUrl(item.url)) { console.log(`[${kind}] refused url ${item.url}`); continue; }
    console.log(`\n===== ${kind}: ${item.symbol} | ${item.headline}\n    ${item.url}`);
    const page = await context.newPage();
    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      const ok = page.getByRole('button', { name: 'ยอมรับ', exact: true });
      if (await ok.isVisible({ timeout: 2500 })) await ok.click();
    } catch { /* no banner */ }
    await page.waitForTimeout(8000);

    const digest = await page.evaluate((headline) => {
      const needle = headline.slice(0, 14);
      const all = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && (e.textContent || '').includes(needle));
      const leaf = all[0];
      const chain = [];
      for (let n = leaf, i = 0; n && i < 9; n = n.parentElement, i++) {
        chain.push(`${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : ''} textLen=${(n.innerText || '').length}`);
      }
      const clone = document.documentElement.cloneNode(true);
      clone.querySelectorAll('script,style,svg,noscript,link,meta,iframe,img').forEach((e) => e.remove());
      return { chain, html: clone.outerHTML, leafCount: all.length };
    }, item.headline);
    console.log('headline leaf elements:', digest.leafCount);
    digest.chain.forEach((c) => console.log('  ^', c));
    console.log('stripped html bytes:', digest.html.length);
    files[`fixtures/detail-${kind}.html`] = digest.html;
    await page.close();
    await new Promise((r) => setTimeout(r, config.delayMs));
  }
} finally {
  await browser.close();
}

await publishToDataBranch({ repoDir: process.cwd(), files, message: `fixtures: detail pages ${new Date().toISOString()}` });
console.log('\npublished', Object.keys(files).join(', '));
