// ============================================================
// TASUKE.AI — レシート自動取込（OCR → 仕分け → freee登録）
// ============================================================
// 正式運用: 撮影画像をリポジトリの receipts/ に入れる → npm run receipt（既定で ./receipts/ を処理）
//   絶対パス例: /Volumes/Home_Mac_SSD/02_Development/04_AI_Lab/TASUKE-AI/receipts
// ============================================================
// 使い方:
//   npm run receipt                             — ./receipts/ 内を一括（推奨）
//   node receipt-import.js <画像ファイル or フォルダ>
//   node receipt-import.js ./receipts/           — フォルダ内の画像を一括処理
//   node receipt-import.js receipt.jpg            — 1枚だけ処理
//   node receipt-import.js --dry-run ./receipts/  — freee登録せずプレビュー
//   node receipt-import.js --learn               — freeeから仕分けルールを再学習
//   node receipt-import.js --no-compress <dir>   — 登録後も元の巨大画像のまま（省略時はJPEG化して軽量化）
//
// OCR（Gemini）環境変数:
//   RECEIPT_GEMINI_MODEL      — 既定 gemini-2.5-flash（旧 GAS は 2.0-flash 相当）
//   RECEIPT_OCR_PARTNER_PROMPT_MAX — receipt-rules.json からプロンプトに載せる取引先名の最大件数（既定 120）
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { GoogleGenAI } = require('@google/genai');
const { loadToken, getAccessToken, refreshToken, httpsGet } = require('./freee-auth');

const { execSync } = require('child_process');

const RULES_FILE = path.join(__dirname, 'receipt-rules.json');
/** 同一画像の二重登録を防ぐ（ファイル内容のSHA-256） */
const STATE_FILE = path.join(__dirname, 'receipt-import-state.json');
const SUPPORTED_EXT = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.pdf'];
const MAX_IMAGE_WIDTH = 1200;

/** freee 明細の「備考」欄 — このスクリプト経由の取込はすべて同一文言（取引メモは使わない） */
const RECEIPT_IMPORT_REMARK = process.env.RECEIPT_IMPORT_REMARK || process.env.RECEIPT_IMPORT_DESC_PREFIX || 'TASUKE-AI';
/** ルール未登録の新規店舗で、勘定を推測できないときのデフォルト（経費の勘定科目名） */
const RECEIPT_NEW_ACCOUNT_NAME = process.env.RECEIPT_NEW_ACCOUNT_NAME || '消耗品費';
/** 品目が決まらないときの最終フォールバック（freee の品目マスタに存在する名前） */
const RECEIPT_DEFAULT_ITEM_NAME = process.env.RECEIPT_DEFAULT_ITEM_NAME || '事務用品';
/** 飲食店レシートで交際費になったとき、事務用品より優先する品目名（マスタに無ければ次へ） */
const RECEIPT_DINING_DEFAULT_ITEM_NAME = process.env.RECEIPT_DINING_DEFAULT_ITEM_NAME || '飲食';
/** 部門が決まらないときのフォールバック（freee の部門名） */
const RECEIPT_DEFAULT_SECTION_NAME = process.env.RECEIPT_DEFAULT_SECTION_NAME || '営業';
const RECEIPT_DEFAULT_SECTION_ID = process.env.RECEIPT_DEFAULT_SECTION_ID
  ? parseInt(process.env.RECEIPT_DEFAULT_SECTION_ID, 10)
  : null;

/** 勘定科目名 → 部門マスタで探す候補名（過去の freee 取引の流れに合わせる） */
const ACCOUNT_ITEM_TO_SECTION_NAMES = {
  交際費: ['営業', 'マーケティング', '事務'],
  消耗品費: ['事務', '営業', 'マーケティング'],
  旅費交通費: ['営業', '事務'],
  会議費: ['営業', '事務'],
  雑費: ['事務', '営業'],
  通信費: ['事務', '営業'],
  新聞図書費: ['事務', '営業'],
  車両費: ['営業', '事務'],
  広告宣伝費: ['マーケティング', '営業'],
  福利厚生費: ['事務', '営業'],
  法定福利費: ['事務', '営業'],
  事業主貸: ['生活関連', '生活'],
};

/** 店名から「外食・飲食店」とみなす（勘定を交際費に寄せる） */
const STORE_DINING_HINTS =
  /らーめん|ラーメン|拉麺|つけ麺|うどん|そば|蕎麦|丼|食堂|定食|カフェ|喫茶|レストラン|飲食|牛丼|寿司|すし|焼肉|ステーキ|パン|ベーカリー|居酒屋|酒場|ダイニング|珈琲|コーヒー|スタバ|マクド|すき家|吉野家|松屋|餃子|とんかつ|天ぷら|ピザ|バー|BAR|ファミレス|ファーストキッチン|モスバーガー|ケンタッキー/i;
/** 最優先フォールバック（数値 ID を直接指定する場合。RECEIPT_DEFAULT_ITEM_NAME より優先） */
const RECEIPT_DEFAULT_ITEM_ID = process.env.RECEIPT_DEFAULT_ITEM_ID
  ? parseInt(process.env.RECEIPT_DEFAULT_ITEM_ID, 10)
  : null;

/** 勘定科目名 → 品目マスタで探す候補名（先頭から順） */
const ACCOUNT_ITEM_TO_ITEM_NAMES = {
  交際費: ['飲食', '交際', '交際費', '飲食費', '会議費'],
  消耗品費: ['事務用品', '消耗品', '消耗品費'],
  旅費交通費: ['交通費', '旅費', '交通'],
  会議費: ['会議', '会議費'],
  雑費: ['雑費'],
  通信費: ['通信', '通信費'],
  新聞図書費: ['新聞図書', '書籍'],
  車両費: ['車両', '燃料', 'ガソリン'],
  広告宣伝費: ['広告', '宣伝'],
  福利厚生費: ['福利厚生'],
  法定福利費: ['法定福利'],
  事業主貸: ['生活', '事業主貸'],
};

