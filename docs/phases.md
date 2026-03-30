# TASUKE.AI 開発ロードマップ

> CLAUDE.md から退避した完了済みフェーズの記録（2026-03-30）

## Phase 1: 朝次ブリーフ自動生成スクリプト ✅
- 毎朝8時に自動実行（`brief.js`）
- 案件ステータスは Notion **案件管理DB** の **`クライアント`（Select）** と **`ステータス`** を参照（`scripts/lib/notion-case-client-status.js`、Notion の `Niki DINER` はブリーフ表記 `Niki★DINER` に対応）。複数案件はより「進んでいる」ステータスを優先表示
- 飲食業界トレンド・AIメッセージを生成
- Slackの `#daily-command` に通知 ＋ デイリーログDBに保存

## Phase 1.5: クライアント売上定時通知 ✅
- スマレジ（よいどころ千福）から日次売上取得（`sales-report.js`）
- Slackの `#daily-command` に通知 ＋ クライアント売上DBに保存

## Phase 1.7: Instagram運用OS ✅
- 月間投稿カレンダー自動生成（`content-calendar.js`）
- M'z cafe（6本/月）・Niki★DINER（4本/月）の投稿企画をNotionに一括生成
- **Niki★DINER 素材**: `09_Prosnap`（2026-02撮影・113枚・赤背景統一）を最優先で使用。番号帯 001-039=バーガー, 040-055=ライスプレート, 056-060=サラダ, 061-072=サイド, 073-086=副菜, 087-096=ドリンク, 097-113=デザート
- **素材選定→画像リタッチ→Notion更新の自動化**（`content-prepare.js`）: Notionの「素材チェックリスト」に記載されたファイルパスをそのまま使用（Single Source of Truth） → Gemini（`gemini-3.1-flash-image-preview`）でリタッチ・縦変換（3:4） → `04_AI_Generated/` に保存（sharp 8bit sRGB正規化）→ Notionステータスを「AI生成済み」に更新。リタッチプロンプトは元写真のラベル・ロゴを保持し、新規テキストは追加しない
- **キャプション・フック・CTA の AI 動的生成**（2026-03-28 実装）: `content-calendar.js` 内で Gemini API（`gemini-2.5-flash`）を使い、毎回ユニークなテキストを生成。固定テンプレは AI 失敗時のフォールバックとして残存
  - **クライアント別人格（`CLIENT_PERSONAS`）**: Mz cafe=「大人の隠れ家の店主」（静かな語り口・余韻）、Niki★DINER=「アメリカンダイナーの陽気な兄貴」（テンポ速い・断定調）
  - **重複回避**: Notion から過去10件のキャプションを取得し、同一バッチ内の生成分も含めてプロンプトに渡す
  - **出力形式**: JSON（`{"hook": "...", "caption": "...", "cta": "..."}`）、`responseMimeType: 'application/json'`、`temperature: 0.9`
- **スタッフレディ**: Notionを見れば判断ゼロで投稿完了できるレベル
- キャプション完成済み・コピペ用テキスト・STEP形式編集手順・投稿前後チェックリスト
- ハッシュタグ5個×3セットA/B/Cローテーション（シャドウバン回避）
- 成長アクション指示付き（投稿後の手動エンゲージメント）
- 季節自動置換（{season}→春/夏/秋/冬）
- 制作ツール: Google AI Studio (ImageFX/Veo 3.1), ChatGPT, DaVinci Resolve（無料版）, Canva, Premiere Pro
- content-agent で SNS企画・ハッシュタグ提案に対応

### コンテンツ運用フロー（月次）
```
① content-calendar.js → Notionにカレンダー生成（ステータス: 企画中）
   - フック・キャプション・CTAは Gemini API で動的生成（人格別）
   - 素材チェックリストに使用ファイルパスを記載
   ↓
② content-prepare.js → 企画中エントリを自動処理
   - Notion「素材チェックリスト」のファイルパスをそのまま使用
   - Gemini でリタッチ・縦変換（3:4）
   - 04_AI_Generated/ に保存（sharp 8bit sRGB正規化）
   - Notionステータスを「AI生成済み」に更新 + メモにパス記録
   ↓
③ Notionで確認 → 投稿
```

