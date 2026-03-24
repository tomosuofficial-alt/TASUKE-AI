/**
 * LINE取り込み／タスク吸い出し用の Notion データベースを1つ作成し、
 * .env に NOTION_LINE_INBOX_DB_ID を追記する（未設定のときのみ）。
 *
 * 使い方: node scripts/notion-create-line-inbox-db.js
 *
 * 環境変数:
 *   NOTION_TOKEN（必須）
 *   NOTION_LINE_INBOX_PARENT_PAGE_ID（任意）… DB をぶら下げる親ページID。未設定時は CLAUDE.md のトップページID
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');

const DEFAULT_PARENT_PAGE = '3249fe8c3a7f80269c41ce55e14d4d79';

async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.error('✗ NOTION_TOKEN が .env にありません');
    process.exit(1);
  }

  const envPath = path.join(__dirname, '..', '.env');
  let existing = '';
  if (fs.existsSync(envPath)) {
    existing = fs.readFileSync(envPath, 'utf8');
    if (/^\s*NOTION_LINE_INBOX_DB_ID\s*=/m.test(existing)) {
      const m = existing.match(/^\s*NOTION_LINE_INBOX_DB_ID\s*=\s*([^\s#]+)/m);
      console.log('✓ 既に NOTION_LINE_INBOX_DB_ID が .env にあります:', m ? m[1] : '(値を確認してください)');
      process.exit(0);
    }
  }

  const parent = process.env.NOTION_LINE_INBOX_PARENT_PAGE_ID || DEFAULT_PARENT_PAGE;
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  const db = await notion.databases.create({
    parent: { page_id: parent },
    title: [{ type: 'text', text: { content: 'LINE取り込み・タスク吸い出し' } }],
    properties: {
      名前: { title: {} },
      日付: { date: {} },
      取引先: { rich_text: {} },
      完了: { checkbox: {} },
    },
  });

  const id = db.id;
  const line = `\n# LINE取り込みDB（notion-create-line-inbox-db.js が追記）\nNOTION_LINE_INBOX_DB_ID=${id}\n`;
  fs.appendFileSync(envPath, line, { flag: 'a' });
  console.log('✓ Notion にデータベースを作成しました');
  console.log('  ID:', id);
  console.log('  URL:', db.url || `https://notion.so/${id.replace(/-/g, '')}`);
  console.log('✓ .env に NOTION_LINE_INBOX_DB_ID を追記しました');
}

main().catch((e) => {
  console.error('✗', e.message);
  if (e.code === 'object_not_found' || /permission/i.test(String(e.message))) {
    console.error('  ヒント: Notion のインテグレーションを「親ページ」に招待してください。');
    console.error('  別の親にしたい場合: NOTION_LINE_INBOX_PARENT_PAGE_ID を .env に設定して再実行。');
  }
  process.exit(1);
});
