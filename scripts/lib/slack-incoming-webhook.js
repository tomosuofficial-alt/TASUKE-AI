const https = require('https');

/**
 * Slack Incoming Webhook に JSON { text } を POST する。
 */
function sendSlackIncomingWebhook(text, rawUrl = process.env.SLACK_DAILY_COMMAND_WEBHOOK_URL) {
  if (!rawUrl) {
    console.error('✗ SLACK_DAILY_COMMAND_WEBHOOK_URL が未設定のため Slack に送れません');
    return Promise.resolve();
  }
  let webhookUrl;
  try {
    webhookUrl = new URL(rawUrl);
  } catch (err) {
    console.error('✗ Slack Webhook URL が不正です:', err.message);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const body = JSON.stringify({ text });
    const req = https.request(
      {
        hostname: webhookUrl.hostname,
        path: webhookUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        if (res.statusCode === 200) console.log('✓ Slack に送信しました');
        else console.error('✗ Slack 送信エラー:', res.statusCode);
        resolve();
      },
    );
    req.on('error', (err) => {
      console.error('✗ Slack 送信エラー:', err.message);
      resolve();
    });
    req.write(body);
    req.end();
  });
}

module.exports = { sendSlackIncomingWebhook };
