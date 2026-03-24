#!/usr/bin/env node
/**
 * Notion コンテンツDBから、自動化で使っていないプロパティを削除する。
 *
 * 削除対象（DBに存在するもののみ）:
 *   - 投稿予定日（投稿日と重複する場合）
 *   - 担当AI
 *   - 本文（キャプションと重複する場合）
 *   - 種別（※コンテンツ種別は削除しない — content-calendar.js で使用中）
 *
 * 使い方（プロジェクトルート）:
 *   node scripts/notion-content-db-remove-unused-props.js
 *   node scripts/notion-content-db-remove-unused-props.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CONTENT_DB = '942d70a4-e645-464e-a1ab-5176bce10939';

const DRY_RUN = process.argv.includes('--dry-run');

/** 削除候補（存在するキーのみ API で null 指定） */
const CANDIDATES = ['投稿予定日', '担当AI', '本文', '種別'];

(async () => {
  console.log(`\n=== notion-content-db-remove-unused-props ===${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  const db = await notion.databases.retrieve({ database_id: CONTENT_DB });
  const existing = Object.keys(db.properties);
  const toRemove = CANDIDATES.filter((name) => existing.includes(name));

  if (toRemove.length === 0) {
    console.log('削除対象のプロパティはありません（既に無いか、名前が違います）。');
    console.log('DB のプロパティ:', existing.join(', '));
    return;
  }

  console.log('削除するプロパティ:', toRemove.join(', '));
  if (DRY_RUN) {
    console.log('\n（dry-run のため API は呼びません）');
    return;
  }

  const properties = {};
  for (const name of toRemove) {
    properties[name] = null;
  }

  await notion.databases.update({
    database_id: CONTENT_DB,
    properties,
  });

  console.log('\n完了: Notion コンテンツDBから上記プロパティを削除しました。');
  console.log('※ 「コンテンツ種別」は content-calendar.js で使用のため対象外です。');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
