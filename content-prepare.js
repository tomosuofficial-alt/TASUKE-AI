#!/usr/bin/env node
// content-prepare.js — Notion Content DB → 素材選定 → Gemini画像加工 → 保存
// 出力 PNG は sharp で 8bit sRGB に正規化（DaVinci 対応）。既存の 10bit PNG を直す: npm run png:8bit:all
// 使い方:
//   node content-prepare.js                    # ステータス「企画中」の全投稿を処理
//   node content-prepare.js --limit 3          # 最大3件
//   node content-prepare.js --client "Mz cafe" # 特定クライアントのみ
//   node content-prepare.js --dry-run          # 画像生成せずにプレビューのみ
//   node content-prepare.js --from-date 2026-03-22   # 企画中のみ、その日以降
//   node content-prepare.js --from-date 2026-03-25 --to-date 2026-03-27  # 期間内のみ（企画中）
//   node content-prepare.js --from-date 2026-03-22 --regenerate  # 同日以降・未投稿まで再生成
//   4投稿目以降: PNG 削除 + Notion ページアーカイブ → npm run notion:delete-ai-from-4th

import 'dotenv/config';
import { Client } from '@notionhq/client';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { queryContentDataSource } = require('./scripts/lib/notion-content-data-source-query.js');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const CONTENT_DB = '942d70a4-e645-464e-a1ab-5176bce10939';

// ─── CLI引数パース ───────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const MAX_POSTS = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 999;
const clientIdx = args.indexOf('--client');
const CLIENT_FILTER = clientIdx !== -1 ? args[clientIdx + 1] : null;
const fromDateIdx = args.indexOf('--from-date');
const FROM_DATE = fromDateIdx !== -1 ? args[fromDateIdx + 1] : null;
const toDateIdx = args.indexOf('--to-date');
const TO_DATE = toDateIdx !== -1 ? args[toDateIdx + 1] : null;
const REGENERATE = args.includes('--regenerate');

// ─── 素材マッピング（content-calendar.jsと同期） ─────────────────
// 素材選定は Notion「素材チェックリスト」が Single Source of Truth（content-calendar.js が生成）
// ここには basePath（チェックリストの相対パス解決用）と outputDir（生成画像の保存先）のみ定義
const MATERIAL_CONFIG = {
  'Mz cafe': {
    basePath: '/Volumes/Home_Mac_SSD/01_Projects/Mz_cafe/03_Material',
    outputDir: '/Volumes/Home_Mac_SSD/01_Projects/Mz_cafe/03_Material/02_Photos/04_AI_Generated',
  },
  'Niki★DINER': {
    basePath: '/Volumes/Home_Mac_SSD/01_Projects/Niki_Diner/03_Material',
    outputDir: '/Volumes/Home_Mac_SSD/01_Projects/Niki_Diner/03_Material/02_Photos/04_AI_Generated',
  },
};

// ─── Notion「素材チェックリスト」から画像パスを抽出 ─────────────
// content-calendar.js が Notion に書いた指示をそのまま使う（Single Source of Truth）
function parseChecklistForImages(checklist, basePath) {
  if (!checklist) return [];
  const lines = checklist.split('\n');
  const imagePaths = [];
  let inImageSection = false;

  for (const line of lines) {
    if (line.includes('── 画像')) { inImageSection = true; continue; }
    if (line.includes('── 動画')) { inImageSection = false; continue; }
    if (!inImageSection) continue;

    const match = line.match(/\d+\.\s+(.+)/);
    if (!match) continue;
    const relPath = match[1].trim();
    if (!relPath) continue;
    const fullPath = path.join(basePath, relPath);
    if (fs.existsSync(fullPath)) {
      imagePaths.push({ filePath: fullPath, category: path.basename(path.dirname(relPath)), num: path.basename(relPath) });
    } else {
      console.log(`    ⚠ チェックリストのファイルが見つかりません: ${fullPath}`);
    }
  }
  return imagePaths;
}

