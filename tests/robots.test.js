import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPathAllowed, assertNewsPathAllowed } from '../src/robots.js';
import { isSetNewsUrl } from '../src/guards.js';

// robots.txt of www.set.or.th as observed on 2026-11-04
const SET_ROBOTS = `User-agent: *
Allow:  /
Disallow: /*/preview/
Disallow: /preview/
Disallow: /config/
Disallow: /data/
Disallow: /dat/
Disallow: /_partial/
Disallow: /commons/
Disallow: /set/
`;

// robots.txt of weblink.set.or.th (attachment host) as observed on 2026-11-04
const WEBLINK_ROBOTS = `User-agent: OpenAI
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: GPTBot
Allow: /dat/news/
Allow: /dat/report/
Allow: /dat/security/
Disallow: /

User-agent: *
Disallow: /
`;

test('news pages are allowed on www.set.or.th, but /dat/ and /set/ are not', () => {
  assert.equal(isPathAllowed(SET_ROBOTS, '/th/market/news-and-alert/news'), true);
  assert.equal(isPathAllowed(SET_ROBOTS, '/th/market/news-and-alert/newsdetails'), true);
  assert.equal(isPathAllowed(SET_ROBOTS, '/dat/x'), false);
  assert.equal(isPathAllowed(SET_ROBOTS, '/set/anything'), false);
  assert.equal(isPathAllowed(SET_ROBOTS, '/th/preview/abc'), false); // wildcard rule /*/preview/
});

test('weblink robots disallows generic agents everywhere, including /dat/news/', () => {
  assert.equal(isPathAllowed(WEBLINK_ROBOTS, '/dat/news/a.pdf'), false);
  assert.equal(isPathAllowed(WEBLINK_ROBOTS, '/dat/news/a.pdf', '*'), false);
  assert.equal(isPathAllowed(WEBLINK_ROBOTS, '/'), false);
});

test('a named agent group applies only to that agent (not to us)', () => {
  assert.equal(isPathAllowed(WEBLINK_ROBOTS, '/dat/news/a.pdf', 'GPTBot'), true);
  assert.equal(isPathAllowed(WEBLINK_ROBOTS, '/dat/news/a.pdf', 'SomeOtherBot'), false);
});

test('empty Disallow allows everything; no rules means allowed; longest match wins', () => {
  assert.equal(isPathAllowed('User-agent: *\nDisallow:\n', '/x'), true);
  assert.equal(isPathAllowed('', '/x'), true);
  assert.equal(isPathAllowed('User-agent: *\nDisallow: /a/\nAllow: /a/b/\n', '/a/b/c'), true);
  assert.equal(isPathAllowed('User-agent: *\nDisallow: /a/\nAllow: /a/b/\n', '/a/x'), false);
});

const fakeFetch = (status, body = '') => async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });

test('assertNewsPathAllowed resolves when allowed or robots is 404', async () => {
  await assertNewsPathAllowed(fakeFetch(200, SET_ROBOTS));
  await assertNewsPathAllowed(fakeFetch(404));
});

test('assertNewsPathAllowed throws when the news path is disallowed', async () => {
  const body = 'User-agent: *\nDisallow: /th/market/\n';
  await assert.rejects(() => assertNewsPathAllowed(fakeFetch(200, body)), /robots/i);
});

test('assertNewsPathAllowed throws when robots.txt cannot be verified (5xx)', async () => {
  await assert.rejects(() => assertNewsPathAllowed(fakeFetch(503)), /robots/i);
});

test('isSetNewsUrl accepts only SET news detail pages over https', () => {
  const ok = 'https://www.set.or.th/th/market/news-and-alert/newsdetails?id=1&symbol=SPG';
  assert.equal(isSetNewsUrl(ok), true);
  for (const bad of [
    'https://weblink.set.or.th/dat/news/202611/a.pdf',
    'https://www.facebook.com/sharer.php?u=https://www.set.or.th/th/market/news-and-alert/newsdetails?id=1',
    'https://www.set.or.th/dat/eod/listedcompany/static/listedCompanies_th_TH.xls',
    'http://www.set.or.th/th/market/news-and-alert/newsdetails?id=1',
    'https://www.set.or.th.evil.com/th/market/news-and-alert/newsdetails?id=1',
    'https://www.set.or.th@evil.com/th/market/news-and-alert/newsdetails?id=1',
    'not a url',
    '',
  ]) {
    assert.equal(isSetNewsUrl(bad), false, bad);
  }
});
