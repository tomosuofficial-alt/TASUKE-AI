// .freee-token.json を1行にして GitHub Secret FREEE_TOKEN_JSON に貼り付けやすくする
//   node scripts/print-freee-token-json-for-github-secret.js        # 標準出力
//   node scripts/print-freee-token-json-for-github-secret.js | pbcopy   # macOS でクリップボード

const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', '.freee-token.json');
if (!fs.existsSync(p)) {
  console.error('✗ .freee-token.json がありません。先に node freee-auth.js refresh などで取得してください。');
  process.exit(1);
}

let j;
try {
  j = JSON.parse(fs.readFileSync(p, 'utf8'));
} catch (e) {
  console.error('✗ JSON の読み込みに失敗:', e.message);
  process.exit(1);
}

process.stdout.write(JSON.stringify(j));
