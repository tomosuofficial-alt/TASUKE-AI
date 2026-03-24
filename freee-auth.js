// ============================================================
// TASUKE.AI — freee会計 OAuth認証 & トークン管理
// ============================================================
// 使い方:
//   node freee-auth.js setup              — 認可URL表示 → ブラウザで認可
//   node freee-auth.js token <認可コード>  — 認可コード → アクセストークン取得
//   node freee-auth.js refresh            — リフレッシュトークンでアクセストークン更新
//   node freee-auth.js check              — 現在のトークンで接続確認（事業所情報取得）
// ============================================================

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '.freee-token.json');

const FREEE_CLIENT_ID = process.env.FREEE_CLIENT_ID || '';
const FREEE_CLIENT_SECRET = process.env.FREEE_CLIENT_SECRET || '';
const http = require('http');
const { execSync } = require('child_process');

const FREEE_REDIRECT_URI_OOB = 'urn:ietf:wg:oauth:2.0:oob';
const FREEE_REDIRECT_URI_LOCAL = 'http://localhost:8089/callback';
const FREEE_REDIRECT_URI = FREEE_REDIRECT_URI_OOB;

// ─── トークンファイル管理 ────────────────────────────────────

function loadToken() {
  const envJson = process.env.FREEE_TOKEN_JSON;
  if (envJson && String(envJson).trim()) {
    try {
      return JSON.parse(envJson);
    } catch (e) {
      console.error('⚠ FREEE_TOKEN_JSON のパースに失敗:', e.message);
    }
  }
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('⚠ トークンファイル読み込みエラー:', e.message);
  }
  return null;
}

function saveToken(tokenData) {
  const data = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_in: tokenData.expires_in,
    company_id: tokenData.company_id || null,
    created_at: tokenData.created_at || Math.floor(Date.now() / 1000),
    saved_at: new Date().toISOString(),
  };
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(data, null, 2));
  return data;
}

function getAccessToken() {
  const token = loadToken();
  if (!token) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = token.created_at + token.expires_in;
  if (now >= expiresAt) return null;

  return token.access_token;
}

// ─── HTTPSヘルパー ───────────────────────────────────────────

function httpsPost(hostname, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const encoded = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const req = https.request({
      hostname,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(encoded),
        ...headers,
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
    req.write(encoded);
    req.end();
  });
}

function httpsGet(hostname, urlPath, accessToken) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path: urlPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
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
    req.end();
  });
}

// ─── コマンド: setup ─────────────────────────────────────────

function showSetup() {
  if (!FREEE_CLIENT_ID) {
    console.error('✗ FREEE_CLIENT_ID が .env に設定されていません');
    console.error('  https://app.secure.freee.co.jp/developers/applications でアプリを作成してください');
    process.exit(1);
  }

  const authUrl = `https://accounts.secure.freee.co.jp/public_api/authorize`
    + `?response_type=code`
    + `&client_id=${FREEE_CLIENT_ID}`
    + `&redirect_uri=${encodeURIComponent(FREEE_REDIRECT_URI)}`
    + `&prompt=select_company`;

  console.log(`
=== freee OAuth認証セットアップ ===

以下のURLをブラウザで開いてください:

${authUrl}

手順:
  1. freeeにログイン
  2. 事業所を選択
  3. 「許可する」をクリック
  4. 表示された認可コードをコピー
  5. 以下のコマンドを実行:

     node freee-auth.js token <認可コード>
`);
}

// ─── コマンド: login（ローカルサーバーで自動トークン取得） ────

