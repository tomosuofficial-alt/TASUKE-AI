require('dotenv').config();
const { Client } = require('@notionhq/client');
const RSSParser = require('rss-parser');
const https = require('https');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const rss = new RSSParser();
const { fetchCaseClientStatuses, fetchUpcomingDeadlines, BRIEF_CLIENT_ORDER: CLIENTS } = require('./scripts/lib/notion-case-client-status.js');

const DAILY_LOG_DB = 'b16ea51c-cd90-470f-8072-6eb4a6536da3';
const RSS_FEEDS = [
  'https://www.ssnp.co.jp/feed/',
  'https://gigazine.net/news/rss_2.0/',
  'https://techcrunch.com/category/artificial-intelligence/feed/',
];

const AI_MESSAGES = [
  '今日も一歩、月500万円に近づく日にしよう。',
  'クライアントの成功がTASUKE.AIの成功。丁寧に向き合おう。',
  '小さな自動化の積み重ねが、大きな差になる。',
  '迷ったら動く。完璧より完了を優先しよう。',
  '今日の意思決定が、2029年の年商1億円につながっている。',
];

/** 東京の暦での YYYY-MM-DD（cron が UTC のマシンでもずれない） */
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

function ymdToSlash(ymd) {
  return ymd.replace(/-/g, '/');
}

function dateSlashWithWeekdayTokyo(d = new Date()) {
  const slash = ymdToSlash(dateKeyTokyo(d));
  const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
  return `${slash}（${wd}）`;
}

