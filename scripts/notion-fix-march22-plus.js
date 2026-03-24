#!/usr/bin/env node
/**
 * Notion Content DB: 投稿日 >= 指定日（既定 2026-03-22）のページについて
 * - タイトル「クライアント｜テーマカテゴリ」
 * - フック: content-calendar.js の hookByTheme
 * - 素材チェックリスト: selectMaterials（現行ロジック・日付順ローテーションと整合）
 * - コピペ用テキスト: キャプション + 空行 + ハッシュタグセット（常に整合）
 *
 * 使い方:
 *   node scripts/notion-fix-march22-plus.js
 *   node scripts/notion-fix-march22-plus.js --from-date 2026-03-22
 *   node scripts/notion-fix-march22-plus.js --dry-run
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('@notionhq/client');
const { queryContentDataSource } = require('./lib/notion-content-data-source-query.js');
const {
  CLIENT_CONFIGS,
  selectMaterials,
  resetMaterialPickCounters,
} = require('../content-calendar.js');
const {
  richTextPlain,
  generateCopyPasteText,
  rt: rtCopyPaste,
} = require('./lib/notion-copypaste-helpers.js');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fromIdx = args.indexOf('--from-date');
const FROM_DATE = fromIdx !== -1 ? args[fromIdx + 1] : '2026-03-22';

function rt(text) {
  if (!text) return [];
  const t = text.length > 1900 ? text.substring(0, 1900) + '…' : text;
  return [{ text: { content: t } }];
}

function getProp(page, name) {
  return page.properties[name];
}

function selectName(prop) {
  return prop?.select?.name || '';
}

async function queryAllFromDate(dateStr) {
  const results = [];
  let cursor;
  do {
    const res = await queryContentDataSource({
      filter: { property: '投稿日', date: { on_or_after: dateStr } },
      sorts: [{ property: '投稿日', direction: 'ascending' }],
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results;
}

(async () => {
  console.log(`\n=== notion-fix-march22-plus ===`);
  console.log(`投稿日 >= ${FROM_DATE}${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  const pages = await queryAllFromDate(FROM_DATE);
  const active = pages.filter((p) => !p.archived);

  resetMaterialPickCounters();

  let ok = 0;
  let skip = 0;

  for (let i = 0; i < active.length; i++) {
    const page = active[i];
    const client = selectName(getProp(page, 'クライアント'));
    const theme = selectName(getProp(page, 'テーマカテゴリ'));
    const postDate = getProp(page, '投稿日')?.date?.start || '';

    if (!client || !theme) {
      console.log('SKIP (no client/theme)', page.id);
      skip++;
      continue;
    }

    const config = CLIENT_CONFIGS[client];
    if (!config) {
      console.log('SKIP (unknown client)', client, page.id);
      skip++;
      continue;
    }

    const hook = config.hookByTheme?.[theme];
    if (!hook) {
      console.log('SKIP (unknown theme)', client, theme, page.id);
      skip++;
      continue;
    }

    const title = `${client}｜${theme}`;
    const materialSummary = selectMaterials(config, theme, i);

    const caption = richTextPlain(getProp(page, 'キャプション'));
    const hashtags = richTextPlain(getProp(page, 'ハッシュタグセット'));
    const copyPasteText = generateCopyPasteText(caption, hashtags);

    const props = {
      タイトル: { title: [{ text: { content: title } }] },
      'フック（冒頭3秒）': { rich_text: rt(hook) },
      '素材チェックリスト': { rich_text: rt(materialSummary) },
      'コピペ用テキスト': { rich_text: rtCopyPaste(copyPasteText) },
    };

    if (DRY_RUN) {
      console.log(`[DRY] ${postDate} ${title}`);
      ok++;
      continue;
    }

    await notion.pages.update({
      page_id: page.id,
      properties: props,
    });

    console.log('OK', postDate, title);
    ok++;
  }

  console.log(`\n完了: 更新 ${ok} / スキップ ${skip} / 取得 ${active.length}件`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
