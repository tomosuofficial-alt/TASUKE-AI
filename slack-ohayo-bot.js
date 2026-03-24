/**
 * Slack で「おはよう」と送ると、本日の予定（任意）と案件ステータスを返すボット。
 *
 * 起動: SLACK_BOT_TOKEN / SLACK_APP_TOKEN（Socket Mode）が必要
 *   npm run slack:ohayo
 *
 * Slack API（https://api.slack.com/apps）で:
 * - Socket Mode を ON
 * - Bot Token Scopes: app_mentions:read, chat:write, im:history, im:read
 * - Event Subscriptions: app_mention, message.im（Bot users に追加）
 * - Install to Workspace → Bot User ID をメンションに使用
 *
 * 反応する場所:
 * - ボットへの DM で「おはよう」等
 * - チャンネルで @ボット名 おはよう
 */
require('dotenv').config();
const { App } = require('@slack/bolt');
const { buildMorningDailySummaryText } = require('./scripts/lib/morning-daily-summary.js');

function stripSlackMentions(text) {
  return String(text || '')
    .replace(/<@[^>]+>/g, ' ')
    .replace(/<#[^|>]+\|[^>]+>/g, ' ')
    .trim();
}

function isGreetingMessage(text) {
  const t = stripSlackMentions(text);
  if (!t) return false;
  return /おはよう|お早う|おはよー|good\s*morning|^\s*gm\s*[!.！?？]?\s*$/i.test(t);
}

const botToken = process.env.SLACK_BOT_TOKEN;
const appToken = process.env.SLACK_APP_TOKEN;

if (!botToken || !appToken) {
  console.error('✗ SLACK_BOT_TOKEN と SLACK_APP_TOKEN（Socket Mode 用）を .env に設定してください。');
  process.exit(1);
}

const app = new App({
  token: botToken,
  appToken,
  socketMode: true,
});

app.event('app_mention', async ({ event, say }) => {
  if (!isGreetingMessage(event.text)) return;
  try {
    const text = await buildMorningDailySummaryText({ mode: 'interactive' });
    await say({ text, thread_ts: event.thread_ts });
  } catch (err) {
    console.error(err);
    await say({ text: `取得中にエラー: ${err.message}`, thread_ts: event.thread_ts });
  }
});

app.message(async ({ message, say }) => {
  if (message.subtype || message.bot_id) return;
  const isDm = message.channel_type === 'im' || (message.channel && message.channel.startsWith('D'));
  if (!isDm) return;
  if (!isGreetingMessage(message.text)) return;
  try {
    const text = await buildMorningDailySummaryText({ mode: 'interactive' });
    await say(text);
  } catch (err) {
    console.error(err);
    await say(`取得中にエラー: ${err.message}`);
  }
});

(async () => {
  await app.start();
  console.log('⚡ おはようボット起動（Socket Mode）。DM または @メンションで「おはよう」と送ってください。');
})();
