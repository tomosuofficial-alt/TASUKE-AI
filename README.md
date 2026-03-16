# TASUKE-AI

飲食店・中小企業の売上管理と日常業務を、AIで自動化するプロジェクトです。

## このプロジェクトは何をするもの？

- 飲食店の **売上を自動で取りに行って**、Slackに通知する
- 毎朝の **ブリーフ（業務サマリー）** を自動で作って、SlackとNotionに保存する
- CSVファイルから売上データを取り込む
- Claude Code の専門エージェントが、売上確認・調査・運用をサポートする

## 今できること

| 機能 | 状態 | 説明 |
|------|------|------|
| 朝次ブリーフ | 動作中 | 案件状況・トレンド・AIメッセージをSlack通知＋Notion保存 |
| よいどころ千福 売上取得 | 動作中 | スマレジAPIから当日売上を取得 → Slack通知 |
| Niki★DINER 売上取得 | 一時停止 | AirレジAPI未確定のため停止中（CSV運用で対応） |
| Instagram投稿カレンダー | 動作中 | M'z cafe（7本/月）・Niki★DINER（4本/月）のスタッフレディ投稿企画を自動生成 |
| Instagramインサイト集計 | 利用可能 | 投稿ごとのリーチ・ER等を自動取得→Notionに書き込み（要Meta API設定） |
| 競合リサーチ | 利用可能 | 競合アカウント監視＋ハッシュタグトレンド分析→Notionに保存（要Meta API設定） |
| CSV取り込み | 利用可能 | data/ 内のCSVをNotionに取り込む |
| Notion保存（売上） | 一時停止 | 保存先DBの整理が必要なため停止中 |

## フォルダ構成

```
TASUKE-AI/
├── .env                  ← 認証情報（絶対にGitに入れない）
├── .claude/
│   └── agents/           ← Claude Code 専門エージェント定義
│       ├── ceo-agent.md
│       ├── finance-agent.md
│       ├── operations-agent.md
│       ├── research-agent.md
│       └── content-agent.md
├── brief.js              ← 朝次ブリーフ生成スクリプト
├── sales-report.js       ← 売上レポート（よいどころ千福・スマレジ専用の安全版）
├── content-calendar.js   ← Instagram投稿カレンダー生成
├── instagram-insights.js ← Instagram投稿インサイト集計
├── competitor-research.js ← 競合リサーチ（アカウント監視＋ハッシュタグ分析）
├── meta-auth.js          ← Meta Graph API トークン管理
├── import-csv.js         ← CSV → Notion 取り込み
├── import-smaregi.js     ← スマレジCSV → Notion 取り込み
├── data/                 ← 売上CSVファイル置き場
├── logs/                 ← ログ出力先
├── CLAUDE.md             ← AI向け指示書
├── package.json
└── node_modules/
```

## 使い方

### 1. 初回セットアップ

```bash
cd /Volumes/Home_Mac_SSD/02_Development/04_AI_Lab/TASUKE-AI
npm install
```

### 2. 環境変数の確認

`.env` ファイルが存在することを確認する。

```bash
ls -la .env
```

必要な変数名: `NOTION_TOKEN` / `SLACK_DAILY_COMMAND_WEBHOOK_URL` / `SMAREGI_CLIENT_ID` / `SMAREGI_CLIENT_SECRET` / `SMAREGI_CONTRACT_ID`

※ 中身の秘密情報は画面共有やREADMEに出さないこと

## 実行コマンド一覧

| やりたいこと | コマンド |
|------------|---------|
| 朝次ブリーフを実行 | `npm run brief` |
| 売上レポートを実行 | `npm run sales` |
| CSVを取り込む | `npm run import:csv` |
| スマレジCSVを取り込む | `npm run import:smaregi` |
| Instagram投稿カレンダー生成 | `npm run content:calendar` |
| 特定月のカレンダー生成 | `npm run content:calendar -- 2026-04` |
| Instagramインサイト集計（過去7日） | `npm run instagram:insights` |
| Instagramインサイト集計（過去30日） | `npm run instagram:insights -- 30` |
| 競合リサーチ（全実行） | `npm run competitor:research` |
| ハッシュタグ調査 | `npm run competitor:research -- hashtag #高崎グルメ` |
| Meta APIトークン管理 | `npm run meta:auth` |
| トークン有効期限確認 | `npm run meta:auth -- check` |
| 接続情報確認 | `npm run meta:auth -- me` |

どれも `node ファイル名.js` で直接実行しても同じです。

## Claude Code エージェント

Claude Code の中で、目的に応じた専門エージェントが使えます。

| エージェント名 | 役割 | 使うタイミング |
|--------------|------|--------------|
| **ceo-agent** | 司令塔 | 依頼を分類して適切なエージェントに振り分ける |
| **finance-agent** | 売上・経理 | 売上確認、CSV取り込み実行、KPI更新 |
| **operations-agent** | 運用 | 朝次ブリーフ実行、Notion保存、Slack通知 |
| **research-agent** | 調査 | スクリプトの仕様調査、比較、要約 |
| **content-agent** | SNS企画 | Instagram投稿カレンダー生成、STEP形式編集手順、テーマ・ハッシュタグ提案 |

## 今の制限事項

- **Niki★DINER（Airレジ）は自作API接続仕様が未確認**
  - 現時点ではCSV運用で対応
  - API仕様が確認できたら再検討
- **Notion への売上保存は一時停止中**
  - KPI売上DBは個人事業用のため、店舗売上の保存先として不適切
  - 保存先DBの設計が決まったら復活させる
- **sales-report.js はよいどころ千福（スマレジ）専用**
  - Niki★DINERの処理は無効化済み（コード内に復活コメントあり）

## トラブル時の確認ポイント

動かないときは、上から順番にチェックしてください。

1. **npm install は済んでいるか？**
   ```bash
   npm install
   ```

2. **`.env` ファイルはあるか？**
   ```bash
   ls -la .env
   ```
   ※ 中身の秘密情報は画面共有やREADMEに出さないこと

3. **Node.js は入っているか？**
   ```bash
   node -v
   ```

4. **エラーメッセージを読む**
   - `⚠ スマレジAPIキー未設定` → `.env` のスマレジ系の変数が空
   - `✗ Slack送信エラー` → Webhook URLが間違っている or 期限切れ
   - `MODULE_NOT_FOUND` → `npm install` を再実行

5. **ネットワークは繋がっているか？**
   - スマレジAPI・Slack・Notionはすべてインターネット経由

## 今後やること

- [ ] Niki★DINER の売上取得方法を決める（CSV自動化 or 別API）
- [ ] 店舗売上専用のNotion DBを設計して、売上保存を復活させる
- [ ] freee連携で月次経理を自動化する（Phase 2）
- [ ] 朝次ブリーフの定時自動実行（cron or スケジューラ）
- [ ] Instagram Graph API 連携でインサイト自動取得（Phase 2.5）
- [ ] 投稿パフォーマンスの月次自動レポート
- [ ] A/Bテスト追跡（フック・ハッシュタグ・投稿時間）
