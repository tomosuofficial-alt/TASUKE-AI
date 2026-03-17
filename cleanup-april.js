require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CONTENT_DB = '942d70a4-e645-464e-a1ab-5176bce10939';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deleteAprilEntries() {
  console.log('4月エントリーを検索中...');

  const results = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: CONTENT_DB,
      filter: {
        property: '投稿日',
        date: {
          on_or_after: '2026-04-01',
        },
      },
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const aprilEntries = results.filter((p) => {
    const dateVal = p.properties['投稿日']?.date?.start;
    return dateVal && dateVal.startsWith('2026-04');
  });

  console.log(`4月エントリー ${aprilEntries.length} 件を削除します...`);

  for (const page of aprilEntries) {
    await notion.pages.update({ page_id: page.id, archived: true });
    console.log(`  削除: ${page.id}`);
    await sleep(350);
  }

  console.log('完了。次に node content-calendar.js 2026-04 を実行してください。');
}

deleteAprilEntries().catch(console.error);
