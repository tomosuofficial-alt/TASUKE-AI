// airregi-probe.js
//
// 使い方:
// 1) このファイルを TASUKE-AI 直下に保存
// 2) .env に以下を追加
//
// AIRREGI_API_BASE_URL=https://ここにAirレジAPIのベースURL
// AIRREGI_TEST_PATH=/ここに疎通確認したいGETエンドポイント
// AIRREGI_API_KEY=ここにAPIキー
// AIRREGI_API_TOKEN=ここにAPIトークン
//
// # 認証ヘッダー名が不明な場合は、仕様書に合わせて変更
// AIRREGI_API_KEY_HEADER=X-API-Key
// AIRREGI_API_TOKEN_HEADER=X-API-Token
//
// # 必要なら GET 以外も可
// AIRREGI_METHOD=GET
//
// 3) 実行
// node airregi-probe.js
//
// 4) package.json に追加するなら
// "airregi:probe": "node airregi-probe.js"

require("dotenv").config();
const https = require("https");

const {
  AIRREGI_API_BASE_URL,
  AIRREGI_TEST_PATH,
  AIRREGI_API_KEY,
  AIRREGI_API_TOKEN,
  AIRREGI_API_KEY_HEADER = "X-API-Key",
  AIRREGI_API_TOKEN_HEADER = "X-API-Token",
  AIRREGI_METHOD = "GET",
} = process.env;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!AIRREGI_API_BASE_URL) fail("AIRREGI_API_BASE_URL が未設定です");
if (!AIRREGI_TEST_PATH) fail("AIRREGI_TEST_PATH が未設定です");
if (!AIRREGI_API_KEY) fail("AIRREGI_API_KEY が未設定です");
if (!AIRREGI_API_TOKEN) fail("AIRREGI_API_TOKEN が未設定です");

let url;
try {
  url = new URL(AIRREGI_TEST_PATH, AIRREGI_API_BASE_URL);
} catch (e) {
  fail(`URLの組み立てに失敗しました: ${e.message}`);
}

const headers = {
  Accept: "application/json",
  [AIRREGI_API_KEY_HEADER]: AIRREGI_API_KEY,
  [AIRREGI_API_TOKEN_HEADER]: AIRREGI_API_TOKEN,
};

console.log("=== Airレジ API 疎通テスト開始 ===");
console.log(`METHOD : ${AIRREGI_METHOD}`);
console.log(`URL    : ${url.toString()}`);
console.log(`HEADERS: ${AIRREGI_API_KEY_HEADER}=***, ${AIRREGI_API_TOKEN_HEADER}=***`);

const req = https.request(
  {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || 443,
    path: `${url.pathname}${url.search}`,
    method: AIRREGI_METHOD,
    headers,
    timeout: 15000,
  },
  (res) => {
    let body = "";

    res.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });

    res.on("end", () => {
      console.log("\n=== レスポンス ===");
      console.log(`STATUS : ${res.statusCode}`);

      const contentType = res.headers["content-type"] || "";
      console.log(`CONTENT: ${contentType}`);

      const bodyPreview = body.length > 2000 ? `${body.slice(0, 2000)}\n... (truncated)` : body;

      console.log("\n=== BODY ===");
      console.log(bodyPreview || "(empty)");

      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        console.log("\n✓ 疎通成功");
        process.exit(0);
      } else {
        console.log("\n⚠ 疎通はしたが、正常ステータスではありません");
        process.exit(2);
      }
    });
  }
);

req.on("timeout", () => {
  console.error("✗ タイムアウトしました");
  req.destroy();
  process.exit(1);
});

req.on("error", (err) => {
  console.error(`✗ 接続エラー: ${err.message}`);
  process.exit(1);
});

req.end();