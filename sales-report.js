// ============================================================
// TASUKE.AI — 売上レポート（よいどころ千福・スマレジ専用版）
// ============================================================
// 運用メモ（千福）: 営業 18:00〜翌4:00。前日の日次が揃って見えるのは翌朝7時頃が目安。
//   定時ジョブは東京の「昨日」を sum_date に取り、毎回 Notion クライアント売上DB に upsert 相当（同日はスキップ）。
//   依頼がなくても npm run sales のたびに保存処理が走る（NOTION_TOKEN 必須）。
// 変更履歴:
//   2026-03-20  Notion クライアント売上DB への保存を復活（KPI DB には書かない）
//   2026-03-16  安全版に改修
//     - [無効化] Notion KPI売上DB への保存 → 店舗売上の保存先ではないため停止
//     - [無効化] @notionhq/client の読み込み → 今回不要のため削除（後日クライアントDB用に復活）
//     - [変更]   レポート対象を「よいどころ千福」のみに限定
//     - [追加]   トップレベル try-catch でプロセス落ち防止
// ============================================================

require('dotenv').config();
const https = require('https');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CLIENT_SALES_DB = '3249fe8c-3a7f-8151-a97a-c40827a55732';
const CHINPU_CLIENT_NAME = 'よいどころ千福';

/** 東京の暦 YYYY-MM-DD（UTC サーバーでもずれない） */
function dateKeyTokyo(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function addCalendarDaysYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function yesterdayKeyTokyo(d = new Date()) {
  return addCalendarDaysYmd(dateKeyTokyo(d), -1);
}

/** 既定は「東京の昨日」（翌朝7時ジョブ＝前営業日の締めに合わせやすい）。当日だけ見るなら SMAREGI_SUM_DATE=today */
function sumDateForReport() {
  const mode = (process.env.SMAREGI_SUM_DATE || 'yesterday').toLowerCase();
  return mode === 'today' ? dateKeyTokyo() : yesterdayKeyTokyo();
}

/** スマレジが朝時点で未締めのことが多い → 空なら待って再取得（環境変数で調整） */
function emptyRetryConfig() {
  const retries = Math.max(0, parseInt(process.env.SMAREGI_EMPTY_RETRIES ?? '2', 10));
  const delayMs = Math.max(0, parseInt(process.env.SMAREGI_EMPTY_RETRY_MS ?? '45000', 10));
  return { retries, delayMs };
}

function weekdayForDateStr(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, 3, 0, 0); // その日の 12:00 JST
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    weekday: 'narrow',
  }).format(new Date(utcMs));
}

async function clientSalesExists(client, dateStr) {
  const res = await notion.databases.query({
    database_id: CLIENT_SALES_DB,
    filter: {
      and: [
        { property: 'クライアント', select: { equals: client } },
        { property: '日付', title: { contains: dateStr } },
      ],
    },
  });
  return res.results.length > 0;
}

/** @returns {{ status: 'created'|'exists'|'no_token'|'no_data'|'error', detail?: string }} */
async function saveClientSalesToNotion(sumDate, data) {
  if (!process.env.NOTION_TOKEN) {
    console.warn('⚠ NOTION_TOKEN 未設定のためクライアント売上DBには保存しません（ローカルは .env／GitHub Actions は Secrets を確認）');
    return { status: 'no_token' };
  }
  if (!data) return { status: 'no_data' };

  try {
    if (await clientSalesExists(CHINPU_CLIENT_NAME, sumDate)) {
      console.log(`✓ Notion: ${sumDate} は既に登録済みのためスキップ`);
      return { status: 'exists' };
    }
    await notion.pages.create({
      parent: { database_id: CLIENT_SALES_DB },
      properties: {
        '日付': { title: [{ text: { content: sumDate } }] },
        'クライアント': { select: { name: CHINPU_CLIENT_NAME } },
        '売上': { number: data.salesTotal },
        '客数': { number: data.transactionCount },
        '客単価': { number: data.unitPrice },
        '曜日': { select: { name: weekdayForDateStr(sumDate) } },
      },
    });
    console.log(`✓ Notion クライアント売上DBに保存: ${sumDate}`);
    return { status: 'created' };
  } catch (e) {
    const detail = e.body ? JSON.stringify(e.body) : (e.code ? String(e.code) : '');
    console.error('✗ Notion クライアント売上DB 保存エラー:', e.message);
    if (detail) console.error('  詳細:', detail);
    return { status: 'error', detail };
  }
}

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

