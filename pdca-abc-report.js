#!/usr/bin/env node
// ============================================================
// よいどころ千福 — 月次（または期間）ABC分析 + PDCA用 Markdown ひな形
// データ: スマレジ Platform API（取引一覧 → 各行 GET .../transactions/{id}/details）
// 金額: 行の unitDiscountedSum（値引後小計・スマレジ定義）で構成比を算出
// 出力: docs/pdca-abc/*.md + latest.md（#daily-command には通知しない）
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

const CLIENT_LABEL = 'よいどころ千福';
const LIST_LIMIT = 200;
const DETAIL_DELAY_MS = 280;
const DEFAULT_A_THRESHOLD = 70;
const DEFAULT_B_THRESHOLD = 95;

function httpsJson(method, hostname, reqPath, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: reqPath, method, headers: { ...headers, Connection: 'close' } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
          } catch (e) {
            reject(new Error(`JSON parse: ${e.message} (${data.slice(0, 120)})`));
          }
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getSmaregiToken() {
  const clientId = process.env.SMAREGI_CLIENT_ID;
  const clientSecret = process.env.SMAREGI_CLIENT_SECRET;
  const contractId = process.env.SMAREGI_CONTRACT_ID;
  if (!clientId || !clientSecret || !contractId) {
    throw new Error('SMAREGI_CLIENT_ID / SMAREGI_CLIENT_SECRET / SMAREGI_CONTRACT_ID が必要です');
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const form = 'grant_type=client_credentials&scope=pos.transactions:read';
  const { status, body } = await httpsJson(
    'POST',
    'id.smaregi.jp',
    `/app/${contractId}/token`,
    {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form),
    },
    form,
  );
  if (status !== 200 || !body?.access_token) {
    throw new Error(`スマレジトークン取得失敗 HTTP ${status}`);
  }
  return { token: body.access_token, contractId };
}

