// Orchestrator: robots check → listing → details → summaries → report → LINE → state (spec §4, §9).
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import { assertNewsPathAllowed } from './robots.js';
import { fetchListing, ymd } from './listing.js';
import { readDetails } from './detail.js';
import { computeWindow, inWindow, newsKey, uniqueItems } from './news.js';
import { filterNew, markSent, parseState, serializeState } from './state.js';
import { groupItems } from './group.js';
import { summarizeGroup, summarizeItem } from './summarize.js';
import { composeEmpty, composeLine, composeReport } from './compose.js';
import { pushLine, splitMessages } from './line.js';
import { publishToDataBranch } from './publish.js';
import { noAiClient } from './no-ai.js';

const SUMMARY_CONCURRENCY = 4;
const DAY_MS = 24 * 3600 * 1000;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const unreadable = (key, reason) => ({ key, status: 'unreadable', text: reason, unverified: [], usage: { inputTokens: 0, outputTokens: 0 } });

/**
 * One digest run. `deps` carries every side effect so the flow is testable without a network.
 * Returns { sent, itemCount, exitCode }.
 */
export async function run({ config, deps, argv = [] }) {
  const dry = argv.includes('--dry-run');
  const capture = argv.includes('--capture');
  const log = deps.log || (() => {});
  const now = deps.now();
  const date = ymd(now);
  // A dry run must never overwrite the real report that the LINE link points at.
  const reportDir = dry ? 'reports/dry-run' : 'reports';
  const reportUrl = `${config.reportBaseUrl || ''}/${reportDir}/${date}.md`;
  let exitCode = 0;

  const alert = async (text) => {
    log(text);
    if (dry) return;
    try {
      await deps.pushLine([text]);
    } catch (e) {
      log(`alert could not be delivered: ${e.message}`);
    }
  };
  const fail = async (text) => {
    await alert(text);
    return { sent: false, itemCount: 0, exitCode: 1 };
  };

  try {
    await deps.assertNewsPathAllowed();
  } catch (e) {
    return fail(`ระบบหยุดทำงาน: ${e.message}`);
  }

  const state = parseState(await deps.loadStateText());
  const window = computeWindow(now, state.lastSuccessAt ? new Date(state.lastSuccessAt) : null, config.lookbackDays);

  let listing;
  try {
    listing = await deps.fetchListing(config, window);
  } catch (e) {
    return fail(`ดึงรายการข่าวไม่สำเร็จ: ${e.message}`);
  }
  // If SET changes its date format, rows silently fall out of the window: stop instead of reporting "no news".
  const plausible = (i) => ISO_DATETIME.test(i.datetime) && Date.parse(i.datetime) <= now.getTime() + DAY_MS;
  if (listing.items.length > 0 && !listing.items.some(plausible)) {
    return fail('รูปแบบวันที่ของข่าวบนหน้าเว็บเปลี่ยน อ่านวันที่ไม่ได้ จึงหยุดการทำงาน (ต้องแก้ตัวอ่านรายการข่าว)');
  }
  const rows = filterNew(uniqueItems(listing.items).filter((i) => inWindow(i, window)), state);
  log(`listing: ${listing.items.length} rows read (${listing.totalCount} shown by the page), ${rows.length} new in window`);

  // ---- nothing new
  if (rows.length === 0) {
    let sent = false;
    if (config.sendWhenEmpty && !dry) {
      try {
        await deps.pushLine(composeEmpty({ window }));
        sent = true;
      } catch (e) {
        log(`LINE failed: ${e.message}`);
        return { sent: false, itemCount: 0, exitCode: 1 };
      }
    }
    if (!dry) {
      try {
        await deps.publishToDataBranch({ files: { 'state/state.json': serializeState(markSent(state, [], now)) }, message: `state: ${date} (no news)` });
      } catch (e) {
        log(`state not saved: ${e.message}`);
        exitCode = 1;
      }
    }
    return { sent, itemCount: 0, exitCode };
  }

  // ---- group, then decide which pages to read
  const { groups, singles } = groupItems(rows, config);
  const byKey = new Map(rows.map((r) => [newsKey(r), r]));
  const sampleItems = groups.flatMap((g) => g.sampleIds.map((id) => byKey.get(id)).filter(Boolean));
  const room = Math.max(0, config.maxDetailPages - sampleItems.length);
  const readSingles = singles.slice(0, room);
  const overflow = new Set(singles.slice(room).map(newsKey));

  const detailMap = new Map();
  const attempted = [...sampleItems, ...readSingles];
  let detailsThrew = false;
  try {
    for (const d of await deps.readDetails(attempted, config)) detailMap.set(d.id, d);
  } catch (e) {
    detailsThrew = true;
    log(`readDetails failed as a whole: ${e.message}`);
  }
  for (const d of detailMap.values()) if (d.skipped) overflow.add(d.id); // time budget ran out
  // Per-item failures are tolerated; losing every page is a failed run whose state must not advance.
  const detailsFailed = detailsThrew || (attempted.length > 0 && attempted.every((it) => {
    const d = detailMap.get(newsKey(it));
    return !d || (!d.ok && !d.skipped);
  }));
  if (detailsFailed) exitCode = 1;
  const detailOf = (item) =>
    detailMap.get(newsKey(item)) || { id: newsKey(item), ok: false, text: '', attachments: [], attachmentOnly: false, error: 'ไม่มีผลการอ่านหน้าข่าว' };

  // ---- summaries
  const summaries = {};
  const safe = async (key, fn) => {
    try {
      return await fn();
    } catch (e) {
      return unreadable(key, `สรุปไม่สำเร็จ: ${e.message}`);
    }
  };
  const groupResults = await mapLimit(groups, SUMMARY_CONCURRENCY, (g) =>
    safe(g.template, () => deps.summarizeGroup(g, g.sampleIds.map((id) => detailOf(byKey.get(id))))));
  groups.forEach((g, i) => { summaries[g.template] = groupResults[i]; });

  let aiCalls = 0;
  const jobs = [];
  for (const item of readSingles) {
    if (overflow.has(newsKey(item))) continue;
    const d = detailOf(item);
    if (d.ok && !d.attachmentOnly && d.text) {
      if (aiCalls >= config.maxSummaryItems) { overflow.add(newsKey(item)); continue; }
      aiCalls++;
    }
    jobs.push(item);
  }
  const itemResults = await mapLimit(jobs, SUMMARY_CONCURRENCY, (item) => safe(newsKey(item), () => deps.summarizeItem(item, detailOf(item))));
  jobs.forEach((item, i) => { summaries[newsKey(item)] = itemResults[i]; });

  const cost = Object.values(summaries).reduce(
    (a, s) => ({ inputTokens: a.inputTokens + (s.usage?.inputTokens || 0), outputTokens: a.outputTokens + (s.usage?.outputTokens || 0) }),
    { inputTokens: 0, outputTokens: 0 },
  );

  // ---- report
  const input = {
    window, runAt: now, items: rows, groups, singles, summaries,
    details: Object.fromEntries([...detailMap]), overflowIds: [...overflow], cost,
  };
  const report = composeReport(input);
  let reportSaved = true;
  if (!dry || capture) {
    try {
      await deps.publishToDataBranch({
        files: { [`${reportDir}/${date}.md`]: report.markdown, [`${reportDir}/${date}.html`]: report.html },
        message: `report: ${date}`,
      });
    } catch (e) {
      log(`report not saved: ${e.message}`);
      reportSaved = false;
      exitCode = 1;
    }
  }

  // ---- LINE
  const blocks = composeLine(input, reportUrl);
  const warnings = [];
  if (!listing.complete) warnings.push(`⚠ อ่านรายการข่าวได้ไม่ครบ (${listing.items.length} จาก ${listing.totalCount} รายการ)`);
  if (!reportSaved) warnings.push('⚠ บันทึกรายงานเต็มไม่สำเร็จ ลิงก์อาจเปิดไม่ได้');
  if (warnings.length) blocks[0] = `${warnings.join('\n')}\n${blocks[0]}`;
  const messages = splitMessages(blocks, { maxChars: 5000, maxMessages: 5 }, `… ตัดท้าย ดูรายงานเต็ม: ${reportUrl}`);

  if (dry) {
    log(report.markdown);
    log(`--- LINE digest (not sent) ---\n${messages.join('\n=====\n')}`);
    return { sent: false, itemCount: rows.length, exitCode };
  }
  try {
    await deps.pushLine(messages);
  } catch (e) {
    log(`LINE failed: ${e.message}`);
    return { sent: false, itemCount: rows.length, exitCode: 1 };
  }

  // ---- state (only after LINE succeeded, so a failed send is retried next run)
  if (detailsFailed) return { sent: true, itemCount: rows.length, exitCode };
  try {
    const next = markSent(state, rows.map(newsKey), now);
    // An incomplete listing may have missed rows: keep the old window start so the next run re-reads them.
    if (!listing.complete) next.lastSuccessAt = state.lastSuccessAt;
    await deps.publishToDataBranch({ files: { 'state/state.json': serializeState(next) }, message: `state: ${date}` });
  } catch (e) {
    log(`state not saved: ${e.message}`);
    exitCode = 1;
  }
  return { sent: true, itemCount: rows.length, exitCode };
}