/** Gemini / 表記ゆれに合わせて経費科目へ寄せる（部分一致用） */
const CANONICAL_EXPENSE_NAMES = [
  '交際費', '旅費交通費', '会議費', '消耗品費', '雑費', '通信費', '新聞図書費', '車両費',
  '広告宣伝費', '水道光熱費', '修繕費', '租税公課', '外注費', '福利厚生費', '法定福利費',
  '荷造運賃', '減価償却費', '地代家賃', '支払手数料', '事務用品費',
];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/** Gemini レシートOCR用モデル（既定: gemini-2.5-flash）。GAS 版は gemini-2.0-flash 相当 */
const RECEIPT_GEMINI_MODEL = process.env.RECEIPT_GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * receipt-rules.json の取引先キーを最大 N 件、プロンプト用に列挙（GAS の PARTNERS 相当）
 * @returns {string}
 */
function getPartnerNamesForOcrPrompt() {
  const max = Math.min(
    parseInt(process.env.RECEIPT_OCR_PARTNER_PROMPT_MAX || '120', 10) || 120,
    300,
  );
  try {
    if (!fs.existsSync(RULES_FILE)) return '';
    const data = JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
    const keys = Object.keys(data.rules || {}).filter(Boolean);
    keys.sort((a, b) => a.localeCompare(b, 'ja'));
    return keys.slice(0, max).join(', ');
  } catch {
    return '';
  }
}

/**
 * GAS（TOMOSU Receipt）の system プロンプトに相当する指示＋本スクリプト用の出力スキーマ
 */
function buildReceiptOcrSystemPrompt() {
  const partnerBlock = getPartnerNamesForOcrPrompt();
  return `あなたはレシート・領収書のOCR＋仕訳候補を出すAIです。
画像から読み取り、**JSONのみ**で返してください。説明文やマークダウンは禁止です。

## 出力JSON（必ずこの形）
{
  "receipts": [
    {
      "store_name": "店名（正式名称に近い形）",
      "date": "YYYY-MM-DD または null",
      "total_amount": 数値（税込合計・支払額）,
      "tax_amount": 数値または null（消費税額。分かる場合のみ）,
      "items": ["購入品目や摘要の短い列挙（配列。不明なら []）],
      "payment_method": "現金 or カード or 電子マネー or その他 or 不明",
      "category_guess": "freeeの勘定科目に近い名前1つ（経費科目）",
      "item_guess": "freeeの「品目」に近い名称1つ（不明なら null）",
      "section_guess": "freeeの「部門」に近い名称1つ（例: 営業、事務、マーケティング、Web制作、生活関連。不明なら null）",
      "tax_uncertain": true/false（税率・税区分が読めない・曖昧なら true）,
      "raw_text": "レシート上の主要テキストの要約（数行以内）"
    }
  ]
}

## Few-shot

### 例1: コンビニ（文房具）
入力: ローソン、2026-02-17、ボールペン 税込550円
出力:
{"receipts":[{"store_name":"ローソン","date":"2026-02-17","total_amount":550,"tax_amount":null,"items":["ボールペン"],"payment_method":"不明","category_guess":"消耗品費","item_guess":"事務用品","section_guess":"事務","tax_uncertain":false,"raw_text":"ローソン 2026-02-17 合計550円"}]}

### 例2: ガソリン
入力: ENEOS、レギュラー、税込5400円
出力:
{"receipts":[{"store_name":"ENEOS","date":null,"total_amount":5400,"tax_amount":null,"items":["レギュラー給油"],"payment_method":"不明","category_guess":"車両費","item_guess":"ガソリン代","section_guess":"営業","tax_uncertain":false,"raw_text":"ENEOS 給油 5400円"}]}

### 例3: 飲食店（外食）
入力: 〇〇ラーメン、税込1200円
出力:
{"receipts":[{"store_name":"〇〇ラーメン","date":null,"total_amount":1200,"tax_amount":null,"items":["食事"],"payment_method":"不明","category_guess":"交際費","item_guess":"飲食","section_guess":"営業","tax_uncertain":false,"raw_text":"ラーメン店 合計1200円"}]}

## OCR・抽出ルール
1. **金額**: 「¥」「円」「,」を除いた数値。**合計・お支払額**を優先（小計・サブトータルは使わない）
2. **日付**: 2026/02/17, 2026-2-17, 2026.2.17, 令和8年2月17日, R8.2.17 等を **YYYY-MM-DD** に正規化。読めなければ null
3. **店名**: レシート先頭の店舗名を優先。略称は正式に近い形へ
4. **複数レシート**が1画像/PDFにある場合は receipts に**複数要素**
5. **複数税率**があっても**支払合計は1行**（total_amount は1つ）
6. 読み取りに自信がない箇所は tax_uncertain=true とし raw_text に状況を書く

## 仕訳の考え方（category_guess / item_guess）
- **飲食店・カフェ・ラーメン・食堂・牛丼チェーン等での食事**は **交際費** を優先し、**事務用品費・消耗品費にしない**
- コンビニ・ドラッグストアは**買った内容**で判断（文房具→消耗品費寄り、弁当のみ→福利厚生費や交際費の可能性）
- ガソリンスタンド → 車両費、品目はガソリン代寄り
- 鉄道・バス・タクシー・IC運賃 → 旅費交通費寄り
- 駐車場 → 旅費交通費寄りが多い

## 既知の取引先名（過去の freee 取引から。最も近い表記に寄せる）
${partnerBlock ? partnerBlock : '（マスタ未読込: receipt-rules.json を --learn で生成すると補強されます）'}

## 部門の例
Web制作, マーケティング, 事務, 制作, 営業, 撮影・素材制作, 生活関連, 管理 など

## 禁止
- JSON 以外の文字
- コメントや説明文
- 桁の取り違え（金額は必ず再確認）`;
}

