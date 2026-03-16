# TASUKE.AI company — AI指示書

## プロジェクト概要
- **会社**: TASUKE.AI company（TOMOSU. 内部プロジェクト）
- **CEO**: 大内嵩志
- **ミッション**: 飲食店・中小企業のAI活用を支援し、事業成長を加速する

## 売上目標
| 期限 | 目標 | 達成手段 |
|------|------|---------|
| 2026年内 | 月500万円 | クライアント月額費用 ＋ スポット案件の積み上げ |
| 2029年 | 年商1億円 | サービス拡張・クライアント数増加 |

## 現行クライアント
※ クライアントによって対応内容が異なる。詳細は案件管理DBを参照。
| クライアント | レジシステム |
|------------|------------|
| よいどころ千福 | スマレジ（フードビジネスプラン）→ API自動取得 ✅ |
| Niki★DINER | エアレジ → API取得不可（連携システム専用のため対象外） |
| Bistro Knocks | 不明 |
| Mz cafe | 不明 |

## AI幹部と役割
| 役職 | 担当AI | 責任範囲 |
|------|--------|---------|
| CFO | Claude | KPI・売上集計／収益シミュレーション／意思決定支援／freee連携経理 |
| CMO | GPT-5.3 | SNS投稿文・提案書・コンテンツ生成／マーケ戦略 |
| CTO | Cursor | 自動化スクリプト開発／Notion連携システム構築／技術選定 |
| COO | Gemini | 日次タスク整理・進捗管理／クライアント対応フロー設計 |
| CDO | Perplexity | 競合分析／新規営業ネタ収集／深掘り調査（手動利用） |
| Content | Claude (content-agent) | Instagram投稿カレンダー生成／テーマ・フック・CTA提案／ハッシュタグ戦略 |

## AIの動作ルール
| タイミング | スクリプト | 動作 | 通知先 |
|-----------|-----------|------|--------|
| 毎朝8時 | `brief.js` | 朝次ブリーフ自動生成（案件状況・トレンド・AIメッセージ） | `#daily-command` ＋ デイリーログDB |
| 毎日定時 | `sales-report.js` | クライアント別売上レポート（スマレジ・エアレジ取得） | `#daily-command` ＋ KPI売上DB |
| 月次 | （Phase 2） | freeeから売上取得 → KPI更新 | KPI売上DB |
| 随時 | 手動 | 意思決定・重要判断を記録 | 意思決定ログDB |
| 随時 | 手動 | 案件の進捗・ステータス更新 | 案件管理DB |

## Notion データベース
| 用途 | ID |
|------|----|
| トップページ | `3249fe8c3a7f80269c41ce55e14d4d79` |
| デイリーログDB | `b16ea51c-cd90-470f-8072-6eb4a6536da3` |
| 案件管理DB | `e8434c27-61bf-436b-9bf2-601b5ff4d848` |
| コンテンツDB（Instagram投稿カレンダー） | `942d70a4-e645-464e-a1ab-5176bce10939` |
| 競合リサーチDB | 初回実行時に自動作成（`COMPETITOR_DB_ID`で指定可） |
| KPI売上DB | `6b9f8d67-dbed-4f65-9069-67bc0925d711` |
| クライアント売上DB | `3249fe8c-3a7f-8151-a97a-c40827a55732` |
| 意思決定ログDB | `88e65c7c-6e3d-4dad-af74-6ad7f2fd2659` |

## 環境変数
| 変数名 | 説明 |
|--------|------|
| `NOTION_TOKEN` | Notion APIトークン |
| `SLACK_DAILY_COMMAND_WEBHOOK_URL` | Slack `#daily-command` Webhook URL |
| `SMAREGI_CLIENT_ID` | スマレジ APIクライアントID |
| `SMAREGI_CLIENT_SECRET` | スマレジ APIクライアントシークレット |
| `SMAREGI_CONTRACT_ID` | スマレジ 契約ID |
| `AIRREGI_API_KEY` | エアレジ APIキー |
| `AIRREGI_API_TOKEN` | エアレジ APIトークン |
| `META_APP_ID` | Meta Developer App ID |
| `META_APP_SECRET` | Meta Developer App Secret |
| `META_ACCESS_TOKEN` | Meta Graph API 長期アクセストークン |
| `INSTAGRAM_ACCOUNT_ID_MZ` | M'z cafe Instagram ビジネスアカウントID |
| `INSTAGRAM_ACCOUNT_ID_NIKI` | Niki★DINER Instagram ビジネスアカウントID |
| `COMPETITOR_DB_ID` | 競合リサーチDB ID（初回自動作成） |
| `FREEE_CLIENT_ID` | freee APIクライアントID（Phase 3） |
| `FREEE_CLIENT_SECRET` | freee APIクライアントシークレット（Phase 3） |
| `FREEE_REFRESH_TOKEN` | freee APIリフレッシュトークン（Phase 3） |
| `FREEE_COMPANY_ID` | freee 事業所ID（Phase 3） |

