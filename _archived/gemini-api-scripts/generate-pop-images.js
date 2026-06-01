#!/usr/bin/env node
// Niki★DINER ポイントカードPOP用 画像一括生成
// 使い方: node generate-pop-images.js

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const OUTPUT_DIR = '/Volumes/Home_Mac_SSD/01_Projects/Niki_Diner/02_Creative/05_POP/images';

const PROMPTS = [
  {
    id: 'A',
    name: 'burger_hero',
    label: 'A. バーガーヒーローショット',
    prompt: `A dramatic close-up of a gourmet American diner burger,
towering with juicy beef patty, melted cheddar cheese, crispy lettuce,
tomato, and pickles, sesame seed bun,
dark moody studio lighting with warm orange backlight,
shallow depth of field, food photography style,
dark navy blue background,
high contrast, appetizing, cinematic, 8K`,
    aspectRatio: '3:4',
  },
  {
    id: 'B',
    name: 'diner_illustration',
    label: 'B. アメリカンダイナー背景イラスト',
    prompt: `Retro American diner illustration, vintage 1950s style,
neon signs, checkerboard floor, red vinyl stools, jukebox,
flat vector art, bold colors: deep navy blue, red, orange, cyan,
no people, clean graphic design asset,
isolated on dark navy background`,
    aspectRatio: '3:4',
  },
  {
    id: 'C',
    name: 'stamp_icon',
    label: 'C. バーガースタンプアイコン',
    prompt: `A simple bold icon of a hamburger,
thick outline style, flat design, monochrome white on black background,
minimal, stamp-like, circular composition,
suitable for rubber stamp,
vector illustration style,
no text, clean edges`,
    aspectRatio: '1:1',
  },
  {
    id: 'D',
    name: 'pop_reference',
    label: 'D. POPビジュアル参考',
    prompt: `A5 portrait promotional sign for a Japanese American burger restaurant,
point card loyalty program announcement poster,
dark navy blue background, red and orange accent colors,
bold retro typography, stamp boxes row at bottom,
reward tier cards showing 3 / 5 / 10 stamps,
clean graphic design, professional print design,
American diner theme`,
    aspectRatio: '3:4',
  },
];

async function generateImage(item) {
  console.log(`\n[${item.id}] ${item.label} 生成中...`);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{ role: 'user', parts: [{ text: item.prompt }] }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: item.aspectRatio },
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const ext = part.inlineData.mimeType === 'image/png' ? '.png' : '.jpg';
        const filename = `niki_pop_${item.name}${ext}`;
        const outputPath = path.join(OUTPUT_DIR, filename);
        const buffer = Buffer.from(part.inlineData.data, 'base64');
        fs.writeFileSync(outputPath, buffer);
        console.log(`  ✅ 保存: ${outputPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
        return { success: true, path: outputPath };
      }
      if (part.text) {
        console.log(`  AIコメント: ${part.text}`);
      }
    }
    console.log(`  ⚠️ 画像が返されませんでした`);
    return { success: false };
  } catch (err) {
    console.error(`  ❌ エラー: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('=== Niki★DINER ポイントカードPOP 画像一括生成 ===');

  if (!process.env.GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY が未設定です。');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`出力ディレクトリ作成: ${OUTPUT_DIR}`);
  }

  const results = [];
  for (const item of PROMPTS) {
    const result = await generateImage(item);
    results.push({ ...item, ...result });
    // API制限を避けるため少し待機
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== 完了サマリー ===');
  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} [${r.id}] ${r.label}${r.path ? ` → ${path.basename(r.path)}` : ''}`);
  }
}

main();