async function loginFlow() {
  if (!FREEE_CLIENT_ID || !FREEE_CLIENT_SECRET) {
    console.error('✗ FREEE_CLIENT_ID と FREEE_CLIENT_SECRET を .env に設定してください');
    process.exit(1);
  }

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:8089`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('認可コードがありません');
        return;
      }

      console.log(`\n✓ 認可コード受信。トークン交換中...`);

      try {
        const result = await httpsPost('accounts.secure.freee.co.jp', '/public_api/token', {
          grant_type: 'authorization_code',
          client_id: FREEE_CLIENT_ID,
          client_secret: FREEE_CLIENT_SECRET,
          code,
          redirect_uri: FREEE_REDIRECT_URI_LOCAL,
        });

        if (result.status !== 200 || result.body.error) {
          const msg = result.body.error_description || JSON.stringify(result.body);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h1>✗ トークン取得失敗</h1><p>${msg}</p><p>ブラウザを閉じてやり直してください。</p>`);
          console.error(`✗ トークン取得失敗: ${msg}`);
          server.close();
          resolve(false);
          return;
        }

        const saved = saveToken(result.body);
        const expiresHours = Math.floor(result.body.expires_in / 3600);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>✓ freee連携完了！</h1><p>アクセストークン取得成功（有効期限: ${expiresHours}時間）</p><p>このタブを閉じてOKです。</p>`);

        console.log(`✓ アクセストークン取得成功`);
        console.log(`  有効期限: ${expiresHours}時間`);
        if (saved.company_id) console.log(`  事業所ID: ${saved.company_id}`);
        console.log(`  トークンファイル: ${TOKEN_FILE}`);
        console.log(`\n✓ リフレッシュトークンも保存済み（90日有効）`);

        server.close();
        resolve(true);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>✗ エラー</h1><p>${err.message}</p>`);
        console.error(`✗ エラー: ${err.message}`);
        server.close();
        resolve(false);
      }
    });

    server.listen(8089, () => {
      const authUrl = `https://accounts.secure.freee.co.jp/public_api/authorize`
        + `?response_type=code`
        + `&client_id=${FREEE_CLIENT_ID}`
        + `&redirect_uri=${encodeURIComponent(FREEE_REDIRECT_URI_LOCAL)}`
        + `&prompt=select_company`;

      console.log(`
=== freee OAuth認証（自動モード） ===

ローカルサーバー起動: http://localhost:8089/callback

以下のURLをブラウザで開いてください:

${authUrl}

手順:
  1. freeeにログイン
  2. 事業所を選択
  3. 「許可する」をクリック
  → 自動でトークンが取得されます

待機中...（Ctrl+C で中止）
`);
      if (process.platform === 'darwin') {
        try {
          execSync(`open ${JSON.stringify(authUrl)}`, { stdio: 'ignore' });
          console.log('  （既定ブラウザで認可ページを開きました）\n');
        } catch (_) {
          /* 手動でURLを開いてください */
        }
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error('✗ ポート8089が使用中です。他のプロセスを停止してから再試行してください。');
      } else {
        console.error(`✗ サーバーエラー: ${err.message}`);
      }
      resolve(false);
    });
  });
}

// ─── コマンド: token ─────────────────────────────────────────

async function exchangeToken(code) {
  if (!FREEE_CLIENT_ID || !FREEE_CLIENT_SECRET) {
    console.error('✗ FREEE_CLIENT_ID と FREEE_CLIENT_SECRET を .env に設定してください');
    process.exit(1);
  }

  console.log('🔄 認可コード → アクセストークン取得中...\n');

  try {
    const result = await httpsPost('accounts.secure.freee.co.jp', '/public_api/token', {
      grant_type: 'authorization_code',
      client_id: FREEE_CLIENT_ID,
      client_secret: FREEE_CLIENT_SECRET,
      code,
      redirect_uri: FREEE_REDIRECT_URI,
    });

    if (result.status !== 200 || result.body.error) {
      console.error('✗ トークン取得失敗:', result.body.error_description || JSON.stringify(result.body));
      process.exit(1);
    }

    const saved = saveToken(result.body);
    const expiresHours = Math.floor(result.body.expires_in / 3600);

    console.log(`✓ アクセストークン取得成功`);
    console.log(`  有効期限: ${expiresHours}時間`);
    if (saved.company_id) {
      console.log(`  事業所ID: ${saved.company_id}`);
    }
    console.log(`  トークンファイル: ${TOKEN_FILE}`);
    console.log(`\n✓ リフレッシュトークンも保存済み（90日有効）`);
    console.log(`  期限前に node freee-auth.js refresh で更新してください`);
  } catch (err) {
    console.error(`✗ トークン取得エラー: ${err.message}`);
    process.exit(1);
  }
}

// ─── コマンド: refresh ───────────────────────────────────────

async function refreshToken() {
  if (!FREEE_CLIENT_ID || !FREEE_CLIENT_SECRET) {
    console.error('✗ FREEE_CLIENT_ID と FREEE_CLIENT_SECRET を .env に設定してください');
    process.exit(1);
  }

  const current = loadToken();
  if (!current || !current.refresh_token) {
    console.error('✗ リフレッシュトークンがありません');
    console.error('  先に node freee-auth.js setup → token でトークンを取得してください');
    process.exit(1);
  }

  console.log('🔄 リフレッシュトークンでアクセストークン更新中...\n');

  try {
    const result = await httpsPost('accounts.secure.freee.co.jp', '/public_api/token', {
      grant_type: 'refresh_token',
      client_id: FREEE_CLIENT_ID,
      client_secret: FREEE_CLIENT_SECRET,
      refresh_token: current.refresh_token,
    });

    if (result.status !== 200 || result.body.error) {
      console.error('✗ トークン更新失敗:', result.body.error_description || JSON.stringify(result.body));
      if (result.body.error === 'invalid_grant') {
        console.error('\n  リフレッシュトークンが期限切れです。');
        console.error('  node freee-auth.js setup から再認証してください。');
      }
      process.exit(1);
    }

    const saved = saveToken(result.body);
    const expiresHours = Math.floor(result.body.expires_in / 3600);

    console.log(`✓ アクセストークン更新成功`);
    console.log(`  有効期限: ${expiresHours}時間`);
    console.log(`  リフレッシュトークンも新しくなりました（90日有効）`);
  } catch (err) {
    console.error(`✗ トークン更新エラー: ${err.message}`);
    process.exit(1);
  }
}

