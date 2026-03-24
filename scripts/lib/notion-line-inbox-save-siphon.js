/**
 * task-siphon の Markdown レポートを Notion「LINE取り込み」DBに 1 ページ追加する。
 * 環境変数: NOTION_TOKEN, NOTION_LINE_INBOX_DB_ID（必須）
 * 任意: NOTION_LINE_INBOX_DATE_PROP
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { Client } = require('@notionhq/client');

function dateKeyTokyo(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function clip(s, max) {
  const t = String(s || '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** 1ブロックあたりの文字上限に合わせて段落化（最大 ~90 ブロック） */
function markdownToParagraphBlocks(markdown, maxBlocks = 90) {
  const lines = String(markdown || '').split('\n');
  const blocks = [];
  for (const line of lines) {
    let rest = line.length ? line : ' ';
    while (rest.length > 0 && blocks.length < maxBlocks) {
      const piece = clip(rest, 1990);
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: piece } }],
        },
      });
      rest = rest.slice(piece.length);
    }
  }
  if (blocks.length === 0) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: '（本文なし）' } }],
      },
    });
  }
  return blocks;
}

/**
 * @param {{ markdown: string, sourceLabel: string }} opts
 * @returns {Promise<string>} 作成ページの URL
 */
async function saveSiphonReportToLineInbox(opts) {
  const { markdown, sourceLabel } = opts;
  const dbId = process.env.NOTION_LINE_INBOX_DB_ID;
  if (!process.env.NOTION_TOKEN || !dbId) {
    throw new Error('NOTION_TOKEN と NOTION_LINE_INBOX_DB_ID を .env に設定してください');
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const db = await notion.databases.retrieve({ database_id: dbId });
  const schema = db.properties;

  const titleKey = Object.entries(schema).find(([, v]) => v.type === 'title')?.[0];
  if (!titleKey) throw new Error('データベースに title 型のプロパティがありません');

  const datePropName = process.env.NOTION_LINE_INBOX_DATE_PROP
    || Object.entries(schema).find(([, v]) => v.type === 'date')?.[0];
  if (!datePropName) throw new Error('日付型プロパティが見つかりません（NOTION_LINE_INBOX_DATE_PROP で指定可）');

  const ymd = dateKeyTokyo();
  const pageTitle = clip(`タスク吸い出し｜${sourceLabel}｜${ymd}`, 2000);

  const properties = {
    [titleKey]: {
      title: [{ text: { content: pageTitle } }],
    },
    [datePropName]: { date: { start: ymd } },
  };

  const children = markdownToParagraphBlocks(markdown);

  const page = await notion.pages.create({
    parent: { database_id: dbId },
    properties,
    children,
  });

  return page.url || `https://notion.so/${String(page.id).replace(/-/g, '')}`;
}

module.exports = { saveSiphonReportToLineInbox, dateKeyTokyo };
