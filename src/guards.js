// Navigation guard (spec §3.4). Only SET news detail pages may be opened.
// Attachment hosts such as weblink.set.or.th are rejected on purpose: their
// robots.txt disallows automated access, so links to them are kept as text only.

const ALLOWED_HOST = 'www.set.or.th';
const ALLOWED_PATH = '/th/market/news-and-alert/newsdetails';

export function isSetNewsUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && u.hostname === ALLOWED_HOST && u.username === '' && u.pathname === ALLOWED_PATH;
}
