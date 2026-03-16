require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Client } = require('@notionhq/client');
const { execSync } = require('child_process');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CLIENT_SALES_DB = '3249fe8c-3a7f-8151-a97a-c40827a55732';

// Shift-JIS → UTF-8 変換
function readCsvAsUtf8(filePath) {
  return execSync(`iconv -f SHIFT-JIS -t UTF-8 "${filePath}"`).toString();
}

// CSVパース
function parseCsv(content) {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

// Notionに1レコード保存
async function saveRecord(row) {
  const date = row['日付'];
  const client = row['店舗名'];
  const sales = parseInt(row['売上'] || 0);
  const customers = parseInt(row['客数'] || 0);
  const unitPrice = parseInt(row['客単価'] || 0);
  const foodSales = parseInt(row['フード売上'] || 0);
  const drinkSales = parseInt(row['ドリンク売上'] || 0);
  const weekday = row['曜日'] || '';
  const weather = row['天気'] || '';

  // 売上0の日はスキップ
  if (sales === 0) return null;

  try {
    await notion.pages.create({
      parent: { database_id: CLIENT_SALES_DB },
      properties: {
        '日付': { title: [{ text: { content: date } }] },
        'クライアント': { select: { name: client } },
        '売上': { number: sales },
        '客数': { number: customers },
        '客単価': { number: unitPrice },
        'フード売上': { number: foodSales },
        'ドリンク売上': { number: drinkSales },
        '曜日': { select: { name: weekday } },
        '天気': { select: { name: weather } },
      },
    });
    return { date, client, sales };
  } catch (e) {
    console.error(`✗ 保存失敗 ${date}:`, e.message);
    return null;
  }
}

// 重複チェック
async function existsRecord(client, date) {
  const res = await notion.databases.query({
    database_id: CLIENT_SALES_DB,
    filter: {
      and: [
        { property: 'クライアント', select: { equals: client } },
        { property: '日付', title: { contains: date } },
      ],
    },
  });
  return res.results.length > 0;
}

// メイン
async function importCsv(filePath) {
  console.log(`\n📂 読み込み中: ${path.basename(filePath)}`);

  const content = readCsvAsUtf8(filePath);
  const rows = parseCsv(content);

  console.log(`  ${rows.length}件のデータを処理します...`);

  let saved = 0;
  let skipped = 0;
  let zero = 0;

  for (const row of rows) {
    const date = row['日付'];
    const client = row['店舗名'];

    if (!date || !client) continue;
    if (parseInt(row['売上'] || 0) === 0) { zero++; continue; }

    const exists = await existsRecord(client, date);
    if (exists) { skipped++; continue; }

    const result = await saveRecord(row);
    if (result) {
      saved++;
      console.log(`  ✓ ${result.date} ${result.client} ¥${result.sales.toLocaleString()}`);
    }

    // レート制限対策
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`  完了: 保存${saved}件 / スキップ${skipped}件 / 売上0除外${zero}件`);
}

async function main() {
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.csv'))
    .sort()
    .map(f => path.join(dataDir, f));

  if (files.length === 0) {
    console.error('dataフォルダにCSVファイルがありません');
    process.exit(1);
  }

  console.log(`\n=== クライアント売上CSVインポート ===`);
  console.log(`対象ファイル: ${files.length}件\n`);

  for (const file of files) {
    await importCsv(file);
  }

  console.log('\n=== 全ファイルのインポート完了 ===');
}

main();