function parseGeminiReceiptJson(text) {
  let clean = String(text || '').replace(/```json|```/gi, '').trim();
  if (!clean) throw new Error('Gemini OCR: 応答が空でした');

  try {
    return JSON.parse(clean);
  } catch (e) {
    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace > 0) {
      let attempt = clean.substring(0, lastBrace + 1);
      if (attempt.trimStart().startsWith('[') && !attempt.trimEnd().endsWith(']')) {
        attempt += ']';
      }
      try {
        return JSON.parse(attempt);
      } catch (e2) {
        /* fall through */
      }
    }
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e3) {
        throw new Error(`Gemini OCR: JSONを解析できませんでした: ${e.message}`);
      }
    }
    throw new Error(`Gemini OCR: JSONを解析できませんでした: ${e.message}`);
  }
}

/** YYYY/MM/DD 等 → YYYY-MM-DD */
function normalizeDateToYmd(d) {
  if (d == null || d === '') return null;
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}

function normalizeOcrReceiptRow(r) {
  const storeName = (r.store_name || r.partner || r.store || '').toString().trim();
  let total = r.total_amount;
  if (total == null && r.amount != null) total = r.amount;
  if (typeof total === 'string') total = Number(total.replace(/[,¥円\s]/g, ''));
  if (total != null && Number.isNaN(Number(total))) total = null;
  else if (total != null) total = Number(total);

  const dateNorm = normalizeDateToYmd(r.date) || (r.date ? String(r.date).trim() : null);

  return {
    ...r,
    store_name: storeName,
    date: dateNorm,
    total_amount: total,
    category_guess: (r.category_guess || r.account || '').toString().trim(),
    item_guess: r.item_guess != null && r.item_guess !== ''
      ? String(r.item_guess).trim()
      : (r.item != null ? String(r.item).trim() : ''),
    section_guess: r.section_guess != null && r.section_guess !== ''
      ? String(r.section_guess).trim()
      : (r.section != null ? String(r.section).trim() : ''),
    items: Array.isArray(r.items) ? r.items : (r.items ? [r.items] : []),
    payment_method: r.payment_method || '不明',
    tax_uncertain: !!r.tax_uncertain,
    raw_text: (r.raw_text || r.memo || '').toString(),
  };
}

function normalizeOcrEnvelope(parsed) {
  let list;
  if (parsed && Array.isArray(parsed.receipts)) {
    list = parsed.receipts;
  } else if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && (parsed.store_name || parsed.partner || parsed.store)) {
    list = [parsed];
  } else {
    list = [];
  }

  const filtered = list.filter((r) => r && (r.date != null || r.total_amount != null || r.amount != null || r.store_name || r.partner));
  const receipts = filtered.map(normalizeOcrReceiptRow);
  return { receipts };
}

function buildReceiptLineDescription(_receipt) {
  return RECEIPT_IMPORT_REMARK;
}

/** OCR で日付が null のとき、画像ファイルの更新日時を YYYY-MM-DD として使う */
function ensureReceiptDate(receipt, filePath) {
  if (receipt.date) return;
  try {
    const st = fs.statSync(filePath);
    const d = new Date(st.mtime);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    receipt.date = `${y}-${m}-${day}`;
    console.log(`  ℹ️ 日付が読めないため、ファイル日付を使用: ${receipt.date}`);
  } catch (_) {
    /* noop */
  }
}

// ─── freee API POST ──────────────────────────────────────────

