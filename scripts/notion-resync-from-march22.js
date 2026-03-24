#!/usr/bin/env node
/**
 * Notion Content DB: 投稿日 >= 2026-03-22 のページについて
 * - タイトルを「クライアント｜テーマカテゴリ」に揃える
 * - フックを content-calendar.js の hookByTheme に合わせる
 * - コピペ用テキストを キャプション + ハッシュタグ に整合
 *
 * 使い方: node scripts/notion-resync-from-march22.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('@notionhq/client');
const { queryContentDataSource } = require('./lib/notion-content-data-source-query.js');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});
const {
  richTextPlain,
  generateCopyPasteText,
  rt: rtCopyPaste,
} = require('./lib/notion-copypaste-helpers.js');

const HOOK_MZ = {
  '人気No.1メニュー': 'カフェだと思った？ 実はここ、大人の洋風酒場です',
  '新作・限定メニュー': '1軒目にも2軒目にもなる店、知ってる？',
  '調理シーン・盛付け': 'チーズがとろける、この瞬間、見える？',
  'ドリンク・スイーツ': '仕事終わりの一杯、こんな場所で飲みたくない？',
  '雰囲気・空間': 'ここ、本当にカフェ？',
  'お客様の注文風景': '女子会の場所、まだ決まってないなら',
};

const HOOK_NIKI = {
  '看板バーガー': '上州牛を鉄板にギュッと押し付けると…',
  '調理ライブ': 'ソースもベーコンも全部手作り。これがクラフトバーガー',
  'ライスプレート・夜ダイナー': 'ハンバーガー屋のロコモコ、食べたことある？',
  '空間・映えドリンク': 'NYスタイルの空間で、クリームソーダを。',
};

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

async function queryAllFromMarch22() {
  const results = [];
  let cursor;
  do {
    const res = await queryContentDataSource({
      filter: { property: '投稿日', date: { on_or_after: '2026-03-22' } },
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
  const pages = await queryAllFromMarch22();

  let ok = 0;
  let skip = 0;

  for (const page of pages) {
    const client = selectName(getProp(page, 'クライアント'));
    const theme = selectName(getProp(page, 'テーマカテゴリ'));
    if (!client || !theme) {
      console.log('SKIP (no client/theme)', page.id);
      skip++;
      continue;
    }

    const hookMap = client === 'Mz cafe' ? HOOK_MZ : client === 'Niki★DINER' ? HOOK_NIKI : null;
    const hook = hookMap?.[theme];
    if (!hook) {
      console.log('SKIP (unknown theme)', client, theme, page.id);
      skip++;
      continue;
    }

    const title = `${client}｜${theme}`;
    const caption = richTextPlain(getProp(page, 'キャプション'));
    const hashtags = richTextPlain(getProp(page, 'ハッシュタグセット'));
    const copyPasteText = generateCopyPasteText(caption, hashtags);

    await notion.pages.update({
      page_id: page.id,
      properties: {
        タイトル: { title: [{ text: { content: title } }] },
        'フック（冒頭3秒）': { rich_text: rt(hook) },
        'コピペ用テキスト': { rich_text: rtCopyPaste(copyPasteText) },
      },
    });

    console.log('OK', getProp(page, '投稿日')?.date?.start, title);
    ok++;
  }

  console.log(`\n完了: 更新 ${ok} / スキップ ${skip}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
