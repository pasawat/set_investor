// Reads the SET news list like an ordinary visitor: open the page in a real
// browser, press the same buttons a person would, and record the news-list
// responses that the page itself loads. No direct API calls, no custom headers.
//
// Date range strategy (record which one worked after the first live run):
//   1. open the news URL with query params the page itself generates
//      (?source=company&securityType=S,L,X&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD)
//   2. fallback: press ETF / DR / a date preset / "ค้นหา" on the default page
import { chromium } from 'playwright';
import { parseNewsResponse, uniqueItems } from './news.js';
import { sleep } from './retry.js';

const LIST_API = '/api/cms/v1/news/set';
const DAY_MS = 24 * 3600 * 1000;
const BKK_MS = 7 * 3600 * 1000;

async function retry(fn, times, delayMs) {
  let last;
  for (let i = 0; i < times; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (i < times - 1) await sleep(delayMs * 2 ** i);
    }
  }
  throw last;
}

const bkk = (d) => new Date(d.getTime() + BKK_MS);
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${bkk(d).getUTCFullYear()}-${pad(bkk(d).getUTCMonth() + 1)}-${pad(bkk(d).getUTCDate())}`;
export const dmy = (d) => `${pad(bkk(d).getUTCDate())}/${pad(bkk(d).getUTCMonth() + 1)}/${bkk(d).getUTCFullYear()}`;

function typesMatch(url, types) {
  const raw = new URL(url).searchParams.get('securityTypeIds');
  if (!raw) return false;
  const got = raw.split(',').sort().join(',');
  return got === [...types].sort().join(',');
}

function rangeMatches(url, window) {
  const p = new URL(url).searchParams;
  return p.get('fromDate') === dmy(window.from) && p.get('toDate') === dmy(window.to);
}

// Pick the smallest preset button that covers the window (fallback strategy only).
function presetFor(window) {
  const days = Math.ceil((window.to.getTime() - window.from.getTime()) / DAY_MS);
  if (ymd(window.from) === ymd(window.to)) return 'ข่าววันนี้';
  return days <= 4 ? '5D' : '1M';
}

async function acceptCookies(page) {
  try {
    const ok = page.getByRole('button', { name: 'ยอมรับ', exact: true });
    if (await ok.isVisible({ timeout: 3000 })) await ok.click();
  } catch {
    // banner not shown
  }
}

async function readListing(browser, config, window) {
  const context = await browser.newContext({ locale: 'th-TH' });
  const page = await context.newPage();
  const responses = [];
  page.on('response', async (res) => {
    if (!res.url().includes(LIST_API)) return;
    try {
      responses.push({ url: res.url(), json: await res.json() });
    } catch {
      // body not JSON: ignore
    }
  });

  const waitFor = async (predicate, since, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = responses.slice(since).find(predicate);
      if (hit) return hit;
      await sleep(250);
    }
    return null;
  };
  const press = (name) => retry(() => page.getByRole('button', { name, exact: true }).first().click({ timeout: 8000 }), config.retries, Math.max(config.delayMs, 1500));

  // ---- 1. URL query strategy
  const target = `${config.site.newsUrl}?source=company&securityType=${config.securityTypes.join(',')}&fromDate=${ymd(window.from)}&toDate=${ymd(window.to)}`;
  if (!target.startsWith(config.site.newsUrl)) throw new Error('Refusing to open a URL outside the news page');
  let since = responses.length;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await acceptCookies(page);
  let method = 'url-query';
  let hit = await waitFor((r) => typesMatch(r.url, config.securityTypes) && rangeMatches(r.url, window), since, 20000);

  // ---- 2. UI fallback
  if (!hit) {
    method = 'ui-preset';
    since = responses.length;
    await page.goto(config.site.newsUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await acceptCookies(page);
    await waitFor(() => true, since, 20000);
    await sleep(config.delayMs);
    for (const label of ['ETF', 'DR', presetFor(window)]) {
      await press(label);
      await sleep(config.delayMs);
    }
    since = responses.length;
    await press('ค้นหา');
    hit = await waitFor((r) => typesMatch(r.url, config.securityTypes) && r.json && r.json.paginateNews, since, 20000);
  }
  if (!hit) throw new Error('News list did not load with the expected filters (S,L,X)');

  // ---- 3. paginate with the page's own "next" control
  const collected = [];
  const take = (json) => collected.push(...parseNewsResponse(json));
  take(hit.json);
  const totalCount = (hit.json.paginateNews && hit.json.paginateNews.totalCount) || uniqueItems(collected).length;

  let pagesRead = 1;
  let stop = 'complete';
  for (let n = 1; n < 100 && uniqueItems(collected).length < totalCount; n++) {
    const next = page.locator('[aria-label="Go to next page"]').first();
    if ((await next.count()) === 0) {
      stop = 'no-next-control';
      break;
    }
    if ((await next.getAttribute('aria-disabled')) === 'true') {
      stop = 'next-disabled';
      break;
    }
    await sleep(config.delayMs);
    const before = responses.length;
    try {
      await retry(() => next.click({ timeout: 8000 }), config.retries, 1500);
    } catch (e) {
      stop = `click-failed: ${e.message.split('\n')[0]}`;
      break;
    }
    const r = await waitFor((x) => x.json && x.json.paginateNews, before, 20000);
    if (!r) {
      stop = 'no-response-after-click';
      break;
    }
    take(r.json);
    pagesRead++;
  }
  const paginationLabels = await page
    .$$eval('ul.pagination [aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')))
    .catch(() => []);

  const items = uniqueItems(collected);
  return {
    items,
    totalCount,
    complete: items.length >= totalCount,
    method,
    pagesRead,
    stop,
    paginationLabels,
    rawResponses: responses.map((r) => ({ url: r.url, json: r.json })),
  };
}

/** Read every news item in `window` for the configured security types. */
export async function fetchListing(config, window) {
  const browser = await chromium.launch();
  try {
    return await readListing(browser, config, window);
  } finally {
    await browser.close();
  }
}