### npm scripts（コンテンツ系）
| コマンド | 説明 |
|---------|------|
| `npm run content:calendar` | 翌月分のカレンダーをNotionに生成 |
| `npm run content:calendar -- 2026-04` | 指定月のカレンダーを生成 |
| `npm run content:prepare` | 「企画中」エントリの画像リタッチ＋Notion更新 |
| `node content-prepare.js --from-date 2026-04-01 --dry-run` | 素材選定のプレビュー |
| `node content-prepare.js --from-date 2026-04-01 --regenerate` | AI生成済みも含めて再生成 |
| `node content-prepare.js --client "Niki★DINER"` | 特定クライアントのみ |

## Phase 2: Instagram Graph API 連携 ✅
- `instagram-insights.js` — 投稿ごとのインサイト自動取得→Content DBに書き込み
- `meta-auth.js` — Meta Graph APIトークン管理（変換・期限チェック・接続確認）
- 取得メトリクス: リーチ, いいね, コメント, 保存, シェア, 再生数, エンゲージメント率
- 前提: Meta Developer App + 長期トークン + Facebook連携が必要

## Phase 2.5: 競合リサーチ自動化 ✅
- `competitor-research.js` — 競合アカウント監視＋ハッシュタグトレンド分析→Notion競合リサーチDBに保存
- 高崎エリアの同業種アカウント定点観測（フォロワー数・投稿数・ER推定）
- ハッシュタグ別の人気投稿分析（平均いいね・リール率・頻出タグ）

## Phase 3: freee × Notion 経理自動化 ✅
- **現金・レシート経費の正式運用**: 撮影画像を **`TASUKE-AI/receipts/`** に入れる → `npm run receipt` → Gemini OCR → 仕分け → freee 取引登録。手順メモは `receipts/README.md`。**旧運用（CamScanner PDF → AirDrop → GAS 自動仕分け → 目視修正 → Excel → freee インポート）は廃止**。
- `freee-auth.js` — freee OAuth認証 & トークン管理。**CI**: 環境変数 `FREEE_TOKEN_JSON` でトークン注入可能
- **freee アプリの権限**: 一覧は `receipts/FREEE_PERMISSIONS.md`。権限変更時は再認可が必要
- `freee-sales.js` — 月次売上をfreeeから取得 → KPI・売上DB + Slack。**月**列: 合計 `YYYY-MM`、取引先別 `YYYY-MM｜取引先名`。月合計行に **売上合計** と **コンサル／運用代行／スポット**（`kpi-revenue-rules.json` で分類）。過去月の一括取り込みは `node freee-sales.js --no-slack YYYY-MM`
- 損益計算書（P/L）取得対応（`--pl` オプション）
- トークン自動リフレッシュ（アクセストークン6h / リフレッシュトークン90日）
- `receipt-import.js` — レシート画像をGemini OCRで読み取り → 過去取引から自動仕分け → freee APIで取引登録（同一画像は `receipt-import-state.json` で二重登録防止、`--force` で再登録可。登録成功後は長辺1200px JPEGに圧縮）。**ルールにない店舗は freee に取引先を自動作成**
- 仕分けルール自動学習（freee過去取引717件→183ルール生成済み）
- **未請求・要確認アラート**: `unbilled-cases-alert.js`（`npm run cases:unbilled`）→ Slack。詳細は `docs/unbilled-cases-alert.md`
- **意思決定ログ**: `decision-log.js`（`npm run decision:log -- "タイトル"`）。詳細は `docs/github-actions-freee-kpi.md`
- **月次 freee→KPI（GitHub Actions）**: `monthly-freee-kpi.yml`

## Phase 4: PDCA自動レポート＋次回改善案
- インサイトデータから最高/最低パフォーマンス投稿を分析
- KPI漏斗の自動追跡（リーチ→プロフ訪問→フォロー転換→来店）
- 月次レポート自動生成
