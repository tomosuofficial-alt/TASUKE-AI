# GitHub Actions: 月次 freee → KPI・売上DB

Secrets の一覧・登録手順の全体像: **`docs/setup-github-secrets.md`**

ワークフロー: `.github/workflows/monthly-freee-kpi.yml`

毎月1日（UTC）に **前月** の freee 収入を取得し、Notion KPI・売上DB に書き込みます（Slack は `--no-slack`）。成功時に **意思決定ログ** に1行追加します。

## 必要な Secrets

| Secret | 説明 |
|--------|------|
| `NOTION_TOKEN` | Notion インテグレーション |
| `FREEE_CLIENT_ID` | freee アプリ |
| `FREEE_CLIENT_SECRET` | freee アプリ |
| `FREEE_TOKEN_JSON` | **ローカルの `.freee-token.json` の中身を1行の JSON 文字列として貼り付け**（`refresh_token` を含む） |

任意（`.env` と同じ名前で KPI 列の上書きなど）:

- `FREEE_COMPANY_ID`
- `KPI_DB_*` / `KPI_FREEE_MARKER` など

## `FREEE_TOKEN_JSON` の作り方

1. 手元で `node freee-auth.js refresh` を実行し、`.freee-token.json` を最新にする  
2. ファイル全体をコピーし、GitHub の Repository secrets に `FREEE_TOKEN_JSON` として保存（改行を除いて1行でも可）

## リフレッシュトークンがローテーションされたとき

freee は `refresh` のたびに **新しい refresh_token** を返すことがあります。ジョブ内で `node freee-auth.js refresh` が走ると **runner 上の `.freee-token.json` だけ**が更新され、**Secret は自動では更新されません**。

- 月次ジョブが **401 / invalid_grant** で落ちたら、手元で再度 `refresh` → 新しい JSON を `FREEE_TOKEN_JSON` に貼り直してください。

## 手動実行

Actions タブから **Monthly freee KPI sync** を `workflow_dispatch` で実行できます。
