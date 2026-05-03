# Revision Log — エージェント学習記録

エージェントがミスしたパターン・手戻りの原因・CEOからの修正指示を記録する。
各セッション開始時にこのファイルを読み返し、同じミスを繰り返さない。

---

<!-- 新しい記録はこの下に追記する -->

## 2026-03-28: content-prepare.js の素材選定がNotionの指示と乖離していた
- **状況**: `content-prepare.js` で画像リタッチを実行。素材はキーワード解析＋テーママッピングで独自に選定していた
- **ミス**: `content-calendar.js` がNotionの「素材チェックリスト」に書いたファイルパスを無視し、キャプションのキーワード解析で別の素材を選んでいた。結果、Mz cafeで「マルゲリータ」のキャプションなのにハニートーストが1枚目に来る、Niki★DINERで3枚指定なのに2枚しか生成されない等の問題が発生
- **学び**: 素材選定の Single Source of Truth は Notion の「素材チェックリスト」。`content-prepare.js` は独自の選定ロジックを持たず、チェックリストのファイルパスをパースして使う。`content-calendar.js` が書いた指示 → `content-prepare.js` が従う、の一方向フロー

## 2026-03-28: 画像リタッチで元写真のラベル・ロゴが消えた
- **状況**: リタッチプロンプトに「ABSOLUTELY NO TEXT」を追加した
- **ミス**: 指示が強すぎて、元の写真に写っているケチャップ・マスタードのボトルラベルまで消してしまった
- **学び**: 「元写真に存在するラベル・ロゴは保持。新規テキストは追加しない」が正しい指示。プロンプトは「PRESERVE existing labels / Do NOT add NEW text」に修正済み

## 2026-03-28: content-image-gen.js（Imagen版）は運用フローに合わない
- **状況**: 以前のセッションで `scripts/content-image-gen.js`（Imagen APIでゼロから画像生成）を作成
- **ミス**: 本来の運用は「既存写真をGeminiでリタッチ」（`content-prepare.js`）であり、ゼロから生成するスクリプトは不要だった。Notionステータス更新もなく、sharp正規化もなかった
- **学び**: 新しいスクリプトを作る前に、既存の運用フロー（`content-prepare.js`）を確認する。gitにコミット済みだが作業ツリーから消えていたファイルの存在も `git log -- <file>` で確認すべき

## 2026-03-28: キャプションが過去投稿と被る問題
- **状況**: キャプションはテーマ×3パターンの固定テンプレを月ローテーションしていた
- **ミス**: 3ヶ月で一巡し、同じテーマなら同じ文章が何度も出る。バリエーション不足
- **学び**: Gemini API で毎回動的生成に切り替え。過去10件＋同バッチ内の生成分をプロンプトに含めて重複回避。クライアント別の人格設定（`CLIENT_PERSONAS`）で Mz=静かな語り口、Niki=テンポ速い断定調に差別化。固定テンプレはフォールバックとして残す

## 2026-04-26: content-calendar.js Niki★DINER 設定をweekdaySchedule方式に刷新
- **変更内容**: 旧 baseDays/themeRotation/preferredTimes を weekdaySchedule（曜日×contentType×時間の1リスト）に統合。brandStoryByMonth による月次ブランドストーリー展開（A〜E ループ）を追加。calculatePostDatesFromWeekday() 関数を新規追加
- **実装上の注意点**:
  1. formatDateISO は toISOString() を使っていたため UTC -9時間でローカル日付より1日前になるバグがあった。getFullYear/getMonth/getDate を使うローカル日付方式に修正
  2. ブランドストーリーは展開後のキー（例: "ブランドストーリーA: ..."）でフォールバック辞書（hookByThemeVariants 等）を引こうとして空になる問題。baseTheme 変数（展開前のキー）を保持して辞書ルックアップに使うよう修正
  3. M'z cafe は従来の calculatePostDates + baseDays ロジックをそのまま維持（変更なし）
- **学び**: 動的展開後のテーマ名をそのまま辞書キーに使うとヒットしない。展開前の"意味上のキー"を別変数で保持してフォールバックで使う

## 2026-04-26: content-calendar.js のプロパティ名が Notion データソース実態と乖離していた
- **状況**: `checkDuplicates` が全クライアント合計でカウントするため、M'z cafe 6件投入済みの状態で Niki★DINER を追加しようとすると重複検出で中断した
- **ミス1（設計）**: `checkDuplicates` にクライアント絞り込みがなく、異なるクライアントのエントリを同一カウントに含めていた
- **ミス2（プロパティ名不一致）**: `createPostEntry` / `setupDatabaseProperties` / `fetchPastCaptions` が使っているプロパティ名（`フック（冒頭3秒）` / `ハッシュタグセット` / `素材チェックリスト` / `コピペ用テキスト` / `編集手順`）と、実際の Notion データソースのプロパティ名（`冒頭フック` / `ハッシュタグ` / `使用素材` / `コピペ用` / `作業手順`）が乖離していた。`setupDatabaseProperties` が毎回「追加した」と成功ログを出しつつ、pages.create 時に validation_error が起きていた
- **学び1**: クライアントをまたぐ DB はクライアントフィルタ付き重複チェックを必ず行う。`--client` フラグ実装で対応済み
- **学び2**: Notion データソースのプロパティ名は `GET /v1/data_sources/{id}` で必ず実態確認してからスクリプトのキーを定義する。`notion.databases.update` の成功ログだけ信頼しない
- **対応**: `checkDuplicates(year, month, clientFilter)` にクライアントフィルタ引数追加。プロパティ名を実態に合わせて修正（11箇所）。`--client` フラグで特定クライアントのみ処理・重複チェック可能に
