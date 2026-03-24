#!/usr/bin/env node
/**
 * 指定した日付範囲に、コンテンツDBへ投稿行を追加する。
 * createPostEntry（content-calendar.js）と同じロジックでキャプション・フック等を生成。
 *
 * 使い方:
 *   node scripts/notion-seed-posts-date-range.js
 *   node scripts/notion-seed-posts-date-range.js --dry-run
 *
 * 重複: 同一「投稿日 + クライアント + テーマカテゴリ」が既にあればスキップ。
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const {
  CLIENT_CONFIGS,
  createPostEntry,
  resetMaterialPickCounters,
} = require('../content-calendar.js');
const { queryContentDataSource } = require('./lib/notion-content-data-source-query.js');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * 2026-03-25 〜 03-31 の投稿スケジュール
 * - Mz の baseDay 3/25 は postIndex 5（カレンダー6本目）に相当
 * - 期間内を埋めるため、Mz / Niki を交互にし postIndex を連番で進める（テーマローテーション用）
 */
const SCHEDULE = [
  { date: '2026-03-25', client: 'Mz cafe', postIndex: 5 },
  { date: '2026-03-26', client: 'Mz cafe', postIndex: 6 },
  { date: '2026-03-27', client: 'Niki★DINER', postIndex: 4 },
  { date: '2026-03-28', client: 'Mz cafe', postIndex: 7 },
  { date: '2026-03-29', client: 'Niki★DINER', postIndex: 5 },
  { date: '2026-03-30', client: 'Mz cafe', postIndex: 8 },
  { date: '2026-03-31', client: 'Niki★DINER', postIndex: 6 },
  { date: '2026-03-31', client: 'Mz cafe', postIndex: 9 },
];

function themeForEntry(client, postIndex) {
  const config = CLIENT_CONFIGS[client];
  const tr = config.themeRotation;
  return tr[postIndex % tr.length];
}

async function existsDuplicate(dateStr, client, theme) {
  const res = await queryContentDataSource({
    filter: {
      and: [
        { property: '投稿日', date: { equals: dateStr } },
        { property: 'クライアント', select: { equals: client } },
        { property: 'テーマカテゴリ', select: { equals: theme } },
      ],
    },
    page_size: 5,
  });
  return res.results.filter((p) => !p.archived).length > 0;
}

(async () => {
  console.log(`\n=== notion-seed-posts-date-range ===${DRY_RUN ? ' (DRY RUN)' : ''}\n`);
  console.log('対象:', SCHEDULE.map((s) => `${s.date} ${s.client} (index ${s.postIndex})`).join('\n'));
  console.log('');

  resetMaterialPickCounters();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of SCHEDULE) {
    const { date: dateStr, client, postIndex } = row;
    const theme = themeForEntry(client, postIndex);
    if (await existsDuplicate(dateStr, client, theme)) {
      console.log(`SKIP（既存） ${dateStr} ${client} ${theme}`);
      skipped++;
      continue;
    }

    const config = CLIENT_CONFIGS[client];
    const date = new Date(dateStr + 'T12:00:00');
    const month = date.getMonth() + 1;

    if (DRY_RUN) {
      console.log(`[DRY] 作成予定 ${dateStr} ${client} ${theme}`);
      created++;
      continue;
    }

    const ok = await createPostEntry(config, client, postIndex, date, month);
    if (ok) created++;
    else failed++;

    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n完了: 作成 ${created} / スキップ ${skipped} / 失敗 ${failed}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