function httpsPost(hostname, urlPath, body, accessToken) {
  return new Promise((resolve, reject) => {
    const jsonBody = JSON.stringify(body);
    const req = https.request({
      hostname,
      path: urlPath,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonBody),
        'User-Agent': 'TASUKE-AI/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          reject(new Error(`JSON parse error: ${data.substring(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(jsonBody);
    req.end();
  });
}

// ─── freee APIアクセス（自動リフレッシュ） ────────────────────

async function getFreeeToken() {
  let accessToken = getAccessToken();
  if (!accessToken) {
    console.log('🔄 トークンリフレッシュ中...');
    await refreshToken();
    accessToken = getAccessToken();
    if (!accessToken) throw new Error('freee認証が必要です。node freee-auth.js setup を実行してください');
  }
  return accessToken;
}

// ─── 仕分けルール読み込み ────────────────────────────────────

function loadRules() {
  if (!fs.existsSync(RULES_FILE)) {
    console.error('✗ receipt-rules.json がありません。--learn で生成してください');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
}

function fileContentHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function loadImportState() {
  if (!fs.existsSync(STATE_FILE)) return { version: 1, files: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { version: 1, files: {} };
  }
}

function saveImportState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function recordRegisteredFile(state, hash, meta) {
  if (!state.files) state.files = {};
  state.files[hash] = {
    ...meta,
    registered_at: new Date().toISOString(),
  };
  saveImportState(state);
}

/** 登録後に画像を置き換えたとき、重複チェック用ハッシュを付け替える */
function migrateImportStateHash(state, fromHash, toHash, extra = {}) {
  if (!state.files || !state.files[fromHash]) return;
  const prev = state.files[fromHash];
  delete state.files[fromHash];
  state.files[toHash] = {
    ...prev,
    ...extra,
  };
  saveImportState(state);
}

/** macOS の case-insensitive ボリュームで IMG_2573.JPG と IMG_2573.jpg を同一とみなす */
function isSameFilePath(a, b) {
  try {
    if (path.resolve(a) === path.resolve(b)) return true;
    const ra = fs.realpathSync.native(a);
    const rb = fs.realpathSync.native(b);
    return ra === rb;
  } catch {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  }
}

/**
 * レシート画像を長辺 MAX_IMAGE_WIDTH の JPEG にし、元ファイルを置き換え（または HEIC 等は .jpg に変更）
 * @returns {{ ok: boolean, path?: string, origSize?: number, newSize?: number, reason?: string }}
 */
function compressImageInPlace(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.pdf') return { ok: false, reason: 'pdf' };

  const dir = path.dirname(imagePath);
  const base = path.basename(imagePath, path.extname(imagePath));
  const outPath = path.join(dir, `${base}.jpg`);
  const tmpPath = path.join(require('os').tmpdir(), `receipt_compress_${Date.now()}.jpg`);

  try {
    execSync(`sips --resampleWidth ${MAX_IMAGE_WIDTH} -s format jpeg "${imagePath}" --out "${tmpPath}" 2>/dev/null`);
  } catch (e) {
    return { ok: false, reason: String(e.message || e) };
  }

  if (!fs.existsSync(tmpPath)) return { ok: false, reason: 'sips出力なし' };

  const origSize = fs.statSync(imagePath).size;
  const newSize = fs.statSync(tmpPath).size;

  if (isSameFilePath(outPath, imagePath)) {
    fs.copyFileSync(tmpPath, imagePath);
    fs.unlinkSync(tmpPath);
    return { ok: true, path: imagePath, origSize, newSize };
  }

  // 別ボリューム（外付けSSD等）では rename が EXDEV で失敗するため copy + unlink
  try {
    fs.copyFileSync(tmpPath, outPath);
    fs.unlinkSync(imagePath);
    fs.unlinkSync(tmpPath);
  } catch (e) {
    try {
      fs.unlinkSync(tmpPath);
    } catch (_) { /* ignore */ }
    return { ok: false, reason: String(e.message || e) };
  }
  return { ok: true, path: outPath, origSize, newSize };
}

// ─── Gemini OCR ──────────────────────────────────────────────

function resizeImage(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  if (ext === '.pdf') return imagePath;

  try {
    const sizeOut = execSync(`sips -g pixelWidth "${imagePath}" 2>/dev/null`).toString();
    const widthMatch = sizeOut.match(/pixelWidth:\s*(\d+)/);
    const width = widthMatch ? parseInt(widthMatch[1]) : 0;

    if (width <= MAX_IMAGE_WIDTH) return imagePath;

    const tmpPath = path.join(require('os').tmpdir(), `receipt_${Date.now()}.jpg`);
    execSync(`sips --resampleWidth ${MAX_IMAGE_WIDTH} -s format jpeg "${imagePath}" --out "${tmpPath}" 2>/dev/null`);
    const origSize = fs.statSync(imagePath).size;
    const newSize = fs.statSync(tmpPath).size;
    console.log(`  📐 リサイズ: ${(origSize / 1024 / 1024).toFixed(1)}MB → ${(newSize / 1024).toFixed(0)}KB`);
    return tmpPath;
  } catch {
    return imagePath;
  }
}

async function ocrReceipt(imagePath) {
  const resizedPath = resizeImage(imagePath);
  const ext = path.extname(resizedPath).toLowerCase();
  const mimeMap = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.heic': 'image/heic', '.webp': 'image/webp', '.pdf': 'application/pdf',
  };
  const mimeType = mimeMap[ext] || 'image/jpeg';
  const imageData = fs.readFileSync(resizedPath);
  const base64 = imageData.toString('base64');

  const userText =
    mimeType === 'application/pdf'
      ? 'このPDFに含まれるレシート／領収書をすべて読み取り、system の指示どおり **JSONオブジェクト1つ**（receipts 配列）だけを返してください。'
      : 'このレシート／領収書を読み取り、system の指示どおり **JSONオブジェクト1つ**（receipts 配列）だけを返してください。';

  const response = await ai.models.generateContent({
    model: RECEIPT_GEMINI_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: userText },
        ],
      },
    ],
    config: {
      systemInstruction: buildReceiptOcrSystemPrompt(),
      temperature: 0,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const text = response.text || '';
  const parsed = parseGeminiReceiptJson(text);
  return normalizeOcrEnvelope(parsed);
}

// ─── 仕分けマッチング ───────────────────────────────────────

/** レシートに「ブランド＋施設名」が並ぶと、施設名ルールに先にマッチしてしまうためブランドを優先 */
const BRAND_RULE_KEYS = [
  { re: /ダイソー|ＤＡＩＳＯ|DAISO|だいそー/i, key: 'DAISO' },
];

function matchRule(storeName, rules) {
  const ruleEntries = rules.rules || {};

  for (const { re, key } of BRAND_RULE_KEYS) {
    if (re.test(storeName) && ruleEntries[key]) {
      return { ...ruleEntries[key], match_type: 'ブランド優先', matched_name: key };
    }
  }

  // 完全一致
  if (ruleEntries[storeName]) {
    return { ...ruleEntries[storeName], match_type: '完全一致' };
  }

  // 部分一致（店名がルールに含まれる or ルールが店名に含まれる）
  for (const [ruleName, rule] of Object.entries(ruleEntries)) {
    if (storeName.includes(ruleName) || ruleName.includes(storeName)) {
      return { ...rule, match_type: '部分一致', matched_name: ruleName };
    }
  }

  // カタカナ・ひらがな正規化して再マッチ
  const normalize = (s) => s.replace(/[\s\-・]/g, '').toLowerCase();
  const normalizedStore = normalize(storeName);
  for (const [ruleName, rule] of Object.entries(ruleEntries)) {
    if (normalize(ruleName) === normalizedStore) {
      return { ...rule, match_type: '正規化一致', matched_name: ruleName };
    }
  }

  return null;
}

// ─── 新規取引先（freee partners API）──────────────────────────

function findPartnerExactName(partners, storeName) {
  const n = storeName.trim();
  const compact = (s) => s.replace(/[\s　]/g, '');
  return partners.find(
    (p) => p.name === n || compact(p.name) === compact(n),
  );
}

async function searchPartnersByKeyword(companyId, keyword, accessToken) {
  const q = encodeURIComponent((keyword || '').trim().slice(0, 40));
  const r = await httpsGet(
    'api.freee.co.jp',
    `/api/1/partners?company_id=${companyId}&keyword=${q}&limit=100`,
    accessToken,
  );
  return r.body.partners || [];
}

/**
 * 取引先名で検索し、一致すればその ID。なければ POST で新規作成。
 */
