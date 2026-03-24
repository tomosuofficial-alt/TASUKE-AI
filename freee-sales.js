// ============================================================
// TASUKE.AI — freee会計 売上取得 & Notion KPI売上DB 書き込み
// ============================================================
// 使い方:
//   node freee-sales.js                — 当月の売上サマリ取得 → Notion保存 + Slack通知
//   node freee-sales.js 2026-03        — 指定月の売上サマリ取得
//   node freee-sales.js --pl           — 当月の損益計算書（P/L）取得
//   node freee-sales.js --pl 2026-03   — 指定月のP/L取得
//   node freee-sales.js --dry-run      — Notion保存せずプレビューのみ
//   node freee-sales.js --no-slack     — Notion保存のみ（Slack通知をスキップ）
//
// Notion KPI・売上DB（既定: 月, 売上合計, コンサル収益, 運用代行収益, スポット収益, 備考）
//   - 月合計: 月=YYYY-MM、売上合計＋収益タイプ3列（kpi-revenue-rules.json で分類）
//   - 取引先別: 月=YYYY-MM｜取引先名（売上合計・備考のみ）
//   - 環境変数: KPI_DB_* , KPI_SALES_SUMMARY_BREAKDOWN=0 で3列を送らない
// ============================================================

require('dotenv').config();
const https = require('https');
const { Client } = require('@notionhq/client');
const { loadToken, getAccessToken, refreshToken, httpsGet } = require('./freee-auth');
const { loadRevenueRules, classifyDeal, emptyByBucket } = require('./kpi-revenue-classify');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const KPI_DB = '6b9f8d67-dbed-4f65-9069-67bc0925d711';

const KPI_PROP_TITLE = process.env.KPI_DB_TITLE_PROP || '月';
const KPI_PROP_SALES = process.env.KPI_DB_SALES_PROP || '売上合計';
const KPI_PROP_NOTE = process.env.KPI_DB_NOTE_PROP || '備考';
const KPI_PROP_CONSULT = process.env.KPI_DB_CONSULT_PROP || 'コンサル収益';
const KPI_PROP_OPS = process.env.KPI_DB_OPS_PROP || '運用代行収益';
const KPI_PROP_SPOT = process.env.KPI_DB_SPOT_PROP || 'スポット収益';
const FREEE_NOTE_MARKER = process.env.KPI_FREEE_MARKER || 'freee';
const KPI_SUMMARY_BREAKDOWN = process.env.KPI_SALES_SUMMARY_BREAKDOWN !== '0';

/** 取引先行のタイトル区切り（半角|と取引先名の衝突を避ける） */
const PARTNER_TITLE_SEP = '｜';

function partnerRowTitle(yearMonth, partnerName) {
  const safe = String(partnerName || '(取引先なし)').replace(/\r?\n/g, ' ').trim().slice(0, 500);
  return `${yearMonth}${PARTNER_TITLE_SEP}${safe}`;
}

function getTitlePlain(page) {
  const t = page.properties[KPI_PROP_TITLE]?.title;
  return (Array.isArray(t) && t[0]?.plain_text) ? t[0].plain_text : '';
}

function buildPartnerKpiProperties(titleText, amount, dealCount) {
  const note = `${FREEE_NOTE_MARKER} / 取引${dealCount}件`;
  return {
    [KPI_PROP_TITLE]: { title: [{ text: { content: titleText } }] },
    [KPI_PROP_SALES]: { number: amount },
    [KPI_PROP_NOTE]: { rich_text: [{ text: { content: note } }] },
  };
}

function buildSummaryKpiProperties(yearMonth, totalAmount, dealCount, byBucket) {
  const bc = byBucket.consulting.amount;
  const bo = byBucket.ops.amount;
  const bs = byBucket.spot.amount;
  const note = `${FREEE_NOTE_MARKER} / 取引${dealCount}件 / 内訳 コンサル¥${bc.toLocaleString()} 運用¥${bo.toLocaleString()} スポット¥${bs.toLocaleString()}`;
  const base = {
    [KPI_PROP_TITLE]: { title: [{ text: { content: yearMonth } }] },
    [KPI_PROP_SALES]: { number: totalAmount },
    [KPI_PROP_NOTE]: { rich_text: [{ text: { content: note } }] },
  };
  if (KPI_SUMMARY_BREAKDOWN) {
    base[KPI_PROP_CONSULT] = { number: bc };
    base[KPI_PROP_OPS] = { number: bo };
    base[KPI_PROP_SPOT] = { number: bs };
  }
  return base;
}