// ─── スマレジ アクセストークン取得 ───────────────────────────
async function getSmaregiToken() {
  const clientId = process.env.SMAREGI_CLIENT_ID;
  const clientSecret = process.env.SMAREGI_CLIENT_SECRET;
  const contractId = process.env.SMAREGI_CONTRACT_ID;
  if (!clientId || !clientSecret || !contractId) return null;

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
          resolve(json.access_token || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ─── スマレジ 前日売上取得 ────────────────────────────────────
async function fetchSmaregiSales() {
  const token = await getSmaregiToken();
  if (!token) return null;

  const contractId = process.env.SMAREGI_CONTRACT_ID;
  // 朝実行想定: 東京の「昨日」の締め
  const sumDate = yesterdayKeyTokyo();

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
          const items = Array.isArray(JSON.parse(data)) ? JSON.parse(data) : [];
          if (items.length === 0) { resolve(null); return; }
          const totals = items.reduce((acc, item) => ({
            salesTotal: acc.salesTotal + parseInt(item.salesTotal || 0),
            transactionCount: acc.transactionCount + parseInt(item.transactionCount || 0),
          }), { salesTotal: 0, transactionCount: 0 });
          resolve({
            salesTotal: totals.salesTotal,
            transactionCount: totals.transactionCount,
            unitPrice: totals.transactionCount > 0 ? Math.round(totals.salesTotal / totals.transactionCount) : 0,
          });
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function formatSales(data) {
  if (!data) return '  ⚠ データなし（未締め・API未設定など）';
  const lines = [`  • 売上合計 … ¥${data.salesTotal.toLocaleString('ja-JP')}`];
  if (data.transactionCount > 0) {
    lines.push(`  • 客数 … ${data.transactionCount}人`);
    lines.push(`  • 客単価 … ¥${data.unitPrice.toLocaleString('ja-JP')}`);
  } else {
    lines.push('  • 客数 … 0（または未計上）');
  }
  return lines.join('\n');
}

async function fetchClientStatuses() {
  return fetchCaseClientStatuses(notion);
}

const RSS_LABELS = {
  'https://www.ssnp.co.jp/feed/': '食品産業新聞',
  'https://gigazine.net/news/rss_2.0/': 'Gigazine',
  'https://techcrunch.com/category/artificial-intelligence/feed/': 'TechCrunch AI',
};

async function fetchTrends() {
  const items = [];
  for (const url of RSS_FEEDS) {
    try {
      const feed = await rss.parseURL(url);
      if (feed.items.length > 0) {
        const label = RSS_LABELS[url] || '';
        items.push(`[${label}] ${feed.items[0].title}`);
      }
    } catch {
      // RSSが取得できない場合はスキップ
    }
  }
  return items.length > 0 ? items : ['トレンド情報を取得できませんでした'];
}

function getAIMessage() {
  const index = new Date().getDay() % AI_MESSAGES.length;
  return AI_MESSAGES[index];
}

async function generateBrief() {
  const today = new Date();
  const dateStr = ymdToSlash(dateKeyTokyo(today));
  const dateHuman = dateSlashWithWeekdayTokyo(today);

  console.log(`[${dateStr}] 朝次ブリーフ生成開始...`);

  const [statuses, trends, smaregiData, deadlines] = await Promise.all([
    fetchClientStatuses(),
    fetchTrends(),
    fetchSmaregiSales(),
    fetchUpcomingDeadlines(notion),
  ]);

  const clientLines = CLIENTS.map((name) => `  • ${name} … ${statuses[name]}`).join('\n');
  const deadlineLines = deadlines.length > 0
    ? '\n\n⚠️ 期限が近い案件:\n' + deadlines.map((d) => {
      const prefix = d.isPast ? '🔴 期限超過' : '⚠️ 期限';
      return `  ${prefix} ${d.deadline}: ${d.client} — ${d.action}`;
    }).join('\n')
    : '';
  const trendLines = trends.map((t) => `  • ${t}`).join('\n');
  const aiMessage = getAIMessage();

  const yesterdayStr = ymdToSlash(yesterdayKeyTokyo(today));

  const slackText = `③ ニュース｜${dateHuman}
${trendLines}
💬 ${aiMessage}`;

  // Notion デイリーログには、その日のスナップショット全文を残す
  const notionArchiveText = `【朝のアーカイブ・全文】${dateHuman}
（Slackでは ①予定・案件 ②売上 のあとに ③として送っている内容＋参照用の複製）

────────────
【クライアント案件のステータス】Notion案件管理
${clientLines}${deadlineLines}

────────────
【昨日の店舗売上】よいどころ千福・スマレジ（集計日 ${yesterdayStr}）
${formatSales(smaregiData)}

────────────
【ニュースピック】
${trendLines}

────────────
【今日のひとこと】
  ${aiMessage}`;

  console.log('\n' + slackText + '\n');

  await Promise.all([
    saveToNotion(notionArchiveText, dateStr, today),
    sendToSlack(slackText),
  ]);

  console.log('完了！');
}

async function saveToNotion(briefText, dateStr, date) {
  try {
    await notion.pages.create({
      parent: { database_id: DAILY_LOG_DB },
      properties: {
        title: {
          title: [{ text: { content: `朝次ブリーフ ${dateStr}` } }],
        },
        '日付': {
          date: { start: dateKeyTokyo(date) },
        },
      },
      children: [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: briefText } }],
          },
        },
      ],
    });
    console.log('✓ Notionに保存しました');
  } catch (err) {
    console.error('✗ Notion保存エラー:', err.message);
  }
}

async function sendToSlack(text) {
  const rawUrl = process.env.SLACK_DAILY_COMMAND_WEBHOOK_URL;
  if (!rawUrl) {
    console.error('✗ SLACK_DAILY_COMMAND_WEBHOOK_URL が未設定のため Slack に送れません');
    return;
  }
  let webhookUrl;
  try {
    webhookUrl = new URL(rawUrl);
  } catch (err) {
    console.error('✗ Slack Webhook URL が不正です:', err.message);
    return;
  }
  return new Promise((resolve) => {
    const body = JSON.stringify({ text });

    const req = https.request({
      hostname: webhookUrl.hostname,
      path: webhookUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      if (res.statusCode === 200) {
        console.log('✓ Slackに送信しました');
      } else {
        console.error('✗ Slack送信エラー:', res.statusCode);
      }
      resolve();
    });

    req.on('error', (err) => {
      console.error('✗ Slack送信エラー:', err.message);
      resolve();
    });

    req.write(body);
    req.end();
  });
}

generateBrief();
