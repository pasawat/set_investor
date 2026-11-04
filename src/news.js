// News item parsing, de-duplication and time-window helpers (pure functions).

const BANGKOK_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok is UTC+7 all year
const DAY_MS = 24 * 3600 * 1000;
const CLOSE_HOUR = 16;
const CLOSE_MINUTE = 30;

const str = (v) => (v === undefined || v === null ? '' : String(v));

function toItem(raw) {
  return {
    id: str(raw.id),
    datetime: str(raw.datetime),
    symbol: str(raw.symbol),
    headline: str(raw.headline),
    tag: str(raw.tag),
    url: str(raw.url),
    product: str(raw.product),
  };
}

/** Extract NewsItem[] from a news API JSON body as loaded by the page itself. */
export function parseNewsResponse(json) {
  if (!json || typeof json !== 'object') return [];
  const grouped = (json.newsGroups || []).flatMap((g) => g.newsInfoList || []);
  const paged = (json.paginateNews && json.paginateNews.newsInfoList) || [];
  return [...grouped, ...paged].map(toItem);
}

/** Drop repeated ids, keeping the first occurrence and original order. */
export function uniqueById(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// Market close (16:30 Bangkok) of the weekday before the Bangkok calendar day of `now`.
function previousTradingClose(now) {
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  let day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  do {
    day -= DAY_MS;
  } while ([0, 6].includes(new Date(day).getUTCDay()));
  return new Date(day + (CLOSE_HOUR * 60 + CLOSE_MINUTE) * 60 * 1000 - BANGKOK_OFFSET_MS);
}

/**
 * Window to read: since the last successful run if known, otherwise since the
 * previous trading day's close; never further back than `lookbackDays`.
 */
export function computeWindow(now, lastSuccess, lookbackDays) {
  const floor = now.getTime() - lookbackDays * DAY_MS;
  const start = lastSuccess ? lastSuccess : previousTradingClose(now);
  return { from: new Date(Math.max(start.getTime(), floor)), to: now };
}

export function inWindow(item, window) {
  const t = Date.parse(item.datetime);
  if (Number.isNaN(t)) return false;
  return t >= window.from.getTime() && t <= window.to.getTime();
}
