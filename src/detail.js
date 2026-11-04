// Reads news detail pages like an ordinary visitor (spec §3, §6).
// Attachment links are returned as text only: they are never clicked or downloaded.
import { chromium } from 'playwright';
import { parse } from 'node-html-parser';
import { isSetNewsUrl } from './guards.js';
import { newsKey } from './news.js';
import { backoffDelay, sleep } from './retry.js';

// The boilerplate disclaimer SET prints on every announcement (exchange liability notice).
const DISCLAIMER = /สารสนเทศฉบับนี้จัดทำและเผยแพร่[\s\S]*?เผยแพร่สารสนเทศฉบับนี้/;

function cleanBody(raw) {
  return raw
    .replace(DISCLAIMER, ' ')
    .replace(/ข้อสงวนสิทธิ์/g, ' ')
    .replace(/_{5,}/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Pure: parse the rendered HTML of a news detail page. */
export function extractDetail(html) {
  // `pre` must be absent from blockTextElements so it is parsed as markup:
  // the announcement body sits in <pre><div class="raw-html">. (`pre: false` would drop its content.)
  const root = parse(html, { blockTextElements: { script: true, noscript: true, style: true } });
  // The page has an empty decoy div.news before the real block: pick the one holding the headline.
  const news = root.querySelectorAll('div.news').find((n) => n.querySelector('.title h2')) || null;
  const title = news ? (news.querySelector('.title h2')?.text || '').trim() : '';
  const attachments = news
    ? news.querySelectorAll('a.btn-download').map((a) => ({ text: a.text.trim(), href: a.getAttribute('href') || '' }))
    : [];
  const body = root.querySelector('.card-content .raw-html'); // scoped: other .raw-html (cookie banner) exist on the page
  const text = body ? cleanBody(body.structuredText) : '';
  return { title, text, attachments, attachmentOnly: text === '' && attachments.length > 0 };
}

const failure = (id, error) => ({ id, ok: false, text: '', attachments: [], attachmentOnly: false, error });

/**
 * Open each item's detail page (one at a time, paced) and extract it.
 * Never throws for a single bad page: the result carries `ok:false` and `error`.
 */
export async function readDetails(items, config, deps = {}) {
  const launch = deps.launch || (() => chromium.launch());
  const retryBase = config.retryDelayMs ?? 2000;
  const deadline = config.detailBudgetMs ? Date.now() + config.detailBudgetMs : Infinity;
  const results = [];
  let browser = null;
  let context = null;
  let opened = 0;
  try {
    for (const item of items) {
      const id = newsKey(item);
      if (!isSetNewsUrl(item.url)) {
        results.push(failure(id, `Refused url (not a SET news detail page): ${item.url}`));
        continue;
      }
      if (Date.now() > deadline) {
        results.push({ ...failure(id, 'เกินงบเวลาอ่านหน้าข่าวต่อรอบ'), skipped: true });
        continue;
      }
      if (!browser) {
        browser = await launch();
        context = await browser.newContext({ locale: 'th-TH' });
      }
      if (opened++ > 0) await sleep(config.delayMs);

      let lastError = 'unknown error';
      let done = null;
      for (let attempt = 1; attempt <= config.retries && !done; attempt++) {
        const page = await context.newPage();
        try {
          await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('div.news .title h2', { timeout: 20000 });
          await page.waitForSelector('.card-content .raw-html', { timeout: 20000 });
          done = { id, ok: true, ...extractDetail(await page.content()) };
        } catch (e) {
          lastError = e.message.split('\n')[0];
          // a retry is another page load: never sooner than the pacing delay
          if (attempt < config.retries) await sleep(Math.max(config.delayMs, backoffDelay(attempt, retryBase, e)));
        } finally {
          await page.close();
        }
      }
      results.push(done || failure(id, lastError));
    }
  } finally {
    if (browser) await browser.close();
  }
  return results;
}
