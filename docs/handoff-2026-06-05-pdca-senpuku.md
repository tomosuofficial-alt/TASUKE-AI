# 引き継ぎメモ: 千福PDCA改善システム（2026-06-05）

- 端末移行: **MacBook Air → Mac mini（本体）**
- 作成: ツカサ（CEO orchestrator）
- 目的: 別マシンで新しいClaude Codeセッションを開いても、経緯と次の一手がそのまま分かるようにする

---

## これは何か（30秒）

代表（大内）依頼。よいどころ千福の定例会議で吸い上げる「進捗・達成度・つまずき」を、会議で流して終わりにせず **PDCAループ（拾う→詰める→返す）** で回す。原因を **「人 vs 仕組み/動線」** で切り分け、仕組み・マニュアルを一つずつ資産化する。最終的に「**改善カード**」を既存チェックシートアプリ（Next.js/Supabase想定）に統合し **プロダクト資産化（KGI）**。店舗が自走 → TOMOSU. は監査役に退く。

## 正本ドキュメント

- **上位構想（プロダクト資産化まで）の正本** → [senpuku-pdca-system-spec.md](senpuku-pdca-system-spec.md)
- **Phase1 運用ループ（拾う→詰める→返す＋AI代行モデル）** → [pdca-meeting-loop.md](pdca-meeting-loop.md)
- Notion台帳 作成スクリプト（**実行保留中**） → `scripts/notion-create-meeting-actions-db.js`

## 確定した決定（§10）

| § | 項目 | 決定 |
|---|------|------|
| ① | 配置 | **C → A**（Phase1 Notion → Phase2 アプリ資産化） |
| ③ | 入力者 | Phase1=**AI代行(マワリ)** ／ 移管後=店長・幹部（異論なければ確定） |
| ④ | サイクル | **月次定例＋月内に中間1回**（隔週相当） |
| ⑥ | 原因分類 | spec §6 の **7分類を採用**（旧5分類を置換／異論なければ確定） |
| ⑦ | 達成度 | **5段階** |
| 役割分担 | 拾う・詰めるドラフト・返す＝**マワリ(AI)代行**／大内＝議事メモ提供・○×判断・現場確認 |

## 未決・ブロッカー（＝次にやること）

1. **✅ 解消（2026-06-05 ツクル on Mac mini）** 既存チェックシートアプリのソース確定。
   - パス: `/Volumes/Home_Mac_SSD/02_Development/02_Web_Apps/Yoidokoro_Senpuku/Check_Sheet/`
   - 公開URL: `https://senpuku-manual.netlify.app/`（タイトル一致確認済）
   - GitHub: `github.com/tomosuofficial-alt/senpuku-check-sheet`
   - 実構成: **GAS + Google Sheets（6シート）+ Netlify静的HTML + Claude Haiku + LINE**。spec §4 想定（Next.js/Supabase/Vercel）と乖離。spec §4 にツクル追記ノートを追加済。
   - データモデル提案 → [data-model-proposal-v1.md](data-model-proposal-v1.md)（レビュー待ち）
2. **§10⑤ 内製オーナー**（第2期に運用移管する社内の人）未定。大内さん指名待ち（店長？ ちいさん？）。
3. **✅ 解消（2026-06-05 ツクル on Mac mini）** Notion MCP 経由で NOTION_TOKEN なしで DB 作成完了。
   - 作成済: https://app.notion.com/p/47e529d28f984b3ea263219b4f7544c0
   - `scripts/notion-create-meeting-actions-db.js` も §5 新設計（7分類・19列）に改修済（構文OK）。横展開（Niki★DINER 等）の DB 作成時に NOTION_TOKEN 経由で再利用可能。
4. **6月定例（2026-06-02）の議事メモ未受領** ＝ Section10 由来の新規アクション投入と、4月／5/1由来カード26件の状態更新の起点。
   - DB は構築済み・5/1由来カードも投入済みなので、議事メモが来た瞬間に **「差分入力フロー」**（前節参照）が動く。
   - 届かない間も 4月 ❌ 6件と 5/1 由来 15件は既に「未達 / 進行中」状態なので、6/16 詰めるは部分的に実行可能。

