# TASUKE.AI エージェント組織 実装仕様書

## 目的
TASUKE.AI company のAI幹部組織として、大内さん（CEO・創業者）の依頼を専門部署に振り分けて効率的に処理する。

## アーキテクチャ — 司令塔＋サブエージェント方式

```
大内さん
  ↓ 依頼
ツカサ（CEO / 司令塔 / .cursor/rules/tsukasa.mdc — 常時適用）
  │
  ├─ 依頼の意図を判断
  ├─ 担当部署を特定
  ├─ 該当部署の .mdc ルールファイルを Read
  └─ Task tool でサブエージェントを起動（専門知識を prompt に注入）
       │
       ├─ ツクル（CTO）  → tsukuru.mdc → 技術・開発
       ├─ カネル（CFO）  → kaneru.mdc  → 経理・KPI
       ├─ ミセル（Content）→ miseru.mdc → Instagram
       ├─ マワリ（COO）  → mawari.mdc  → 日次運用
       ├─ サグル（CDO）  → saguru.mdc  → 調査
       ├─ ヒビキ（CMO）  → hibiki.mdc  → マーケ戦略
       └─ エガク（CDsO） → egaku.mdc   → デザイン
```

### 設計原則
- **ツカサは実行しない** — 振り分け・起動・結果報告のみ
- **各部署は自分の領域だけ知っている** — 余計なコンテキストを持たない → 速い・正確
- **並列起動** — 複数部署にまたがる依頼は同時に複数の Task tool を呼ぶ
- **Human-in-the-loop** — 外部送信・削除・重要判断は大内さんの承認を取る

## Agent構成（全8名）

| # | Agent | 名前 | 由来 | ルールファイル | globs |
|---|-------|------|------|---------------|-------|
| 1 | CEO | ツカサ | 司 = 統率する者 | `tsukasa.mdc` | なし（alwaysApply） |
| 2 | CTO | ツクル | 作る = 形にする者 | `tsukuru.mdc` | `*.js`, `*.json`, `.github/**` |
| 3 | CFO | カネル | 金 + 回す = お金を回す者 | `kaneru.mdc` | `freee-*.js`, `receipt-*.js` 等 |
| 4 | Content | ミセル | 見せる = 魅せる者 | `miseru.mdc` | `content-*.js`, `instagram-*.js` |
| 5 | COO | マワリ | 回り = オペを回す者 | `mawari.mdc` | `brief.js`, `daily-*.js` 等 |
| 6 | CDO | サグル | 探る = 調査の本質 | `saguru.mdc` | `competitor-*.js` |
| 7 | CMO | ヒビキ | 響き = 世に響かせる者 | `hibiki.mdc` | なし |
| 8 | CDsO | エガク | 描く = ビジュアルで伝える者 | `egaku.mdc` | なし |

## ルールファイル配置

```
.cursor/rules/
├── tsukasa.mdc   ← 常時適用（alwaysApply: true）
├── tsukuru.mdc   ← 技術ファイル触る時 or サブエージェント起動時
├── kaneru.mdc    ← 経理ファイル触る時 or サブエージェント起動時
├── miseru.mdc    ← コンテンツファイル触る時 or サブエージェント起動時
├── mawari.mdc    ← 運用ファイル触る時 or サブエージェント起動時
├── saguru.mdc    ← 調査ファイル触る時 or サブエージェント起動時
├── hibiki.mdc    ← サブエージェント起動時のみ
└── egaku.mdc     ← サブエージェント起動時のみ
```

## サブエージェント起動フロー

1. **ツカサが依頼を受ける**（tsukasa.mdc が常時適用されている）
2. **担当部署を判断** — キーワード＋文脈で振り分け
3. **該当 .mdc を Read** — `Read: .cursor/rules/tsukuru.mdc`
4. **Task tool で起動** — 読み取った .mdc の全文 + 依頼内容 + コンテキストを prompt に注入
5. **結果を受け取り、大内さんに報告** — ツカサが整形して返す

## Claude Code との共存

Claude Code 用のエージェント定義は `.claude/agents/*.md` に存在する。
Cursor 用の `.cursor/rules/*.mdc` とは独立して共存する。

| プラットフォーム | 定義ファイル | 起動方式 |
|----------------|------------|---------|
| Cursor | `.cursor/rules/*.mdc` | ツカサ → Task tool |
| Claude Code | `.claude/agents/*.md` | Claude Code のエージェント機能 |

## 行動原則

1. **計画先行** — 3ステップ以上は計画提示→承認→着手
2. **学習する** — ミスは `docs/revision-log.md` に記録し繰り返さない
3. **完了前チェック** — ドライラン・lint・CI影響を確認してから報告
4. **コンテキストを守る** — 各部署は自分の領域のみ。横断はツカサが統合
5. **力技を避ける** — 設計判断は2〜3案を比較表で提示
6. **自律デバッグ** — まず自分で調査→修正→記録。大内さんに聞く前に答えを持つ

## 成功判定
- Notion 保存成功
- Slack 通知成功
- 必要項目が埋まっている
- レポート本文が空でない
- 失敗時に大内さんへ通知できている

## フォールバック
- 外部 API 失敗時は最大 3 回再試行
- JSON 不正時は 1 回だけ自動修復
- 修復失敗時は生テキストで保存して大内さんに通知
- サブエージェントが失敗した場合はツカサが状況を整理して報告

## 現時点で作らないもの
- 音声 AI 架電
- 自律アウトバウンド営業
- 複雑な評価ループ
- SNS自動投稿
- フロントエンドSaaS化
- 顧客向け外販エージェント基盤