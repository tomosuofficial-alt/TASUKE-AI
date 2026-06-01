/**
 * よいどころ千福の定例ミーティング議事録（Notionアーカイブ）を圧縮して
 * 「議事録ダイジェスト（相談用・背景）」を生成する。
 *
 *   node scripts/senpuku-meetings-build.js
 *
 * フロー:
 *   1. 議事録アーカイブ配下の子ページ（各議事録）を列挙
 *   2. 各議事録の本文を Notion API で取得しテキスト化（私=Claudeのコンテキストには載せない）
 *   3. 日付順に結合 → Gemini で1回圧縮 → ダイジェスト生成
 *
 * 出力: docs/senpuku-meetings.md（相談時にClaudeが読む。個々の議事録は読まない）
 *
 * 環境変数: NOTION_TOKEN（必須）, SENPUKU_CONTEXT_MODEL（既定 sonnet。alias可）
 * 注意: 出力はLINE/会議の個人情報の要約を含む。git にコミットしない（.gitignore 済み）。
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');
const { runClaude } = require('./lib/claude-cli.js');

const MODEL = process.env.SENPUKU_CONTEXT_MODEL || 'sonnet';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'senpuku-meetings.md');
const ARCHIVE_ID = '3529fe8c-3a7f-8131-a3ab-fb719d756f55'; // 議事録アーカイブページ

const MEETINGS_SYS = `あなたは飲食店支援コンサル「TASUKE.AI（大内さん）」の相談相手AIのための背景資料を編集するエディタです。
入力は支援先「よいどころ千福」の月初定例ミーティング議事録（2024年10月〜2026年5月、時系列）。
これらを通読し、相談相手AIが"会議の経緯"を把握するための【議事録ダイジェスト】を Markdown で作ってください。

目的: 個々の議事録を毎回読まなくても、AIが「これまでの流れ・繰り返す論点・決定の履歴・常習的な未達」を踏まえて相談に乗れること。

構成（この見出しで Markdown 出力。前置き・締めの挨拶は不要）:
# 千福 定例ミーティング ダイジェスト（相談用・背景）
## 1. 通史
- 四半期ごとに、その時期の主題と転換点を数行で
## 2. 繰り返し戻ってくる論点
- 何度も議題に上る＝根深い課題。いつ頃から続いているかを添える
## 3. 常習的な未達項目
- 毎回❌が続くアクション（例: 朝礼・ロス報告など）。初出時期と繰り返し回数の目安
## 4. 主要な決定事項の履歴
- いつ何を決めたか。決定が覆った/形骸化したものは明記
## 5. 数値・業績のトレンド
- 売上・客数・組数など、議事録から追える範囲で
## 6. 現在進行中の主要プロジェクトの経緯
- 法人化・スマレジ・顧客カルテ・採用・2号店・経営理念 など

厳守事項:
- 事実に忠実、創作しない。日付は議事録の表記を使う。
- 全体で約5,000〜7,000字に圧縮。冗長な逐語列挙はしない。
- 「繰り返し」「常習未達」は具体的に（いつから・何回くらい）。
- 必ず 1〜6章すべてを最後まで書き切る。
- 【不問】金銭に関する過去の問題（金銭事故・窃盗・横領・弁護士介入等）は解決済みのため、ダイジェストに一切含めないこと（当事者間で「今後触れない」と合意済み）。`;

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Notion API のレート制限（公称 約3 req/s）に配慮した throttle
let lastCall = 0;
async function listChildren(blockId, cursor) {
  const wait = Math.max(0, 340 - (Date.now() - lastCall));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  return notion.blocks.children.list({ block_id: blockId, page_size: 100, start_cursor: cursor });
}

const rt = (arr) => (arr || []).map((t) => t.plain_text).join('');

async function blocksToText(blockId, depth = 0) {
  let out = '';
  let cursor;
  do {
    const res = await listChildren(blockId, cursor);
    for (const b of res.results) {
      const t = b.type;
      const d = b[t] || {};
      const indent = '  '.repeat(depth);
      switch (t) {
        case 'heading_1': out += `\n# ${rt(d.rich_text)}\n`; break;
        case 'heading_2': out += `\n## ${rt(d.rich_text)}\n`; break;
        case 'heading_3': out += `\n### ${rt(d.rich_text)}\n`; break;
        case 'paragraph': { const s = rt(d.rich_text); if (s) out += `${indent}${s}\n`; break; }
        case 'bulleted_list_item': out += `${indent}- ${rt(d.rich_text)}\n`; break;
        case 'numbered_list_item': out += `${indent}1. ${rt(d.rich_text)}\n`; break;
        case 'to_do': out += `${indent}- [${d.checked ? 'x' : ' '}] ${rt(d.rich_text)}\n`; break;
        case 'quote': out += `${indent}> ${rt(d.rich_text)}\n`; break;
        case 'callout': out += `${indent}> ${rt(d.rich_text)}\n`; break;
        case 'toggle': out += `${indent}- ${rt(d.rich_text)}\n`; break;
        case 'table_row': out += `${indent}| ${(d.cells || []).map((c) => rt(c)).join(' | ')} |\n`; break;
        case 'divider': out += `${indent}---\n`; break;
        case 'child_page': out += `${indent}[子ページ: ${d.title}]\n`; break;
        default: { const s = rt(d.rich_text); if (s) out += `${indent}${s}\n`; }
      }
      if (b.has_children && t !== 'child_page') {
        out += await blocksToText(b.id, depth + 1);
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function listMeetingPages(parentId) {
  const pages = [];
  let cursor;
  do {
    const res = await listChildren(parentId, cursor);
    for (const b of res.results) {
      if (b.type === 'child_page') pages.push({ id: b.id, title: b.child_page.title });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function parseDate(title) {
  const m = String(title).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0;
}

async function gen(sys, userText) {
  const { result } = await runClaude({ prompt: userText, systemPrompt: sys, model: MODEL });
  return result || '';
}

async function main() {
  if (!process.env.NOTION_TOKEN) { console.error('✗ NOTION_TOKEN が .env にありません'); process.exit(1); }

  console.error('議事録アーカイブから子ページを列挙中…');
  const pages = await listMeetingPages(ARCHIVE_ID);
  pages.sort((a, b) => parseDate(a.title) - parseDate(b.title));
  if (pages.length === 0) { console.error('✗ 議事録が見つかりません'); process.exit(1); }
  console.error(`  ${pages.length} 本の議事録を検出`);

  let combined = '';
  let totalChars = 0;
  for (const p of pages) {
    process.stderr.write(`  ・取得: ${p.title} … `);
    const body = await blocksToText(p.id);
    totalChars += body.length;
    combined += `\n\n===== 議事録: ${p.title} =====\n${body}`;
    console.error(`${body.length.toLocaleString()}字`);
  }
  console.error(`\n合計 ${totalChars.toLocaleString()} 字 → Claude で圧縮…`);

  const digest = await gen(MEETINGS_SYS, combined);
  if (!digest.trim()) { console.error('✗ ダイジェストが空でした'); process.exit(1); }

  const header = [
    '<!--',
    '  千福 定例ミーティング ダイジェスト（相談用・背景）',
    '  生成: scripts/senpuku-meetings-build.js（Claude ' + MODEL + '）',
    `  元データ: Notion 議事録アーカイブ（${pages.length}本: ${pages[0].title} 〜 ${pages[pages.length - 1].title}）`,
    '  ⚠ 会議の個人情報の要約を含む。git にコミットしないこと。',
    '  更新方法: 新しい議事録がNotionに追加されたら、このスクリプトを再実行。',
    '-->',
    '',
  ].join('\n');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, header + digest.trim() + '\n', 'utf-8');
  console.error('');
  console.log(`✓ 生成完了: ${path.relative(ROOT, OUT)}`);
  console.log(`  議事録 ${pages.length}本（${totalChars.toLocaleString()}字）→ ダイジェスト ${digest.trim().length.toLocaleString()}字`);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