/** freee 同期行のみ（手入力の同じ「月」と区別） */
function freeeRowFilter(extraAnd = []) {
  return {
    and: [
      { property: KPI_PROP_NOTE, rich_text: { contains: FREEE_NOTE_MARKER } },
      ...extraAnd,
    ],
  };
}

// ─── Slack 送信 ───────────────────────────────────────────────

function sendToSlack(text) {
  const webhookUrl = process.env.SLACK_DAILY_COMMAND_WEBHOOK_URL;
  return new Promise((resolve) => {
    if (!webhookUrl) { resolve(); return; }
    try {
      const url = new URL(webhookUrl);
      const body = JSON.stringify({ text });
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, (res) => {
        if (res.statusCode === 200) console.log('✓ Slack (#daily-command) 送信完了');
        else console.error('✗ Slack送信エラー:', res.statusCode);
        resolve();
      });
      req.on('error', (err) => { console.error('✗ Slack送信エラー:', err.message); resolve(); });
      req.write(body);
      req.end();
    } catch (err) { console.error('✗ Slack送信エラー:', err.message); resolve(); }
  });
}

// ─── freee APIアクセス（自動リフレッシュ付き） ────────────────

async function freeeGet(urlPath) {
  let accessToken = getAccessToken();

  if (!accessToken) {
    console.log('🔄 アクセストークン期限切れ。リフレッシュ中...');
    await refreshToken();
    accessToken = getAccessToken();
    if (!accessToken) {
      throw new Error('アクセストークンを取得できません。node freee-auth.js setup を実行してください');
    }
  }

  const res = await httpsGet('api.freee.co.jp', urlPath, accessToken);

  if (res.status === 401) {
    console.log('🔄 401エラー。トークンをリフレッシュして再試行...');
    await refreshToken();
    accessToken = getAccessToken();
    if (!accessToken) throw new Error('リフレッシュ後もトークン取得失敗');
    return httpsGet('api.freee.co.jp', urlPath, accessToken);
  }

  return res;
}

// ─── 事業所ID取得 ────────────────────────────────────────────

function getCompanyId() {
  const token = loadToken();
  if (token && token.company_id) return token.company_id;
  const envId = process.env.FREEE_COMPANY_ID;
  if (envId) return envId;
  return null;
}

/** 当月取引に登場する ID だけ GET（全件ページングより高速） */
async function fetchNameMapByIds(companyId, ids, pathBase, bodyKey) {
  const map = {};
  const unique = [...new Set(ids.filter((id) => id != null))];
  await Promise.all(unique.map(async (id) => {
    const res = await freeeGet(`${pathBase}/${id}?company_id=${companyId}`);
    if (res.status === 200 && res.body[bodyKey]) {
      map[id] = res.body[bodyKey].name;
    }
  }));
  return map;
}

function collectDetailIdsFromDeals(deals) {
  const accountIds = [];
  const itemIds = [];
  for (const deal of deals) {
    for (const d of deal.details || []) {
      if (d.account_item_id != null) accountIds.push(d.account_item_id);
      if (d.item_id != null) itemIds.push(d.item_id);
    }
  }
  return { accountIds, itemIds };
}

// ─── 月次売上取得（取引一覧から集計） ────────────────────────

async function fetchMonthlySales(yearMonth) {
  const companyId = getCompanyId();
  if (!companyId) throw new Error('事業所IDが未設定。node freee-auth.js check を実行してください');

  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  console.log(`📊 freee売上取得: ${startDate} 〜 ${endDate}\n`);

  let allDeals = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const path = `/api/1/deals`
      + `?company_id=${companyId}`
      + `&type=income`
      + `&start_issue_date=${startDate}`
      + `&end_issue_date=${endDate}`
      + `&limit=${limit}`
      + `&offset=${offset}`;

    const res = await freeeGet(path);
    if (res.status !== 200) {
      throw new Error(`freee API エラー (${res.status}): ${JSON.stringify(res.body)}`);
    }

    const deals = res.body.deals || [];
    allDeals.push(...deals);

    if (deals.length < limit) break;
    offset += limit;
  }

  console.log(`  取引件数: ${allDeals.length}件`);

  const revenueRules = loadRevenueRules();
  const partnerIds = allDeals.map((d) => d.partner_id).filter((id) => id != null);
  const { accountIds, itemIds } = collectDetailIdsFromDeals(allDeals);
  const [partnerMap, accountMap, itemMap] = await Promise.all([
    fetchNameMapByIds(companyId, partnerIds, '/api/1/partners', 'partner'),
    fetchNameMapByIds(companyId, accountIds, '/api/1/account_items', 'account_item'),
    fetchNameMapByIds(companyId, itemIds, '/api/1/items', 'item'),
  ]);

  const byPartner = {};
  const byBucket = emptyByBucket();
  let totalAmount = 0;

  for (const deal of allDeals) {
    const partnerName = (deal.partner_id != null && partnerMap[deal.partner_id])
      ? partnerMap[deal.partner_id]
      : '(取引先なし)';
    const amount = (deal.details || []).reduce((sum, d) => sum + (d.amount || 0), 0);
    const bucket = classifyDeal(deal, partnerName, accountMap, itemMap, revenueRules);

    if (!byPartner[partnerName]) {
      byPartner[partnerName] = { count: 0, amount: 0 };
    }
    byPartner[partnerName].count++;
    byPartner[partnerName].amount += amount;

    byBucket[bucket].amount += amount;
    byBucket[bucket].count++;
    totalAmount += amount;
  }

  return {
    yearMonth,
    startDate,
    endDate,
    totalAmount,
    dealCount: allDeals.length,
    byPartner,
    byBucket,
  };
}

