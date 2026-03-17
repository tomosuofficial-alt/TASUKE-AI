require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CONTENT_DB = '942d70a4-e645-464e-a1ab-5176bce10939';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listAndDeleteTestEntries() {
  console.log('全エントリーを取得中...');

  const results = [];
  let cursor;

  do {
    const res = await notion.databases.query({
      database_id: CONTENT_DB,
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  console.log(`合計 ${results.length} 件取得`);

  // 投稿日が2026-03 or 2026-04 以外のエントリーをテスト扱いとして検出
  const testEntries = results.filter((p) => {
    const dateVal = p.properties['投稿日']?.date?.start;
    if (!dateVal) return true; // 投稿日なし → テストエントリー
    const isValidMonth = dateVal.startsWith('2026-03') || dateVal.startsWith('2026-04');
    return !isValidMonth;
  });

  if (testEntries.length === 0) {
    console.log('テストエントリーは見つかりませんでした。');
    return;
  }

  console.log(`\nテストエントリー ${testEntries.length} 件を検出:`);
  for (const p of testEntries) {
    const title = p.properties['タイトル']?.title?.[0]?.plain_text || '(タイトルなし)';
    const date = p.properties['投稿日']?.date?.start || '(日付なし)';
    console.log(`  - [${date}] ${title} (${p.id})`);
  }

  console.log('\n削除中...');
  for (const page of testEntries) {
    await notion.pages.update({ page_id: page.id, archived: true });
    const title = page.properties['タイトル']?.title?.[0]?.plain_text || '(タイトルなし)';
    console.log(`  削除: ${title}`);
    await sleep(350);
  }

  console.log(`\n完了。${testEntries.length} 件のテストエントリーを削除しました。`);
}

listAndDeleteTestEntries().catch(console.error);
