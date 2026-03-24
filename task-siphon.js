/**
 * 会話ログ・メモから「把握漏れしやすいタスク・フォロー・未確定」を Gemini で吸い出す。
 *
 * 使い方:
 *   運用は「line-imports/ に .txt を入れる → npm run line:ingest」一括推奨
 *   1 ファイルだけなら: npm run task:siphon -- line-imports/会話の名前.txt
 *   pbpaste | node task-siphon.js
 *   node task-siphon.js path/to/memo.txt
 *   npm run task:siphon -- line-imports/foo.txt --notion   … 結果を Notion LINE取り込みDBへ転記
 *
 * 環境変数:
 *   GEMINI_API_KEY（必須）
 *   TASK_SIPHON_MODEL 既定 gemini-2.5-flash
 *   TASK_SIPHON_MAX_CHARS 既定 120000（超えたら先頭だけ処理）
 *   --notion 時: NOTION_TOKEN, NOTION_LINE_INBOX_DB_ID（任意 NOTION_LINE_INBOX_DATE_PROP）
 *   タスク行: NOTION_TASKS_DB_ID（npm run notion:create-tasks-db）… 吸い出しJSONから 1 タスク 1 行。重複は出所+タイトルでスキップ（NOTION_TASKS_DEDUP=0 で無効化）
 *
 * 注意: LINE 全文はリポジトリにコミットしないこと。ローカルや一時ファイルで実行。
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const MODEL = process.env.TASK_SIPHON_MODEL || 'gemini-2.5-flash';
const MAX_CHARS = Math.min(
  500000,
  Math.max(5000, parseInt(process.env.TASK_SIPHON_MAX_CHARS || '120000', 10) || 120000),
);

const SYSTEM_INSTRUCTION = `あなたは業務アシスタント。入力はコンサル／飲食支援の現場の会話ログ・メモ・転記テキストです。
ユーザーは受託側の代表（大内さん）です。

次を行い、**JSON オブジェクト 1 つだけ**を返してください（前後に説明文やコードフェンスを付けない）。

目的:
1. **ユーザーが把握しきれていない／見落としやすい**フォロー・タスク・確認事項を洗い出す。
2. 明示依頼（「お願い」「〜してください」「確認」等）に加え、**言外で必要そうな次アクション**も candidate に含める。
3. 既に完了したように読めるものは除く。曖昧なら残して kind を follow_up や decision_needed にする。

出力キー（すべて必須。配列は空可）:
- overlooked_or_implicit: 配列。要素は {
    "title": "短いタスク名",
    "kind": "task" | "follow_up" | "decision_needed",
    "urgency": "high" | "medium" | "low" | "unknown",
    "who_should_act": "自分" | "相手" | "双方" | "unknown",
    "deadline_note": "日付や期限の言及があれば文字列、なければ null",
    "client_hint": "よいどころ千福 / M'z cafe / Niki★DINER / TOMOSU. / 外部 など推測できる場合。なければ null",
    "evidence": "根拠となる原文の抜粋（60文字以内）"
  }
- blockers_or_unclear: 配列。要素は { "issue": "string", "why_unclear": "string" }
- summary_for_user: ユーザー向け3行以内の総括（日本語）

個人名は入力に含まれる場合のみ使い、推測で新しい固有名詞を作らない。

重要: 返す JSON は**必ず完結**させること（途中で切れないこと）。overlooked_or_implicit は多くても**8件まで**にし、evidence は**必ず40文字以内**（長い会話は要約）。summary_for_user は2行以内。`;

const SYSTEM_RETRY_SUFFIX = `

【再試行モード】前回は JSON が途中で切れました。今度は必ず完結させてください。
overlooked_or_implicit は**最大5件**、evidence は**30文字以内**、summary_for_user は2行。blockers は最大3件。`;

function readInput(argv) {
  const arg = argv[0];
  if (!arg || arg === '-') {
    try {
      return fs.readFileSync(0, 'utf-8');
    } catch {
      console.error('✗ 標準入力が空です。ファイルパスを渡すかパイプで入力してください。');
      process.exit(1);
    }
  }
  const p = path.resolve(arg);
  if (!fs.existsSync(p)) {
    console.error('✗ ファイルがありません:', p);
    process.exit(1);
  }
  return fs.readFileSync(p, 'utf-8');
}

function stripJsonFence(s) {
  let t = String(s || '').trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (m) t = m[1].trim();
  return t;
}

function parseJsonSafe(raw) {
  const t = stripJsonFence(raw);
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(t.slice(start, end + 1));
    }
    throw new Error('JSON として解釈できませんでした');
  }
}

function formatMarkdownReport(data) {
  const lines = [];
  lines.push('# タスク吸い出し（把握漏れチェック）', '');
  lines.push('## 総括', '', (data.summary_for_user || '（なし）').trim(), '');

  const items = data.overlooked_or_implicit || [];
  lines.push(`## 見落としやすいフォロー・タスク（${items.length}件）`, '');
  if (items.length === 0) {
    lines.push('（該当なし）', '');
  } else {
    for (let i = 0; i < items.length; i++) {
      const x = items[i];
      lines.push(`### ${i + 1}. ${x.title || '（無題）'}`);
      lines.push(`- **種別**: ${x.kind || '-'} ｜ **緊急度**: ${x.urgency || '-'} ｜ **動くべき相手**: ${x.who_should_act || '-'}`);
      if (x.client_hint) lines.push(`- **クライアント候補**: ${x.client_hint}`);
      if (x.deadline_note) lines.push(`- **期限メモ**: ${x.deadline_note}`);
      lines.push(`- **根拠**: ${x.evidence || '（なし）'}`);
      lines.push('');
    }
  }

  const blk = data.blockers_or_unclear || [];
  lines.push(`## ブロッカー・不明点（${blk.length}件）`, '');
  if (blk.length === 0) {
    lines.push('（該当なし）', '');
  } else {
    blk.forEach((b, i) => {
      lines.push(`- **${i + 1}.** ${b.issue || ''} — *なぜ不明か*: ${b.why_unclear || ''}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

function parseArgs(argv) {
  const wantJson = argv.includes('--json');
  const wantNotion = argv.includes('--notion');
  const rest = argv.filter((a) => a !== '--json' && a !== '--notion' && a !== '--');
  return { wantJson, wantNotion, fileArg: rest[0] };
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const { wantJson, wantNotion, fileArg } = parseArgs(rawArgv);
  if (!process.env.GEMINI_API_KEY) {
    console.error('✗ GEMINI_API_KEY が .env にありません');
    process.exit(1);
  }

  let text = readInput(fileArg ? [fileArg] : []);
  if (!text.trim()) {
    console.error('✗ 入力テキストが空です');
    process.exit(1);
  }
  if (text.length > MAX_CHARS) {
    console.error(`⚠ 入力 ${text.length} 文字 → 先頭 ${MAX_CHARS} 文字のみ処理します（TASK_SIPHON_MAX_CHARS で変更可）`);
    text = text.slice(0, MAX_CHARS);
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const userPrompt =
    '以下のテキストを分析してください。\n\n---\n' + text + '\n---';

  const maxTok = parseInt(process.env.TASK_SIPHON_MAX_TOKENS || '32768', 10) || 32768;

  let data;
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const sys = attempt === 0 ? SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION + SYSTEM_RETRY_SUFFIX;
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: sys,
        temperature: attempt === 0 ? 0.2 : 0.1,
        maxOutputTokens: maxTok,
        responseMimeType: 'application/json',
      },
    });
    raw = response.text || '';
    try {
      data = parseJsonSafe(raw);
      if (attempt === 1) console.error('⚠ 再試行で JSON 解析に成功しました');
      break;
    } catch (e) {
      if (attempt === 0) {
        console.error('⚠ JSON 解析失敗 → 件数を絞って再試行します…', e.message);
        continue;
      }
      console.error('✗ モデル応答の解析失敗:', e.message);
      console.error('--- raw ---\n', raw.slice(0, 2000));
      process.exit(1);
    }
  }

  const md = formatMarkdownReport(data);
  console.log(md);

  const sourceLabel = fileArg ? path.basename(fileArg) : 'stdin';
  if (process.env.NOTION_TASKS_DB_ID) {
    try {
      const { appendTasksFromSiphonData } = require('./scripts/lib/notion-append-siphon-tasks.js');
      const { created, skipped } = await appendTasksFromSiphonData(data, { sourceLabel });
      if (created > 0 || skipped > 0) {
        console.error(`\n✓ タスクDB: 新規 ${created} 件、同一出所・同名でスキップ ${skipped} 件`);
      }
    } catch (e) {
      console.error('\n⚠ タスクDB:', e.message);
    }
  }

  if (wantJson) {
    console.log('\n--- JSON ---\n');
    console.log(JSON.stringify(data, null, 2));
  }

  if (wantNotion) {
    const { saveSiphonReportToLineInbox } = require('./scripts/lib/notion-line-inbox-save-siphon.js');
    try {
      const url = await saveSiphonReportToLineInbox({ markdown: md, sourceLabel: sourceLabel });
      console.error(`\n✓ Notion に転記しました: ${url}`);
    } catch (e) {
      console.error('\n✗ Notion 転記エラー:', e.message);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
