#!/usr/bin/env node
/**
 * Notion Content DB: 「コピペ用テキスト」を
 *   キャプション + 空行 + ハッシュタグセット
 * に揃える（content-calendar.js の generateCopyPasteText と同じルール）
 *
 * 使い方（プロジェクトルートで）:
 *   node scripts/notion-sync-copypaste.js
 *   node scripts/notion-sync-copypaste.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('@notionhq/client');
const { queryContentDataSource } = require('./lib/notion-content-data-source-query.js');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});
const { richTextPlain, generateCopyPasteText, rt } = require('./lib/notion-copypaste-helpers.js');

const DRY_RUN = process.argv.includes('--dry-run');

async function queryAllPages() {
  const results = [];
  let cursor;
  do {
    const res = await queryContentDataSource({
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.filter((p) => !p.archived);
}

(async () => {
  console.log(`\n=== notion-sync-copypaste ===${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  const pages = await queryAllPages();
  let updated = 0;
  let skip = 0;
  let same = 0;

  for (const page of pages) {
    const p = page.properties;
    const caption = richTextPlain(p['キャプション']);
    const hashtags = richTextPlain(p['ハッシュタグセット']);
    const current = richTextPlain(p['コピペ用テキスト']);
    const next = generateCopyPasteText(caption, hashtags);

    if (!caption && !hashtags) {
      skip++;
      continue;
    }

    if (current === next) {
      same++;
      continue;
    }

    const title = richTextPlain(p['タイトル']) || page.id;
    console.log(`更新: ${title}`);
    if (DRY_RUN) {
      console.log(`  (差分あり: ${current.length} → ${next.length} 文字)`);
    }

    if (!DRY_RUN) {
      await notion.pages.update({
        page_id: page.id,
        properties: {
          'コピペ用テキスト': { rich_text: rt(next) },
        },
      });
    }
    updated++;
  }

  console.log(`\n完了: 更新 ${updated} / 変更なし ${same} / キャプション・タグ両方空でスキップ ${skip} / 全 ${pages.length} 件`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
