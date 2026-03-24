/**
 * LINE吸い出しから作る「タスク管理」用 Notion DB を作成し、.env に NOTION_TASKS_DB_ID を追記（未設定時のみ）。
 *
 *   npm run notion:create-tasks-db
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
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8');
    if (/^\s*NOTION_TASKS_DB_ID\s*=/m.test(existing)) {
      const m = existing.match(/^\s*NOTION_TASKS_DB_ID\s*=\s*([^\s#]+)/m);
      console.log('✓ 既に NOTION_TASKS_DB_ID があります:', m ? m[1] : '');
      process.exit(0);
    }
  }

  const parent = process.env.NOTION_TASKS_PARENT_PAGE_ID || DEFAULT_PARENT_PAGE;
  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  const db = await notion.databases.create({
    parent: { page_id: parent },
    title: [{ type: 'text', text: { content: 'タスク（LINE吸い出し）' } }],
    properties: {
      タスク: { title: {} },
      状態: {
        select: {
          options: [
            { name: '未着手', color: 'gray' },
            { name: '進行中', color: 'blue' },
            { name: '完了', color: 'green' },
          ],
        },
      },
      種別: {
        select: {
          options: [
            { name: 'task', color: 'default' },
            { name: 'follow_up', color: 'yellow' },
            { name: 'decision_needed', color: 'red' },
          ],
        },
      },
      緊急度: {
        select: {
          options: [
            { name: 'high', color: 'red' },
            { name: 'medium', color: 'orange' },
            { name: 'low', color: 'gray' },
            { name: 'unknown', color: 'default' },
          ],
        },
      },
      動く人: {
        select: {
          options: [
            { name: '自分', color: 'blue' },
            { name: '相手', color: 'purple' },
            { name: '双方', color: 'pink' },
            { name: 'unknown', color: 'default' },
          ],
        },
      },
      期限メモ: { rich_text: {} },
      クライアント: { rich_text: {} },
      根拠: { rich_text: {} },
      出所: { rich_text: {} },
    },
  });

  const id = db.id;
  const line = `\n# タスクDB（notion-create-tasks-db.js が追記）\nNOTION_TASKS_DB_ID=${id}\n`;
  fs.appendFileSync(envPath, line, { flag: 'a' });
  console.log('✓ Notion に「タスク（LINE吸い出し）」DBを作成しました');
  console.log('  ID:', id);
  console.log('  URL:', db.url || `https://notion.so/${id.replace(/-/g, '')}`);
  console.log('✓ .env に NOTION_TASKS_DB_ID を追記しました');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
