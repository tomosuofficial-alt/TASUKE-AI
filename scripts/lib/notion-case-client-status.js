/**
 * Notion 案件管理DB → 朝次・朝サマリ用の「クライアント別ステータス」
 * プロパティ: クライアント(Select), ステータス(Select)。レガシーで Title の名前列にもフォールバック。
 */
const CASE_DB_ID = 'e8434c27-61bf-436b-9bf2-601b5ff4d848';

/** ブリーフに並べる順・キー（表示名） */
const BRIEF_CLIENT_ORDER = ['よいどころ千福', 'Niki★DINER', 'Bistro Knocks', 'Mz cafe'];

/** Notion の選択肢名 → ブリーフキー（★表記ゆれ対応） */
const NOTION_CLIENT_TO_BRIEF = {
  よいどころ千福: 'よいどころ千福',
  'Niki DINER': 'Niki★DINER',
  'Niki★DINER': 'Niki★DINER',
  'Bistro Knocks': 'Bistro Knocks',
  'Mz cafe': 'Mz cafe',
  新規: null,
};

const STATUS_PRIORITY = {
  進行中: 4,
  提案中: 3,
  保留: 2,
  完了: 1,
};

function priorityOf(status) {
  return STATUS_PRIORITY[status] ?? 0;
}

function strongerStatus(a, b) {
  return priorityOf(b) > priorityOf(a) ? b : a;
}

function notionClientNameFromPage(props) {
  const sel = props['クライアント']?.select?.name;
  if (sel) return sel;
  const nameProp = props['名前'] || props['title'] || props['クライアント名'];
  if (nameProp?.type === 'title' && nameProp.title?.[0]?.plain_text) {
    return nameProp.title[0].plain_text.trim();
  }
  return null;
}

function briefKeyFromNotionClient(notionName) {
  if (!notionName) return null;
  if (BRIEF_CLIENT_ORDER.includes(notionName)) return notionName;
  const mapped = NOTION_CLIENT_TO_BRIEF[notionName];
  if (mapped && BRIEF_CLIENT_ORDER.includes(mapped)) return mapped;
  return null;
}

/**
 * @param {import('@notionhq/client').Client} notion
 * @param {{ databaseId?: string }} [opts]
 * @returns {Promise<Record<string, string>>}
 */
async function fetchCaseClientStatuses(notion, opts = {}) {
  const databaseId = opts.databaseId || process.env.NOTION_CASE_DB_ID || CASE_DB_ID;
  const statuses = {};
  BRIEF_CLIENT_ORDER.forEach((name) => {
    statuses[name] = '情報なし';
  });

  if (!process.env.NOTION_TOKEN) return statuses;

  try {
    const all = [];
    let cursor;
    do {
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
      });
      all.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    for (const page of all) {
      const props = page.properties || {};
      const briefKey = briefKeyFromNotionClient(notionClientNameFromPage(props));
      if (!briefKey) continue;

      const statusProp = props['ステータス'] || props['Status'];
      if (!statusProp) continue;
      const status = statusProp.select?.name || statusProp.status?.name || '未設定';

      const cur = statuses[briefKey];
      statuses[briefKey] = cur === '情報なし' ? status : strongerStatus(cur, status);
    }
    return statuses;
  } catch {
    const err = {};
    BRIEF_CLIENT_ORDER.forEach((name) => {
      err[name] = '取得エラー';
    });
    return err;
  }
}

/**
 * 期限が近い案件（次回アクション＋期限）を取得する
 * @param {import('@notionhq/client').Client} notion
 * @param {{ databaseId?: string, withinDays?: number }} [opts]
 * @returns {Promise<Array<{ client: string, caseName: string, action: string, deadline: string }>>}
 */
async function fetchUpcomingDeadlines(notion, opts = {}) {
  const databaseId = opts.databaseId || process.env.NOTION_CASE_DB_ID || CASE_DB_ID;
  const withinDays = opts.withinDays ?? 3;
  const alerts = [];

  if (!process.env.NOTION_TOKEN) return alerts;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limitDate = new Date(today);
    limitDate.setDate(limitDate.getDate() + withinDays);

    const all = [];
    let cursor;
    do {
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
        page_size: 100,
      });
      all.push(...response.results);
      cursor = response.has_more ? response.next_cursor : undefined;
    } while (cursor);

    for (const page of all) {
      const props = page.properties || {};
      const deadlineProp = props['期限'];
      if (!deadlineProp?.date?.start) continue;

      const deadlineDate = new Date(deadlineProp.date.start);
      if (deadlineDate > limitDate) continue;

      const action = props['次回アクション']?.rich_text?.[0]?.plain_text || '';
      if (!action) continue;

      const clientName = notionClientNameFromPage(props);
      const briefKey = briefKeyFromNotionClient(clientName) || clientName || '不明';

      const titleProp = props['案件名'] || props['名前'] || props['title'];
      const caseName = titleProp?.title?.[0]?.plain_text || '';

      const mm = deadlineDate.getMonth() + 1;
      const dd = deadlineDate.getDate();
      const isPast = deadlineDate < today;

      alerts.push({
        client: briefKey,
        caseName,
        action,
        deadline: `${mm}/${dd}`,
        isPast,
      });
    }

    alerts.sort((a, b) => (a.deadline > b.deadline ? 1 : -1));
    return alerts;
  } catch {
    return [];
  }
}

module.exports = {
  BRIEF_CLIENT_ORDER,
  CASE_DB_ID,
  fetchCaseClientStatuses,
  fetchUpcomingDeadlines,
};
