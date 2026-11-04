// Runtime configuration. Defaults come from the spec; env vars override.

const NUMERIC = {
  groupMin: ['GROUP_MIN', 5],
  groupSample: ['GROUP_SAMPLE', 3],
  maxDetailPages: ['MAX_DETAIL_PAGES', 150],
  maxSummaryItems: ['MAX_SUMMARY_ITEMS', 200],
  maxInputChars: ['MAX_INPUT_CHARS', 6000],
  retries: ['RETRIES', 3],
  delayMs: ['DELAY_MS', 2500],
  lookbackDays: ['LOOKBACK_DAYS', 5],
};

function num(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

export function loadConfig(env = process.env) {
  const config = { securityTypes: ['S', 'L', 'X'] };
  for (const [key, [name, fallback]] of Object.entries(NUMERIC)) {
    config[key] = num(env, name, fallback);
  }
  if (config.delayMs < 2500) throw new Error('DELAY_MS must be >= 2500 (spec §3.3)');
  config.sendWhenEmpty = env.SEND_WHEN_EMPTY === undefined ? true : env.SEND_WHEN_EMPTY !== 'false';
  config.models = {
    default: env.MODEL_DEFAULT || 'claude-sonnet-5-5',
    template: env.MODEL_TEMPLATE || 'claude-haiku-5-5',
  };
  config.site = {
    baseUrl: 'https://www.set.or.th',
    newsUrl: 'https://www.set.or.th/th/market/news-and-alert/news',
  };
  config.anthropicKey = env.ANTHROPIC_API_KEY;
  config.lineToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  config.lineUserId = env.LINE_USER_ID;
  return config;
}
