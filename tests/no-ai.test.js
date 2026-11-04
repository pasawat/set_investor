import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noAiClient } from '../src/no-ai.js';
import { summarizeItem } from '../src/summarize.js';

const config = { models: { default: 'm', template: 't' }, maxInputChars: 6000, retries: 3, retryDelayMs: 0 };
const item = { id: '1', symbol: 'ABC', datetime: '', headline: 'หัวข้อ', tag: '', url: 'u', product: 'S' };

test('noAiClient answers with the first lines of the news text and says it is not an AI summary', async () => {
  const detail = { id: '1|ABC', ok: true, text: 'บรรทัดหนึ่ง\nบรรทัดสอง\nบรรทัดสาม\nบรรทัดสี่', attachments: [], attachmentOnly: false };
  const s = await summarizeItem(noAiClient, item, detail, config);
  assert.equal(s.status, 'ok');
  assert.match(s.text, /บรรทัดหนึ่ง/);
  assert.match(s.text, /บรรทัดสาม/);
  assert.doesNotMatch(s.text, /บรรทัดสี่/);
  assert.match(s.text, /ไม่ได้สรุปด้วย AI/);
  assert.deepEqual(s.unverified, []);
});
