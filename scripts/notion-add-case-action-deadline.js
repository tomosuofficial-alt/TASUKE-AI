// 案件管理DBに「次回アクション」（テキスト）と「期限」（日付）を追加（無ければのみ）
//   node scripts/notion-add-case-action-deadline.js

require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CASE_DB = process.env.NOTION_CASE_DB_ID || 'e8434c27-61bf-436b-9bf2-601b5ff4d848';

const PROPS_TO_ADD = {
  次回アクション: { rich_text: {} },
  期限: { date: {} },
};

async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.error('✗ NOTION_TOKEN が未設定です');
    process.exit(1);
  }

  const db = await notion.databases.retrieve({ database_id: CASE_DB });

  const toAdd = {};
  for (const [name, config] of Object.entries(PROPS_TO_ADD)) {
    if (db.properties[name]) {
      console.log(`✓ 「${name}」は既にあります（スキップ）`);
    } else {
      toAdd[name] = config;
    }
  }

  if (Object.keys(toAdd).length === 0) {
    console.log('✓ 追加するプロパティはありません');
    return;
  }

  await notion.databases.update({
    database_id: CASE_DB,
    properties: toAdd,
  });

  console.log(`✓ 案件管理DBに追加しました: ${Object.keys(toAdd).join('、')}`);
  console.log('\n次: Notionで各案件の「次回アクション」と「期限」を入力してください。');
  console.log('朝ブリーフで期限3日以内の案件が警告表示されます。');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
