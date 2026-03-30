# TASUKE.AI 第一形態 実装仕様書

## 目的
TASUKE.AI company の第一形態として、内製運用基盤を安定稼働させる。

この段階では、既存スクリプト資産を再利用しながら、
Claude Code 上で最小構成の AI エージェント運用を実現する。

## 第一形態の方針
- Quick Wins を優先する
- 既存コードを捨てず、Agent から呼び出す
- 複雑な自律判断より、明確なルーティングを優先する
- Human-in-the-loop を残す
- 外部への完全自律営業は行わない

## Agent構成
| # | Agent | 名前 | 由来 |
|---|-------|------|------|
| 1 | CEO Agent | ツカサ | 司（つかさ）＝ 統率する者 |
| 2 | Finance Agent | カネル | 金（かね）＋ 動詞的響き ＝ お金を回す者 |
| 3 | Operations Agent | マワリ | 回り ＝ 日々のオペを回す者 |
| 4 | Research Agent | サグル | 探る（さぐる）＝ 調査の本質 |
| 5 | Content Agent | ミセル | 見せる ＝ SNSで魅せる者 |

※ CMO「ヒビキ」（GPT-5.3）・CTO「ツクル」（Cursor）は外部AI担当のため agent-spec 対象外

## Agentの責務

### CEO Agent「ツカサ」
- Founder の指示を受ける
- 意図分類を行う
- 適切な Agent（カネル・マワリ・サグル・ミセル）に委譲する
- 最終結果を整形して返す

### Finance Agent「カネル」
- 売上データ処理を担当する
- 既存の売上関連スクリプトを実行する
- 売上レポートを生成する
- KPI更新に必要な出力を返す

### Operations Agent「マワリ」
- 朝次ブリーフ生成を担当する
- Notion 保存を担当する
- Slack 通知を担当する
- 各 Agent の成果物を所定フォーマットに整える

### Research Agent「サグル」
- 調査依頼に対応する
- Web検索または指定ソースから情報収集する
- 要点を短く整理する
- 保存用の下書きを返す

## 起動条件

### ツカサ（CEO Agent）
- Slack などで自然言語指示を受けたとき
- 「調べて」「売上見せて」「保存して」などの依頼を受けたとき

### カネル（Finance Agent）
- 売上確認依頼を受けたとき
- CSVインポート実行時
- KPI更新処理が必要なとき

### マワリ（Operations Agent）
- 毎朝の定期実行
- 保存・通知依頼が来たとき
- 各 Agent の成果物を Notion / Slack に流す必要があるとき

### サグル（Research Agent）
- 調査依頼が来たときのみ

## 成功判定
- Notion 保存成功
- Slack 通知成功
- JSON もしくは Markdown の必要項目が埋まっている
- レポート本文が空でない
- 失敗時に Founder へ通知できている

## フォールバック
- 外部 API 失敗時は最大 3 回再試行
- JSON 不正時は 1 回だけ自動修復
- 修復失敗時は生テキストで保存して Founder に通知
- 未知フォーマット CSV は Finance Agent が停止し Founder に確認を求める

## 第一形態で作らないもの
- 音声 AI 架電
- 自律アウトバウンド営業
- 複雑な評価ループ
- SNS自動投稿
- フロントエンドSaaS化
- 顧客向け外販エージェント基盤

## 実装優先順位

### Phase 1
- Operations Agent
- Finance Agent
- 既存スクリプト呼び出し基盤
- Notion / Slack の共通ツール化

### Phase 2
- CEO Agent
- intent router
- タスクスキーマ定義

### Phase 3
- Research Agent
- エラーハンドリング強化
- Human-in-the-loop 運用の安定化