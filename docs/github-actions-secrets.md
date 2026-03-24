# GitHub Actions 用 Secrets 一覧

リポジトリ **Settings → Secrets and variables → Actions** に登録します。

`scripts/sync-github-secrets-from-env.js` で、ローカルの `.env`（と `.freee-token.json`）から一括同期できます。

```bash
node scripts/sync-github-secrets-from-env.js
```

## 必須（朝ジョブ・売上・欠損埋め）

| Secret | 用途 |
|--------|------|
| `NOTION_TOKEN` | Notion API |
| `SLACK_DAILY_COMMAND_WEBHOOK_URL` | `#daily-command` Incoming Webhook |
| `SMAREGI_CLIENT_ID` | スマレジ |
| `SMAREGI_CLIENT_SECRET` | スマレジ |
| `SMAREGI_CONTRACT_ID` | スマレジ |

## 朝①の予定・LINE取り込みを使う場合（未設定なら該当ステップは失敗し得る）

| Secret | 用途 |
|--------|------|
| `NOTION_SCHEDULE_DB_ID` | 予定DB |
| `NOTION_SCHEDULE_DATE_PROP` | 日付プロパティ名 |
| `NOTION_SCHEDULE_TITLE_PROP` | タイトルプロパティ名 |
| `NOTION_LINE_INBOX_DB_ID` | LINE Inbox DB |
| `NOTION_LINE_INBOX_DATE_PROP` ほか | `daily-brief-and-sales.yml` 参照 |
| `NOTION_LINE_INBOX_WINDOW_DAYS` | 任意 |

## 月次 freee KPI（`monthly-freee-kpi.yml`）

| Secret | 用途 |
|--------|------|
| `FREEE_CLIENT_ID` | freee アプリ |
| `FREEE_CLIENT_SECRET` | freee アプリ |
| `FREEE_COMPANY_ID` | 事業所ID |
| `FREEE_TOKEN_JSON` | `.freee-token.json` の中身（同期スクリプトが設定） |

## 未請求アラート等

| Secret | 用途 |
|--------|------|
| `SLACK_DAILY_COMMAND_WEBHOOK_URL` | 共通 |
