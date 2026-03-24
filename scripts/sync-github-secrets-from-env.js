#!/usr/bin/env node
/**
 * ローカル .env の値を GitHub Actions の Repository secrets に同期する（値は標準出力に出さない）。
 * 用法: リポジトリに remote があり gh がログイン済みの状態で
 *   node scripts/sync-github-secrets-from-env.js
 */
require('dotenv').config();
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const KEYS = [
  'NOTION_TOKEN',
  'SLACK_DAILY_COMMAND_WEBHOOK_URL',
  'SMAREGI_CLIENT_ID',
  'SMAREGI_CLIENT_SECRET',
  'SMAREGI_CONTRACT_ID',
  'NOTION_SCHEDULE_DB_ID',
  'NOTION_SCHEDULE_DATE_PROP',
  'NOTION_SCHEDULE_TITLE_PROP',
  'NOTION_LINE_INBOX_DB_ID',
  'NOTION_LINE_INBOX_DATE_PROP',
  'NOTION_LINE_INBOX_SUMMARY_PROP',
  'NOTION_LINE_INBOX_PARTNER_PROP',
  'NOTION_LINE_INBOX_DONE_PROP',
  'NOTION_LINE_INBOX_WINDOW_DAYS',
  'FREEE_CLIENT_ID',
  'FREEE_CLIENT_SECRET',
  'FREEE_COMPANY_ID',
];

function setSecret(name, value) {
  const r = spawnSync('gh', ['secret', 'set', name], {
    input: value,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(`✗ ${name}:`, r.stderr?.trim() || 'gh secret set 失敗');
    return;
  }
  console.log(`✓ ${name}`);
}

console.log('GitHub Secrets 同期（.env → gh secret set）…\n');
for (const k of KEYS) {
  const value = process.env[k];
  if (value === undefined || value === '') {
    console.log(`— スキップ（未設定）: ${k}`);
    continue;
  }
  setSecret(k, value);
}

const tokenPath = path.join(__dirname, '..', '.freee-token.json');
if (fs.existsSync(tokenPath)) {
  const raw = fs.readFileSync(tokenPath, 'utf8');
  setSecret('FREEE_TOKEN_JSON', raw);
} else {
  console.log('— スキップ: FREEE_TOKEN_JSON（.freee-token.json なし）');
}

console.log('\n完了。GitHub → Settings → Secrets で不足がないか確認してください。');