// ─── スマレジ 日次売上取得（1回。空配列は null） ─────────────
function fetchSmaregiSalesOnce(sumDate, token) {
  const contractId = process.env.SMAREGI_CONTRACT_ID;

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
          if (items.length === 0) {
            console.warn(`⚠ スマレジ: sum_date=${sumDate} の締めデータなし（未集計の可能性）`);
            resolve(null);
            return;
          }

          const totals = items.reduce((acc, item) => ({
            salesTotal: acc.salesTotal + parseInt(item.salesTotal || 0),
            transactionCount: acc.transactionCount + parseInt(item.transactionCount || 0),
          }), { salesTotal: 0, transactionCount: 0 });

          resolve({
            sumDate,
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

// ─── スマレジ 日次売上（空のときリトライ） ───────────────────
async function fetchSmaregiSales(sumDate) {
  const token = await getSmaregiToken();
  if (!token) return null;

  const { retries, delayMs } = emptyRetryConfig();
  let row = await fetchSmaregiSalesOnce(sumDate, token);
  for (let attempt = 1; attempt <= retries && row === null; attempt++) {
    console.log(`  sum_date=${sumDate} … ${delayMs}ms 待って再試行 (${attempt}/${retries})`);
    await new Promise((r) => setTimeout(r, delayMs));
    const t2 = await getSmaregiToken();
    if (!t2) return null;
    row = await fetchSmaregiSalesOnce(sumDate, t2);
  }
  return row;
}

// ─── フォーマット ─────────────────────────────────────────────
function formatSales(data) {
  if (!data) {
    return [
      '  ⚠ スマレジからまだ数字が取れません（未締め・休業・API未設定の可能性）。',
      '  昼以降の再取得ジョブで Notion だけ埋まることがあります。',
    ].join('\n');
  }
  const sales = data.salesTotal.toLocaleString('ja-JP');
  const lines = [`  • 売上合計 … ¥${sales}`];
  if (data.transactionCount > 0) {
    const unit = data.unitPrice.toLocaleString('ja-JP');
    lines.push(`  • 客数 … ${data.transactionCount}人`, `  • 客単価 … ¥${unit}`);
  } else {
    lines.push('  • 客数 … 0（または未計上）');
  }
  return lines.join('\n');
}

// ─── メイン ───────────────────────────────────────────────────
async function generateSalesReport() {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const timeStr = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

  console.log(`[${dateStr} ${timeStr}] 売上レポート生成開始...`);

  const sumDate = sumDateForReport();
  console.log(`  スマレジ sum_date=${sumDate} (SMAREGI_SUM_DATE=${process.env.SMAREGI_SUM_DATE || 'yesterday 既定'})`);

  // よいどころ千福（スマレジ）のみ取得（sumDate は API 照会日＝Notion の日付キー）
  const smaregiRow = await fetchSmaregiSales(sumDate);
  const smaregiData = smaregiRow
    ? {
        salesTotal: smaregiRow.salesTotal,
        transactionCount: smaregiRow.transactionCount,
        unitPrice: smaregiRow.unitPrice,
      }
    : null;

  const notionSave = await saveClientSalesToNotion(smaregiRow?.sumDate, smaregiData);
  if (smaregiData && notionSave.status === 'error') {
    console.warn('⚠ 売上データは取れていますが Notion への保存に失敗しました。DBのプロパティ名・「よいどころ千福」選択肢・曜日の選択肢を確認してください。');
  }
  if (smaregiData && notionSave.status === 'no_token') {
    console.warn('⚠ 売上データは取れていますが NOTION_TOKEN が無いため Notion には書き込めません。');
  }

  const sumDateSlash = sumDate.replace(/-/g, '/');
  const notionLine = notionSave.status === 'created'
    ? 'Notion … 今回の sum_date を新規保存しました。'
    : notionSave.status === 'exists'
      ? 'Notion … 同日は既に登録済みのためスキップ。'
      : notionSave.status === 'no_token'
        ? 'Notion … 未設定（NOTION_TOKEN）のため未保存。'
        : notionSave.status === 'error'
          ? 'Notion … 保存エラー（ログ参照）。'
          : smaregiData
            ? 'Notion … データなしのため未保存。'
            : 'Notion … スマレジ未取得のため未保存。';

  const reportText = `② 千福売上｜${sumDateSlash}
${formatSales(smaregiData)}
${notionLine}`;

  console.log('\n' + reportText + '\n');

  await sendToSlack(process.env.SLACK_DAILY_COMMAND_WEBHOOK_URL, reportText);

  console.log('完了！');
}

/** Notion に無い日だけスマレジから埋める（Slack は送らない） */
async function backfillMissingDays(dayCount) {
  const end = yesterdayKeyTokyo();
  console.log(`\n=== 欠損バックフィル（よいどころ千福）最大${dayCount}日・基準日 ${end} ===\n`);

  for (let i = 0; i < dayCount; i++) {
    const sumDate = addCalendarDaysYmd(end, -i);
    if (await clientSalesExists(CHINPU_CLIENT_NAME, sumDate)) {
      console.log(`  スキップ（登録済） ${sumDate}`);
      continue;
    }
    const row = await fetchSmaregiSales(sumDate);
    if (!row) {
      console.warn(`  スキップ（APIにデータなし） ${sumDate}`);
      continue;
    }
    const data = {
      salesTotal: row.salesTotal,
      transactionCount: row.transactionCount,
      unitPrice: row.unitPrice,
    };
    const saveRes = await saveClientSalesToNotion(row.sumDate, data);
    if (saveRes.status === 'error') break;
    await new Promise((x) => setTimeout(x, 400));
  }
  console.log('\n=== バックフィル終了 ===\n');
}

// ─── トップレベル安全実行 ─────────────────────────────────────
const argv = process.argv.slice(2);
if (argv[0] === '--backfill') {
  const raw = argv[1];
  const n = Math.min(366, Math.max(1, parseInt(raw || '14', 10) || 14));
  backfillMissingDays(n).catch((err) => {
    console.error('致命的エラー:', err.message);
    process.exit(1);
  });
} else {
  generateSalesReport().catch((err) => {
    console.error('致命的エラー:', err.message);
    process.exit(1);
  });
}
