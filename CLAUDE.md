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
| Niki★DINER | エアレジ |
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
| 毎朝7時（目安） | `morning:ci` | ①予定・案件 → ②千福売上（Notionクライアント売上DB）→ ③ブリーフ（デイリーログにも保存）。Slackは①②③の3通のみ | `#daily-command` ＋ デイリーログDB |
| 月次 | `freee-sales.js` | freeeから自社売上取得 → KPI更新 | `#daily-command` ＋ KPI売上DB |
| 月次（月初・CI） | `monthly-freee-kpi.yml` | 前月分を `freee-sales.js --no-slack` で KPI・売上DB に同期 → `decision-log.js` で記録 | KPI・売上DB ＋ 意思決定ログDB |
| 随時 | `decision-log.js` | 重要判断を **意思決定ログDB** に1行追加（`npm run decision:log -- "タイトル"`） | 意思決定ログDB |
| 随時 | 手動 | 案件の進捗・ステータス更新 | 案件管理DB |
| 月次（推奨） | `pdca-abc-report.js` | よいどころ千福の取引明細からABC分析＋PDCAひな形（`npm run pdca:abc -- YYYY-MM`） | `docs/pdca-abc/latest.md`（#daily-command には出さない） |
| 月次（月初） | `unbilled-cases-alert.js` | 案件管理DBの未請求・要確認候補 → Slack（`npm run cases:unbilled`） | `#daily-command` |

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

### コンテンツDB（見やすさ・手動）
- プロパティの並び・A〜F の意味: `docs/notion-content-db-property-order.md`
- **Notion 上でブロック分け風にする**（表ビューの複製・表示列の切替・リンクドビュー）: `docs/notion-content-db-notion-ui-layout.md`  
  ※列の間に区切り線は引けないため、**ビュー**で「編集用」「インサイト用」に分けるのが定石。
- **ダッシュボード（入口ページ＋リンクドビューで絞り込み）**: `docs/notion-instagram-dashboard.md`

## 環境変数
| 変数名 | 説明 |
|--------|------|
| `NOTION_TOKEN` | Notion APIトークン |
| `NOTION_CONTENT_DATA_SOURCE_ID` | （任意）コンテンツDBのデータソースID。未設定時は既定値（`scripts/lib/notion-content-data-source-query.js` 参照）。マルチデータソース化後のクエリ・作成に使用。 |
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
| `KPI_DB_TITLE_PROP` / `KPI_DB_SALES_PROP` / `KPI_DB_NOTE_PROP` | KPI・売上DBの列名（既定: `月`・`売上合計`・`備考`） |
| `KPI_FREEE_MARKER` | 備考に含めるマーカー（既定: `freee`・同期行の識別用） |
| `KPI_REVENUE_RULES_PATH` | 収益タイプ分類JSONのパス（既定: `kpi-revenue-rules.json`） |
| `KPI_SALES_SUMMARY_BREAKDOWN` | `0` で月合計行にコンサル・運用・スポット列を書かない |
| `NOTION_CASE_DB_ID` | 案件管理DB ID（`unbilled-cases-alert.js`・省略時は CLAUDE 記載の既定） |
| `CASE_BILLING_STATUS_PROP` / `CASE_BILLING_UNBILLED_VALUE` | 未請求の明示 Select 列と値（`docs/unbilled-cases-alert.md`） |
| `CASE_UNBILLED_HEURISTIC` / `CASE_UNBILLED_STATUSES` | ヒューリスティックの on/off と対象ステータス |
| `FREEE_TOKEN_JSON` | （CI用）`.freee-token.json` 相当の JSON。`loadToken()` がファイルより優先（`freee-auth.js`） |
| `NOTION_DECISION_LOG_DB_ID` | 意思決定ログDB ID（`decision-log.js`・省略時は下表の既定） |

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
- 案件ステータスは Notion **案件管理DB** の **`クライアント`（Select）** と **`ステータス`** を参照（`scripts/lib/notion-case-client-status.js`、Notion の `Niki DINER` はブリーフ表記 `Niki★DINER` に対応）。複数案件はより「進んでいる」ステータスを優先表示
- 飲食業界トレンド・AIメッセージを生成
- Slackの `#daily-command` に通知 ＋ デイリーログDBに保存

### Phase 1.5: クライアント売上定時通知 ✅
- スマレジ（よいどころ千福）から日次売上取得（`sales-report.js`）
- Slackの `#daily-command` に通知 ＋ クライアント売上DBに保存

### Phase 1.7: Instagram運用OS ✅
- 月間投稿カレンダー自動生成（`content-calendar.js`）
- M'z cafe（7本/月）・Niki★DINER（4本/月）の投稿企画をNotionに一括生成
- **スタッフレディ**: Notionを見れば判断ゼロで投稿完了できるレベル
- キャプション完成済み・コピペ用テキスト・STEP形式編集手順・投稿前後チェックリスト
- ハッシュタグ5個×3セットA/B/Cローテーション（シャドウバン回避）
- 成長アクション指示付き（投稿後の手動エンゲージメント）
- 季節自動置換（{season}→春/夏/秋/冬）
- 制作ツール: Google AI Studio (ImageFX/Veo 3.1), ChatGPT, DaVinci Resolve（無料版）, Canva, Premiere Pro
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

