// ============================================================
// TASUKE.AI — 案件管理DBの「未請求」候補を集計 → Slack（任意でコンソールのみ）
// ============================================================
//   node unbilled-cases-alert.js              — Slack 送信（SLACK_DAILY_COMMAND_WEBHOOK_URL）
//   node unbilled-cases-alert.js --dry-run  — コンソールのみ
//
// 判定:
//   1) CASE_BILLING_STATUS_PROP が DB にあり、かつ select が CASE_BILLING_UNBILLED_VALUE と一致 → 未請求
//   2) 上記が無い／空のとき: ステータスが CASE_UNBILLED_STATUSES に含まれ、月額 > 0 → 要確認候補
//      （CASE_UNBILLED_HEURISTIC=0 で 2) をオフ）
//
// 詳細: docs/unbilled-cases-alert.md
// ============================================================

require('dotenv').config();
const https = require('https');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CASE_DB = process.env.NOTION_CASE_DB_ID || 'e8434c27-61bf-436b-9bf2-601b5ff4d848';

const BILLING_STATUS_PROP = process.env.CASE_BILLING_STATUS_PROP || '';
const BILLING_UNBILLED_VALUE = process.env.CASE_BILLING_UNBILLED_VALUE || '未請求';
const HEURISTIC_ON = process.env.CASE_UNBILLED_HEURISTIC !== '0';
const HEURISTIC_STATUSES = (process.env.CASE_UNBILLED_STATUSES || '進行中')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function sendToSlack(text) {
  const webhookUrl = process.env.SLACK_DAILY_COMMAND_WEBHOOK_URL;
  return new Promise((resolve) => {
    if (!webhookUrl) {
      console.warn('⚠ SLACK_DAILY_COMMAND_WEBHOOK_URL 未設定のため Slack はスキップ');
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
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        if (res.statusCode === 200) console.log('✓ Slack (#daily-command) 送信完了');
        else console.error('✗ Slack送信エラー:', res.statusCode);
        resolve();
      });
      req.on('error', (err) => { console.error('✗ Slack送信エラー:', err.message); resolve(); });
      req.write(body);
      req.end();
    } catch (err) { console.error('✗ Slack送信エラー:', err.message); resolve(); }
  });
}

function titleOf(props, name) {
  const p = props[name];
  if (!p || p.type !== 'title') return '';
  return (p.title && p.title[0] && p.title[0].plain_text) ? p.title[0].plain_text : '';
}

function selectOf(props, name) {
  const p = props[name];
  if (!p || p.type !== 'select') return null;
  return p.select ? p.select.name : null;
}

function numberOf(props, name) {
  const p = props[name];
  if (!p || p.type !== 'number') return null;
  return p.number;
}

async function queryAllCases() {
  const all = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: CASE_DB,
      start_cursor: cursor,
      page_size: 100,
    });
    all.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return all;
}

function classifyRow(props) {
  if (BILLING_STATUS_PROP && props[BILLING_STATUS_PROP] && props[BILLING_STATUS_PROP].type === 'select') {
    const v = props[BILLING_STATUS_PROP].select?.name;
    if (v === BILLING_UNBILLED_VALUE) {
      return { hit: true, reason: `請求列「${BILLING_STATUS_PROP}」= ${BILLING_UNBILLED_VALUE}` };
    }
    if (v != null && v !== '') {
      return { hit: false, reason: '' };
    }
  }

  if (!HEURISTIC_ON) return { hit: false, reason: '' };

  const st = selectOf(props, 'ステータス');
  const monthly = numberOf(props, '月額');
  if (st && HEURISTIC_STATUSES.includes(st) && monthly != null && monthly > 0) {
    return {
      hit: true,
      reason: `ヒューリスティック（ステータス=${st}・月額>0）`,
    };
  }
  return { hit: false, reason: '' };
}

function formatLine(props) {
  const name = titleOf(props, '案件名');
  const client = selectOf(props, 'クライアント') || '—';
  const st = selectOf(props, 'ステータス') || '—';
  const monthly = numberOf(props, '月額');
  const mStr = monthly != null ? `月額¥${monthly.toLocaleString('ja-JP')}` : '月額未入力';
  return ` ・${name || '（無題）'}（${client}）${mStr}／${st}`;
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  if (!process.env.NOTION_TOKEN) {
    console.error('✗ NOTION_TOKEN が未設定です');
    process.exit(1);
  }

  const pages = await queryAllCases();
  const hits = [];
  for (const page of pages) {
    const { hit, reason } = classifyRow(page.properties);
    if (hit) hits.push({ page, reason });
  }

  const head = `【月末】案件管理 — 未請求・要確認候補（${hits.length}件）`;
  const lines = hits.map(({ page, reason }) => `${formatLine(page.properties)}\n   └ ${reason}`);
  const footer = [
    '',
    HEURISTIC_ON && !BILLING_STATUS_PROP
      ? '💡 確実にしたい場合は Notion に「請求ステータス」などの Select を追加し、CASE_BILLING_STATUS_PROP / CASE_BILLING_UNBILLED_VALUE を設定してください（docs/unbilled-cases-alert.md）。'
      : '',
  ].filter(Boolean).join('\n');

  const text = [head, '', lines.length ? lines.join('\n') : ' （該当なし）', footer].filter(Boolean).join('\n');

  console.log('\n' + text + '\n');

  if (!dry) await sendToSlack(text);
  else console.log('(--dry-run: Slack スキップ)\n');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