async function ensurePartner(companyId, storeName, accessToken) {
  const trimmed = (storeName || '').trim();
  if (!trimmed) throw new Error('店名が空のため取引先を作成できません');

  let partners = await searchPartnersByKeyword(companyId, trimmed, accessToken);
  let hit = findPartnerExactName(partners, trimmed);
  if (hit) return { id: hit.id, created: false };

  if (trimmed.length > 18) {
    partners = await searchPartnersByKeyword(companyId, trimmed.slice(0, 16), accessToken);
    hit = findPartnerExactName(partners, trimmed);
    if (hit) return { id: hit.id, created: false };
  }

  let res = await httpsPost('api.freee.co.jp', '/api/1/partners', {
    company_id: companyId,
    name: trimmed,
  }, accessToken);

  if (res.status === 201 && res.body.partner?.id) {
    return { id: res.body.partner.id, created: true };
  }

  const dup = JSON.stringify(res.body || {}).includes('既に使用');
  if (dup) {
    partners = await searchPartnersByKeyword(companyId, trimmed, accessToken);
    hit = findPartnerExactName(partners, trimmed);
    if (hit) return { id: hit.id, created: false };
  }

  throw new Error(`取引先の作成に失敗: ${JSON.stringify(res.body)}`);
}

function pickAccountItemFromGuess(categoryGuess, expenseItems, storeName) {
  const store = (storeName || '').trim();

  /** ラーメン屋等は消耗品にしない */
  if (STORE_DINING_HINTS.test(store)) {
    const kousai = expenseItems.find((a) => a.name === '交際費');
    if (kousai) return kousai;
  }

  const g = (categoryGuess || '').trim();
  const norm = (s) => s.replace(/[\s　]/g, '');

  const pickFallback = () => {
    const name = RECEIPT_NEW_ACCOUNT_NAME;
    const fb = expenseItems.find((a) => a.name === name);
    return fb || expenseItems[0];
  };

  if (!g) {
    if (STORE_DINING_HINTS.test(store)) {
      const kousai = expenseItems.find((a) => a.name === '交際費');
      if (kousai) return kousai;
    }
    return pickFallback();
  }

  /** Gemini が消耗品と言っても店が飲食店なら交際費 */
  if (STORE_DINING_HINTS.test(store) && (g.includes('消耗品') || g.includes('事務'))) {
    const kousai = expenseItems.find((a) => a.name === '交際費');
    if (kousai) return kousai;
  }

  let hit = expenseItems.find((a) => a.name === g);
  if (hit) return hit;

  for (const canon of CANONICAL_EXPENSE_NAMES) {
    if (g.includes(canon) || canon.includes(g)) {
      hit = expenseItems.find((a) => a.name === canon);
      if (hit) return hit;
    }
  }

  const gn = norm(g);
  for (const a of expenseItems) {
    if (gn.includes(norm(a.name)) || norm(a.name).includes(gn)) return a;
  }

  return pickFallback();
}

function taxCodeFromAccountItem(accountItem) {
  if (accountItem.default_tax_code != null) return accountItem.default_tax_code;
  if (accountItem.tax_code != null) return accountItem.tax_code;
  return 136;
}

/**
 * freee 品目マスタから1件選ぶ（必ず item_id を付ける）
 * @param {object} rule
 * @param {object} receipt
 * @param {Array} items GET /items の配列
 * @returns {{ id: number, name: string } | null}
 */
function pickItemIdForRule(rule, receipt, items) {
  const list = (items || []).filter((i) => i.available !== false);
  if (!list.length) return null;

  if (RECEIPT_DEFAULT_ITEM_ID && !Number.isNaN(RECEIPT_DEFAULT_ITEM_ID)) {
    const byId = list.find((i) => i.id === RECEIPT_DEFAULT_ITEM_ID);
    if (byId) return byId;
  }

  if (rule.item_id) {
    const byId = list.find((i) => i.id === rule.item_id);
    if (byId) return byId;
  }

  const ig = (receipt.item_guess || '').trim();
  const diningStore = STORE_DINING_HINTS.test(receipt.store_name || '');
  /** 飲食店なのに item_guess が事務系だけのときは無視（事務用品に落ちない） */
  const ignoreBadItemGuess = diningStore && /事務|消耗品|文具|コピー/.test(ig) && !/飲食|交際|食|メシ|ラーメン|麺/.test(ig);
  if (ig && !ignoreBadItemGuess) {
    let hit = list.find((i) => i.name === ig);
    if (hit) return hit;
    hit = list.find((i) => (i.name && (i.name.includes(ig) || ig.includes(i.name))));
    if (hit) return hit;
  }

  for (const line of receipt.items || []) {
    const l = String(line).trim();
    if (l.length < 2) continue;
    const hit = list.find(
      (i) => i.name && (l.includes(i.name) || (i.name.length >= 2 && l.includes(i.name.slice(0, 8)))),
    );
    if (hit) return hit;
  }

  const hints = ACCOUNT_ITEM_TO_ITEM_NAMES[rule.account_item_name] || [];
  for (const h of hints) {
    const hit = list.find(
      (i) => i.name === h || (i.name && (i.name.includes(h) || h.includes(i.name))),
    );
    if (hit) return hit;
  }

  if (rule.account_item_name === '交際費' && diningStore) {
    const preferDining = [RECEIPT_DINING_DEFAULT_ITEM_NAME, '飲食', '交際', '交際費', '飲食費'];
    for (const h of preferDining) {
      const x = list.find((i) => i.name === h || (i.name && i.name.includes(h)));
      if (x) return x;
    }
  }

  const defName = RECEIPT_DEFAULT_ITEM_NAME;
  let hit = list.find((i) => i.name === defName);
  if (hit) return hit;
  hit = list.find((i) => i.name && (i.name.includes(defName) || defName.includes(i.name)));
  if (hit) return hit;

  return null;
}

function resolveItemOnRule(rule, receipt, items) {
  const picked = pickItemIdForRule(rule, receipt, items);
  if (!picked) {
    throw new Error(
      `品目を決められません。freee に「${RECEIPT_DEFAULT_ITEM_NAME}」等の品目を作成するか、RECEIPT_DEFAULT_ITEM_ID（数値）を .env に設定してください。`,
    );
  }
  return {
    ...rule,
    item_id: picked.id,
    item_name: picked.name,
  };
}

/**
 * @param {Array} sections GET /sections の sections 配列
 * @returns {{ id: number, name: string } | null}
 */