## 次の段取り（spec §0 準拠・一気に実装しない）

1. ✅ アプリのソースパス確定（2026-06-05 完了）→ ソースは GAS+Sheets だった（Supabase ではない）
2. ✅ **①データモデル提案**（spec §6 ＋ 実シート突合）起草 → **[data-model-proposal-v1.md](data-model-proposal-v1.md)** で大内承認（2026-06-05）
3. ✅ **②Phase1 実装**（2026-06-05 大内承認のもと一気通貫実行）
   - Notion DB「定例アクション追跡」作成: https://app.notion.com/p/47e529d28f984b3ea263219b4f7544c0
   - data source: `collection://86509c4e-5cf9-43f9-b520-aa006e60d308`
   - 親ページ: TASUKE.AI company OS（`3249fe8c3a7f80269c41ce55e14d4d79`）
   - 19列スキーマは [data-model-proposal-v1.md](data-model-proposal-v1.md) §5 完全準拠
   - 改善カード 26件 初期投入完了（5/1議事録由来 + 6/2アジェンダ妥協不可3決定）
4. **③Phase1 運用検証** → 6/16 詰める → 6/30 返す → 7月定例で評価

### 初期投入 26件の内訳

| 区分 | 件数 | 状態 | 由来 |
|---|---|---|---|
| 4月達成チェック ❌ | 6 | 未達 / 繰り越し | 4/2 議事録 (Section4) |
| 4月達成チェック △ | 2 | 進行中（達成度3） | 4/2 議事録 (Section4) |
| 5/1 で決めた新規タスク | 15 | 進行中（一部 完了） | 5/1 議事録 (Section10) |
| 6/2 アジェンダ 妥協不可3決定 | 3 | 未着手 | 6/2 アジェンダ予定 (Section10) |

### 6/2 議事メモ受領後の差分入力フロー（マワリ向け）

議事メモを大内から受領したら、以下を順に実行:

1. **既存カードの状態更新** — Section4 の 4月由来 8件を 6/2 結果で更新
   - 達成 → `状態=完了`, `達成度=5 完了`, `検証結果` 記入
   - 一部達成 → `状態=検証中` or `進行中`, `達成度=2-4`, `なぜできなかったか` 記入（②詰める対象）
   - 未達 → `状態=未達` 継続、原因分類を 7分類から付与、`改善案` 記入
2. **5/1 タスク15件の状態更新** — 同上
3. **妥協不可3決定の更新** — 6/2 で決まった内容を `検証結果` に記入し `状態=完了`
4. **6/2 で新規に決まったアクション追加** — Section10 由来のカードを追加投入
   - 6月止血策1つ＋計測項目1つ
   - 6月KPI3つ＋担当
   - 離反常連3名アプローチ
   - 2回目来店導線1アクション
   - その他現場再発防止・採用・教育の確定事項

### Notion DB の即時アクセス
- Database: https://app.notion.com/p/47e529d28f984b3ea263219b4f7544c0
- Notion MCP 経由なら data_source_id `86509c4e-5cf9-43f9-b520-aa006e60d308` で page 追加・更新可能
- `scripts/notion-create-meeting-actions-db.js` は **再作成しないこと**（DB は既に存在）。同スクリプトは Niki★DINER 等の別クライアント DB 作成時に再利用

## Mac mini での再開手順

```bash
cd <TASUKE-AIのパス>      # 例: ~/Developer/TASUKE-AI
git fetch origin
git checkout feat/abc-dispatch-inputs
git pull
# その後 Claude Code を起動し、この handoff を読ませてから続行
```

## 注意

- Air 上には `tmp/yoidokoro_senpuku/`（6/2アジェンダ v1〜v4_1、ABC原価資料 等）が**未コミットで残存**。本PDCA継続には docs 2本＋スクリプトで足りるが、アジェンダ現物が必要なら別途同期。
- ブランチは `feat/abc-dispatch-inputs`（mainではない）。
