// KPI 収益タイプ分類（kpi-revenue-rules.json）
// freee-sales.js から利用

const fs = require('fs');
const path = require('path');

const VALID_BUCKETS = new Set(['consulting', 'ops', 'spot']);

const KNOWN_IF_KEYS = new Set([
  'partner_name_contains',
  'partner_name_equals',
  'account_name_contains',
  'item_name_contains',
  'description_contains',
  'account_item_id',
  'item_id',
]);

function loadRevenueRules(explicitPath) {
  const p = explicitPath || process.env.KPI_REVENUE_RULES_PATH
    || path.join(__dirname, 'kpi-revenue-rules.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw);
    if (!VALID_BUCKETS.has(j.default_bucket)) j.default_bucket = 'spot';
    return j;
  } catch {
    return { default_bucket: 'spot', rules: [] };
  }
}

function normalizeForMatch(s) {
  return String(s || '').toLowerCase();
}

function normContains(hay, needle) {
  return normalizeForMatch(hay).includes(normalizeForMatch(needle));
}

function idsMatch(detailIds, ruleVal) {
  const arr = Array.isArray(ruleVal) ? ruleVal : [ruleVal];
  const nums = arr.map(Number).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return false;
  return nums.some((n) => detailIds.includes(n));
}

function ruleMatches(ifBlock, ctx) {
  if (!ifBlock || typeof ifBlock !== 'object') return false;
  const keys = Object.keys(ifBlock).filter((k) => KNOWN_IF_KEYS.has(k));
  if (keys.length === 0) return false;

  for (const key of keys) {
    const val = ifBlock[key];
    if (val === undefined || val === null) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;

    switch (key) {
      case 'partner_name_contains':
        if (!normContains(ctx.partnerName, val)) return false;
        break;
      case 'partner_name_equals':
        if (ctx.partnerName !== val) return false;
        break;
      case 'account_name_contains':
        if (!ctx.accountNames.some((n) => normContains(n, val))) return false;
        break;
      case 'item_name_contains':
        if (!ctx.itemNames.some((n) => normContains(n, val))) return false;
        break;
      case 'description_contains':
        if (!ctx.descriptions.some((n) => normContains(n, val))) return false;
        break;
      case 'account_item_id':
        if (!idsMatch(ctx.accountItemIds, val)) return false;
        break;
      case 'item_id':
        if (!idsMatch(ctx.itemIds, val)) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

function buildCtx(deal, partnerName, accountMap, itemMap) {
  const details = deal.details || [];
  const accountNames = details.map((d) => accountMap[d.account_item_id] || '').filter(Boolean);
  const itemNames = details.map((d) => itemMap[d.item_id] || '').filter(Boolean);
  const descriptions = details.map((d) => d.description || '').filter(Boolean);
  const accountItemIds = details.map((d) => d.account_item_id).filter((id) => id != null);
  const itemIds = details.map((d) => d.item_id).filter((id) => id != null);
  return {
    partnerName,
    accountNames,
    itemNames,
    descriptions,
    accountItemIds,
    itemIds,
  };
}

function classifyDeal(deal, partnerName, accountMap, itemMap, rulesConfig) {
  const ctx = buildCtx(deal, partnerName, accountMap, itemMap);
  const rules = Array.isArray(rulesConfig.rules) ? rulesConfig.rules : [];
  for (const r of rules) {
    if (!r || !r.if || !r.bucket) continue;
    if (!VALID_BUCKETS.has(r.bucket)) continue;
    if (ruleMatches(r.if, ctx)) return r.bucket;
  }
  const d = rulesConfig.default_bucket;
  return VALID_BUCKETS.has(d) ? d : 'spot';
}

function emptyByBucket() {
  return {
    consulting: { amount: 0, count: 0 },
    ops: { amount: 0, count: 0 },
    spot: { amount: 0, count: 0 },
  };
}

module.exports = {
  loadRevenueRules,
  classifyDeal,
  emptyByBucket,
  VALID_BUCKETS,
};
