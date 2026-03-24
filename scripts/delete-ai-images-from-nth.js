#!/usr/bin/env node
/**
 * 投稿日 >= 指定日の Notion 投稿を日付昇順で並べ、N 投稿目以降について:
 * - ローカルの AI 生成 PNG（3枚）を削除
 * - Notion コンテンツDBの該当ページをアーカイブ（DBから非表示・後から復元可）
 *
 * 使い方（プロジェクトルートで）:
 *   node scripts/delete-ai-images-from-nth.js --from-date 2026-03-22 --from-index 4
 *   npm run notion:delete-ai-from-4th
 *
 * --from-index 4 → 4番目以降（1始まり）。3番目まで残すなら --from-index 4。
 *
 * --files-only … PNG だけ削除し、Notion は触らない（従来の「企画中に戻す」が必要な場合用）
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Client } from '@notionhq/client';

const require = createRequire(import.meta.url);
const { queryContentDataSource } = require('./lib/notion-content-data-source-query.js');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});

const MATERIAL_CONFIG = {
  'Mz cafe': {
    outputDir: '/Volumes/Home_Mac_SSD/01_Projects/Mz_cafe/03_Material/02_Photos/04_AI_Generated',
  },
  'Niki★DINER': {
    outputDir: '/Volumes/Home_Mac_SSD/01_Projects/Niki_Diner/03_Material/02_Photos/04_AI_Generated',
  },
};

function parseArgs() {
  const a = process.argv.slice(2);
  let fromDate = '2026-03-22';
  let fromIndex = 4; // 1-based: delete from this post number onward
  let filesOnly = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--from-date' && a[i + 1]) {
      fromDate = a[i + 1];
      i++;
    } else if (a[i] === '--from-index' && a[i + 1]) {
      fromIndex = parseInt(a[i + 1], 10);
      i++;
    } else if (a[i] === '--files-only') {
      filesOnly = true;
    }
  }
  return { fromDate, fromIndex, filesOnly };
}

async function queryAllFromDate(dateStr) {
  const results = [];
  let cursor;
  do {
    const res = await queryContentDataSource({
      filter: {
        and: [
          { property: '投稿日', date: { on_or_after: dateStr } },
          {
            or: [
              { property: 'ステータス', select: { equals: '企画中' } },
              { property: 'ステータス', select: { equals: '生成待ち' } },
              { property: 'ステータス', select: { equals: 'AI生成済み' } },
              { property: 'ステータス', select: { equals: 'CEO確認待ち' } },
              { property: 'ステータス', select: { equals: '承認済み' } },
            ],
          },
        ],
      },
      sorts: [{ property: '投稿日', direction: 'ascending' }],
      page_size: 100,
      start_cursor: cursor,
    });
    results.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return results.filter((p) => !p.archived);
}

(async () => {
  const { fromDate, fromIndex, filesOnly } = parseArgs();
  if (fromIndex < 1) {
    console.error('--from-index は 1 以上');
    process.exit(1);
  }

  const zeroBased = fromIndex - 1; // 4番目以降 → index >= 3

  console.log(`\n=== delete-ai-images-from-nth ===`);
  if (filesOnly) {
    console.log(`投稿日 >= ${fromDate}、並び順 ${fromIndex}番目以降: PNG のみ削除（Notion は変更しません）\n`);
  } else {
    console.log(`投稿日 >= ${fromDate}、並び順 ${fromIndex}番目以降: PNG 削除 + Notion ページをアーカイブ\n`);
  }

  const pages = await queryAllFromDate(fromDate);
  const targets = pages.slice(zeroBased);

  if (targets.length === 0) {
    console.log('対象がありません。');
    return;
  }

  console.log(`対象: ${targets.length} 投稿（全 ${pages.length} 件中 ${fromIndex}番目〜）\n`);

  for (const page of targets) {
    const p = page.properties;
    const clientName = p['クライアント']?.select?.name || '';
    const theme = p['テーマカテゴリ']?.select?.name || '';
    const postDate = p['投稿日']?.date?.start || '';
    const cfg = MATERIAL_CONFIG[clientName];
    if (!cfg || !theme || !postDate) {
      console.log('SKIP', page.id, clientName, theme);
      continue;
    }

    const dateTag = postDate.replace(/-/g, '');
    const themeSlug = theme.replace(/[・★]/g, '_');
    const outDir = cfg.outputDir;

    for (let i = 1; i <= 3; i++) {
      const fn = `${dateTag}_${themeSlug}_${i}.png`;
      const fp = path.join(outDir, fn);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        console.log('削除', fp);
      }
    }

    if (!filesOnly) {
      await notion.pages.update({
        page_id: page.id,
        archived: true,
      });
      console.log(`Notion アーカイブ: ${postDate} ${clientName} ${theme} (${page.id})\n`);
    }
  }

  console.log('完了');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
