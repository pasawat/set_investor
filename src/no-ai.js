// Stand-in for the Claude client used by --no-ai / key-less dry runs: returns an excerpt of the
// news text instead of a summary, so the rest of the pipeline can be exercised without an API key.
const EXCERPT_LINES = 3;

export const noAiClient = {
  messages: {
    create: async ({ messages }) => {
      const match = /<news_text>\n([\s\S]*)\n<\/news_text>/.exec(messages[0].content);
      const excerpt = (match ? match[1] : '').split('\n').filter(Boolean).slice(0, EXCERPT_LINES).join('\n');
      return {
        content: [{ type: 'text', text: `${excerpt}\n(ตัดตอนจากต้นฉบับ ไม่ได้สรุปด้วย AI)` }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
  },
};
