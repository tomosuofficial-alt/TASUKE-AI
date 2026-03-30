/**
 * 本日の予定（コンテンツ DB・任意の予定 DB）と案件ステータスを 1 本のテキストにまとめる。
 * slack-ohayo-bot.js / daily-command-morning.js から共用。
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { Client } = require('@notionhq/client');
const { queryContentDataSource } = require('./notion-content-data-source-query.js');
const { fetchNotionLineInboxToday } = require('./notion-line-inbox-query.js');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const { fetchCaseClientStatuses, BRIEF_CLIENT_ORDER: CLIENTS } = require('./notion-case-client-status.js');

function dateKeyTokyo(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

/** 例: 2026/03/22（土） */
function dateSlashWithWeekdayTokyo(d = new Date()) {
  const slash = dateKeyTokyo(d).replace(/-/g, '/');
  const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
  return `${slash}（${wd}）`;
}

async function fetchClientStatuses() {
  return fetchCaseClientStatuses(notion);
}

function formatTaskSection(statuses) {
  const entries = CLIENTS.map((name) => ({ name, st: statuses[name] }));
  const allEmpty = entries.every((e) => !e.st || e.st === '情報なし');
  if (allEmpty) return null;
  const lines = entries
    .filter((e) => e.st && e.st !== '情報なし')
    .map((e) => `  • ${e.name} … ${e.st}`)
    .join('\n');
  return `【案件ステータス】\n${lines}`;
}

async function fetchInstagramContentToday() {
  const today = dateKeyTokyo();
  if (!process.env.NOTION_TOKEN) {
    return { lines: ['  ⚠ NOTION_TOKEN が無いため取得スキップ'], error: null };
  }
  try {
    const result = await queryContentDataSource({
      filter: {
        and: [
          { property: '投稿日', date: { on_or_after: today } },
          { property: '投稿日', date: { on_or_before: today } },
        ],
      },
      sorts: [{ property: 'クライアント', direction: 'ascending' }],
      page_size: 50,
    });
    const rows = (result.results || []).map((entry) => {
      const client = entry.properties['クライアント']?.select?.name || '（クライアント）';
      const title = entry.properties['タイトル']?.title?.[0]?.plain_text || '（無題）';
      const st = entry.properties['ステータス']?.select?.name;
      const stPart = st ? ` ／ ${st}` : '';
      return `  • ${client}：${title}${stPart}`;
    });
    return {
      lines: rows.length ? rows : ['  （今日のInstagram投稿予定はありません）'],
      error: null,
    };
  } catch (err) {
    return { lines: [`  ⚠ 取得できませんでした: ${err.message}`], error: err };
  }
}

async function fetchOptionalScheduleDb() {
  const dbId = process.env.NOTION_SCHEDULE_DB_ID;
  if (!dbId || !process.env.NOTION_TOKEN) return null;

  const dateProp = process.env.NOTION_SCHEDULE_DATE_PROP || '日付';
  const titleProp = process.env.NOTION_SCHEDULE_TITLE_PROP || '名前';

  try {
    const response = await notion.databases.query({
      database_id: dbId,
      filter: { property: dateProp, date: { equals: dateKeyTokyo() } },
      sorts: [{ property: dateProp, direction: 'ascending' }],
      page_size: 30,
    });
    const lines = [];
    for (const page of response.results) {
      const props = page.properties || {};
      let title = props[titleProp]?.title?.[0]?.plain_text;
      if (!title) {
        const tKey = Object.keys(props).find((k) => props[k]?.type === 'title');
        title = tKey ? props[tKey]?.title?.[0]?.plain_text : '';
      }
      lines.push(`  • ${title || '（無題）'}`);
    }
    return lines.length ? lines : ['  （このDBでは今日の予定はありません）'];
  } catch (err) {
    return [`  ⚠ 取得エラー: ${err.message}`];
  }
}

/**
 * @param {{ mode?: 'scheduled' | 'interactive' }} opts
 */
const LINE_INBOX_DISPLAY_MAX = 5;

async function buildMorningDailySummaryText(opts = {}) {
  const mode = opts.mode || 'scheduled';
  const dateLine = dateSlashWithWeekdayTokyo();
  const [statuses, contentToday, scheduleExtra, lineInbox] = await Promise.all([
    fetchClientStatuses(),
    fetchInstagramContentToday(),
    fetchOptionalScheduleDb(),
    fetchNotionLineInboxToday(),
  ]);

  const header =
    mode === 'interactive'
      ? `おはようございます ☀️  ${dateLine}`
      : `① 予定・案件｜${dateLine}`;

  const parts = [header];

  const hasContent = contentToday.lines.length > 0
    && !contentToday.lines[0].includes('投稿予定はありません');
  if (hasContent) {
    parts.push('', '【Instagram】', ...contentToday.lines);
  }

  if (scheduleExtra) {
    const hasSchedule = !scheduleExtra[0]?.includes('予定はありません');
    if (hasSchedule) {
      parts.push('', '【予定】', ...scheduleExtra);
    }
  }

  if (lineInbox && lineInbox.lines.length > 0) {
    const total = lineInbox.lines.length;
    const shown = lineInbox.lines.slice(0, LINE_INBOX_DISPLAY_MAX);
    const suffix = total > LINE_INBOX_DISPLAY_MAX
      ? `  … 他 ${total - LINE_INBOX_DISPLAY_MAX} 件（Notionで確認）`
      : '';
    parts.push('', `【業務メモ】直近${process.env.NOTION_LINE_INBOX_WINDOW_DAYS || '7'}日・${total}件`, ...shown);
    if (suffix) parts.push(suffix);
  }

  const taskSection = formatTaskSection(statuses);
  if (taskSection) {
    parts.push('', taskSection);
  }

  return parts.join('\n');
}

module.exports = {
  buildMorningDailySummaryText,
  dateKeyTokyo,
  dateSlashWithWeekdayTokyo,
  fetchClientStatuses,
  fetchInstagramContentToday,
  fetchOptionalScheduleDb,
  fetchNotionLineInboxToday,
};
