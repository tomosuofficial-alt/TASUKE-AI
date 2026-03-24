#!/usr/bin/env node
/**
 * GitHub Actions 朝一括: ①②③ を順に実行する。いずれかが失敗しても後続を実行する。
 * Slack への投稿は各スクリプトのみ（実行サマリは送らない）。
 */
require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

const STEPS = [
  { label: '① 今日の予定・案件', npm: 'morning:daily-command' },
  { label: '② 店舗売上', npm: 'sales' },
  { label: '③ ニュース＆ひとこと', npm: 'brief' },
];

function runNpm(script) {
  const r = spawnSync('npm', ['run', script], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (r.error) {
    console.error(r.error);
    return 1;
  }
  if (r.signal) return 1;
  return r.status ?? 1;
}

const outcomes = [];
for (const step of STEPS) {
  console.log(`\n========== ${step.label} (npm run ${step.npm}) ==========\n`);
  outcomes.push(runNpm(step.npm));
}

const anyFailed = outcomes.some((c) => c !== 0);
process.exit(anyFailed ? 1 : 0);
