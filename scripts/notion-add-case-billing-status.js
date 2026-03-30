// 案件管理DBに Select「請求ステータス」（未請求／請求済／不要）を追加（無ければのみ）
//   node scripts/notion-add-case-billing-status.js

require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CASE_DB = process.env.NOTION_CASE_DB_ID || 'e8434c27-61bf-436b-9bf2-601b5ff4d848';

const PROP = '請求ステータス';
const OPTIONS = [
  { name: '未請求', color: 'red' },
  { name: '請求済', color: 'green' },
  { name: '不要', color: 'gray' },
];

async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.error('✗ NOTION_TOKEN が未設定です');
    process.exit(1);
  }

  const db = await notion.databases.retrieve({ database_id: CASE_DB });
  if (db.properties[PROP]) {
    console.log(`✓ 「${PROP}」は既にあります（スキップ）`);
    return;
  }

  await notion.databases.update({
    database_id: CASE_DB,
    properties: {
      [PROP]: {
        select: { options: OPTIONS },
      },
    },
  });

  console.log(`✓ 案件管理DBに「${PROP}」を追加しました（${OPTIONS.map((o) => o.name).join(' / ')}）`);
  console.log('\n次: リポジトリ直下の .env に次を追記してください（未請求アラートの明示運用）:');
  console.log('  CASE_BILLING_STATUS_PROP=請求ステータス');
  console.log('  CASE_BILLING_UNBILLED_VALUE=未請求');
  console.log('  CASE_UNBILLED_HEURISTIC=0   ← ヒューリスティックを止める場合（任意）');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
