/**
 * line-imports/ に置いた LINE 書き出し .txt をまとめて処理する（運用はこれ1本）。
 *
 *   npm run line:ingest
 *   npm run line:ingest -- --force   … 内容が同じでも再実行（再取り込み）
 *
 * 各ファイルごとに task-siphon（Gemini 吸い出し → Notion 転記）を順に実行。
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const DIR = path.join(ROOT, 'line-imports');
const TASK = path.join(ROOT, 'task-siphon.js');
const STATE_FILE = path.join(DIR, '.ingest-state.json');

function listTxtFiles() {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((name) => {
      if (!name.toLowerCase().endsWith('.txt')) return false;
      if (name.toLowerCase() === 'readme.txt') return false;
      return true;
    })
    .map((name) => path.join(DIR, name))
    .sort((a, b) => a.localeCompare(b, 'ja'));
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function fileHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  const force = process.argv.includes('--force');
  const files = listTxtFiles();
  if (files.length === 0) {
    console.log('line-imports/ に .txt がありません（README.txt 以外）。LINEの保存ファイルを置いてから再実行してください。');
    process.exit(0);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('✗ GEMINI_API_KEY が .env にありません');
    process.exit(1);
  }
  if (!process.env.NOTION_LINE_INBOX_DB_ID) {
    console.error('✗ NOTION_LINE_INBOX_DB_ID が .env にありません（notion:create-line-inbox を先に）');
    process.exit(1);
  }

  const state = loadState();
  let skipped = 0;

  console.log(`line-imports 一括吸い出し: ${files.length} ファイル（変更なしはスキップ）\n`);

  let failed = 0;
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const key = rel;
    let h;
    try {
      h = fileHash(file);
    } catch (e) {
      console.error(`✗ 読めません: ${rel}`, e.message);
      failed += 1;
      continue;
    }
    if (!force && state[key] === h) {
      console.log(`⏭ スキップ（変更なし） ${rel}`);
      skipped += 1;
      continue;
    }

    console.log(`━━ ${rel} ━━`);
    try {
      execFileSync(process.execPath, [TASK, file, '--notion'], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
      });
      state[key] = h;
      saveState(state);
    } catch {
      failed += 1;
      console.error(`✗ 失敗: ${rel}`);
    }
    console.log('');
  }

  if (skipped && failed === 0) {
    console.log(`（${skipped} 件は前回と同じ内容のためスキップ）`);
  }

  if (failed) {
    console.error(`完了（うち ${failed} 件は失敗）`);
    process.exit(1);
  }
  console.log('✓ すべて完了');
}

main();
