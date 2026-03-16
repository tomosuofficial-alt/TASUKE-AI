require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { Client } = require('@notionhq/client');
const { execSync } = require('child_process');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CLIENT_SALES_DB = '3249fe8c-3a7f-8151-a97a-c40827a55732';

const WEEKDAY_MAP = { '0': '日', '1': '月', '2': '火', '3': '水', '4': '木', '5': '金', '6': '土' };

function readCsvAsUtf8(filePath) {
  return execSync(`iconv -f SHIFT-JIS -t UTF-8 "${filePath}"`).toString();
}

function parseCsv(content) {
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

function getWeekday(dateStr) {
  // 2026/03/06 形式
  const d = new Date(dateStr.replace(/\//g, '-'));
  return WEEKDAY_MAP[String(d.getDay())];
}

async function existsRecord(client, dateStr) {
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

async function saveRecord(row) {
  const rawDate = row['日付'];
  // YYYY/MM/DD → YYYY-MM-DD
  const date = rawDate.replace(/\//g, '-');
  const client = row['店舗名'];
  const sales = parseInt(row['純売上'] || 0);
  const customers = parseInt(row['客数'] || 0);
  const unitPrice = parseInt(row['客単価'] || 0);
  const weather = row['天気'] || '';
  const weekday = getWeekday(rawDate);

  if (sales === 0) return null;

  // 合計行・前月実績行をスキップ
  if (['合計', '前月実績', '前月比', '前年実績', '前年比'].includes(rawDate)) return null;

  try {
    await notion.pages.create({
      parent: { database_id: CLIENT_SALES_DB },
      properties: {
        '日付': { title: [{ text: { content: date } }] },
        'クライアント': { select: { name: client } },
        '売上': { number: sales },
        '客数': { number: customers },
        '客単価': { number: unitPrice },
        '曜日': { select: { name: weekday } },
        ...(weather ? { '天気': { select: { name: weather } } } : {}),
      },
    });
    return { date, client, sales };
  } catch (e) {
    console.error(`✗ 保存失敗 ${date}:`, e.message);
    return null;
  }
}

async function importFile(filePath) {
  console.log(`\n📂 読み込み中: ${path.basename(filePath)}`);
  const content = readCsvAsUtf8(filePath);
  const rows = parseCsv(content);

  let saved = 0, skipped = 0, zero = 0;

  for (const row of rows) {
    const rawDate = row['日付'];
    if (!rawDate || ['合計', '前月実績', '前月比', '前年実績', '前年比'].includes(rawDate)) continue;

    const sales = parseInt(row['純売上'] || 0);
    if (sales === 0) { zero++; continue; }

    const date = rawDate.replace(/\//g, '-');
    const client = row['店舗名'];
    const exists = await existsRecord(client, date);
    if (exists) { skipped++; continue; }

    const result = await saveRecord(row);
    if (result) {
      saved++;
      console.log(`  ✓ ${result.date} ${result.client} ¥${result.sales.toLocaleString()}`);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`  完了: 保存${saved}件 / スキップ${skipped}件 / 売上0除外${zero}件`);
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    // 引数なしの場合はdataフォルダのsmaregi_*.csvを対象
    const dataDir = path.join(__dirname, 'data');
    const autoFiles = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('smaregi_') && f.endsWith('.csv'))
      .sort()
      .map(f => path.join(dataDir, f));
    files.push(...autoFiles);
  }

  if (files.length === 0) {
    console.error('対象ファイルがありません');
    process.exit(1);
  }

  console.log(`\n=== よいどころ千福 売上CSVインポート ===`);
  for (const file of files) await importFile(file);
  console.log('\n=== インポート完了 ===');
}

main();
