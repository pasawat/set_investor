// TEMPORARY (deleted in Task 12): live check of detail.js on a GitHub runner.
// Reads 5 real news detail pages and records every URL the browser was told to open.
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { loadConfig } from './config.js';
import { assertNewsPathAllowed } from './robots.js';
import { readDetails } from './detail.js';

const config = loadConfig();
await assertNewsPathAllowed();

execFileSync('git', ['fetch', 'origin', '+refs/heads/data:refs/remotes/origin/data'], { stdio: 'inherit' });
const listing = JSON.parse(execFileSync('git', ['show', 'origin/data:fixtures/listing.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const items = listing.items;
const pick = [
  items.find((i) => i.tag === 'financial-statement'),
  items.find((i) => i.tag === 'nav'),
  items.find((i) => i.product === 'X'),
  items.filter((i) => i.product === 'S' && i.tag === '')[0],
  items.filter((i) => i.product === 'S' && i.tag === '')[1],
].filter(Boolean);

const opened = [];
const launch = async () => {
  const browser = await chromium.launch();
  return {
    newContext: async (o) => {
      const context = await browser.newContext(o);
      return {
        newPage: async () => {
          const page = await context.newPage();
          const goto = page.goto.bind(page);
          page.goto = (url, opts) => { opened.push(url); return goto(url, opts); };
          return page;
        },
      };
    },
    close: () => browser.close(),
  };
};

const results = await readDetails(pick, config, { launch });
for (const r of results) {
  console.log(`${r.id} ok=${r.ok} attachmentOnly=${r.attachmentOnly} textChars=${r.text.length} attachments=${JSON.stringify(r.attachments.map((a) => a.href))}${r.error ? ' error=' + r.error : ''}\n    title=${JSON.stringify(r.title)} text=${JSON.stringify(r.text.slice(0, 90))}`);
}
console.log('\nURLs the browser was told to open:');
opened.forEach((u) => console.log(' ', u));
const offSite = opened.filter((u) => !u.startsWith('https://www.set.or.th/th/market/news-and-alert/newsdetails?'));
console.log('off-site/unexpected navigations:', offSite.length);
if (results.some((r) => !r.ok) || offSite.length) process.exit(1);