// ─── 損益計算書（P/L）取得 ───────────────────────────────────

async function fetchPL(yearMonth) {
  const companyId = getCompanyId();
  if (!companyId) throw new Error('事業所IDが未設定');

  const [year, month] = yearMonth.split('-').map(Number);
  const startMonth = month;
  const endMonth = month;

  console.log(`📊 freee損益計算書取得: ${year}年${month}月\n`);

  const path = `/api/1/reports/trial_pl`
    + `?company_id=${companyId}`
    + `&fiscal_year=${year}`
    + `&start_month=${startMonth}`
    + `&end_month=${endMonth}`;

  const res = await freeeGet(path);
  if (res.status !== 200) {
    throw new Error(`freee API エラー (${res.status}): ${JSON.stringify(res.body)}`);
  }

  const balances = res.body.trial_pl_sections || res.body.trial_pl || [];
  return { yearMonth, balances, raw: res.body };
}

// ─── Notion KPI売上DB 保存 ───────────────────────────────────

async function queryKpiPage(titleExact) {
  const existing = await notion.databases.query({
    database_id: KPI_DB,
    filter: freeeRowFilter([
      { property: KPI_PROP_TITLE, title: { equals: titleExact } },
    ]),
  });
  return existing.results[0] || null;
}

async function listPartnerPagesForMonth(yearMonth) {
  const prefix = `${yearMonth}${PARTNER_TITLE_SEP}`;
  const all = [];
  let cursor = undefined;
  do {
    const res = await notion.databases.query({
      database_id: KPI_DB,
      filter: freeeRowFilter([
        { property: KPI_PROP_TITLE, title: { starts_with: prefix } },
      ]),
      start_cursor: cursor,
      page_size: 100,
    });
    all.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return all;
}

async function upsertPartnerKpiRow(titleText, amount, count, logLabel) {
  const properties = buildPartnerKpiProperties(titleText, amount, count);
  const page = await queryKpiPage(titleText);
  if (page) {
    await notion.pages.update({ page_id: page.id, properties });
    console.log(`✓ Notion KPI売上DB 更新: ${logLabel}`);
  } else {
    await notion.pages.create({
      parent: { database_id: KPI_DB },
      properties,
    });
    console.log(`✓ Notion KPI売上DB 新規作成: ${logLabel}`);
  }
}

async function upsertSummaryKpiRow(salesData, logLabel) {
  const { yearMonth, totalAmount, dealCount, byBucket } = salesData;
  const properties = buildSummaryKpiProperties(yearMonth, totalAmount, dealCount, byBucket);
  const page = await queryKpiPage(yearMonth);
  if (page) {
    await notion.pages.update({ page_id: page.id, properties });
    console.log(`✓ Notion KPI売上DB 更新: ${logLabel}`);
  } else {
    await notion.pages.create({
      parent: { database_id: KPI_DB },
      properties,
    });
    console.log(`✓ Notion KPI売上DB 新規作成: ${logLabel}`);
  }
}

async function archiveStalePartnerRows(yearMonth, byPartner) {
  const validTitles = new Set(
    Object.keys(byPartner).map((name) => partnerRowTitle(yearMonth, name)),
  );
  const pages = await listPartnerPagesForMonth(yearMonth);
  for (const page of pages) {
    const t = getTitlePlain(page);
    if (t && !validTitles.has(t)) {
      await notion.pages.update({ page_id: page.id, archived: true });
      console.log(`✓ Notion KPI売上DB アーカイブ（旧取引先行）: ${t}`);
    }
  }
}

async function saveToNotion(salesData) {
  const { yearMonth, byPartner } = salesData;

  try {
    await upsertSummaryKpiRow(salesData, `${yearMonth}（月合計）`);

    const partners = Object.entries(byPartner).sort((a, b) => b[1].amount - a[1].amount);
    for (const [name, data] of partners) {
      const title = partnerRowTitle(yearMonth, name);
      await upsertPartnerKpiRow(title, data.amount, data.count, title);
    }

    await archiveStalePartnerRows(yearMonth, byPartner);
  } catch (err) {
    console.error(`✗ Notion保存失敗: ${err.message}`);
    if (err.message.includes('Could not find property')) {
      console.error('\n💡 KPI・売上DBのプロパティ名を確認してください。');
      console.error(`   既定: ${KPI_PROP_TITLE}, ${KPI_PROP_SALES}, ${KPI_PROP_NOTE}（「${FREEE_NOTE_MARKER}」で識別）`);
      console.error(`   内訳列: ${KPI_PROP_CONSULT}, ${KPI_PROP_OPS}, ${KPI_PROP_SPOT}（不要なら KPI_SALES_SUMMARY_BREAKDOWN=0）`);
      console.error('   環境変数 KPI_DB_* で上書き可。');
    }
  }
}

// ─── レポートフォーマット ────────────────────────────────────

function formatSalesReport(salesData) {
  const { yearMonth, totalAmount, dealCount, byPartner, byBucket } = salesData;

  const partnerLines = Object.entries(byPartner)
    .sort((a, b) => b[1].amount - a[1].amount)
    .map(([name, data]) => `  ・${name}: ¥${data.amount.toLocaleString()}（${data.count}件）`)
    .join('\n');

  const b = byBucket || emptyByBucket();
  const bucketLines = [
    `  ・コンサル: ¥${b.consulting.amount.toLocaleString()}（${b.consulting.count}件）`,
    `  ・運用代行: ¥${b.ops.amount.toLocaleString()}（${b.ops.count}件）`,
    `  ・スポット: ¥${b.spot.amount.toLocaleString()}（${b.spot.count}件）`,
  ].join('\n');

  return `【freee月次売上レポート】${yearMonth}

■ TASUKE.AI 売上サマリ
・月間売上合計: ¥${totalAmount.toLocaleString()}
・取引件数: ${dealCount}件

■ 収益タイプ別（kpi-revenue-rules.json）
${bucketLines}

■ 取引先別内訳
${partnerLines || '  ・取引なし'}`;
}

function formatPLReport(plData) {
  const { yearMonth, balances, raw } = plData;

  let lines = [`【freee損益計算書】${yearMonth}\n`];

  if (Array.isArray(balances) && balances.length > 0) {
    for (const section of balances) {
      const name = section.account_item_name || section.name || '不明';
      const closing = section.closing_balance || 0;
      if (closing !== 0) {
        lines.push(`  ${name}: ¥${closing.toLocaleString()}`);
      }
    }
  } else if (raw.trial_pl_sections) {
    for (const section of raw.trial_pl_sections) {
      lines.push(`\n■ ${section.account_category_name || '不明'}`);
      for (const item of (section.account_items || [])) {
        if (item.closing_balance !== 0) {
          lines.push(`  ・${item.account_item_name}: ¥${item.closing_balance.toLocaleString()}`);
        }
      }
    }
  } else {
    lines.push('  データなし（取引が登録されていない可能性があります）');
  }

  return lines.join('\n');
}

// ─── メイン ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const isPL = args.includes('--pl');
  const isDryRun = args.includes('--dry-run');
  const isNoSlack = args.includes('--no-slack');
  const monthArg = args.find(a => /^\d{4}-\d{2}$/.test(a));

  const now = new Date();
  const yearMonth = monthArg || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  try {
    if (isPL) {
      const plData = await fetchPL(yearMonth);
      const report = formatPLReport(plData);
      console.log('\n' + report + '\n');

      if (!isDryRun && !isNoSlack) {
        await sendToSlack(report);
      }
    } else {
      const salesData = await fetchMonthlySales(yearMonth);
      const report = formatSalesReport(salesData);
      console.log('\n' + report + '\n');

      if (!isDryRun) {
        await saveToNotion(salesData);
        if (!isNoSlack) await sendToSlack(report);
        else console.log('(--no-slack: Slack通知をスキップ)\n');
      } else {
        console.log('(--dry-run: Notion保存・Slack通知をスキップ)\n');
      }
    }

    console.log('完了！');
  } catch (err) {
    console.error(`✗ エラー: ${err.message}`);
    process.exit(1);
  }
}

main();
