require('dotenv').config();
const { Client } = require('@notionhq/client');
const RSSParser = require('rss-parser');
const https = require('https');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const rss = new RSSParser();

const DAILY_LOG_DB = 'b16ea51c-cd90-470f-8072-6eb4a6536da3';
const KPI_DB = '6b9f8d67-dbed-4f65-9069-67bc0925d711';
const CLIENTS = ['よいどころ千福', 'Niki★DINER', 'Bistro Knocks', 'Mz cafe'];
const RSS_FEEDS = [
  'https://www.ssnp.co.jp/feed/',
  'https://ainow.ai/feed/',
  'https://www.businessinsider.jp/feed/index.xml',
];

const AI_MESSAGES = [
  '今日も一歩、月500万円に近づく日にしよう。',
  'クライアントの成功がTASUKE.AIの成功。丁寧に向き合おう。',
  '小さな自動化の積み重ねが、大きな差になる。',
  '迷ったら動く。完璧より完了を優先しよう。',
  '今日の意思決定が、2029年の年商1億円につながっている。',
];

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
  // 朝8時実行のため前日の売上を取得
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const sumDate = yesterday.toISOString().split('T')[0];

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
  if (!data) return '・データなし（未締め）';
  const lines = [`・売上：¥${data.salesTotal.toLocaleString('ja-JP')}`];
  if (data.transactionCount > 0) {
    lines.push(`・客数：${data.transactionCount}人`);
    lines.push(`・客単価：¥${data.unitPrice.toLocaleString('ja-JP')}`);
  }
  return lines.join('\n');
}

async function fetchClientStatuses() {
  try {
    const response = await notion.databases.query({
      database_id: 'e8434c27-61bf-436b-9bf2-601b5ff4d848',
    });

    const statuses = {};
    CLIENTS.forEach(name => { statuses[name] = '情報なし'; });

    response.results.forEach(page => {
      const nameProp = page.properties['名前'] || page.properties['title'] || page.properties['クライアント名'];
      const statusProp = page.properties['ステータス'] || page.properties['Status'];

      if (nameProp && statusProp) {
        const name = nameProp.title?.[0]?.plain_text || '';
        const status = statusProp.select?.name || statusProp.status?.name || '未設定';
        if (CLIENTS.includes(name)) {
          statuses[name] = status;
        }
      }
    });

    return statuses;
  } catch {
    const statuses = {};
    CLIENTS.forEach(name => { statuses[name] = '取得エラー'; });
    return statuses;
  }
}

const RSS_LABELS = {
  'https://www.ssnp.co.jp/feed/': '食品産業新聞',
  'https://ainow.ai/feed/': 'AINOW（AI）',
  'https://www.businessinsider.jp/feed/index.xml': 'Business Insider',
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

function formatDate(date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

async function generateBrief() {
  const today = new Date();
  const dateStr = formatDate(today);

  console.log(`[${dateStr}] 朝次ブリーフ生成開始...`);

  const [statuses, trends, smaregiData] = await Promise.all([
    fetchClientStatuses(),
    fetchTrends(),
    fetchSmaregiSales(),
  ]);

  const clientLines = CLIENTS.map(name => `・${name}：${statuses[name]}`).join('\n');
  const trendLines = trends.map(t => `・${t}`).join('\n');
  const aiMessage = getAIMessage();

  // 前日の日付
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  const briefText = `【TASUKE.AI 朝次ブリーフ】${dateStr}

■ 案件ステータス
${clientLines}

■ 昨日の売上（${yesterdayStr}）
よいどころ千福（スマレジ）
${formatSales(smaregiData)}

■ 注目トレンド
${trendLines}

■ 今日のひとこと
${aiMessage}`;

  console.log('\n' + briefText + '\n');

  await Promise.all([
    saveToNotion(briefText, dateStr, today),
    sendToSlack(briefText),
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
          date: { start: date.toISOString().split('T')[0] },
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
  return new Promise((resolve) => {
    const webhookUrl = new URL(process.env.SLACK_DAILY_COMMAND_WEBHOOK_URL);
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
