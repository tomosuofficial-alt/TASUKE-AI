/**
 * 定例会議のアクションを PDCA で追う「定例アクション追跡」Notion DB を作成し、
 * .env に NOTION_MEETING_ACTIONS_DB_ID を追記する（未設定時のみ）。
 *
 *   node scripts/notion-create-meeting-actions-db.js
 *   npm run notion:create-meeting-actions-db
 *
 * 設計仕様: docs/data-model-proposal-v1.md §5（spec §6 7分類・5段階達成度を反映）
 *           （旧設計: docs/pdca-meeting-loop.md §2 — 5分類は置換済）
 *
 * 環境変数:
 *   NOTION_TOKEN（必須）
 *   NOTION_MEETING_ACTIONS_PARENT_PAGE_ID（任意）… 未設定時は CLAUDE.md トップページID
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('@notionhq/client');

const DEFAULT_PARENT_PAGE = '3249fe8c3a7f80269c41ce55e14d4d79';
const ENV_KEY = 'NOTION_MEETING_ACTIONS_DB_ID';
const DB_NAME = '定例アクション追跡';

async function main() {
  // ── 1. トークンチェック ──────────────────────────────────────────
  if (!process.env.NOTION_TOKEN) {
    console.error('✗ NOTION_TOKEN が .env にありません');
    process.exit(1);
  }

  // ── 2. 冪等チェック：既に .env に DB ID があれば停止 ──────────────
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8');
    const re = new RegExp(`^\\s*${ENV_KEY}\\s*=\\s*([^\\s#]+)`, 'm');
    const m = existing.match(re);
    if (m) {
      console.log(`✓ 既に ${ENV_KEY} が .env にあります: ${m[1]}`);
      console.log('  再作成したい場合は .env から当該行を削除してから再実行してください。');
      process.exit(0);
    }
  }

  const parent = process.env.NOTION_MEETING_ACTIONS_PARENT_PAGE_ID || DEFAULT_PARENT_PAGE;
  console.log(`  親ページID: ${parent}`);
  console.log(`  DB名: ${DB_NAME}`);
  console.log('  Notion API を呼び出しています...');

  const notion = new Client({ auth: process.env.NOTION_TOKEN });

  // 担当者と報告者で同じ選択肢を共有
  const memberOptions = [
    { name: 'ちい',    color: 'pink'    },
    { name: 'たつや',  color: 'blue'    },
    { name: 'ひろき',  color: 'green'   },
    { name: 'なぎさ',  color: 'yellow'  },
    { name: 'いくえ',  color: 'purple'  },
    { name: 'あきお',  color: 'orange'  },
    { name: 'おおうち',color: 'red'     },
    { name: '全員',    color: 'default' },
  ];

  // ── 3. DB 作成 ───────────────────────────────────────────────────
  // 列構成は docs/data-model-proposal-v1.md §5 に準拠
  const db = await notion.databases.create({
    parent: { page_id: parent },
    title: [{ type: 'text', text: { content: DB_NAME } }],
    properties: {
      // ── title 列 ──
      アクション: { title: {} },

      // ── 説明（description）──
      説明: { rich_text: {} },

      // ── 起点メタ ──
      対象会議日: { date: {} },
      '対象 Section': {
        select: {
          options: [
            { name: 'Section4',  color: 'blue'   }, // アクション達成チェック
            { name: 'Section6',  color: 'yellow' }, // スタッフ振り返り
            { name: 'Section10', color: 'green'  }, // 次月アクション決定
          ],
        },
      },
      区分: {
        select: {
          options: [
            { name: 'タスク',     color: 'blue'   },
            { name: '決定事項',   color: 'red'    },
            { name: '業務',       color: 'gray'   },
            { name: '現場オペ',   color: 'green'  },
          ],
        },
      },
      報告者: { select: { options: memberOptions } },

      // ── 担当・期限 ──
      担当者: { select: { options: memberOptions } },
      期限:   { date: {} },

      // ── 状態・達成度 ──
      状態: {
        select: {
          options: [
            { name: '未着手',     color: 'gray'   },
            { name: '進行中',     color: 'blue'   },
            { name: '検証中',     color: 'purple' },
            { name: '完了',       color: 'green'  },
            { name: '横展開済',   color: 'brown'  },
            { name: '未達',       color: 'red'    },
            { name: '繰り越し',   color: 'orange' },
          ],
        },
      },
      達成度: {
        select: {
          options: [
            { name: '1 未着手',     color: 'gray'   },
            { name: '2 着手のみ',   color: 'yellow' },
            { name: '3 部分達成',   color: 'orange' },
            { name: '4 ほぼ達成',   color: 'blue'   },
            { name: '5 完了',       color: 'green'  },
          ],
        },
      },

      // ── 原因分類 7分類（spec §6 / proposal §3.2）──
      原因分類: {
        select: {
          options: [
            { name: 'ヒューマンエラー（人）',     color: 'orange'  }, // human_error
            { name: '仕組み・ルールの不備',       color: 'red'     }, // system_rule
            { name: '動線・オペレーション設計',   color: 'pink'    }, // operation_flow
            { name: '情報共有不足',               color: 'yellow'  }, // info_sharing
            { name: 'スキル・教育不足',           color: 'purple'  }, // skill_education
            { name: 'ツール・設備',               color: 'blue'    }, // tool_equipment
            { name: 'その他',                     color: 'default' }, // other
          ],
        },
      },

      // ── 詰める（②）3列 ──
      なぜできなかったか:   { rich_text: {} },
      どこでつまずいたか:   { rich_text: {} },
      改善案:               { rich_text: {} },

      // ── Check（検証結果）──
      検証結果: { rich_text: {} },

      // ── Act（資産化）──
      '資産化する？':      { checkbox: {} },
      資産化リンク:        { url: {} },
      関連チェック項目:    { rich_text: {} }, // 例: "ドリンク清掃/DR001"

      // ── スコープ ──
      対象クライアント: {
        select: {
          options: [
            { name: 'よいどころ千福',  color: 'blue'   },
            { name: 'Niki★DINER',     color: 'pink'   },
            { name: 'Bistro Knocks',  color: 'green'  },
            { name: 'Mz cafe',        color: 'yellow' },
          ],
        },
      },
    },
  });

  // ── 4. .env 追記 ─────────────────────────────────────────────────
  const id = db.id;
  const appendLine = `\n# 定例アクション追跡DB（notion-create-meeting-actions-db.js が追記）\n${ENV_KEY}=${id}\n`;
  fs.appendFileSync(envPath, appendLine, { flag: 'a' });

  console.log(`✓ Notion に「${DB_NAME}」DBを作成しました`);
  console.log('  ID :', id);
  console.log('  URL:', db.url || `https://notion.so/${id.replace(/-/g, '')}`);
  console.log(`✓ .env に ${ENV_KEY} を追記しました`);
  console.log('');
  console.log('  GitHub Secrets にも登録してください:');
  console.log(`  ${ENV_KEY}=${id}`);
}

main().catch((e) => {
  console.error('✗', e.message);
  if (e.code === 'object_not_found' || /permission/i.test(String(e.message))) {
    console.error('  ヒント: Notion インテグレーションを親ページに招待してください。');
    console.error(`  別の親にしたい場合は NOTION_MEETING_ACTIONS_PARENT_PAGE_ID を .env に設定して再実行。`);
  }
  process.exit(1);
});