function pickSectionIdForRule(rule, receipt, sections) {
  const list = (sections || []).filter((s) => s.available !== false);
  if (!list.length) return null;

  if (RECEIPT_DEFAULT_SECTION_ID && !Number.isNaN(RECEIPT_DEFAULT_SECTION_ID)) {
    const h = list.find((s) => s.id === RECEIPT_DEFAULT_SECTION_ID);
    if (h) return h;
  }

  if (rule.section_id) {
    const h = list.find((s) => s.id === rule.section_id);
    if (h) return h;
  }

  const sg = (receipt.section_guess || '').trim();
  if (sg) {
    let hit = list.find((s) => s.name === sg);
    if (hit) return hit;
    hit = list.find((s) => s.name && (s.name.includes(sg) || sg.includes(s.name)));
    if (hit) return hit;
  }

  const hints = ACCOUNT_ITEM_TO_SECTION_NAMES[rule.account_item_name] || [];
  for (const name of hints) {
    const hit = list.find(
      (s) => s.name === name || (s.name && (s.name.includes(name) || name.includes(s.name))),
    );
    if (hit) return hit;
  }

  if (STORE_DINING_HINTS.test(receipt.store_name || '') && rule.account_item_name === '交際費') {
    for (const name of ['営業', 'マーケティング', '事務']) {
      const hit = list.find((s) => s.name === name);
      if (hit) return hit;
    }
  }

  const def = RECEIPT_DEFAULT_SECTION_NAME;
  let hit = list.find((s) => s.name === def);
  if (hit) return hit;
  hit = list.find((s) => s.name && (s.name.includes(def) || def.includes(s.name)));
  return hit || null;
}

function resolveSectionOnRule(rule, receipt, sections) {
  const picked = pickSectionIdForRule(rule, receipt, sections);
  if (!picked) {
    return { ...rule, section_id: rule.section_id || null, section_name: rule.section_name || '' };
  }
  return {
    ...rule,
    section_id: picked.id,
    section_name: picked.name,
  };
}

// ─── freee取引登録 ───────────────────────────────────────────

const WALLET_MAP = {
  '現金': { type: 'wallet', id: 6820123 },
  'paypay': { type: 'wallet', id: 7236189 },
  'suica': { type: 'wallet', id: 7675312 },
  'メルペイ': { type: 'wallet', id: 7675369 },
};

function resolveWallet(paymentMethod) {
  if (!paymentMethod) return WALLET_MAP['現金'];
  const lower = (paymentMethod || '').toLowerCase();
  if (lower.includes('paypay')) return WALLET_MAP['paypay'];
  if (lower.includes('suica') || lower.includes('交通系')) return WALLET_MAP['suica'];
  if (lower.includes('メルペイ') || lower.includes('merpay')) return WALLET_MAP['メルペイ'];
  if (lower.includes('現金') || lower.includes('cash')) return WALLET_MAP['現金'];
  return WALLET_MAP['現金'];
}

async function registerToFreee(receipt, rule, companyId, accessToken) {
  const wallet = resolveWallet(receipt.payment_method);
  const body = {
    company_id: companyId,
    issue_date: receipt.date,
    type: 'expense',
    partner_id: rule.partner_id || undefined,
    details: [{
      account_item_id: rule.account_item_id,
      tax_code: rule.tax_code,
      amount: receipt.total_amount,
      item_id: rule.item_id || undefined,
      section_id: rule.section_id || undefined,
      description: buildReceiptLineDescription(receipt),
    }],
    payments: [{
      amount: receipt.total_amount,
      from_walletable_type: wallet.type,
      from_walletable_id: wallet.id,
      date: receipt.date,
    }],
  };

  const res = await httpsPost('api.freee.co.jp', '/api/1/deals', body, accessToken);
  return res;
}

// ─── 仕分けルール再学習 ─────────────────────────────────────

async function learnRules() {
  console.log('📚 freeeから仕分けルールを再学習中...\n');
  const accessToken = await getFreeeToken();
  const token = loadToken();
  const companyId = token.company_id;

  let allDeals = [];
  let offset = 0;
  while (true) {
    const res = await httpsGet('api.freee.co.jp', `/api/1/deals?company_id=${companyId}&type=expense&limit=100&offset=${offset}`, accessToken);
    const deals = res.body.deals || [];
    allDeals.push(...deals);
    if (deals.length < 100) break;
    offset += 100;
  }

  const acRes = await httpsGet('api.freee.co.jp', `/api/1/account_items?company_id=${companyId}`, accessToken);
  const acMap = {}; for (const i of (acRes.body.account_items || [])) { acMap[i.id] = i.name; }
  const itemRes = await httpsGet('api.freee.co.jp', `/api/1/items?company_id=${companyId}`, accessToken);
  const itemMap = {}; for (const i of (itemRes.body.items || [])) { itemMap[i.id] = i.name; }
  const secRes = await httpsGet('api.freee.co.jp', `/api/1/sections?company_id=${companyId}`, accessToken);
  const secMap = {}; for (const s of (secRes.body.sections || [])) { secMap[s.id] = s.name; }

  let partMap = {};
  let partOffset = 0;
  while (true) {
    const res = await httpsGet('api.freee.co.jp', `/api/1/partners?company_id=${companyId}&limit=100&offset=${partOffset}`, accessToken);
    const partners = res.body.partners || [];
    for (const p of partners) { partMap[p.id] = p.name; }
    if (partners.length < 100) break;
    partOffset += 100;
  }

  const ruleMap = {};
  for (const deal of allDeals) {
    const pName = partMap[deal.partner_id] || '';
    if (!pName) continue;
    for (const d of (deal.details || [])) {
      const key = pName;
      if (!ruleMap[key]) ruleMap[key] = {};
      const rKey = `${d.account_item_id}|${d.item_id || ''}|${d.section_id || ''}`;
      if (!ruleMap[key][rKey]) {
        ruleMap[key][rKey] = {
          account_item_id: d.account_item_id,
          account_item_name: acMap[d.account_item_id] || '',
          tax_code: d.tax_code,
          item_id: d.item_id || null,
          item_name: itemMap[d.item_id] || '',
          section_id: d.section_id || null,
          section_name: secMap[d.section_id] || '',
          count: 0,
        };
      }
      ruleMap[key][rKey].count++;
    }
  }

  const rules = {};
  for (const [partner, patterns] of Object.entries(ruleMap)) {
    const best = Object.values(patterns).sort((a, b) => b.count - a.count)[0];
    rules[partner] = {
      partner_id: allDeals.find(d => partMap[d.partner_id] === partner)?.partner_id || null,
      account_item_id: best.account_item_id,
      account_item_name: best.account_item_name,
      tax_code: best.tax_code,
      item_id: best.item_id,
      item_name: best.item_name,
      section_id: best.section_id,
      section_name: best.section_name,
      match_count: best.count,
    };
  }

  const output = {
    generated_at: new Date().toISOString(),
    company_id: companyId,
    total_deals_analyzed: allDeals.length,
    rules,
    masters: { account_items: acMap, items: itemMap, sections: secMap, partners: partMap },
  };

  fs.writeFileSync(RULES_FILE, JSON.stringify(output, null, 2));
  console.log(`✓ 仕分けルール更新完了`);
  console.log(`  取引先ルール数: ${Object.keys(rules).length}`);
  console.log(`  分析した取引数: ${allDeals.length}`);
}