### Phase 3: freee × Notion 経理自動化 ✅
- **現金・レシート経費の正式運用**: 撮影画像を **`TASUKE-AI/receipts/`**（例: `/Volumes/Home_Mac_SSD/02_Development/04_AI_Lab/TASUKE-AI/receipts`）に入れる → リポジトリ直下で **`npm run receipt`** → Gemini OCR → 仕分け → freee 取引登録。手順メモは `receipts/README.md`。**旧運用（CamScanner PDF → AirDrop → GAS 自動仕分け → 目視修正 → Excel → freee インポート）は廃止**。
- `freee-auth.js` — freee OAuth認証 & トークン管理（セットアップ・リフレッシュ・接続確認）。**CI**: 環境変数 `FREEE_TOKEN_JSON` でトークンを注入可能（ファイルより優先）
- **freee アプリ（開発者向け）の権限**: 取引の参照・登録・更新、取引先の参照・登録・更新、勘定科目・品目・部門・口座・事業所の参照など（一覧は `receipts/FREEE_PERMISSIONS.md`）。権限を変えたら **再認可**（ブラウザで認可し直し → `freee-auth.js token` でトークン更新）が必要
- `freee-sales.js` — 月次売上をfreeeから取得 → KPI・売上DB + Slack。**月**列: 合計 `YYYY-MM`、取引先別 `YYYY-MM｜取引先名`。月合計行に **売上合計** と **コンサル／運用代行／スポット**（`kpi-revenue-rules.json` で分類、`docs/kpi-revenue-rules.md`）。**備考**は `freee` を含み手入力行と区別。取引先名は `partner_id` で解決。`KPI_SALES_SUMMARY_BREAKDOWN=0` で内訳3列を送らない。過去月の一括取り込みは `node freee-sales.js --no-slack YYYY-MM`（Slack を飛ばす）
- 損益計算書（P/L）取得対応（`--pl` オプション）
- トークン自動リフレッシュ（アクセストークン6h / リフレッシュトークン90日）
- `receipt-import.js` — レシート画像をGemini OCRで読み取り → 過去取引から自動仕分け → freee APIで取引登録（同一画像は `receipt-import-state.json` で二重登録を防止、`--force` で再登録可。登録成功後は既定で長辺1200px JPEGに置き換えて容量削減、`--no-compress` / `RECEIPT_NO_COMPRESS=1` で元ファイル維持）。OCR は旧 GAS 版に近い **system プロンプト＋`responseMimeType: application/json`＋`temperature: 0`**（`RECEIPT_GEMINI_MODEL` でモデル変更可、`RECEIPT_OCR_PARTNER_PROMPT_MAX` でプロンプトに載せる取引先名の最大件数）。freee 明細の **備考** は `TASUKE-AI` のみ（`RECEIPT_IMPORT_REMARK` で変更可）。**品目**は常に付与（`item_guess`・購入品目・勘定からマスタ照合、足りなければ `RECEIPT_DEFAULT_ITEM_NAME` / `RECEIPT_DEFAULT_ITEM_ID`）。**ルールにない店舗は freee に取引先を自動作成**し、勘定は Gemini 推測＋経費科目マスタ（`RECEIPT_NEW_ACCOUNT_NAME` でフォールバック勘定を指定可）
- 仕分けルール自動学習（freee過去取引717件→183ルール生成済み）
- **未請求・要確認アラート**: `unbilled-cases-alert.js`（`npm run cases:unbilled`）→ Slack。**推奨**: 案件管理DBに Select **`請求ステータス`**（`未請求` / `請求済` / `不要`）を追加し `CASE_BILLING_STATUS_PROP=請求ステータス` で明示運用。無い場合は **進行中かつ月額>0** を候補表示。`docs/unbilled-cases-alert.md`。定時: `monthly-unbilled-cases.yml`
- **意思決定ログ**: `decision-log.js`（`npm run decision:log -- "タイトル"`、`--body` / `--reason` / `--ai` / `--priority`）。定例の経理同期の記録は **`.github/workflows/monthly-freee-kpi.yml`** が自動で1行追加（`docs/github-actions-freee-kpi.md`）
- **月次 freee→KPI（GitHub Actions）**: `monthly-freee-kpi.yml` — Secrets `FREEE_TOKEN_JSON`（`.freee-token.json` の中身）＋ `FREEE_CLIENT_*` ＋ `NOTION_TOKEN`。前月を `--no-slack` で同期

### Phase 4: PDCA自動レポート＋次回改善案
- インサイトデータから最高/最低パフォーマンス投稿を分析
- KPI漏斗の自動追跡（リーチ→プロフ訪問→フォロー転換→来店）
- 月次レポート自動生成
