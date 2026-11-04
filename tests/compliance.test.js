// Enforces spec §3: the code must not impersonate browsers/bots, call the site's
// API directly, or fetch attachments from the attachment host.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname;

function sourceFiles(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
  );
}

const FORBIDDEN = [
  'setExtraHTTPHeaders',
  'userAgent:',
  'user-agent',
  '.request.get',
  '.request.post',
  'page.request',
  "waitForEvent('download'",
  'waitForEvent("download"',
  'acceptDownloads',
];

// robots.js legitimately names the robots.txt field "User-agent" (it parses it; it never sets one).
const EXEMPT = { 'robots.js': ['user-agent'] };

test('src/ contains none of the forbidden access patterns', () => {
  const files = sourceFiles();
  assert.ok(files.length > 0, 'expected source files');
  for (const file of files) {
    const text = readFileSync(file, 'utf8').toLowerCase();
    const exempt = EXEMPT[file.split('/').pop()] || [];
    for (const pattern of FORBIDDEN) {
      if (exempt.includes(pattern.toLowerCase())) continue;
      assert.equal(text.includes(pattern.toLowerCase()), false, `${file} contains forbidden "${pattern}"`);
    }
  }
});

test('only guards.js may mention the attachment host (to reject it)', () => {
  for (const file of sourceFiles()) {
    if (file.endsWith('/guards.js')) continue;
    assert.equal(readFileSync(file, 'utf8').includes('weblink.set.or.th'), false, `${file} mentions the attachment host`);
  }
});
