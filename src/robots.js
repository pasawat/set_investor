// robots.txt evaluation (RFC 9309 semantics: group by User-agent, longest match wins, Allow wins ties).

const NEWS_PATH = '/th/market/news-and-alert/news';
const ROBOTS_URL = 'https://www.set.or.th/robots.txt';

function parseGroups(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false;
      if (value !== '') current.rules.push({ allow: field === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternToRegExp(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + source + (anchored ? '$' : ''));
}

export function isPathAllowed(robotsText, path, agent = '*') {
  const groups = parseGroups(robotsText);
  const wanted = agent.toLowerCase();
  let matching = groups.filter((g) => g.agents.includes(wanted));
  if (matching.length === 0) matching = groups.filter((g) => g.agents.includes('*'));
  const rules = matching.flatMap((g) => g.rules);
  let best = null;
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    const len = rule.pattern.length;
    if (!best || len > best.len || (len === best.len && rule.allow)) best = { len, allow: rule.allow };
  }
  return best ? best.allow : true;
}

/** Throws unless robots.txt of www.set.or.th permits the news page (spec §9). */
export async function assertNewsPathAllowed(fetchImpl = fetch) {
  const res = await fetchImpl(ROBOTS_URL);
  if (res.status === 404 || res.status === 410) return; // no robots.txt: nothing is disallowed
  if (!res.ok) throw new Error(`Cannot verify robots.txt (HTTP ${res.status}); refusing to continue`);
  const text = await res.text();
  if (!isPathAllowed(text, NEWS_PATH)) {
    throw new Error(`robots.txt now disallows ${NEWS_PATH}; refusing to continue`);
  }
}
