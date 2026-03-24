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

module.exports = {
  BRIEF_CLIENT_ORDER,
  CASE_DB_ID,
  fetchCaseClientStatuses,
};
