/**
 * 定例会議のアクションを PDCA で追う「定例アクション追跡」Notion DB を作成し、
 * .env に NOTION_MEETING_ACTIONS_DB_ID を追記する（未設定時のみ）。
 *
 *   node scripts/notion-create-meeting-actions-db.js
 *   npm run notion:create-meeting-actions-db
 *
 * 設計仕様: docs/pdca-meeting-loop.md §2
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

  // ── 3. DB 作成 ───────────────────────────────────────────────────
  const db = await notion.databases.create({
    parent: { page_id: parent },
    title: [{ type: 'text', text: { content: DB_NAME } }],
    properties: {
      // title 列
      アクション: { title: {} },

      // select 列
      担当者: {
        select: {
          options: [
            { name: 'ちい',    color: 'pink'    },
            { name: 'たつや',  color: 'blue'    },
            { name: 'ひろき',  color: 'green'   },
            { name: 'なぎさ',  color: 'yellow'  },
            { name: 'いくえ',  color: 'purple'  },
            { name: 'あきお',  color: 'orange'  },
            { name: 'おおうち',color: 'red'     },
            { name: '全員',    color: 'default' },
          ],
        },
      },
      状態: {
        select: {
          options: [
            { name: '未着手',   color: 'gray'   },
            { name: '進行中',   color: 'blue'   },
            { name: '完了',     color: 'green'  },
            { name: '未達',     color: 'red'    },
            { name: '繰り越し', color: 'orange' },
          ],
        },
      },
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
      対象会議回: {
        select: {
          options: [
            { name: '2026-04', color: 'gray'   },
            { name: '2026-05', color: 'gray'   },
            { name: '2026-06', color: 'blue'   },
          ],
        },
      },
      つまずき分類: {
        select: {
          options: [
            { name: '仕組み/動線',      color: 'red'     },
            { name: 'ヒューマンエラー', color: 'orange'  },
            { name: '外部要因',         color: 'yellow'  },
            { name: '知識/スキル不足',  color: 'purple'  },
            { name: '未分類',           color: 'default' },
          ],
        },
      },

      // date 列
      期限: { date: {} },

      // rich_text 列
      なぜできなかったか: { rich_text: {} },
      どこでつまずいたか: { rich_text: {} },
      改善案:             { rich_text: {} },
      備考:               { rich_text: {} },

      // url 列
      資産化リンク: { url: {} },
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
