#!/usr/bin/env node
// Gemini API 画像加工テスト
// 使い方: node test-gemini-image.js

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/** DaVinci 等向け: 8bit sRGB PNG に正規化（Gemini は 10bit PNG を返すことがある） */
async function encodePng8Bit(inputBuffer) {
  return sharp(inputBuffer)
    .toColorspace('srgb')
    .png({ compressionLevel: 9, effort: 8 })
    .toBuffer();
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const INPUT_IMAGE = '/Volumes/Home_Mac_SSD/01_Projects/Niki_Diner/03_Material/02_Photos/10_Menu_Photos_Edit/2_Niki_burgers/nikidiner_00004.jpg';
const OUTPUT_DIR = '/Volumes/Home_Mac_SSD/01_Projects/Mz_cafe/03_Material/02_Photos/04_AI_Generated';

async function main() {
  console.log('=== Gemini API 画像加工テスト ===');

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'ここにAPIキーを貼る') {
    console.error('ERROR: GEMINI_API_KEY が未設定です。.env を確認してください。');
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_IMAGE)) {
    console.error(`ERROR: 入力画像が見つかりません: ${INPUT_IMAGE}`);
    process.exit(1);
  }

  console.log(`入力画像: ${path.basename(INPUT_IMAGE)}`);

  const imageBuffer = fs.readFileSync(INPUT_IMAGE);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  const prompt = 'Retouch this food photo like a professional photographer. Enhance color grading with warm tones. Add shallow depth-of-field bokeh effect to the background. Boost saturation on the food to create a sizzle/appetizing feel. Do NOT change the composition, do NOT add or remove any objects, do NOT change the background. Keep the original scene exactly as-is. Only adjust lighting, color, and focus. Output must look like a high-end DSLR photo with professional color grading.';

  console.log(`プロンプト: ${prompt}`);
  console.log('Aspect ratio: 指定なし（元画像の比率を維持）');
  console.log('Gemini API に送信中...');

  try {
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
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          aspectRatio: '3:4',
        },
      },
    });

    let imageFound = false;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        const outputExt = part.inlineData.mimeType === 'image/png' ? '.png' : '.jpg';
        const outputPath = path.join(OUTPUT_DIR, `gemini_test_output${outputExt}`);
        const rawBuffer = Buffer.from(part.inlineData.data, 'base64');
        const outputBuffer =
          outputExt === '.png' ? await encodePng8Bit(rawBuffer) : rawBuffer;
        fs.writeFileSync(outputPath, outputBuffer);
        console.log(`\n✅ 画像生成成功！`);
        console.log(`出力: ${outputPath}`);
        console.log(`サイズ: ${(outputBuffer.length / 1024).toFixed(0)} KB`);
        imageFound = true;
      }
      if (part.text) {
        console.log(`\nAIコメント: ${part.text}`);
      }
    }

    if (!imageFound) {
      console.log('\n⚠️ 画像が返されませんでした。テキストのみの応答:');
      console.log(JSON.stringify(response.candidates[0].content.parts, null, 2));
    }
  } catch (err) {
    console.error('\n❌ エラー:', err.message);
    if (err.message.includes('API key')) {
      console.error('→ APIキーを確認してください');
    }
    if (err.message.includes('model')) {
      console.error('→ モデル名を確認してください。Google AI Proプランが必要です');
    }
  }
}

main();
