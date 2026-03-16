require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── Meta Graph API トークン管理 ─────────────────────────────────
// 使い方:
//   node meta-auth.js exchange <短期トークン>  — 短期→長期トークン変換
//   node meta-auth.js check                    — 現在のトークン有効期限を確認
//   node meta-auth.js me                       — 接続確認（自分のアカウント情報）
// ──────────────────────────────────────────────────────────────────

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';

// ─── HTTPSリクエストヘルパー ──────────────────────────────────────

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

// ─── コマンド: exchange ──────────────────────────────────────────

async function exchangeToken(shortToken) {
  if (!META_APP_ID || !META_APP_SECRET) {
    console.error('✗ META_APP_ID と META_APP_SECRET を .env に設定してください');
    process.exit(1);
  }

  console.log('🔄 短期トークン → 長期トークン変換中...\n');

  const url = `https://graph.facebook.com/v21.0/oauth/access_token`
    + `?grant_type=fb_exchange_token`
    + `&client_id=${META_APP_ID}`
    + `&client_secret=${META_APP_SECRET}`
    + `&fb_exchange_token=${shortToken}`;

  try {
    const result = await graphGet(url);
    const token = result.access_token;
    const expiresIn = result.expires_in; // 秒

    const days = Math.floor(expiresIn / 86400);
    console.log(`✓ 長期トークン取得成功（有効期限: ${days}日）\n`);
    console.log('以下を .env の META_ACCESS_TOKEN に設定してください:\n');
    console.log('─'.repeat(60));
    console.log(token);
    console.log('─'.repeat(60));
    console.log(`\n⚠ このトークンは${days}日後に期限切れになります。`);
    console.log('  期限前に再度 exchange を実行してください。');
  } catch (err) {
    console.error(`✗ トークン変換失敗: ${err.message}`);
    process.exit(1);
  }
}

// ─── コマンド: check ─────────────────────────────────────────────

async function checkToken() {
  if (!META_ACCESS_TOKEN) {
    console.error('✗ META_ACCESS_TOKEN が .env に設定されていません');
    console.error('  先に exchange コマンドで長期トークンを取得してください');
    process.exit(1);
  }

  console.log('🔍 トークン有効期限を確認中...\n');

  const url = `https://graph.facebook.com/v21.0/debug_token`
    + `?input_token=${META_ACCESS_TOKEN}`
    + `&access_token=${META_ACCESS_TOKEN}`;

  try {
    const result = await graphGet(url);
    const data = result.data;

    if (!data) {
      console.error('✗ トークン情報を取得できませんでした');
      process.exit(1);
    }

    const isValid = data.is_valid;
    const expiresAt = data.expires_at;
    const scopes = data.scopes || [];

    if (!isValid) {
      console.error('✗ トークンは無効です。再度 exchange を実行してください。');
      process.exit(1);
    }

    if (expiresAt === 0) {
      console.log('✓ トークンは有効です（無期限）');
    } else {
      const expiresDate = new Date(expiresAt * 1000);
      const now = new Date();
      const daysLeft = Math.floor((expiresDate - now) / 86400000);

      console.log(`✓ トークンは有効です`);
      console.log(`  期限: ${expiresDate.toLocaleDateString('ja-JP')}（残り${daysLeft}日）`);

      if (daysLeft <= 7) {
        console.log('\n⚠ 期限が近いです！ exchange で更新してください。');
      } else if (daysLeft <= 14) {
        console.log('\n💡 2週間以内に期限切れ。早めに更新を。');
      }
    }

    console.log(`\n  スコープ: ${scopes.join(', ') || '(なし)'}`);

    // 必要なスコープチェック
    const required = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list'];
    const missing = required.filter((s) => !scopes.includes(s));
    if (missing.length > 0) {
      console.log(`\n⚠ 不足しているスコープ: ${missing.join(', ')}`);
      console.log('  Meta Developer App の権限設定を確認してください。');
    }
  } catch (err) {
    console.error(`✗ トークン確認失敗: ${err.message}`);
    process.exit(1);
  }
}

// ─── コマンド: me ────────────────────────────────────────────────

async function showMe() {
  if (!META_ACCESS_TOKEN) {
    console.error('✗ META_ACCESS_TOKEN が .env に設定されていません');
    process.exit(1);
  }

  console.log('🔍 接続情報を確認中...\n');

  try {
    // Facebook ユーザー情報
    const me = await graphGet(`https://graph.facebook.com/v21.0/me?access_token=${META_ACCESS_TOKEN}`);
    console.log(`Facebook: ${me.name} (ID: ${me.id})`);

    // Facebookページ一覧
    const pages = await graphGet(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${META_ACCESS_TOKEN}`
    );
    if (pages.data && pages.data.length > 0) {
      console.log(`\nFacebookページ:`);
      for (const page of pages.data) {
        console.log(`  - ${page.name} (ID: ${page.id})`);

        // ページに紐づくInstagramアカウント
        try {
          const igAccount = await graphGet(
            `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${META_ACCESS_TOKEN}`
          );
          if (igAccount.instagram_business_account) {
            const igId = igAccount.instagram_business_account.id;
            const igInfo = await graphGet(
              `https://graph.facebook.com/v21.0/${igId}?fields=username,followers_count,media_count&access_token=${META_ACCESS_TOKEN}`
            );
            console.log(`    → Instagram: @${igInfo.username} (ID: ${igId})`);
            console.log(`      フォロワー: ${igInfo.followers_count} / 投稿数: ${igInfo.media_count}`);
          }
        } catch (e) {
          // Instagram未連携の場合はスキップ
        }
      }
    } else {
      console.log('\n⚠ Facebookページが見つかりません。');
      console.log('  Facebookページを作成し、Instagramと連携してください。');
    }
  } catch (err) {
    console.error(`✗ 接続確認失敗: ${err.message}`);
    process.exit(1);
  }
}

// ─── メイン ──────────────────────────────────────────────────────

const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'exchange':
    if (!arg) {
      console.error('使い方: node meta-auth.js exchange <短期トークン>');
      process.exit(1);
    }
    exchangeToken(arg);
    break;

  case 'check':
    checkToken();
    break;

  case 'me':
    showMe();
    break;

  default:
    console.log(`
=== Meta Graph API トークン管理 ===

使い方:
  node meta-auth.js exchange <短期トークン>  短期→長期トークン変換
  node meta-auth.js check                    トークン有効期限を確認
  node meta-auth.js me                       接続情報を確認

セットアップ手順:
  1. https://developers.facebook.com/ でアプリを作成
  2. 「Instagram Graph API」と「Facebook Login」を追加
  3. 権限を追加: instagram_basic, instagram_manage_insights, pages_show_list
  4. Graph API Explorer で短期トークンを生成
  5. node meta-auth.js exchange <短期トークン> で長期トークンに変換
  6. .env に META_ACCESS_TOKEN=<長期トークン> を追加
  7. node meta-auth.js me で接続確認

必要な .env 変数:
  META_APP_ID        — Meta App ID
  META_APP_SECRET    — Meta App Secret
  META_ACCESS_TOKEN  — 長期アクセストークン
`);
}