// ------------------------------------------------------------------ CLI
function loadStateText() {
  try {
    execFileSync('git', ['fetch', 'origin', '+refs/heads/data:refs/remotes/origin/data'], { stdio: 'ignore' });
    return execFileSync('git', ['show', 'origin/data:state/state.json'], { encoding: 'utf8' });
  } catch {
    return ''; // first run: no data branch or state yet
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const config = loadConfig();
  config.reportBaseUrl = process.env.REPORT_BASE_URL || (process.env.GITHUB_REPOSITORY ? `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/data` : '');

  const useAi = !argv.includes('--no-ai') && Boolean(config.anthropicKey);
  if (!useAi && !dry) throw new Error('ANTHROPIC_API_KEY is required (use --dry-run --no-ai to test without it)');
  if (!dry && (!config.lineToken || !config.lineUserId)) throw new Error('LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID are required');
  if (!useAi) console.log('AI summaries are OFF: report uses excerpts of the original text');

  // maxRetries 0: summarize.js does its own retry, so attempts must not multiply.
  const client = useAi ? new Anthropic({ apiKey: config.anthropicKey, maxRetries: 0 }) : noAiClient;
  const deps = {
    assertNewsPathAllowed,
    fetchListing,
    readDetails,
    summarizeItem: (item, detail) => summarizeItem(client, item, detail, config),
    summarizeGroup: (group, details) => summarizeGroup(client, group, details, config),
    pushLine: (messages) => pushLine({ token: config.lineToken, userId: config.lineUserId, messages }),
    publishToDataBranch: (args) => publishToDataBranch({ repoDir: process.cwd(), ...args }),
    now: () => new Date(),
    loadStateText,
    log: (m) => console.log(m),
  };
  const result = await run({ config, deps, argv });
  console.log(`done: ${JSON.stringify(result)}`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
