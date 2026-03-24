/**
 * 毎朝 7:00 JST 想定（GitHub Actions cron 連携）: #daily-command に本日の予定＋タスク進捗を送る。
 * GitHub Actions: .github/workflows/weekday-morning-daily-command.yml
 */
require('dotenv').config();
const { buildMorningDailySummaryText } = require('./scripts/lib/morning-daily-summary.js');
const { sendSlackIncomingWebhook } = require('./scripts/lib/slack-incoming-webhook.js');

(async () => {
  try {
    const text = await buildMorningDailySummaryText({ mode: 'scheduled' });
    console.log('\n' + text + '\n');
    await sendSlackIncomingWebhook(text);
  } catch (err) {
    console.error('✗ daily-command-morning:', err);
    process.exit(1);
  }
})();
