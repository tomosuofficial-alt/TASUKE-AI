/**
 * Niki★DINER 2026-05-01（中止）エントリの5フィールド手動上書き。
 * docs/handoff-niki-bilingual-2026-05-02.md §2-② に準拠。
 *
 * 使い方:
 *   node scripts/niki-2026-05-01-overwrite.js          # find + backup + dry-run のみ
 *   node scripts/niki-2026-05-01-overwrite.js --apply  # 実書き込み
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE_ID =
  process.env.NOTION_CONTENT_DATA_SOURCE_ID || 'f61e6093-e419-4475-b8d3-64d294983959';
const NOTION_VERSION = '2025-09-03';
const APPLY = process.argv.includes('--apply');

const BACKUP_PATH = path.join(__dirname, '..', 'tmp', 'niki-2026-05-01-backup.json');

const TARGET_CLIENT = 'Niki★DINER';
const TARGET_DATE = '2026-05-01';

// ── 上書き内容（handoff doc §2-② から） ──────────────────────────
const CAPTION = `鉄板に、上州牛100%のパティをそっと置きます。

スマッシャーで一気にプレスする瞬間、肉汁が広がり、香ばしい音が立ちのぼります。

押しつけて生まれる、薄くて香ばしい縁。
内側に閉じこめた、とろけるような旨み。

この一連の流れを、私たちはお客様の目の前で仕上げます。

カウンター越しに、バーガーが組み上がるところまでご覧いただけます。

🍔 上州牛100%スマッシュバーガー専門店
📍 高崎モントレー5F（高崎駅直結）
🕚 11:00〜21:30

鉄板の音と香りで、お迎えします。ぜひお越しください。

---

That sound? That's the start.

100% Joshu beef hits the iron plate. We press hard, press fast — smash style. Crust forms in seconds. Juice locks in.

You watch it all happen. Right there at the counter. The sizzle. The smoke. The build.

This is how a real smash burger comes together. No shortcuts. No mystery.

🍔 100% Joshu Beef Smash Burger specialty
📍 Takasaki Montrey 5F (right at Takasaki Station)
🕚 11:00–21:30

Save this. Tag a friend. Then come hungry.`;

const HASHTAGS = `#NikiDINER #ニキダイナー #スマッシュバーガー #上州牛 #高崎グルメ #高崎ランチ #高崎ディナー #高崎駅グルメ #高崎モントレー #群馬グルメ #調理ライブ #肉汁バーガー #バーガー専門店 #SmashBurger #JoshuBeef #Takasaki #TakasakiGourmet #GunmaFood #JapanEats #BurgerLover #Foodie #DinerVibes`;

const HOOK = `ジュッ。それが、はじまりの音です。`;
const CTA = `鉄板の音をぜひ目の前で。お待ちしています。`;
const COPYPASTE = `${CAPTION}\n\n${HASHTAGS}`;

// プロパティ名は実DBスキーマに合わせる（content-calendar.js の setupDatabaseProperties は
// 古い名前を保持しており未同期。実DBは「冒頭フック / ハッシュタグ / コピペ用」）
const FIELDS = {
  '冒頭フック': HOOK,
  'CTA': CTA,
  'キャプション': CAPTION,
  'ハッシュタグ': HASHTAGS,
  'コピペ用': COPYPASTE,
};

// ── Notion API ヘルパー ─────────────────────────────────────────
const headers = {
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json',
};

async function notionFetch(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const json = await res.json();
  if (!res.ok) {
    console.error('Notion API error:', res.status, JSON.stringify(json, null, 2));
    throw new Error(`Notion ${res.status}`);
  }
  return json;
}

// 2000文字制限対策の rich_text チャンク化
function toRichText(text) {
  const CHUNK = 1900;
  const segments = [];
  for (let i = 0; i < text.length; i += CHUNK) {
    segments.push({ type: 'text', text: { content: text.slice(i, i + CHUNK) } });
  }
  return segments.length ? segments : [{ type: 'text', text: { content: '' } }];
}

function plainTextOf(richText) {
  if (!Array.isArray(richText)) return '';
  return richText.map((r) => r.plain_text ?? r.text?.content ?? '').join('');
}

// ── メイン ───────────────────────────────────────────────────────
(async () => {
  if (!NOTION_TOKEN) {
    console.error('NOTION_TOKEN が .env に未設定です');
    process.exit(1);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`データソース: ${DATA_SOURCE_ID}`);
  console.log(`絞り込み: クライアント="${TARGET_CLIENT}" / 投稿日=${TARGET_DATE}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // [Step 1] 該当ページ検索
  const queryRes = await notionFetch(
    `https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        filter: {
          and: [
            { property: 'クライアント', select: { equals: TARGET_CLIENT } },
            { property: '投稿日', date: { equals: TARGET_DATE } },
          ],
        },
      }),
    }
  );

  const hits = queryRes.results || [];
  console.log(`[Step 1] 検索ヒット: ${hits.length} 件`);
  hits.forEach((p, i) => {
    const status = p.properties?.['ステータス']?.select?.name ?? '(unset)';
    const theme = p.properties?.['テーマカテゴリ']?.select?.name ?? '(unset)';
    const title = plainTextOf(p.properties?.['名前']?.title || p.properties?.['タイトル']?.title || []);
    console.log(`  [${i}] page_id=${p.id}`);
    console.log(`      ステータス="${status}" / テーマ="${theme}"`);
    console.log(`      タイトル="${title}"`);
  });

  if (hits.length === 0) {
    console.log('\n→ 該当なし。中止扱いではない可能性があるので、絞り込みを見直してください。');
    process.exit(2);
  }
  if (hits.length > 1) {
    console.log('\n⚠️  2件以上ヒットしました。意図せぬ更新を避けるため、ここで停止します。');
    process.exit(3);
  }

  const page = hits[0];
  const pageId = page.id;

  // [Step 2] 既存値バックアップ
  const fullPage = await notionFetch(`https://api.notion.com/v1/pages/${pageId}`);
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(fullPage, null, 2));
  console.log(`\n[Step 2] バックアップ書き出し → ${path.relative(process.cwd(), BACKUP_PATH)}`);
  console.log('         既存5フィールド値:');
  for (const fieldName of Object.keys(FIELDS)) {
    const cur = plainTextOf(fullPage.properties?.[fieldName]?.rich_text);
    const head = cur.replace(/\n/g, ' ').slice(0, 60);
    console.log(`           ${fieldName}: "${head}${cur.length > 60 ? '…' : ''}" (${cur.length}字)`);
  }

  // [Step 3] dry-run 表示
  console.log('\n[Step 3] これから書き込む内容（dry-run）:');
  console.log('─────────────────────────────────────────────');
  for (const [fieldName, value] of Object.entries(FIELDS)) {
    console.log(`■ ${fieldName} (${value.length}字)`);
    console.log(value);
    console.log('─────────────────────────────────────────────');
  }

  // [Step 4] apply 判定
  if (!APPLY) {
    console.log('\n✋ ここで停止。--apply を付けて再実行すると実書き込みします。');
    console.log(`   対象 page_id: ${pageId}`);
    process.exit(0);
  }

  const properties = {};
  for (const [name, value] of Object.entries(FIELDS)) {
    properties[name] = { rich_text: toRichText(value) };
  }

  const patchRes = await notionFetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });
  console.log(`\n✅ 更新完了: page_id=${patchRes.id}`);
  console.log(`   last_edited_time=${patchRes.last_edited_time}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
