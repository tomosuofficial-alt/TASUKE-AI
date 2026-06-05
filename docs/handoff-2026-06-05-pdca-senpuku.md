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

1. **【最優先・関所】既存チェックシートアプリ（`senpuku-manual.netlify.app`）のソースの正確なパス未取得。**
   - 大内さん回答＝「**ローカルの別フォルダにある**」。だが Air 上の自動探索では発見できず（`~/Developer`=TASUKE-AIのみ、`~/bistro-knocks-recipeal`は別クライアント、内容grepもヒット0）。
   - → **Mac mini 本体にある可能性が高い。** Mac miniで再探索（`find ~ -maxdepth 6 -name package.json -not -path "*/node_modules/*"` で next を含むものを当たる）か、大内さんにパスを直接聞く。
   - 稼働先が **Netlify** なのに spec §4 は **Vercel/Supabase** 記載。実コードを読んで **実構成を確定**すること（§10②）。
2. **§10⑤ 内製オーナー**（第2期に運用移管する社内の人）未定。大内さん指名待ち（店長？ ちいさん？）。
3. **NOTION_TOKEN がローカルに無い**（GitHub Secrets には登録済み）。Notion台帳の実作成は (a) token入手 かつ (b) **§6 の7分類スキーマに作り直してから**。
   - ⚠️ 現在の `scripts/notion-create-meeting-actions-db.js` は **旧設計（つまずき5分類）**。実行前に spec §6 の改善カード（`cause_type` 7分類・`achievement`・`status`・`verification`・`to_standardize`・`related_doc` 等）に **列定義を改修**すること。
4. **6月定例（2026-06-02）の議事メモ未受領** ＝「拾う」の起点。届けばマワリが台帳入力→6/16深掘り→6/30返すを代行。

## 次の段取り（spec §0 準拠・一気に実装しない）

1. アプリのソースパス確定 → **ツクルがコード & Supabaseスキーマを読む**
2. **①データモデル提案**（spec §6 ＋ 実スキーマ突合）をレビュー用に提示 → 大内承認
3. **②MVP画面/機能定義** → 承認
4. **③実装** → デプロイ → Phase1 運用検証

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
