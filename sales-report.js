// ============================================================
// TASUKE.AI — 売上レポート（よいどころ千福・スマレジ専用版）
// ============================================================
// 変更履歴:
//   2026-03-16  安全版に改修
//     - [無効化] Niki★DINER（エアレジ）処理 → API未確定のため停止
//     - [無効化] Notion KPI売上DB への保存 → 店舗売上の保存先ではないため停止
//     - [無効化] @notionhq/client の読み込み → 今回不要のため削除
//     - [変更]   レポート対象を「よいどころ千福」のみに限定
//     - [追加]   トップレベル try-catch でプロセス落ち防止
// ============================================================

require('dotenv').config();
const https = require('https');

// --- [無効化] Notion関連 -------------------------------------------
// 今回は Notion 保存を行わないため、@notionhq/client は読み込まない。
// 復活時: const { Client } = require('@notionhq/client');
// 復活時: const notion = new Client({ auth: process.env.NOTION_TOKEN });
// 復活時: const KPI_DB = '6b9f8d67-dbed-4f65-9069-67bc0925d711';
// -------------------------------------------------------------------

// ─── Slack 送信 ───────────────────────────────────────────────
function sendToSlack(webhookUrl, text) {
  return new Promise((resolve) => {
    if (!webhookUrl) {
      console.error('✗ SLACK_DAILY_COMMAND_WEBHOOK_URL が未設定です');
      resolve();
      return;
    }

    try {
      const url = new URL(webhookUrl);
      const body = JSON.stringify({ text });
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        if (res.statusCode === 200) console.log('✓ Slack (#daily-command) 送信完了');
        else console.error('✗ Slack送信エラー:', res.statusCode);
        resolve();
      });
      req.on('error', (err) => { console.error('✗ Slack送信エラー:', err.message); resolve(); });
      req.write(body);
      req.end();
    } catch (err) {
      console.error('✗ Slack送信 予期せぬエラー:', err.message);
      resolve();
    }
  });
}

// ─── スマレジ プラットフォームAPI アクセストークン取得 ────────
async function getSmaregiToken() {
  const clientId = process.env.SMAREGI_CLIENT_ID;
  const clientSecret = process.env.SMAREGI_CLIENT_SECRET;
  const contractId = process.env.SMAREGI_CONTRACT_ID;

  if (!clientId || !clientSecret || !contractId) {
    console.warn('⚠ スマレジAPIキー未設定。スキップします。');
    return null;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = 'grant_type=client_credentials&scope=pos.transactions:read';

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'id.smaregi.jp',
      path: `/app/${contractId}/token`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            console.log('✓ スマレジトークン取得成功');
            resolve(json.access_token);
          } else {
            console.error('✗ スマレジトークンエラー:', data.slice(0, 200));
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', (err) => { console.error('スマレジ接続エラー:', err.message); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── スマレジ 日次売上取得（よいどころ千福） ─────────────────
async function fetchSmaregiSales() {
  const token = await getSmaregiToken();
  if (!token) return null;

  const contractId = process.env.SMAREGI_CONTRACT_ID;
  const today = new Date();
  const sumDate = today.toISOString().split('T')[0];

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.smaregi.jp',
      path: `/${contractId}/pos/daily_summaries?sum_date=${sumDate}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const items = Array.isArray(json) ? json : [];
          if (items.length === 0) { console.warn('⚠ スマレジ: 本日の締めデータなし'); resolve(null); return; }

          const totals = items.reduce((acc, item) => ({
            salesTotal: acc.salesTotal + parseInt(item.salesTotal || 0),
            transactionCount: acc.transactionCount + parseInt(item.transactionCount || 0),
          }), { salesTotal: 0, transactionCount: 0 });

          resolve({
            salesTotal: totals.salesTotal,
            transactionCount: totals.transactionCount,
            unitPrice: totals.transactionCount > 0
              ? Math.round(totals.salesTotal / totals.transactionCount)
              : 0,
          });
        } catch (e) {
          console.error('スマレジ解析エラー:', e.message, data.slice(0, 200));
          resolve(null);
        }
      });
    });
    req.on('error', (err) => { console.error('スマレジ接続エラー:', err.message); resolve(null); });
    req.end();
  });
}

// --- [無効化] エアレジ（Niki★DINER）処理 -------------------------
// エアレジはAPI未確定のため一旦停止。
// 復活時は fetchAirregiSales() を再実装し、メインから呼び出す。
// ------------------------------------------------------------------

// --- [無効化] Notion KPI売上DB 保存処理 ---------------------------
// KPI_DB は個人事業の売上DBであり、店舗売上の保存先ではないため停止。
// 復活時: saveToNotion(clientName, data, dateStr) を再実装する。
// ------------------------------------------------------------------

// ─── フォーマット ─────────────────────────────────────────────
function formatSales(data) {
  if (!data) return '・データ取得できませんでした（未締め or API未設定）';
  const sales = data.salesTotal.toLocaleString('ja-JP');
  const unit = data.unitPrice.toLocaleString('ja-JP');
  const lines = [`・本日売上：¥${sales}`];
  if (data.transactionCount > 0) {
    lines.push(`・客数：${data.transactionCount}人`);
    lines.push(`・客単価：¥${unit}`);
  }
  return lines.join('\n');
}

// ─── メイン ───────────────────────────────────────────────────
async function generateSalesReport() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const timeStr = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

  console.log(`[${dateStr} ${timeStr}] 売上レポート生成開始...`);

  // よいどころ千福（スマレジ）のみ取得
  const smaregiData = await fetchSmaregiSales();

  const reportText = `【売上レポート】${dateStr} ${timeStr}

■ よいどころ千福（スマレジ）
${formatSales(smaregiData)}

※ Niki★DINER（エアレジ）は API未確定のため一時停止中`;

  console.log('\n' + reportText + '\n');

  // Slack通知のみ（Notion保存は無効化中）
  await sendToSlack(process.env.SLACK_DAILY_COMMAND_WEBHOOK_URL, reportText);

  console.log('完了！');
}

// ─── トップレベル安全実行 ─────────────────────────────────────
generateSalesReport().catch((err) => {
  console.error('致命的エラー:', err.message);
  process.exit(1);
});
