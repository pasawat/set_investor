// TEMPORARY (deleted in Task 12): live check of listing.js on a GitHub runner.
// Reads the news list, prints a summary, and publishes the raw capture as a fixture.
import { loadConfig } from './config.js';
import { assertNewsPathAllowed } from './robots.js';
import { fetchListing } from './listing.js';
import { computeWindow, newsKey } from './news.js';
import { publishToDataBranch } from './publish.js';

const config = loadConfig();
await assertNewsPathAllowed();

const now = new Date();
const window = computeWindow(now, null, config.lookbackDays);
console.log('window:', window.from.toISOString(), '->', window.to.toISOString());

const result = await fetchListing(config, window);
const byProduct = {};
for (const i of result.items) byProduct[i.product] = (byProduct[i.product] || 0) + 1;
const ids = result.items.map(newsKey);

console.log('method:', result.method);
console.log('totalCount shown by page:', result.totalCount, '| unique items collected:', result.items.length, '| complete:', result.complete);
console.log('pagesRead:', result.pagesRead, '| stop:', result.stop);
console.log('pagination labels:', JSON.stringify(result.paginationLabels));
console.log('by product:', JSON.stringify(byProduct));
console.log('duplicate id|symbol keys:', ids.length - new Set(ids).size);
console.log('sample:', JSON.stringify(result.items.slice(0, 3)));

await publishToDataBranch({
  repoDir: process.cwd(),
  files: { 'fixtures/listing.json': JSON.stringify({ capturedAt: now.toISOString(), window, ...result }, null, 2) },
  message: `fixtures: listing capture ${now.toISOString()}`,
});
console.log('published fixtures/listing.json to data branch');
