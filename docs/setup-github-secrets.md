# GitHub Actions 用 Secrets の登録手順

GitHub リポジトリ → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

機密は **GitHub にだけ**貼り、リポジトリにコミットしないでください。

---

## 共通（複数ワークフローで使用）

| Secret 名 | 用途 |
|-----------|------|
| `NOTION_TOKEN` | Notion インテグレーションのシークレット |
| `SLACK_DAILY_COMMAND_WEBHOOK_URL` | Slack `#daily-command` の Incoming Webhook URL |

---

## 朝次・売上（`daily-brief-and-sales.yml` など）

| Secret 名 | 用途 |
|-----------|------|
| `SMAREGI_CLIENT_ID` | スマレジ |
| `SMAREGI_CLIENT_SECRET` | スマレジ |
| `SMAREGI_CONTRACT_ID` | スマレジ |

（朝次の分割ジョブで使う場合はワークフロー定義に合わせて同じ名前で登録）

---

## 月次 freee → KPI（`monthly-freee-kpi.yml`）

| Secret 名 | 用途 |
|-----------|------|
| `FREEE_CLIENT_ID` | freee アプリの Client ID |
| `FREEE_CLIENT_SECRET` | freee アプリの Secret |
| `FREEE_TOKEN_JSON` | 下記スクリプトで **1行の JSON** を生成して貼り付け |
| `FREEE_COMPANY_ID` | （任意）事業所 ID。未設定ならトークン内の `company_id` を使用 |

### `FREEE_TOKEN_JSON` の作り方（推奨）

1. 手元でトークンを最新化:  
   `node freee-auth.js refresh`
2. 1行 JSON を出力:  
   `node scripts/print-freee-token-json-for-github-secret.js`
3. その **丸ごと**をコピーし、Secret 名 `FREEE_TOKEN_JSON` に保存（macOS なら `| pbcopy` でクリップボードへ）

詳細・トラブル時: `docs/github-actions-freee-kpi.md`

---

## 月次未請求アラート（`monthly-unbilled-cases.yml`）

| Secret 名 | 用途 |
|-----------|------|
| `NOTION_TOKEN` | 上記と同じで可 |
| `SLACK_DAILY_COMMAND_WEBHOOK_URL` | 上記と同じで可 |

任意: リポジトリの **Variables** に `CASE_BILLING_STATUS_PROP` 等を置く場合は、ワークフロー側で `env:` に渡す必要があります（現状ワークフローは未設定のため、未請求の判定は既定のヒューリスティックまたは Notion 列＋ローカル `.env`）。

---

## 登録後の確認

- **Actions** タブから該当ワークフローを **Run workflow**（手動）で1回実行  
- 失敗時はログを確認し、`FREEE_TOKEN_JSON` の更新や Notion / freee の権限を見直す