async function apiGet(contractId, token, apiPathAndQuery) {
  const { status, body } = await httpsJson(
    'GET',
    'api.smaregi.jp',
    `/${contractId}${apiPathAndQuery}`,
    { Authorization: `Bearer ${token}` },
  );
  if (status !== 200) {
    throw new Error(`API GET ${apiPathAndQuery} → HTTP ${status}`);
  }
  return body;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 東京の月の初日・末日 YYYY-MM-DD */
function monthRangeTokyo(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  const first = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { first, last };
}

function toJstBounds(firstYmd, lastYmd) {
  return {
    from: `${firstYmd}T00:00:00+09:00`,
    to: `${lastYmd}T23:59:59+09:00`,
  };
}

async function fetchTransactionHeads(contractId, token, fromIso, toIso) {
  const heads = [];
  let page = 1;
  for (;;) {
    const q = new URLSearchParams({
      'terminal_tran_date_time-from': fromIso,
      'terminal_tran_date_time-to': toIso,
      limit: String(LIST_LIMIT),
      page: String(page),
    });
    const batch = await apiGet(contractId, token, `/pos/transactions?${q}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const h of batch) {
      if (h.cancelDivision !== '0') continue;
      if (h.transactionHeadDivision !== '1') continue;
      heads.push(h);
    }
    if (batch.length < LIST_LIMIT) break;
    page += 1;
  }
  return heads;
}

async function fetchDetails(contractId, token, transactionHeadId) {
  const rows = await apiGet(contractId, token, `/pos/transactions/${transactionHeadId}/details`);
  return Array.isArray(rows) ? rows : [];
}

function aggregateLines(detailsList, by) {
  const map = new Map();
  for (const line of detailsList) {
    if (String(line.transactionDetailDivision || '') !== '1') continue;
    const qty = parseFloat(line.quantity || '0') || 0;
    const amount = parseInt(line.unitDiscountedSum || '0', 10) || 0;
    if (amount === 0 && qty === 0) continue;
    let key;
    if (by === 'product') {
      key = `${line.productCode || line.productId || ''}\t${line.productName || '（無名）'}`;
    } else {
      key = line.categoryName || '（未分類）';
    }
    const cur = map.get(key) || { key, amount: 0, qty: 0 };
    cur.amount += amount;
    cur.qty += qty;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

function classifyAbc(rows, total, aPct, bPct) {
  let cumBefore = 0;
  return rows.map((r) => {
    const pct = total > 0 ? (100 * r.amount) / total : 0;
    const cumAfter = cumBefore + pct;
    let abc = 'C';
    if (cumBefore < aPct) abc = 'A';
    else if (cumBefore < bPct) abc = 'B';
    cumBefore = cumAfter;
    return { ...r, pct, cumPct: cumAfter, abc };
  });
}

function formatMarkdown({ periodLabel, fromYmd, toYmd, by, rows, total, headsCount, aPct, bPct }) {
  const lines = [];
  lines.push(`# PDCA / ABC — ${CLIENT_LABEL}`);
  lines.push('');
  lines.push(`- **対象期間**: ${periodLabel}（${fromYmd} 〜 ${toYmd}）`);
  lines.push(`- **集計軸**: ${by === 'product' ? '商品' : 'カテゴリ（部門）'}`);
  lines.push(`- **金額**: 取引明細の \`unitDiscountedSum\` 合計（値引後行小計）`);
  lines.push(`- **ABC ルール**: 売上の多い順に、**その行を足す前の累積構成比**が ${aPct}% 未満→A、${bPct}% 未満→B、それ以外→C`);
  lines.push(`- **取引件数（ヘッダ）**: ${headsCount} 件`);
  lines.push('');
  lines.push('## Plan（次の期間の仮説・打ち手）');
  lines.push('');
  lines.push('- ');
  lines.push('');
  lines.push('## Do（実行したこと）');
  lines.push('');
  lines.push('- ');
  lines.push('');
  lines.push('## Check（ABC）');
  lines.push('');
  lines.push(`| ABC | ${by === 'product' ? '商品' : 'カテゴリ'} | 売上(行計) | 構成比 | 累積 | 数量合計 |`);
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    const name = String(r.key).replace(/\|/g, '\\|').replace(/\t/g, ' ');
    lines.push(
      `| ${r.abc} | ${name} | ${r.amount.toLocaleString('ja-JP')} | ${r.pct.toFixed(1)}% | ${r.cumPct.toFixed(1)}% | ${r.qty.toFixed(1)} |`,
    );
  }
  lines.push('');
  lines.push(`**合計（行計の足し合わせ）**: ¥${total.toLocaleString('ja-JP')}`);
  lines.push('');
  lines.push('### 区分サマリ');
  const sumA = rows.filter((x) => x.abc === 'A').reduce((s, x) => s + x.amount, 0);
  const sumB = rows.filter((x) => x.abc === 'B').reduce((s, x) => s + x.amount, 0);
  const sumC = rows.filter((x) => x.abc === 'C').reduce((s, x) => s + x.amount, 0);
  lines.push(`- **A**: ¥${sumA.toLocaleString('ja-JP')}（${total ? ((100 * sumA) / total).toFixed(1) : 0}%）`);
  lines.push(`- **B**: ¥${sumB.toLocaleString('ja-JP')}（${total ? ((100 * sumB) / total).toFixed(1) : 0}%）`);
  lines.push(`- **C**: ¥${sumC.toLocaleString('ja-JP')}（${total ? ((100 * sumC) / total).toFixed(1) : 0}%）`);
  lines.push('');
  lines.push('## Act（次期への改善）');
  lines.push('');
  lines.push('- ');
  lines.push('');
  return lines.join('\n');
}

function parseArgs(argv) {
  let by = 'category';
  let dry = false;
  const rest = [];
  for (const a of argv) {
    if (a === '--by-product') by = 'product';
    else if (a === '--by-category') by = 'category';
    else if (a === '--dry-run') dry = true;
    else if (!a.startsWith('--')) rest.push(a);
  }
  let fromYmd;
  let toYmd;
  let periodLabel;
  if (rest.length === 1 && /^\d{4}-\d{2}$/.test(rest[0])) {
    const { first, last } = monthRangeTokyo(rest[0]);
    fromYmd = first;
    toYmd = last;
    periodLabel = `${rest[0]}`;
  } else if (rest.length === 2 && /^\d{4}-\d{2}-\d{2}$/.test(rest[0]) && /^\d{4}-\d{2}-\d{2}$/.test(rest[1])) {
    fromYmd = rest[0];
    toYmd = rest[1];
    periodLabel = `${fromYmd}〜${toYmd}`;
  } else {
    console.error(`使い方:
  node pdca-abc-report.js <YYYY-MM> [オプション]
  node pdca-abc-report.js <YYYY-MM-DD> <YYYY-MM-DD> [オプション]

オプション:
  --by-category   カテゴリ別（既定）
  --by-product    商品別
  --dry-run       Markdown を保存せず標準出力のみ（#daily-command には送らない）

環境変数:
  ABC_A_THRESHOLD  既定 ${DEFAULT_A_THRESHOLD}（累積%で A の上限）
  ABC_B_THRESHOLD  既定 ${DEFAULT_B_THRESHOLD}（累積%で B の上限）

例:
  node pdca-abc-report.js 2026-03
  node pdca-abc-report.js 2026-03-01 2026-03-31
`);
    process.exit(1);
  }
  const aPct = Math.min(100, Math.max(1, parseInt(process.env.ABC_A_THRESHOLD || String(DEFAULT_A_THRESHOLD), 10) || DEFAULT_A_THRESHOLD));
  const bPct = Math.min(100, Math.max(aPct, parseInt(process.env.ABC_B_THRESHOLD || String(DEFAULT_B_THRESHOLD), 10) || DEFAULT_B_THRESHOLD));
  return { fromYmd, toYmd, periodLabel, by, dry, aPct, bPct };
}

async function main() {
  const { fromYmd, toYmd, periodLabel, by, dry, aPct, bPct } = parseArgs(process.argv.slice(2));
  const { from, to } = toJstBounds(fromYmd, toYmd);

  const { token, contractId } = await getSmaregiToken();
  console.log(`取引一覧取得 ${from} … ${to}`);

  const heads = await fetchTransactionHeads(contractId, token, from, to);
  console.log(`  ヘッダ ${heads.length} 件 → 明細取得中…`);

  const allLines = [];
  let n = 0;
  for (const h of heads) {
    const id = h.transactionHeadId;
    const details = await fetchDetails(contractId, token, id);
    allLines.push(...details);
    n += 1;
    if (n % 40 === 0) console.log(`  … ${n}/${heads.length}`);
    await sleep(DETAIL_DELAY_MS);
  }

  const buckets = aggregateLines(allLines, by);
  const total = buckets.reduce((s, r) => s + r.amount, 0);
  const classified = classifyAbc(buckets, total, aPct, bPct);

  const md = formatMarkdown({
    periodLabel,
    fromYmd,
    toYmd,
    by,
    rows: classified,
    total,
    headsCount: heads.length,
    aPct,
    bPct,
  });

  if (dry) {
    console.log(md);
  } else {
    const outDir = path.join(__dirname, 'docs', 'pdca-abc');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const fileSlug = fromYmd === toYmd ? fromYmd : `${fromYmd}_${toYmd}`;
    const fname = `pdca-abc-${fileSlug}.md`;
    const outPath = path.join(outDir, fname);
    const latestPath = path.join(outDir, 'latest.md');
    fs.writeFileSync(outPath, md, 'utf8');
    fs.writeFileSync(latestPath, md, 'utf8');
    console.log(`\n✓ 保存: ${outPath}`);
    console.log(`✓ 直近: ${latestPath}（Cursor では docs/pdca-abc/latest.md を開く）\n`);
  }

  console.log('完了');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
