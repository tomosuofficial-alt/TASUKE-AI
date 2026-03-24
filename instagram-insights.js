require('dotenv').config();
const https = require('https');
const { Client } = require('@notionhq/client');
const { queryContentDataSource } = require('./scripts/lib/notion-content-data-source-query.js');

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});
const CONTENT_DB = '942d70a4-e645-464e-a1ab-5176bce10939';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const IG_ACCOUNTS = {
  'Mz cafe': process.env.INSTAGRAM_ACCOUNT_ID_MZ || '',
  'Niki★DINER': process.env.INSTAGRAM_ACCOUNT_ID_NIKI || '',
};

// ─── Graph API ヘルパー ──────────────────────────────────────────

function graphGet(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'User-Agent': 'TASUKE-AI/1.0' },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`Graph API Error: ${json.error.message} (code: ${json.error.code})`));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Instagram 投稿一覧取得 ──────────────────────────────────────

async function getRecentMedia(igAccountId, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceTimestamp = Math.floor(since.getTime() / 1000);

  const fields = 'id,caption,timestamp,media_type,like_count,comments_count,permalink';
  const url = `https://graph.facebook.com/v21.0/${igAccountId}/media`
    + `?fields=${fields}`
    + `&since=${sinceTimestamp}`
    + `&limit=50`
    + `&access_token=${META_ACCESS_TOKEN}`;

  const result = await graphGet(url);
  return result.data || [];
}

// ─── 投稿別インサイト取得 ────────────────────────────────────────

async function getMediaInsights(mediaId, mediaType) {
  // メトリクスはメディアタイプによって異なる
  let metrics;
  if (mediaType === 'VIDEO' || mediaType === 'REELS') {
    metrics = 'reach,plays,saved,shares';
  } else if (mediaType === 'CAROUSEL_ALBUM') {
    metrics = 'reach,saved,shares';
  } else {
    // IMAGE
    metrics = 'reach,saved,shares';
  }

  const url = `https://graph.facebook.com/v21.0/${mediaId}/insights`
    + `?metric=${metrics}`
    + `&access_token=${META_ACCESS_TOKEN}`;

  try {
    const result = await graphGet(url);
    const insights = {};
    for (const item of result.data || []) {
      insights[item.name] = item.values?.[0]?.value || 0;
    }
    return insights;
  } catch (err) {
    // インサイト未対応の投稿（ストーリーズなど）はスキップ
    console.log(`    ⚠ インサイト取得不可: ${err.message}`);
    return null;
  }
}

// ─── Notion Content DB からエントリ取得 ──────────────────────────

async function getNotionEntries(clientName, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  const result = await queryContentDataSource({
    filter: {
      and: [
        {
          property: 'クライアント',
          select: { equals: clientName },
        },
        {
          property: '投稿日',
          date: { on_or_after: sinceStr },
        },
      ],
    },
    sorts: [{ property: '投稿日', direction: 'ascending' }],
    page_size: 100,
  });

  return result.results;
}

// ─── Notion Content DB にインサイトプロパティを追加 ──────────────

async function setupInsightProperties() {
  console.log('📋 インサイトプロパティをセットアップ中...');

  try {
    const db = await notion.databases.retrieve({ database_id: CONTENT_DB });
    const existing = Object.keys(db.properties);

    const insightProps = {
      'リーチ数': { number: { format: 'number' } },
      'インプレッション': { number: { format: 'number' } },
      'いいね数': { number: { format: 'number' } },
      'コメント数': { number: { format: 'number' } },
      '保存数': { number: { format: 'number' } },
      'シェア数': { number: { format: 'number' } },
      '再生数': { number: { format: 'number' } },
      'エンゲージメント率': { number: { format: 'percent' } },
      'インサイト取得日': { date: {} },
      'Instagram投稿URL': { url: {} },
    };

    const toAdd = {};
    for (const [name, config] of Object.entries(insightProps)) {
      if (!existing.includes(name)) {
        toAdd[name] = config;
      }
    }

    if (Object.keys(toAdd).length > 0) {
      await notion.databases.update({
        database_id: CONTENT_DB,
        properties: toAdd,
      });
      console.log(`  ✓ ${Object.keys(toAdd).length}件のプロパティを追加しました`);
    } else {
      console.log('  ✓ プロパティは全て揃っています');
    }
  } catch (err) {
    console.error(`  ✗ プロパティセットアップ失敗: ${err.message}`);
  }
}

// ─── Notion エントリにインサイトを書き込み ────────────────────────

async function writeInsightsToNotion(pageId, insights, media) {
  const likes = media.like_count || 0;
  const comments = media.comments_count || 0;
  const reach = insights.reach || 0;
  const saves = insights.saved || 0;
  const shares = insights.shares || 0;
  const plays = insights.plays || 0;
  const engagementRate = reach > 0 ? (likes + comments + saves + shares) / reach : 0;

  const properties = {
    'リーチ数': { number: reach },
    'いいね数': { number: likes },
    'コメント数': { number: comments },
    '保存数': { number: saves },
    'シェア数': { number: shares },
    'エンゲージメント率': { number: Math.round(engagementRate * 10000) / 10000 },
    'インサイト取得日': { date: { start: new Date().toISOString().split('T')[0] } },
    'Instagram投稿URL': { url: media.permalink || null },
  };

  if (plays > 0) {
    properties['再生数'] = { number: plays };
  }

  await notion.pages.update({
    page_id: pageId,
    properties,
  });
}

// ─── マッチングロジック ──────────────────────────────────────────