## 技術スタック
- Node.js
- Notion API
- freee API
- 各種AI API
- RSS（ニュース取得・無料）
  - 食品産業新聞（飲食業界）: `https://www.ssnp.co.jp/feed/`
  - AINOW（AI関連）: `https://ainow.ai/feed/`
  - Business Insider Japan（事業トレンド）: `https://www.businessinsider.jp/feed/index.xml`

## 朝次ブリーフ 出力フォーマット
- **実行時刻**: 毎朝8時
- **配信先**: LINE通知 ＋ Notionデイリーログに保存

### 構成
```
【TASUKE.AI 朝次ブリーフ】YYYY/MM/DD

■ 案件ステータス
- よいどころ千福：〇〇
- Niki★DINER：〇〇
- Bistro Knocks：〇〇
- Mz cafe：〇〇

■ 注目トレンド
- 〇〇（RSS取得）

■ 今日のひとこと
〇〇（AIからのメッセージ）
```

## 開発ロードマップ
### Phase 1: 朝次ブリーフ自動生成スクリプト ✅
- 毎朝8時に自動実行（`brief.js`）
- 案件ステータス・飲食業界トレンド・AIメッセージを生成
- Slackの `#daily-command` に通知 ＋ デイリーログDBに保存

### Phase 1.5: クライアント売上定時通知 ✅
- スマレジ（よいどころ千福）・エアレジ（Niki★DINER）から日次売上取得（`sales-report.js`）
- Slackの `#daily-command` に通知 ＋ KPI売上DBに保存
- よいどころ千福のみ対象（スマレジ プラットフォームAPI）
- Niki★DINERはエアレジAPI取得不可のため対象外

### Phase 1.7: Instagram運用OS ✅
- 月間投稿カレンダー自動生成（`content-calendar.js`）
- M'z cafe（7本/月）・Niki★DINER（4本/月）の投稿企画をNotionに一括生成
- **スタッフレディ**: Notionを見れば判断ゼロで投稿完了できるレベル
- キャプション完成済み・コピペ用テキスト・STEP形式編集手順・投稿前後チェックリスト
- ハッシュタグ5個×3セットA/B/Cローテーション（シャドウバン回避）
- 成長アクション指示付き（投稿後の手動エンゲージメント）
- 季節自動置換（{season}→春/夏/秋/冬）
- 制作ツール: Google AI Studio (ImageFX/Veo 3.1), ChatGPT, CapCut, Canva, Premiere Pro, DaVinci Resolve
- content-agent で SNS企画・ハッシュタグ提案に対応

### Phase 2: Instagram Graph API 連携 ✅
- `instagram-insights.js` — 投稿ごとのインサイト自動取得→Content DBに書き込み
- `meta-auth.js` — Meta Graph APIトークン管理（変換・期限チェック・接続確認）
- 取得メトリクス: リーチ, いいね, コメント, 保存, シェア, 再生数, エンゲージメント率
- 前提: Meta Developer App + 長期トークン + Facebook連携が必要

### Phase 2.5: 競合リサーチ自動化 ✅
- `competitor-research.js` — 競合アカウント監視＋ハッシュタグトレンド分析→Notion競合リサーチDBに保存
- 高崎エリアの同業種アカウント定点観測（フォロワー数・投稿数・ER推定）
- ハッシュタグ別の人気投稿分析（平均いいね・リール率・頻出タグ）

### Phase 3: freee × Notion 経理自動化
- 月次売上をfreeeから取得 → KPI売上DBに自動書き込み
- 月末に案件管理DBの未請求案件を検出してアラート

### Phase 4: PDCA自動レポート＋次回改善案
- インサイトデータから最高/最低パフォーマンス投稿を分析
- KPI漏斗の自動追跡（リーチ→プロフ訪問→フォロー転換→来店）
- 月次レポート自動生成
