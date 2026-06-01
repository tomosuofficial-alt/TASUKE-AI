/**
 * よいどころ千福のLINE5ファイルから「相談用 圧縮背景（千福ブリーフィング）」を生成する。
 *
 *   node scripts/senpuku-context-build.js
 *
 * 2段階圧縮:
 *   Stage 1: 各ファイルを「テーマ別の現状・経緯・千福の声」に中間要約（全文をGeminiが読む）
 *   Stage 2: 5本の中間要約を統合し、重複排除・整理して最終ブリーフィングに仕上げ
 *
 * 出力: docs/senpuku-context.md（= 相談時にClaudeが読む圧縮背景。フルログは読まない）
 *
 * 環境変数:
 *   （Claude Code CLI のサブスク認証を使用。追加APIキーは不要）
 *   SENPUKU_CONTEXT_MODEL（既定 sonnet。alias または full name）
 *
 * 注意: 出力はLINE個人情報の要約を含む。git にはコミットしない（.gitignore 推奨）。
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { runClaude } = require('./lib/claude-cli.js');

const MODEL = process.env.SENPUKU_CONTEXT_MODEL || 'sonnet';
const ROOT = path.join(__dirname, '..');
const LINE_DIR = path.join(ROOT, 'line-imports');
const OUT = path.join(ROOT, 'docs', 'senpuku-context.md');

// 千福関連の5ファイル（NFC正規化して実ファイルと突き合わせる）
const WANT = [
  '[LINE]浅見千福.txt',
  '[LINE]千福定例ミーティング.txt',
  '[LINE]千福コンサルグループ.txt',
  '[LINE]小野川 達矢.txt',
  '[LINE]井上寛大.txt',
].map((s) => s.normalize('NFC'));

const STAGE1_SYS = `あなたは飲食店支援コンサル「TASUKE.AI（代表 大内さん）」の業務アシスタントです。
入力は支援先「よいどころ千福」に関するLINEトーク全文（受託側=大内さん視点）。
このトークから、後で大内さんの"相談相手AI"が千福の文脈を把握するための【中間メモ】を Markdown で作ってください。

含めるもの:
- 登場人物と役割（断定できない場合は「推測」と明記）
- テーマ別の現状・これまでの経緯・未解決の論点。テーマ例:
  経営/数値・店舗オペレーション・メニュー・人材/育成・システム(スマレジ/PAYGATE等)・設備/備品・その他
- 千福側のキー発言（短い引用＋話者＋日付があれば）
- 温度感、センシティブな点（地雷になりそうな話題）

ルール: 事実に忠実に。トークにないことは創作しない。日付はトーク内の表記をそのまま使う。
冗長な逐語起こしにせず、後で統合しやすい密度に圧縮する。`;

const STAGE2_SYS = `あなたは「TASUKE.AI（代表 大内さん）」の相談相手AIのための背景資料を編集するエディタです。
入力は支援先「よいどころ千福」に関する複数の中間メモ。
これらを統合・圧縮し、ひとつの【千福ブリーフィング】に仕上げてください。

目的: これを読んだAIが、千福の課題相談に"千福の文脈を踏まえて多角的に"答えられる最小限の背景を持てること。
深い細部は別途「原文検索」で補う前提なので、ここでは"幹"だけを簡潔に書く。

構成（この見出しで Markdown 出力。前置き・締めの挨拶は不要）:
# 千福ブリーフィング（相談用・背景）
## 1. 基本プロフィール
- 業態・規模感、TASUKE.AI（大内さん）の立ち位置・支援範囲（数行）
## 2. 関係者マップ
- 代表=浅見千福。主要スタッフ（小野川達矢・井上寛大ほか）を1人1〜2行で役割と特性
## 3. テーマ別の現状と論点
- 経営/数値・店舗オペレーション・メニュー・人材/育成・システム・設備/備品 ごとに
  「現状と核心的な論点」を2〜4行。代表のスタンスが分かるキー発言を最大1つ（話者・日付付き）
## 4. 進行中の重要事項
- 締切感・優先度の高いものを箇条書き
## 5. 千福の価値観・社風・代表のスタンス（数行）
## 6. 相談時の注意点
- センシティブ・地雷になりやすい話題、配慮すべき関係性を箇条書き

厳守事項:
- 事実に忠実、創作しない。相談に効く"理解"を書く（単なる列挙にしない）。
- 全体で約6,000字（多くても8,000字）に圧縮する。冗長な逐語列挙はしない。
- 必ず 1〜6章すべてを最後まで書き切る（途中で終わらせない）。
- 【不問】金銭に関する過去の問題（金銭事故・窃盗・横領・弁護士介入等）は解決済みのため、ブリーフィングに一切含めないこと（当事者間で「今後触れない」と合意済み）。`;

function resolveFiles() {
  if (!fs.existsSync(LINE_DIR)) {
    throw new Error(`line-imports/ が見つかりません: ${LINE_DIR}`);
  }
  const actual = fs.readdirSync(LINE_DIR);
  const byNfc = new Map(actual.map((n) => [n.normalize('NFC'), n]));
  const resolved = [];
  for (const w of WANT) {
    const real = byNfc.get(w);
    if (!real) {
      console.error(`⚠ 見つからない: ${w}`);
      continue;
    }
    resolved.push({ label: w, fullPath: path.join(LINE_DIR, real) });
  }
  return resolved;
}

async function gen(sys, userText) {
  const { result } = await runClaude({
    prompt: userText,
    systemPrompt: sys,
    model: MODEL,
  });
  return result || '';
}

async function main() {
  const files = resolveFiles();
  if (files.length === 0) {
    console.error('✗ 対象ファイルが1つもありません');
    process.exit(1);
  }

  // ── Stage 1: 各ファイル → 中間メモ ──
  console.error(`Stage 1: 各ファイルを中間要約（${files.length}ファイル）`);
  const intermediates = [];
  for (const f of files) {
    const raw = fs.readFileSync(f.fullPath, 'utf-8');
    console.error(`  ・${f.label}（${raw.length.toLocaleString()}字）→ Claude…`);
    const userText = `クライアント: よいどころ千福\nソース: ${f.label}\n\n--- LINEトーク全文 ---\n${raw}\n--- ここまで ---`;
    const memo = await gen(STAGE1_SYS, userText);
    if (!memo.trim()) {
      console.error(`    ⚠ 空の応答（スキップ）`);
      continue;
    }
    intermediates.push(`## 中間メモ: ${f.label}\n\n${memo.trim()}`);
  }
  if (intermediates.length === 0) {
    console.error('✗ 中間メモが1つも生成できませんでした');
    process.exit(1);
  }

  // ── Stage 2: 統合 → 最終ブリーフィング ──
  console.error(`\nStage 2: ${intermediates.length}本を統合して千福ブリーフィングへ…`);
  const combined = intermediates.join('\n\n---\n\n');
  const final = await gen(STAGE2_SYS, combined);
  if (!final.trim()) {
    console.error('✗ 統合結果が空でした');
    process.exit(1);
  }

  const header = [
    '<!--',
    '  千福ブリーフィング（相談用・圧縮背景）',
    '  生成: scripts/senpuku-context-build.js（Claude ' + MODEL + '）',
    '  元データ: line-imports/ の千福5ファイル',
    '  ⚠ LINE個人情報の要約を含む。git にコミットしないこと。',
    '  更新方法: 千福LINEを取り込み直したら、このスクリプトを再実行。',
    '-->',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, header + final.trim() + '\n', 'utf-8');
  console.error('');
  console.log(`✓ 生成完了: ${path.relative(ROOT, OUT)}`);
  console.log(`  最終ブリーフィング ${final.trim().length.toLocaleString()} 字`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
