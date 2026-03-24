#!/usr/bin/env node
/**
 * フォルダ内の PNG を 8bit sRGB に一括変換（DaVinci Resolve 向け）
 *
 * content-prepare.js の MATERIAL_CONFIG の outputDir と同期すること。
 *
 * 使い方（必ず TASUKE-AI プロジェクトルートで）:
 *   cd /path/to/TASUKE-AI
 *
 *   # AI生成フォルダをまとめて（Mz + Niki）
 *   node scripts/png-to-8bit.js --all
 *   npm run png:8bit:all
 *
 *   # 1フォルダだけ
 *   node scripts/png-to-8bit.js "/絶対パス/画像フォルダ"
 *   npm run png:8bit -- "/絶対パス/画像フォルダ"
 *
 *   # 複数フォルダ
 *   node scripts/png-to-8bit.js "/path/a" "/path/b"
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/** content-prepare.js の MATERIAL_CONFIG.*.outputDir と同じパス */
const DEFAULT_AI_OUTPUT_DIRS = [
  '/Volumes/Home_Mac_SSD/01_Projects/Mz_cafe/03_Material/02_Photos/04_AI_Generated',
  '/Volumes/Home_Mac_SSD/01_Projects/Niki_Diner/03_Material/02_Photos/04_AI_Generated',
];

const args = process.argv.slice(2).filter((a) => a !== '--');

async function convertOneDir(abs) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    console.error('スキップ（フォルダなし）:', abs);
    return { ok: 0, skip: 1 };
  }

  const files = fs.readdirSync(abs).filter((f) => f.toLowerCase().endsWith('.png'));
  if (files.length === 0) {
    console.log(`（PNG なし） ${abs}`);
    return { ok: 0, skip: 0 };
  }

  console.log(`\n── ${files.length} 件: ${abs}\n`);

  let ok = 0;
  for (const f of files) {
    const p = path.join(abs, f);
    try {
      const b = await sharp(fs.readFileSync(p))
        .toColorspace('srgb')
        .png({ compressionLevel: 9, effort: 8 })
        .toBuffer();
      fs.writeFileSync(p, b);
      console.log('OK', f);
      ok++;
    } catch (e) {
      console.error('NG', f, e.message);
    }
  }
  return { ok, skip: 0 };
}

function printHelp() {
  console.log(`
PNG → 8bit sRGB 一括変換（既存の Gemini 出力など）

  node scripts/png-to-8bit.js --all
  node scripts/png-to-8bit.js <フォルダ> [フォルダ ...]

  npm run png:8bit:all
  npm run png:8bit -- <フォルダ>

※ プロジェクトルートで実行（sharp は node_modules 内）
※ 今後 content-prepare で生成する PNG は保存時に自動で 8bit になります
`);
}

(async () => {
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  let dirs = [];
  if (args.includes('--all')) {
    dirs = [...DEFAULT_AI_OUTPUT_DIRS];
  } else if (args.length === 0) {
    printHelp();
    process.exit(1);
  } else {
    dirs = args.map((d) => path.resolve(d));
  }

  console.log('8bit sRGB PNG 変換を開始します…');
  let totalOk = 0;

  for (const abs of dirs) {
    const r = await convertOneDir(abs);
    totalOk += r.ok;
  }

  console.log(`\n完了（変換したファイル数: ${totalOk}）`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
