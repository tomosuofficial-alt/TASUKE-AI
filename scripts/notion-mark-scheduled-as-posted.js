#!/usr/bin/env node
/**
 * コンテンツ DB: ステータス「予約投稿済み」の全ページを「投稿済み」に一括変更する。
 *
 * 「予約投稿済み」は手動運用の値で、予約時刻が過ぎて実際に投稿された分を
 * まとめて「投稿済み」へ揃えるための一回限りスクリプト。
 *
 * 使い方（プロジェクトルートで / .env に NOTION_TOKEN が必要）:
 *   node scripts/notion-mark-scheduled-as-posted.js --dry-run   # 対象一覧を表示のみ
 *   node scripts/notion-mark-scheduled-as-posted.js             # 実際に更新
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('@notionhq/client');
const { queryContentDataSource } = require('./lib/notion-content-data-source-query.js');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});

const FROM_STATUS = '予約投稿済み';
const TO_STATUS = '投稿済み';
const STATUS_PROP = 'ステータス';
const DRY_RUN = process.argv.includes('--dry-run');

function statusName(prop) {
  if (!prop) return '';
  if (prop.type === 'select') return prop.select?.name || '';
  if (prop.type === 'status') return prop.status?.name || '';
  return '';
}

function titleOf(props) {
  const t = props['タイトル'];
  if (t?.type === 'title') return (t.title || []).map((x) => x.plain_text).join('');
  return '';
}

async function queryAllPages() {
  const results = [];
  let cursor;
  do {
    const res = await queryContentDataSource({ page_size: 100, start_cursor: cursor });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.filter((p) => !p.archived);
}

(async () => {
  console.log(`\n=== notion-mark-scheduled-as-posted ===${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log(`「${FROM_STATUS}」→「${TO_STATUS}」\n`);

  const pages = await queryAllPages();

  // ステータスプロパティの型を最初のページから判定（select / status 両対応）
  const sample = pages.find((p) => p.properties[STATUS_PROP]);
  const propType = sample?.properties[STATUS_PROP]?.type || 'select';

  const targets = pages.filter((p) => statusName(p.properties[STATUS_PROP]) === FROM_STATUS);

  console.log(`全 ${pages.length} 件中、「${FROM_STATUS}」は ${targets.length} 件:`);
  targets.forEach((p, i) => {
    const client = p.properties['クライアント']?.select?.name || '-';
    const date = p.properties['投稿日']?.date?.start || '-';
    console.log(`  ${String(i + 1).padStart(2)}. [${date}] ${client}｜${titleOf(p.properties) || p.id}`);
  });

  if (DRY_RUN) {
    console.log(`\n(DRY RUN: 更新は行っていません)`);
    return;
  }
  if (targets.length === 0) {
    console.log('\n対象なし。終了。');
    return;
  }

  let updated = 0;
  for (const p of targets) {
    const value =
      propType === 'status' ? { status: { name: TO_STATUS } } : { select: { name: TO_STATUS } };
    await notion.pages.update({
      page_id: p.id,
      properties: { [STATUS_PROP]: value },
    });
    updated++;
  }
  console.log(`\n完了: ${updated} / ${targets.length} 件を「${TO_STATUS}」に更新しました。`);
})().catch((e) => {
  console.error('ERROR:', e.message, e.body ? JSON.stringify(e.body) : '');
  process.exit(1);
});
