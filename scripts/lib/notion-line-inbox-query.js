/**
 * LINE 連携の「次のステップ」用: Notion の取り込み DB から本日分を読む。
 *
 * 【前提】個人の LINE トーク履歴を API で読むことはできません。
 * 現実的な流れは例えば次のどちらかです。
 *   - LINE公式アカウントの Messaging API →（Make / Cloud Functions 等）→ Notion に 1 行追加
 *   - 業務上の重要メモだけ手動でこの DB に貼る
 *
 * 必要な環境変数:
 *   NOTION_LINE_INBOX_DB_ID … 取り込み用データベース ID（ハイフン付き32桁）
 * 任意:
 *   NOTION_LINE_INBOX_DATE_PROP   既定: 日付（date 型・「いつ」の行か）
 *   NOTION_LINE_INBOX_SUMMARY_PROP 既定: メモ（title または rich_text）
 *   NOTION_LINE_INBOX_PARTNER_PROP  既定: 取引先（title / rich_text / select）
 *   NOTION_LINE_INBOX_DONE_PROP     設定した場合: checkbox が false の行だけ（未対応だけ朝に出す）
 *   NOTION_LINE_INBOX_WINDOW_DAYS    既定 7 … 「日付」が今日から遡って N 日以内の行を朝に出す（前日夜に取り込んでも載る）
 *
 * Notion DB の推奨プロパティ例:
 *   日付(date) / メモ(title) / 取引先(select または text) / 完了(checkbox・任意)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

function dateKeyTokyo(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function addCalendarDaysYmd(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function textFromProp(prop) {
  if (!prop) return '';
  const t = prop.title?.[0]?.plain_text;
  if (t) return t.trim();
  const r = prop.rich_text?.map((x) => x.plain_text).join('');
  if (r) return r.trim();
  if (prop.select?.name) return String(prop.select.name).trim();
  return '';
}

function clip(s, max = 120) {
  const one = s.replace(/\s+/g, ' ').trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

/**
 * @returns {Promise<null | { lines: string[] }>}
 *   DB 未設定時は null（朝サマリではブロックごと出さない）
 */
async function fetchNotionLineInboxToday() {
  const dbId = process.env.NOTION_LINE_INBOX_DB_ID;
  if (!dbId || !process.env.NOTION_TOKEN) return null;

  const dateProp = process.env.NOTION_LINE_INBOX_DATE_PROP || '日付';
  const summaryProp = process.env.NOTION_LINE_INBOX_SUMMARY_PROP || 'メモ';
  const partnerProp = process.env.NOTION_LINE_INBOX_PARTNER_PROP || '取引先';
  const doneProp = process.env.NOTION_LINE_INBOX_DONE_PROP || '';
  const windowDays = Math.min(
    30,
    Math.max(0, parseInt(process.env.NOTION_LINE_INBOX_WINDOW_DAYS || '7', 10) || 7),
  );

  const today = dateKeyTokyo();
  const start = addCalendarDaysYmd(today, -windowDays);

  const andFilter = [
    { property: dateProp, date: { on_or_after: start } },
    { property: dateProp, date: { on_or_before: today } },
  ];
  if (doneProp) {
    andFilter.push({ property: doneProp, checkbox: { equals: false } });
  }

  try {
    const response = await notion.databases.query({
      database_id: dbId,
      filter: { and: andFilter },
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      page_size: 25,
    });

    const lines = [];
    for (const page of response.results) {
      const props = page.properties || {};
      const partner = textFromProp(props[partnerProp]);
      let body = textFromProp(props[summaryProp]);
      if (!body) {
        const tKey = Object.keys(props).find((k) => props[k]?.type === 'title');
        body = tKey ? textFromProp(props[tKey]) : '';
      }
      const clipped = clip(body || '（本文なし）');
      if (partner) lines.push(`  • ${partner} … ${clipped}`);
      else lines.push(`  • ${clipped}`);
    }

    return { lines };
  } catch (err) {
    return { lines: [`  ⚠ LINE取り込みDBの取得に失敗: ${err.message}`] };
  }
}

module.exports = { fetchNotionLineInboxToday, dateKeyTokyo, addCalendarDaysYmd };
