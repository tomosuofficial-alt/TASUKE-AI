// ============================================================
// TASUKE.AI — 意思決定ログDB に1行追加
// ============================================================
//   node decision-log.js "タイトル" [options]
//
//   --body "判断内容の本文"
//   --reason "判断した理由"
//   --choices "検討した選択肢"
//   --decision "最終決定の要約"
//   --ai "CFO/Claude"     （既定: CFO/Claude）
//   --priority 高|中|低   （既定: 中）
//   --date YYYY-MM-DD     （既定: 東京の今日）
//   --dry-run
//
// 環境変数: NOTION_TOKEN, NOTION_DECISION_LOG_DB_ID（省略時は CLAUDE 記載の既定）
// ============================================================

require('dotenv').config();
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DECISION_DB = process.env.NOTION_DECISION_LOG_DB_ID || '88e65c7c-6e3d-4dad-af74-6ad7f2fd2659';

const AI_OPTIONS = new Set(['CFO/Claude', 'CMO/ChatGPT', 'CTO/Cursor', 'COO/Gemini', 'CDO/Perplexity']);
const PRI_OPTIONS = new Set(['高', '中', '低']);

function dateKeyTokyo(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--body') opts.body = argv[++i] || '';
    else if (a === '--reason') opts.reason = argv[++i] || '';
    else if (a === '--choices') opts.choices = argv[++i] || '';
    else if (a === '--decision') opts.decision = argv[++i] || '';
    else if (a === '--ai') opts.ai = argv[++i] || '';
    else if (a === '--priority') opts.priority = argv[++i] || '';
    else if (a === '--date') opts.date = argv[++i] || '';
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('-')) throw new Error(`不明なオプション: ${a}`);
    else pos.push(a);
  }
  return { title: pos.join(' ').trim(), ...opts };
}

function rt(text) {
  const t = String(text || '').trim();
  if (!t) return { rich_text: [] };
  return { rich_text: [{ type: 'text', text: { content: t.slice(0, 1900) } }] };
}

async function main() {
  const raw = process.argv.slice(2).filter((x) => x !== '--');
  let parsed;
  try {
    parsed = parseArgs(raw);
  } catch (e) {
    console.error('✗', e.message);
    process.exit(1);
  }

  if (!parsed.title) {
    console.error('使い方: node decision-log.js "タイトル" [--body ...] [--ai CFO/Claude] [--priority 中] [--dry-run]');
    process.exit(1);
  }

  if (!process.env.NOTION_TOKEN) {
    console.error('✗ NOTION_TOKEN が未設定です');
    process.exit(1);
  }

  const ai = AI_OPTIONS.has(parsed.ai) ? parsed.ai : 'CFO/Claude';
  const priority = PRI_OPTIONS.has(parsed.priority) ? parsed.priority : '中';
  const dateStr = parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : dateKeyTokyo();
  const body = parsed.body || parsed.title;

  const properties = {
    タイトル: { title: [{ text: { content: parsed.title.slice(0, 1900) } }] },
    日付: { date: { start: dateStr } },
    担当AI: { select: { name: ai } },
    重要度: { select: { name: priority } },
    判断内容: rt(body),
  };
  if (parsed.reason) properties['判断した理由'] = rt(parsed.reason);
  if (parsed.choices) properties['選択肢'] = rt(parsed.choices);
  if (parsed.decision) properties['最終決定'] = rt(parsed.decision);

  if (parsed.dryRun) {
    console.log('(--dry-run)', JSON.stringify({ properties }, null, 2));
    return;
  }

  await notion.pages.create({
    parent: { database_id: DECISION_DB },
    properties,
  });
  console.log(`✓ 意思決定ログDB に追加: ${parsed.title}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