// ─── 画像の向きを判定 ────────────────────────────────────────────
function getImageOrientation(filePath) {
  const out = execSync(`sips -g pixelWidth -g pixelHeight "${filePath}"`, { encoding: 'utf8' });
  const w = parseInt(out.match(/pixelWidth:\s*(\d+)/)?.[1] || '0');
  const h = parseInt(out.match(/pixelHeight:\s*(\d+)/)?.[1] || '0');
  const ratio = w / h;
  const isPortrait = ratio < 0.85;         // 明確な縦長
  const isSquareish = ratio >= 0.85 && ratio <= 1.15;  // 正方形〜ほぼ正方形
  const isLandscape = ratio > 1.15;        // 明確な横長
  return { width: w, height: h, isPortrait, isSquareish, isLandscape, needsConvert: !isPortrait };
}

// ─── リタッチ用プロンプト（「AIっぽさ」・過度なHDR・料理の巨大化を避ける） ──
function truncateForPrompt(s, max = 400) {
  if (!s) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function buildRetouchPrompt(isPullback, { caption, theme, hook }) {
  const captionLine = truncateForPrompt(caption, 420);
  const hookLine = truncateForPrompt(hook, 160);

  const shared = `You are editing a REAL restaurant photo for Instagram Reels. Output must look like believable editorial / smartphone food photography — NOT a CGI render, NOT an "AI beauty" filter.

POST CONTEXT (stay aligned; do not invent different dishes, props, or people):
- Theme: ${theme}
- Hook line: ${hookLine || '(none)'}
- Caption excerpt: ${captionLine || '(none)'}

CRITICAL — SCALE & REALISM:
- Keep believable physical scale: the dish must look like a normal portion on a real table. Plate, glass, cutlery, and table edge must stay in proportion. NEVER make the food look comically large or "hero macro" vs. the table.
- Preserve the exact scene: same dishes, same background, same table. Do NOT add/remove objects, do NOT change layout.
- Avoid oversaturated HDR, plastic highlights, fake glow, or heavy "AI polish" that looks synthetic.
- PRESERVE all existing product labels, brand logos, and text physically present on objects in the original photo (e.g. ketchup bottles, sauce labels). These are part of the real scene.
- Do NOT add any NEW text, watermarks, overlays, or written characters that were not in the original photo.

EDITING STYLE:
- Gentle exposure, white balance, and natural contrast. Subtle warm toning is OK if it matches the venue.
- Depth of field: only if it matches the original lens feel; avoid artificial bokeh halos.

`;

  if (isPullback) {
    return `${shared}REFRAME for 3:4 vertical: Slightly widen the frame as if the photographer stepped back half a step — show a bit more table and context so scale reads naturally. Still the same scene, not a new composition.`;
  }
  return `${shared}Keep the same framing and composition. Only refine light, color balance, and micro-contrast — like a light Lightroom pass on a real photo.`;
}

/**
 * Gemini が返す PNG は 10bit/16bit になり得る（DaVinci Resolve で読めないことがある）。
 * 8bit sRGB PNG に正規化して保存する。
 */
async function encodePng8Bit(inputBuffer) {
  return sharp(inputBuffer)
    .toColorspace('srgb')
    .png({ compressionLevel: 9, effort: 8 })
    .toBuffer();
}

// ─── Gemini APIで画像加工 ────────────────────────────────────────
async function processImage(inputPath, outputPath, context = {}) {
  const imageBuffer = fs.readFileSync(inputPath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(inputPath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  const orient = getImageOrientation(inputPath);

  const apiConfig = {
    responseModalities: ['TEXT', 'IMAGE'],
  };

  const prompt = buildRetouchPrompt(orient.needsConvert, {
    caption: context.caption || '',
    theme: context.theme || '',
    hook: context.hook || '',
  });
  if (orient.needsConvert) {
    apiConfig.imageConfig = { aspectRatio: '3:4' };
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    ],
    config: apiConfig,
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      const rawBuffer = Buffer.from(part.inlineData.data, 'base64');
      let outputBuffer;
      try {
        outputBuffer = await encodePng8Bit(rawBuffer);
      } catch (e) {
        console.log(`    ⚠ 8bit PNG 正規化に失敗（そのまま保存）: ${e.message}`);
        outputBuffer = rawBuffer;
      }
      fs.writeFileSync(outputPath, outputBuffer);
      const mode = orient.isPortrait ? 'portrait' : orient.isSquareish ? 'square→3:4' : 'landscape→3:4';
      return { path: outputPath, sizeKB: Math.round(outputBuffer.length / 1024), mode };
    }
  }
  return null;
}

// ─── Notionステータス更新 ────────────────────────────────────────
async function updateNotionStatus(pageId, status, generatedPaths) {
  const props = {
    'ステータス': { select: { name: status } },
  };

  if (generatedPaths && generatedPaths.length > 0) {
    const pathsText = generatedPaths.map((p, i) => `${i + 1}. ${p}`).join('\n');
    props['メモ'] = {
      rich_text: [{ text: { content: `AI生成画像:\n${pathsText}` } }],
    };
  }

  await notion.pages.update({ page_id: pageId, properties: props });
}

// ─── メイン処理 ──────────────────────────────────────────────────
async function main() {
  if (REGENERATE && !FROM_DATE) {
    console.error('エラー: --regenerate には --from-date YYYY-MM-DD が必要です。');
    process.exit(1);
  }

  console.log('\n=== content-prepare.js ===');
  console.log(`モード: ${DRY_RUN ? 'DRY RUN（プレビューのみ）' : '本番実行'}`);
  if (CLIENT_FILTER) console.log(`クライアント: ${CLIENT_FILTER}`);
  console.log(`最大処理数: ${MAX_POSTS}\n`);
  if (FROM_DATE || TO_DATE) {
    const lo = FROM_DATE || '(指定なし)';
    const hi = TO_DATE || '(指定なし)';
    console.log(`投稿日フィルタ: ${lo} 〜 ${hi}`);
  }
  if (REGENERATE) console.log('再生成モード: 企画中 / 生成待ち / AI生成済み / CEO確認待ち / 承認済み（投稿済みは除外）');

  // 1. Notionから対象投稿を取得（ページネーション）
  let filter;
  if (REGENERATE && FROM_DATE) {
    filter = {
      and: [
        { property: '投稿日', date: { on_or_after: FROM_DATE } },
        ...(TO_DATE ? [{ property: '投稿日', date: { on_or_before: TO_DATE } }] : []),
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
    };
  } else {
    filter = {
      and: [{ property: 'ステータス', select: { equals: '企画中' } }],
    };
    if (FROM_DATE) {
      filter.and.push({ property: '投稿日', date: { on_or_after: FROM_DATE } });
    }
    if (TO_DATE) {
      filter.and.push({ property: '投稿日', date: { on_or_before: TO_DATE } });
    }
  }
  if (CLIENT_FILTER) {
    filter.and.push({ property: 'クライアント', select: { equals: CLIENT_FILTER } });
  }

  const posts = [];
  let cursor;
  do {
    const res = await queryContentDataSource({
      filter,
      sorts: [{ property: '投稿日', direction: 'ascending' }],
      page_size: 100,
      start_cursor: cursor,
    });
    posts.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  const limited = posts.slice(0, MAX_POSTS);
  console.log(`📋 対象投稿: ${limited.length}件\n`);

  if (limited.length === 0) {
    console.log('処理する投稿がありません。');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const page of limited) {
    const p = page.properties;
    const clientName = p['クライアント']?.select?.name || '';
    const theme = p['テーマカテゴリ']?.select?.name || '';
    const postDate = p['投稿日']?.date?.start || '';
    const hook = p['フック（冒頭3秒）']?.rich_text?.[0]?.plain_text || '';
    const caption = p['キャプション']?.rich_text?.[0]?.plain_text || '';

    console.log(`─────────────────────────────────────`);
    console.log(`📅 ${postDate} | ${clientName} | ${theme}`);
    console.log(`🎣 ${hook.substring(0, 50)}`);

    const config = MATERIAL_CONFIG[clientName];
    if (!config) {
      console.log(`  ⚠ クライアント "${clientName}" の設定が見つかりません。スキップ。`);
      failCount++;
      continue;
    }

    // 2. Notion「素材チェックリスト」から画像パスを取得（content-calendar.js の指示に従う）
    const checklist = p['素材チェックリスト']?.rich_text?.[0]?.plain_text || '';
    const imageSources = parseChecklistForImages(checklist, config.basePath);

    if (imageSources.length === 0) {
      console.log(`  ⚠ テーマ "${theme}" の素材マッピングが見つかりません。スキップ。`);
      failCount++;
      continue;
    }

    console.log(`  📂 選定素材:`);
    for (const src of imageSources) {
      const exists = fs.existsSync(src.filePath);
      console.log(`    ${exists ? '✓' : '✗'} ${path.basename(src.filePath)} (${src.category})`);
    }

    if (DRY_RUN) {
      console.log(`  🔍 DRY RUN: 画像生成をスキップ`);
      successCount++;
      continue;
    }

    // 3. 出力ディレクトリ作成
    const outputDir = config.outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 4. 各画像をGemini APIでリタッチ
    const generatedPaths = [];

    for (let i = 0; i < imageSources.length; i++) {
      const src = imageSources[i];
      if (!fs.existsSync(src.filePath)) {
        console.log(`    ✗ ファイルが見つかりません: ${src.filePath}`);
        continue;
      }

      const dateTag = postDate.replace(/-/g, '');
      const outputFileName = `${dateTag}_${theme.replace(/[・★]/g, '_')}_${i + 1}.png`;
      const outputPath = path.join(outputDir, outputFileName);

      const orient = getImageOrientation(src.filePath);
      const modeLabel = orient.isPortrait ? '縦→リタッチ' : orient.isSquareish ? '正方形→3:4+引き' : '横→3:4+引き';
      console.log(`  🎨 [${i + 1}/${imageSources.length}] ${path.basename(src.filePath)} (${orient.width}x${orient.height} ${modeLabel}) → Gemini...`);

      try {
        const result = await processImage(src.filePath, outputPath, {
          caption,
          theme,
          hook,
        });
        if (result) {
          console.log(`    ✅ ${path.basename(result.path)} (${result.sizeKB} KB, ${result.mode})`);
          generatedPaths.push(result.path);
        } else {
          console.log(`    ⚠ 画像が返されませんでした`);
        }
      } catch (err) {
        console.log(`    ❌ エラー: ${err.message}`);
      }

      // APIレート制限回避: 2秒待機
      if (i < imageSources.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // 5. Notionステータス更新
    if (generatedPaths.length > 0) {
      try {
        await updateNotionStatus(page.id, 'AI生成済み', generatedPaths);
        console.log(`  📝 Notion更新: ステータス → AI生成済み`);
        successCount++;
      } catch (err) {
        console.log(`  ⚠ Notion更新失敗: ${err.message}`);
        successCount++;
      }
    } else {
      failCount++;
    }

    // 投稿間の待機
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`=== 完了 ===`);
  console.log(`成功: ${successCount} / 失敗: ${failCount} / 合計: ${limited.length}`);
  if (DRY_RUN) console.log('※ DRY RUNのため画像生成は行っていません');
  console.log(`\n→ Notion Content DB で確認してください`);
}

main().catch(err => {
  console.error('予期しないエラー:', err.message);
  process.exit(1);
});