// ─── コマンド: check ─────────────────────────────────────────

async function checkConnection() {
  const token = loadToken();
  if (!token) {
    console.error('✗ トークンファイルがありません');
    console.error('  先に node freee-auth.js setup → token でトークンを取得してください');
    process.exit(1);
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = token.created_at + token.expires_in;
  const isExpired = now >= expiresAt;

  console.log('🔍 freee接続情報を確認中...\n');

  // トークン有効期限
  if (isExpired) {
    console.log('⚠ アクセストークンが期限切れです。refreshを実行します...\n');
    await refreshToken();
    console.log('');
    return checkConnection();
  }

  const remainMin = Math.floor((expiresAt - now) / 60);
  const remainHours = Math.floor(remainMin / 60);
  console.log(`✓ アクセストークン: 有効（残り${remainHours}時間${remainMin % 60}分）`);

  // リフレッシュトークン有効期限（90日）
  const refreshExpiresAt = token.created_at + (90 * 86400);
  const refreshDaysLeft = Math.floor((refreshExpiresAt - now) / 86400);
  if (refreshDaysLeft <= 7) {
    console.log(`⚠ リフレッシュトークン: 残り${refreshDaysLeft}日（早めに refresh を実行）`);
  } else {
    console.log(`✓ リフレッシュトークン: 残り${refreshDaysLeft}日`);
  }

  // 事業所情報取得
  try {
    const accessToken = token.access_token;
    const res = await httpsGet('api.freee.co.jp', '/api/1/companies', accessToken);

    if (res.status === 401) {
      console.error('\n✗ 認証エラー（401）。node freee-auth.js refresh を実行してください');
      process.exit(1);
    }

    if (res.status !== 200) {
      console.error(`\n✗ API エラー (${res.status}):`, JSON.stringify(res.body));
      process.exit(1);
    }

    const companies = res.body.companies || [];
    if (companies.length === 0) {
      console.log('\n⚠ 事業所が見つかりません');
      return;
    }

    console.log(`\n事業所一覧:`);
    for (const c of companies) {
      const role = c.role || '不明';
      console.log(`  - ${c.display_name || c.name} (ID: ${c.id}, 権限: ${role})`);
    }

    if (token.company_id) {
      console.log(`\n  現在の対象事業所ID: ${token.company_id}`);
    } else if (companies.length === 1) {
      console.log(`\n💡 事業所IDを .freee-token.json に自動設定: ${companies[0].id}`);
      token.company_id = companies[0].id;
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
    }
  } catch (err) {
    console.error(`\n✗ 接続確認失敗: ${err.message}`);
    process.exit(1);
  }
}

// ─── エクスポート（他スクリプトから利用） ─────────────────────

module.exports = { loadToken, saveToken, getAccessToken, refreshToken: refreshToken, httpsGet };

// ─── メイン ──────────────────────────────────────────────────

if (require.main === module) {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case 'setup':
      showSetup();
      break;

    case 'login':
      loginFlow().then((ok) => { if (!ok) process.exit(1); });
      break;

    case 'token':
      if (!arg) {
        console.error('使い方: node freee-auth.js token <認可コード>');
        process.exit(1);
      }
      exchangeToken(arg);
      break;

    case 'refresh':
      refreshToken();
      break;

    case 'check':
      checkConnection();
      break;

    default:
      console.log(`
=== freee会計 OAuth認証 & トークン管理 ===

使い方:
  node freee-auth.js login              ★推奨★ 自動認証（ローカルサーバー経由）
  node freee-auth.js setup              認可URL表示（手動でコード入力）
  node freee-auth.js token <認可コード>  認可コード → アクセストークン取得
  node freee-auth.js refresh            リフレッシュトークンで更新
  node freee-auth.js check              接続確認（事業所情報表示）

初回セットアップ手順:
  1. https://app.secure.freee.co.jp/developers/applications でアプリ作成
  2. コールバックURLに http://localhost:8089/callback を追加
  3. .env に FREEE_CLIENT_ID と FREEE_CLIENT_SECRET を追加
  4. node freee-auth.js login →（macOS はブラウザが自動で開く）認可 → 自動でトークン取得
  5. node freee-auth.js check で接続確認

必要な .env 変数:
  FREEE_CLIENT_ID      — freee アプリの Client ID
  FREEE_CLIENT_SECRET  — freee アプリの Client Secret
  FREEE_TOKEN_JSON     — （任意・CI用）.freee-token.json と同等の JSON を1行で渡すとファイルより優先

トークンの保存先:
  .freee-token.json（.gitignore に追加推奨）
  アクセストークン: 6時間有効（自動リフレッシュ対応）
  リフレッシュトークン: 90日有効（期限前に refresh 実行）
`);
  }
}
