/**
 * task-siphon の JSON から「タスク管理用」Notion DB に行を追加する。
 * 環境変数: NOTION_TOKEN, NOTION_TASKS_DB_ID
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { Client } = require('@notionhq/client');

function clip(s, max) {
  const t = String(s || '');
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function rt(text) {
  const t = clip(text || '', 1900);
  return t
    ? { rich_text: [{ type: 'text', text: { content: t } }] }
    : { rich_text: [] };
}

/**
 * @param {object} data — Gemini の JSON（overlooked_or_implicit, blockers_or_unclear）
 * @param {{ sourceLabel: string }} meta
 * @returns {Promise<{ created: number }>}
 */
async function appendTasksFromSiphonData(data, meta) {
  const dbId = process.env.NOTION_TASKS_DB_ID;
  if (!dbId || !process.env.NOTION_TOKEN) {
    return { created: 0 };
  }

  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const { sourceLabel } = meta;

  const existingTitles = new Set();
  if (process.env.NOTION_TASKS_DEDUP !== '0') {
    let cursor;
    do {
      const res = await notion.databases.query({
        database_id: dbId,
        filter: {
          property: '出所',
          rich_text: { contains: clip(sourceLabel, 100) },
        },
        page_size: 100,
        start_cursor: cursor,
      });
      for (const page of res.results) {
        const t = page.properties['タスク']?.title?.[0]?.plain_text;
        if (t) existingTitles.add(t);
      }
      cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
  }

  const rows = [];

  for (const item of data.overlooked_or_implicit || []) {
    rows.push({
      title: item.title || '（無題）',
      kind: item.kind || 'follow_up',
      urgency: item.urgency || 'unknown',
      who: item.who_should_act || 'unknown',
      deadline: item.deadline_note || '',
      client: item.client_hint || '',
      evidence: item.evidence || '',
    });
  }

  for (const b of data.blockers_or_unclear || []) {
    rows.push({
      title: clip(`要確認: ${b.issue || '不明'}`, 500),
      kind: 'decision_needed',
      urgency: 'medium',
      who: '自分',
      deadline: '',
      client: '',
      evidence: clip(`${b.issue || ''} — ${b.why_unclear || ''}`, 1800),
    });
  }

  let created = 0;
  let skipped = 0;
  for (const r of rows) {
    const titleText = clip(r.title, 2000);
    if (existingTitles.has(titleText)) {
      skipped += 1;
      continue;
    }

    await notion.pages.create({
      parent: { database_id: dbId },
      properties: {
        タスク: {
          title: [{ text: { content: titleText } }],
        },
        状態: {
          select: { name: '未着手' },
        },
        種別: {
          select: { name: r.kind },
        },
        緊急度: {
          select: { name: r.urgency },
        },
        動く人: {
          select: { name: r.who },
        },
        期限メモ: rt(r.deadline),
        クライアント: rt(r.client),
        根拠: rt(r.evidence),
        出所: rt(sourceLabel),
      },
    });
    created += 1;
    existingTitles.add(titleText);
  }

  return { created, skipped };
}

module.exports = { appendTasksFromSiphonData };