function matchMediaToNotion(media, notionEntries) {
  // Instagram投稿のキャプションとNotionエントリのタイトルで最も近いものをマッチ
  // まずは投稿日で絞り込み、次にキャプション内のテーマキーワードで照合
  const matches = [];

  for (const igPost of media) {
    const igDate = igPost.timestamp.split('T')[0];
    const igCaption = (igPost.caption || '').toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    for (const entry of notionEntries) {
      const entryDate = entry.properties['投稿日']?.date?.start;
      const entryTitle = entry.properties['タイトル']?.title?.[0]?.plain_text || '';
      const entryStatus = entry.properties['ステータス']?.select?.name;

      // タイトルからテーマ部分を抽出（「Mz cafe｜人気No.1メニュー」→「人気No.1メニュー」）
      const theme = entryTitle.split('｜')[1] || entryTitle;

      let score = 0;

      // 日付が一致 or 1日差ならスコア加算
      if (entryDate === igDate) {
        score += 10;
      } else if (entryDate) {
        const diff = Math.abs(new Date(entryDate) - new Date(igDate));
        if (diff <= 86400000 * 2) score += 5; // 2日以内
      }

      // テーマキーワードがキャプションに含まれるか
      const keywords = theme.split(/[・｜\s]/);
      for (const kw of keywords) {
        if (kw.length >= 2 && igCaption.includes(kw.toLowerCase())) {
          score += 3;
        }
      }

      // 投稿済みステータスなら優先
      if (entryStatus === '投稿済み') score += 2;

      // Instagram URLが既に設定されている場合、同じURLなら最優先
      const existingUrl = entry.properties['Instagram投稿URL']?.url;
      if (existingUrl === igPost.permalink) {
        score = 100; // 確定マッチ
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    if (bestMatch && bestScore >= 5) {
      matches.push({
        media: igPost,
        notionEntry: bestMatch,
        score: bestScore,
      });
    } else {
      console.log(`    ⚠ マッチなし: ${igPost.permalink} (${igDate})`);
    }
  }

  return matches;
}

// ─── メイン処理 ──────────────────────────────────────────────────

async function main() {
  const days = parseInt(process.argv[2]) || 7;

  console.log(`\n=== Instagram インサイト集計 ===`);
  console.log(`対象: 過去${days}日間\n`);

  // 環境変数チェック
  if (!META_ACCESS_TOKEN) {
    console.error('✗ META_ACCESS_TOKEN が .env に設定されていません');
    console.error('');
    console.error('セットアップ手順:');
    console.error('  1. node meta-auth.js でセットアップ方法を確認');
    console.error('  2. Meta Developer App でトークンを取得');
    console.error('  3. node meta-auth.js exchange <短期トークン> で長期トークンに変換');
    console.error('  4. .env に META_ACCESS_TOKEN=<長期トークン> を追加');
    process.exit(1);
  }

  const activeAccounts = Object.entries(IG_ACCOUNTS).filter(([_, id]) => id);
  if (activeAccounts.length === 0) {
    console.error('✗ Instagram アカウントIDが .env に設定されていません');
    console.error('  INSTAGRAM_ACCOUNT_ID_MZ / INSTAGRAM_ACCOUNT_ID_NIKI を設定してください');
    console.error('  アカウントIDは node meta-auth.js me で確認できます');
    process.exit(1);
  }

  // プロパティセットアップ
  await setupInsightProperties();

  let totalUpdated = 0;
  let totalFailed = 0;

  for (const [clientName, igAccountId] of activeAccounts) {
    console.log(`\n📱 ${clientName}`);

    try {
      // Instagram投稿を取得
      console.log(`  投稿を取得中...`);
      const media = await getRecentMedia(igAccountId, days);
      console.log(`  ${media.length}件の投稿を発見`);

      if (media.length === 0) continue;

      // Notionエントリを取得
      const notionEntries = await getNotionEntries(clientName, days + 7); // 余裕を持って取得
      console.log(`  Notionエントリ: ${notionEntries.length}件`);

      // マッチング
      const matches = matchMediaToNotion(media, notionEntries);
      console.log(`  マッチ: ${matches.length}件`);

      // インサイト取得→Notion書き込み
      for (const match of matches) {
        const { media: igPost, notionEntry } = match;
        const title = notionEntry.properties['タイトル']?.title?.[0]?.plain_text || '(no title)';

        try {
          await sleep(350); // レートリミット

          const insights = await getMediaInsights(igPost.id, igPost.media_type);
          if (!insights) continue;

          await sleep(350);

          await writeInsightsToNotion(notionEntry.id, insights, igPost);

          const reach = insights.reach || 0;
          const engRate = reach > 0
            ? ((igPost.like_count + igPost.comments_count + (insights.saved || 0) + (insights.shares || 0)) / reach * 100).toFixed(1)
            : '0.0';

          console.log(`  ✓ ${title} — リーチ: ${reach} / ER: ${engRate}%`);
          totalUpdated++;
        } catch (err) {
          console.error(`  ✗ ${title} — ${err.message}`);
          totalFailed++;
        }
      }
    } catch (err) {
      console.error(`  ✗ ${clientName} 処理エラー: ${err.message}`);
      totalFailed++;
    }
  }

  console.log(`\n=== 集計完了 ===`);
  console.log(`更新: ${totalUpdated}件 / 失敗: ${totalFailed}件`);

  if (totalUpdated > 0) {
    console.log(`\n→ Notion Content DB でインサイト数値を確認してください`);
  }
}

main().catch((err) => {
  console.error(`\n✗ 致命的エラー: ${err.message}`);
  process.exit(1);
});