// ─── メイン処理 ──────────────────────────────────────────────

async function processReceipts(targets, isDryRun, options = {}) {
  const { forceRegister = false, compressAfter = true } = options;
  const rulesData = loadRules();
  const accessToken = await getFreeeToken();
  const token = loadToken();
  const companyId = token.company_id;
  const importState = loadImportState();

  let files = [];
  for (const target of targets) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      const dirFiles = fs.readdirSync(target)
        .filter(f => SUPPORTED_EXT.includes(path.extname(f).toLowerCase()))
        .map(f => path.join(target, f));
      files.push(...dirFiles);
    } else {
      files.push(target);
    }
  }

  if (files.length === 0) {
    console.error('✗ 対象ファイルがありません');
    process.exit(1);
  }

  console.log(`\n📸 レシート取込開始: ${files.length}ファイル\n`);

  let registered = 0, skipped = 0, needReview = 0, duplicate = 0;

  let expenseAccountsCache = null;
  async function getExpenseAccountItems() {
    if (expenseAccountsCache) return expenseAccountsCache;
    const r = await httpsGet(
      'api.freee.co.jp',
      `/api/1/account_items?company_id=${companyId}`,
      accessToken,
    );
    expenseAccountsCache = (r.body.account_items || []).filter(
      (a) => a.account_category === '経費' && a.available,
    );
    return expenseAccountsCache;
  }

  let itemsMasterCache = null;
  async function getItemsMaster() {
    if (itemsMasterCache) return itemsMasterCache;
    const r = await httpsGet(
      'api.freee.co.jp',
      `/api/1/items?company_id=${companyId}`,
      accessToken,
    );
    itemsMasterCache = r.body.items || [];
    return itemsMasterCache;
  }

  let sectionsMasterCache = null;
  async function getSectionsMaster() {
    if (sectionsMasterCache) return sectionsMasterCache;
    const r = await httpsGet(
      'api.freee.co.jp',
      `/api/1/sections?company_id=${companyId}`,
      accessToken,
    );
    sectionsMasterCache = r.body.sections || [];
    return sectionsMasterCache;
  }

  for (const file of files) {
    console.log(`─── ${path.basename(file)} ───`);

    const contentHash = fileContentHash(file);
    const prev = importState.files && importState.files[contentHash];
    if (prev && !forceRegister) {
      console.log(`  ⏭ 既に登録済み（同一ファイル） deal_id: ${prev.deal_id} @ ${prev.registered_at}`);
      console.log(`    再登録する場合: --force\n`);
      duplicate++;
      continue;
    }

    try {
      const ocrResult = await ocrReceipt(file);
      const receipts = ocrResult.receipts || [ocrResult];

      for (const receipt of receipts) {
        ensureReceiptDate(receipt, file);
        console.log(`  店名: ${receipt.store_name}`);
        console.log(`  日付: ${receipt.date}`);
        console.log(`  金額: ¥${(receipt.total_amount || 0).toLocaleString()}`);
        if (receipt.tax_uncertain) {
          console.log(`  ⚠️ 税区分・税率はOCR上あいまい（要確認）`);
        }

        if (!receipt.store_name || !receipt.date || !receipt.total_amount) {
          console.log(`  ⚠ 必須情報が不足。スキップ`);
          skipped++;
          continue;
        }

        let rule = matchRule(receipt.store_name, rulesData);

        if (!rule) {
          const expenseItems = await getExpenseAccountItems();
          const accountItem = pickAccountItemFromGuess(receipt.category_guess, expenseItems, receipt.store_name);
          if (isDryRun) {
            const partners = await searchPartnersByKeyword(companyId, receipt.store_name, accessToken);
            const hit = findPartnerExactName(partners, receipt.store_name);
            const itemsForPick = await getItemsMaster();
            const sectionsForPick = await getSectionsMaster();
            console.log(`  ✓ 新規取引先モード: ${hit ? `既存「${hit.name}」(id:${hit.id})` : `新規作成予定「${receipt.store_name.trim()}」`}`);
            console.log(`  ✓ 仕分け: ${accountItem.name}（Gemini推測: ${receipt.category_guess || '不明'}）`);
            const tmpRule = {
              partner_id: null,
              account_item_id: accountItem.id,
              account_item_name: accountItem.name,
              tax_code: taxCodeFromAccountItem(accountItem),
              item_id: null,
              section_id: null,
              section_name: '',
              match_type: 'dry-run',
            };
            const picked = pickItemIdForRule(tmpRule, receipt, itemsForPick);
            const pickedSec = pickSectionIdForRule(tmpRule, receipt, sectionsForPick);
            console.log(`  ✓ 品目(予定): ${picked ? `${picked.name} (id:${picked.id})` : 'マスタに合う品目なし → RECEIPT_DEFAULT_ITEM_ID を確認'}`);
            console.log(`  ✓ 部門(予定): ${pickedSec ? `${pickedSec.name} (id:${pickedSec.id})` : 'マスタに合う部門なし'}`);
            console.log(`  📝 備考: ${buildReceiptLineDescription(receipt)}`);
            console.log(`  (dry-run: freee登録スキップ)\n`);
            continue;
          }
          const { id: partnerId, created } = await ensurePartner(companyId, receipt.store_name, accessToken);
          console.log(`  ✓ 取引先: ${created ? '新規作成' : '既存'} → id ${partnerId}`);
          rule = {
            partner_id: partnerId,
            account_item_id: accountItem.id,
            account_item_name: accountItem.name,
            tax_code: taxCodeFromAccountItem(accountItem),
            item_id: null,
            section_id: null,
            section_name: '',
            match_type: created ? '新規取引先(作成)' : '新規取引先(既存)',
          };
        }

        const itemsMaster = await getItemsMaster();
        try {
          rule = resolveItemOnRule(rule, receipt, itemsMaster);
        } catch (err) {
          console.error(`  ✗ ${err.message}`);
          skipped++;
          continue;
        }

        const sectionsMaster = await getSectionsMaster();
        rule = resolveSectionOnRule(rule, receipt, sectionsMaster);

        if (rule) {
          console.log(`  ✓ 仕分け: ${rule.account_item_name} / 部門: ${rule.section_name || '—'} (${rule.match_type})`);
          console.log(`  ✓ 品目: ${rule.item_name}`);

          if (isDryRun) {
            console.log(`  📝 備考: ${buildReceiptLineDescription(receipt)}`);
            console.log(`  (dry-run: freee登録スキップ)\n`);
          } else {
            const res = await registerToFreee(receipt, rule, companyId, accessToken);
            if (res.status === 201) {
              const dealId = res.body.deal?.id;
              console.log(`  ✓ freee登録完了 (ID: ${dealId})`);
              recordRegisteredFile(importState, contentHash, {
                deal_id: dealId,
                path: file,
                basename: path.basename(file),
                store_name: receipt.store_name,
                date: receipt.date,
                amount: receipt.total_amount,
              });
              registered++;
              if (compressAfter) {
                try {
                  const cr = compressImageInPlace(file);
                  if (cr.ok) {
                    const mb = (n) => (n / 1024 / 1024).toFixed(1);
                    console.log(`  🗜 保存を軽量化: ${mb(cr.origSize)}MB → ${mb(cr.newSize)}MB (${path.basename(cr.path)})`);
                    const newHash = fileContentHash(cr.path);
                    if (newHash !== contentHash) {
                      migrateImportStateHash(importState, contentHash, newHash, {
                        path: cr.path,
                        basename: path.basename(cr.path),
                      });
                    }
                  } else if (cr.reason && cr.reason !== 'pdf') {
                    console.log(`  ⚠ 軽量化スキップ: ${cr.reason}`);
                  }
                } catch (e) {
                  console.log(`  ⚠ 軽量化エラー（取引は登録済み）: ${e.message}`);
                }
              }
              console.log('');
            } else {
              console.log(`  ✗ freee登録失敗: ${JSON.stringify(res.body)}\n`);
              skipped++;
            }
          }
        }
      }
    } catch (err) {
      console.error(`  ✗ エラー: ${err.message}\n`);
      skipped++;
    }
  }

  console.log(`\n=== 処理完了 ===`);
  console.log(`  登録: ${registered}件 / 重複スキップ: ${duplicate}件 / 要確認: ${needReview}件 / スキップ: ${skipped}件`);
  if (needReview > 0) {
    console.log(`\n💡 要確認の取引は、freeeで手動登録後に --learn で仕分けルールを更新できます`);
  }
}

