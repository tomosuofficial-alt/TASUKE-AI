require('dotenv').config();
const https = require('https');
const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';

// 自分のIGアカウントID（ハッシュタグ検索に必要）
const MY_IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID_MZ || process.env.INSTAGRAM_ACCOUNT_ID_NIKI || '';

// ─── 競合リサーチDB ──────────────────────────────────────────────
// Notion に新規作成する。初回実行時に自動作成。
let COMPETITOR_DB = process.env.COMPETITOR_DB_ID || '';

// ─── 競合アカウントリスト（手動登録） ─────────────────────────────
// Instagram Business Account ID を指定。
// node meta-auth.js me では自分のアカウントしか見えないため、
// 競合のIDは Instagram Graph API の ig_user_search で取得するか、
// 手動で設定する。
const COMPETITORS = {
  'Mz cafe': [
    // 高崎エリアのカフェ・バー・居酒屋
    // { id: 'IG_ACCOUNT_ID', name: '店名' },
  ],
  'Niki★DINER': [
    // 高崎エリアのバーガー店・ダイナー・ランチ
    // { id: 'IG_ACCOUNT_ID', name: '店名' },
  ],
};

// ─── 監視ハッシュタグリスト ───────────────────────────────────────
const WATCH_HASHTAGS = {
  'Mz cafe': ['高崎カフェ', '高崎グルメ', '夜カフェ', '高崎バー', '高崎ディナー'],
  'Niki★DINER': ['高崎グルメ', '高崎ランチ', 'クラフトバーガー', '高崎バーガー', 'スマッシュバーガー'],
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

// ─── Notion 競合リサーチDB 自動作成 ──────────────────────────────

async function ensureCompetitorDb() {
  if (COMPETITOR_DB) {
    console.log('📋 競合リサーチDB: 既存DBを使用');
    return;
  }

  console.log('📋 競合リサーチDB を新規作成中...');

  // TASUKE.AI トップページの子として作成
  const TOP_PAGE = '3249fe8c3a7f80269c41ce55e14d4d79';

  try {
    const db = await notion.databases.create({
      parent: { page_id: TOP_PAGE },
      title: [{ text: { content: '競合リサーチDB' } }],
      properties: {
        'タイトル': { title: {} },
        'クライアント': {
          select: {
            options: [
              { name: 'Mz cafe', color: 'purple' },
              { name: 'Niki★DINER', color: 'red' },
            ],
          },
        },
        '種別': {
          select: {
            options: [
              { name: '競合アカウント', color: 'blue' },
              { name: 'ハッシュタグトレンド', color: 'green' },
            ],
          },
        },
        'アカウント名': { rich_text: {} },
        'フォロワー数': { number: { format: 'number' } },
        '投稿数': { number: { format: 'number' } },
        'エンゲージメント率推定': { number: { format: 'percent' } },
        '使用ハッシュタグ': { rich_text: {} },
        '人気投稿の傾向': { rich_text: {} },
        'URL': { url: {} },
        '調査日': { date: {} },
        'メモ': { rich_text: {} },
      },
    });

    COMPETITOR_DB = db.id;
    console.log(`  ✓ 作成完了 (ID: ${db.id})`);
    console.log(`  💡 .env に COMPETITOR_DB_ID=${db.id} を追加してください`);
  } catch (err) {
    console.error(`  ✗ DB作成失敗: ${err.message}`);
    process.exit(1);
  }
}

// ─── 競合アカウント監視 ──────────────────────────────────────────

async function monitorCompetitors() {
  console.log('\n🔍 競合アカウント監視\n');

  let hasAny = false;
  for (const [clientName, competitors] of Object.entries(COMPETITORS)) {
    if (competitors.length === 0) continue;
    hasAny = true;

    console.log(`📱 ${clientName} の競合:`);

    for (const comp of competitors) {
      try {
        await sleep(350);
        const info = await graphGet(
          `https://graph.facebook.com/v21.0/${comp.id}`
          + `?fields=username,followers_count,media_count,biography`
          + `&access_token=${META_ACCESS_TOKEN}`
        );

        console.log(`  ✓ @${info.username} — フォロワー: ${info.followers_count} / 投稿: ${info.media_count}`);

        // 最新投稿を取得してエンゲージメント推定
        await sleep(350);
        const media = await graphGet(
          `https://graph.facebook.com/v21.0/${comp.id}/media`
          + `?fields=id,like_count,comments_count,timestamp&limit=10`
          + `&access_token=${META_ACCESS_TOKEN}`
        );

        let avgEngagement = 0;
        if (media.data && media.data.length > 0 && info.followers_count > 0) {
          const totalEng = media.data.reduce((sum, m) => sum + (m.like_count || 0) + (m.comments_count || 0), 0);
          avgEngagement = totalEng / media.data.length / info.followers_count;
        }

        // Notionに保存
        await sleep(350);
        await notion.pages.create({
          parent: { database_id: COMPETITOR_DB },
          properties: {
            'タイトル': { title: [{ text: { content: `@${info.username}` } }] },
            'クライアント': { select: { name: clientName } },
            '種別': { select: { name: '競合アカウント' } },
            'アカウント名': { rich_text: [{ text: { content: `@${info.username}` } }] },
            'フォロワー数': { number: info.followers_count },
            '投稿数': { number: info.media_count },
            'エンゲージメント率推定': { number: Math.round(avgEngagement * 10000) / 10000 },
            'URL': { url: `https://instagram.com/${info.username}` },
            '調査日': { date: { start: new Date().toISOString().split('T')[0] } },
            'メモ': { rich_text: [{ text: { content: (info.biography || '').substring(0, 200) } }] },
          },
        });
      } catch (err) {
        console.error(`  ✗ ${comp.name}: ${err.message}`);
      }
    }
  }

  if (!hasAny) {
    console.log('  ⚠ 競合アカウントが未登録です。');
    console.log('  competitor-research.js の COMPETITORS にアカウントIDを追加してください。');
    console.log('');
    console.log('  設定例:');
    console.log("  'Mz cafe': [");
    console.log("    { id: '12345678901', name: 'カフェ○○' },");
    console.log('  ],');
  }
}

// ─── ハッシュタグトレンド分析 ────────────────────────────────────

async function analyzeHashtag(hashtag, clientName) {
  const tagName = hashtag.replace('#', '');

  try {
    // ハッシュタグID検索
    await sleep(350);
    const searchResult = await graphGet(
      `https://graph.facebook.com/v21.0/ig_hashtag_search`
      + `?q=${encodeURIComponent(tagName)}`
      + `&user_id=${MY_IG_ACCOUNT_ID}`
      + `&access_token=${META_ACCESS_TOKEN}`
    );

    if (!searchResult.data || searchResult.data.length === 0) {
      console.log(`  ⚠ #${tagName}: ハッシュタグが見つかりません`);
      return null;
    }

    const hashtagId = searchResult.data[0].id;

    // トップメディア取得
    await sleep(350);
    const topMedia = await graphGet(
      `https://graph.facebook.com/v21.0/${hashtagId}/top_media`
      + `?fields=id,caption,like_count,comments_count,timestamp,media_type,permalink`
      + `&user_id=${MY_IG_ACCOUNT_ID}`
      + `&limit=25`
      + `&access_token=${META_ACCESS_TOKEN}`
    );

    const posts = topMedia.data || [];
    if (posts.length === 0) {
      console.log(`  ⚠ #${tagName}: トップ投稿なし`);
      return null;
    }

    // 傾向分析
    const avgLikes = posts.reduce((s, p) => s + (p.like_count || 0), 0) / posts.length;
    const avgComments = posts.reduce((s, p) => s + (p.comments_count || 0), 0) / posts.length;
    const reelCount = posts.filter((p) => p.media_type === 'VIDEO').length;
    const reelRate = (reelCount / posts.length * 100).toFixed(0);

    // キャプションからハッシュタグを抽出して頻出タグを集計
    const tagFreq = {};
    for (const post of posts) {
      const caption = post.caption || '';
      const tags = caption.match(/#[\wぁ-んァ-ヶー一-龠]+/g) || [];
      for (const t of tags) {
        tagFreq[t] = (tagFreq[t] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => `${tag}(${count})`)
      .join(' ');

    const trendSummary = `平均いいね: ${Math.round(avgLikes)} / 平均コメント: ${Math.round(avgComments)} / リール率: ${reelRate}%`;

    console.log(`  ✓ #${tagName} — ${trendSummary}`);

    // Notionに保存
    if (COMPETITOR_DB) {
      await sleep(350);
      await notion.pages.create({
        parent: { database_id: COMPETITOR_DB },
        properties: {
          'タイトル': { title: [{ text: { content: `#${tagName} トレンド` } }] },
          'クライアント': clientName ? { select: { name: clientName } } : undefined,
          '種別': { select: { name: 'ハッシュタグトレンド' } },
          '使用ハッシュタグ': { rich_text: [{ text: { content: topTags.substring(0, 2000) } }] },
          '人気投稿の傾向': { rich_text: [{ text: { content: trendSummary } }] },
          '調査日': { date: { start: new Date().toISOString().split('T')[0] } },
        },
      });
    }

    return { tagName, avgLikes, avgComments, reelRate, topTags, trendSummary };
  } catch (err) {
    console.error(`  ✗ #${tagName}: ${err.message}`);
    return null;
  }
}

async function analyzeAllHashtags() {
  console.log('\n📊 ハッシュタグトレンド分析\n');

  for (const [clientName, tags] of Object.entries(WATCH_HASHTAGS)) {
    console.log(`📱 ${clientName}:`);
    for (const tag of tags) {
      await analyzeHashtag(tag, clientName);
    }
    console.log('');
  }
}

// ─── 単一ハッシュタグ調査 ────────────────────────────────────────

async function singleHashtagResearch(hashtag) {
  console.log(`\n🔍 ハッシュタグ調査: ${hashtag}\n`);
  const result = await analyzeHashtag(hashtag, null);
  if (result) {
    console.log(`\n📊 詳細:`);
    console.log(`  平均いいね: ${Math.round(result.avgLikes)}`);
    console.log(`  平均コメント: ${Math.round(result.avgComments)}`);
    console.log(`  リール率: ${result.reelRate}%`);
    console.log(`  頻出タグ: ${result.topTags}`);
  }
}

// ─── メイン処理 ──────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  console.log('\n=== 競合リサーチ ===\n');

  // 環境変数チェック
  if (!META_ACCESS_TOKEN) {
    console.error('✗ META_ACCESS_TOKEN が .env に設定されていません');
    console.error('  先に node meta-auth.js でトークンを設定してください');
    process.exit(1);
  }

  if (!MY_IG_ACCOUNT_ID) {
    console.error('✗ INSTAGRAM_ACCOUNT_ID_MZ or INSTAGRAM_ACCOUNT_ID_NIKI が .env に設定されていません');
    console.error('  ハッシュタグ検索には自分のIGアカウントIDが必要です');
    console.error('  node meta-auth.js me で確認できます');
    process.exit(1);
  }

  // DB確認・作成
  await ensureCompetitorDb();

  if (command === 'hashtag' && arg) {
    // 単一ハッシュタグ調査
    await singleHashtagResearch(arg);
  } else if (command === 'hashtags') {
    // 全ハッシュタグ分析
    await analyzeAllHashtags();
  } else if (command === 'competitors') {
    // 競合アカウント監視のみ
    await monitorCompetitors();
  } else {
    // フル実行（競合 + ハッシュタグ）
    await monitorCompetitors();
    await analyzeAllHashtags();
  }

  console.log('\n=== 完了 ===');
  if (COMPETITOR_DB) {
    console.log(`→ 競合リサーチDB で結果を確認してください`);
  }
}

main().catch((err) => {
  console.error(`\n✗ 致命的エラー: ${err.message}`);
  process.exit(1);
});
