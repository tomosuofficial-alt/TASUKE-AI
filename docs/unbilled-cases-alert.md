# 未請求・要確認案件アラート（`unbilled-cases-alert.js`）

Notion **案件管理DB** を走査し、請求漏れの可能性がある行を Slack `#daily-command` にまとめます（`--dry-run` でコンソールのみ）。

**推奨セットアップ**: 案件管理DBに Select 列 **`請求ステータス`**（`未請求` / `請求済` / `不要`）。API で一括追加する場合は `node scripts/notion-add-case-billing-status.js`。`.env` に `CASE_BILLING_STATUS_PROP=請求ステータス` と `CASE_BILLING_UNBILLED_VALUE=未請求`。列が空の行は従来のヒューリスティックの対象のまま。**ヒューリスティックだけ止める**ときは `CASE_UNBILLED_HEURISTIC=0`。

## 判定ロジック（2段階）

### A. 明示プロパティ（推奨）

Notion の案件管理DBに **Select** 列を追加する例:

- 列名: `請求ステータス`（環境変数 `CASE_BILLING_STATUS_PROP` で変更可）
- オプション例: `未請求` / `請求済` / `不要`

環境変数:

- `CASE_BILLING_STATUS_PROP` — 既定: 空（未使用）。例: `請求ステータス`
- `CASE_BILLING_UNBILLED_VALUE` — 既定: `未請求`

この列があり、値が `未請求` の行だけを **未請求** とみなします（ヒューリスティックより優先）。

### B. ヒューリスティック（列追加前の暫定）

`CASE_BILLING_STATUS_PROP` が未設定、または該当ページにその列が無いとき:

- **ステータス** が `CASE_UNBILLED_STATUSES` に含まれる（既定: `進行中` のみ）
- かつ **月額** が 1 以上

→ 「要確認候補」として一覧に出します（実際の請求状況は人が確認）。

無効化: `CASE_UNBILLED_HEURISTIC=0`

複数ステータス: `CASE_UNBILLED_STATUSES=進行中,提案中`

## 実行

```bash
node unbilled-cases-alert.js --dry-run
npm run cases:unbilled -- --dry-run
```

Slack まで送る:

```bash
npm run cases:unbilled
```

## 環境変数まとめ

| 変数 | 既定 | 説明 |
|------|------|------|
| `NOTION_TOKEN` | — | 必須 |
| `NOTION_CASE_DB_ID` | 案件管理DB ID | 別DBを見るとき |
| `SLACK_DAILY_COMMAND_WEBHOOK_URL` | — | 未設定時はコンソールのみ警告 |
| `CASE_BILLING_STATUS_PROP` | 空 | Select 列名（明示運用） |
| `CASE_BILLING_UNBILLED_VALUE` | `未請求` | 未請求とみなす選択肢名 |
| `CASE_UNBILLED_HEURISTIC` | 有効 | `0` で B をオフ |
| `CASE_UNBILLED_STATUSES` | `進行中` | カンマ区切り |

## 定時実行

GitHub Actions: `.github/workflows/monthly-unbilled-cases.yml`（毎月1日 JST 頃）。  
リポジトリの Secrets に `NOTION_TOKEN` と `SLACK_DAILY_COMMAND_WEBHOOK_URL` を設定してください。