// ─── エントリポイント ────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--learn')) {
    await learnRules();
    return;
  }

  const isDryRun = args.includes('--dry-run');
  const forceRegister = args.includes('--force');
  const noCompress =
    args.includes('--no-compress') ||
    String(process.env.RECEIPT_NO_COMPRESS || '').toLowerCase() === '1' ||
    String(process.env.RECEIPT_NO_COMPRESS || '').toLowerCase() === 'true';
  const compressAfter = !noCompress;
  const targets = args.filter((a) => !a.startsWith('--'));

  if (targets.length === 0) {
    console.log(`
=== レシート自動取込（OCR → 仕分け → freee登録） ===

使い方:
  npm run receipt                             撮影画像を receipts/ に入れたあと（推奨）
  node receipt-import.js <画像 or フォルダ>     レシートを処理してfreeeに登録
  node receipt-import.js --dry-run <画像>       プレビューのみ（登録しない）
  node receipt-import.js --learn                freeeから仕分けルールを再学習
  node receipt-import.js --force <画像>         同一画像でも再登録（重複チェック無視）
  node receipt-import.js --no-compress <dir>    登録後も4.5MBのまま残す（通常はJPEG化して軽量化）

対応フォーマット: ${SUPPORTED_EXT.join(', ')}
環境変数: RECEIPT_NO_COMPRESS=1 で --no-compress と同じ / RECEIPT_IMPORT_REMARK で明細備考（既定: TASUKE-AI）
            RECEIPT_GEMINI_MODEL / RECEIPT_OCR_PARTNER_PROMPT_MAX — OCR（Gemini）のモデルとプロンプト用取引先件数

仕組み:
  1. Gemini APIでレシート画像をOCR（店名・日付・金額を抽出）
  2. receipt-rules.json で過去の仕分けパターンとマッチング
  3. ルールがなければ freee に取引先を検索し、なければ新規作成 → 勘定は Gemini の推測＋経費科目マスタで決定（RECEIPT_NEW_ACCOUNT_NAME で既定を変更可）
  4. 品目は freee マスタから必ず1件紐づけ（item_guess・品目・勘定ヒント・RECEIPT_DEFAULT_ITEM_NAME）
  5. freee APIで取引を自動登録

仕分けルール更新:
  freeeで手動登録した取引を学習して精度を上げるには:
  node receipt-import.js --learn
`);
    return;
  }

  await processReceipts(targets, isDryRun, { forceRegister, compressAfter });
}

main().catch((err) => {
  console.error(`致命的エラー: ${err.message}`);
  process.exit(1);
});
