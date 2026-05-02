# ハンドオフ: Niki★DINER 日英バイリンガルキャプション化

**作成日**: 2026-05-02
**作成元環境**: MacBook Air M2（.env 未設定環境）
**引き継ぎ先環境**: Mac mini 母艦（.env 設定済み）

## 1. 完了済みの作業

### コード実装（PR #1 マージ済み）

[tomosuofficial-alt/TASUKE-AI#1](https://github.com/tomosuofficial-alt/TASUKE-AI/pull/1) — squash マージ済み・main 反映済み

変更内容:

- `CLIENT_PERSONAS['Niki★DINER']` を `{ ja, en, model }` 二層構造に拡張
- 日本語人格を「です／ます基調・温かみ・煽り禁止」に再定義
- 英語人格は現行 American diner host トーンを温存
- `generateContentWithAI` 冒頭で `persona.ja` 有無で分岐
- Niki専用関数 `_generateNikiBilingual` を新設（日英2回コール → `\n\n---\n\n` で連結）
- Niki専用モデルとして `gemini-2.5-flash-lite` を採用（他クライアントは `gemini-2.5-flash` 据え置き）

### 設計判断の背景

| 項目 | 決定 | 理由 |
|---|---|---|
| 生成方式 | 独立生成（B案） | 翻訳方式は日本語の「柔らかさ」を直訳すると硬くなるため却下 |
| 保存形式 | `[日本語]\n\n---\n\n[English]` 連結（X案） | Notion 上で1タップコピペ運用が可能 |
| 対象 | Niki★DINER のみ | 高崎駅直結で外国人観光客流入が見込める立地起因 |
| モデル | Niki = `gemini-2.5-flash-lite` | 短文JSON生成にFlashの推論力は不要、コスト1/3 |
| フォールバック | 日本語のみ据え置き | AI失敗時は英語欠落で許容 |

## 2. 未完の残課題

### ① 実機検証（Niki 1件 + Mz cafe 1件のリグレッション確認）

ローカルに `.env` が無いためブロックされ未実施。Mac mini なら `NOTION_TOKEN` / `NOTION_CONTENT_DATA_SOURCE_ID` / `GEMINI_API_KEY` が揃っているはずなので即実行可能。

```bash
# Niki＋Mz をまとめて生成（次の空き月で）
node content-calendar.js 2026-07
```

- 重複チェックがあるので既存月は走らない（安全）
- 確認ポイント:
  - Niki: 「キャプション」プロパティに `---` 区切りで日英が並ぶ
  - Niki: 日本語側が「です／ます基調」かつ煽り表現なし
  - Niki: 英語側が現行 American diner トーン
  - Niki: 日英で主役メニューが揃っている
  - Mz cafe: 従来通り日本語のみ（`---` 区切りなし）
  - ターミナルログに `Niki JA生成: フック「...」` と `Niki EN生成: hook "..."` が両方出る

### ② 5/1 Niki★DINER エントリ（中止分）の手動上書き

⚠️ Niki の通常投稿日は `[4, 11, 18, 25]` だが、5/1 にイレギュラーで作成された「中止になったエントリ」が存在。これを新バイリンガル仕様で手動上書きする方針。

テーマ: **調理ライブ**
主役メニュー: **上州牛スマッシュバーガー**

#### Notion フィールド貼り付け用

##### フック（冒頭3秒）

```
ジュッ。それが、はじまりの音です。
```

##### CTA

```
鉄板の音をぜひ目の前で。お待ちしています。
```

##### キャプション（日英連結）

```
鉄板に、上州牛100%のパティをそっと置きます。

スマッシャーで一気にプレスする瞬間、肉汁が広がり、香ばしい音が立ちのぼります。

押しつけて生まれる、薄くて香ばしい縁。
内側に閉じこめた、とろけるような旨み。

この一連の流れを、私たちはお客様の目の前で仕上げます。

カウンター越しに、バーガーが組み上がるところまでご覧いただけます。

🍔 上州牛100%スマッシュバーガー専門店
📍 高崎モントレー5F（高崎駅直結）
🕚 11:00〜21:30

鉄板の音と香りで、お迎えします。ぜひお越しください。

---

That sound? That's the start.

100% Joshu beef hits the iron plate. We press hard, press fast — smash style. Crust forms in seconds. Juice locks in.

You watch it all happen. Right there at the counter. The sizzle. The smoke. The build.

This is how a real smash burger comes together. No shortcuts. No mystery.

🍔 100% Joshu Beef Smash Burger specialty
📍 Takasaki Montrey 5F (right at Takasaki Station)
🕚 11:00–21:30

Save this. Tag a friend. Then come hungry.
```

##### ハッシュタグセット

```
#NikiDINER #ニキダイナー #スマッシュバーガー #上州牛 #高崎グルメ #高崎ランチ #高崎ディナー #高崎駅グルメ #高崎モントレー #群馬グルメ #調理ライブ #肉汁バーガー #バーガー専門店 #SmashBurger #JoshuBeef #Takasaki #TakasakiGourmet #GunmaFood #JapanEats #BurgerLover #Foodie #DinerVibes
```

##### コピペ用テキスト（IG投稿そのまま用）

```
鉄板に、上州牛100%のパティをそっと置きます。

スマッシャーで一気にプレスする瞬間、肉汁が広がり、香ばしい音が立ちのぼります。

押しつけて生まれる、薄くて香ばしい縁。
内側に閉じこめた、とろけるような旨み。

この一連の流れを、私たちはお客様の目の前で仕上げます。

カウンター越しに、バーガーが組み上がるところまでご覧いただけます。

🍔 上州牛100%スマッシュバーガー専門店
📍 高崎モントレー5F（高崎駅直結）
🕚 11:00〜21:30

鉄板の音と香りで、お迎えします。ぜひお越しください。

---

That sound? That's the start.

100% Joshu beef hits the iron plate. We press hard, press fast — smash style. Crust forms in seconds. Juice locks in.

You watch it all happen. Right there at the counter. The sizzle. The smoke. The build.

This is how a real smash burger comes together. No shortcuts. No mystery.

🍔 100% Joshu Beef Smash Burger specialty
📍 Takasaki Montrey 5F (right at Takasaki Station)
🕚 11:00–21:30

Save this. Tag a friend. Then come hungry.

#NikiDINER #ニキダイナー #スマッシュバーガー #上州牛 #高崎グルメ #高崎ランチ #高崎ディナー #高崎駅グルメ #高崎モントレー #群馬グルメ #調理ライブ #肉汁バーガー #バーガー専門店 #SmashBurger #JoshuBeef #Takasaki #TakasakiGourmet #GunmaFood #JapanEats #BurgerLover #Foodie #DinerVibes
```

#### 設計チェック

| 項目 | 確認 |
|---|---|
| 日本語人格 | です／ます基調・短文・体言止め・最後に温かみ ✓ |
| 英語人格 | Fast-paced / Declarative / "Save this. Tag a friend." ✓ |
| テーマ整合 | 日英とも「鉄板でスマッシュする瞬間」を主役に ✓ |
| 禁止語チェック | 激安・爆盛り・今すぐ・絶対・必食・神・いかがでしょうか — 全て不使用 ✓ |
| 文字数 | 日英連結＋ハッシュタグ込みで約1,400字（IG上限2,200字以内）✓ |

⚠️ 注: このキャプションは Gemini API ではなく**ツカサが手書き**で生成。新人格定義に沿って書いているが、本番のAI自動生成とは細部が異なる可能性あり。Mac mini で実機検証時に Gemini 経由で再生成する場合は、このテキストを破棄して新規生成結果を採用してよい。

### ③ 単一ポスト再生成スクリプトの実装（オプション）

現状 `content-calendar.js` は月次バッチ専用で、特定日の上書き機能なし。今後同様の単発上書きが頻発する場合は `scripts/regenerate-single-post.js` を新設するとよい。

仕様案:
- 引数: `--client "Niki★DINER" --date 2026-05-01`
- 動作: Notion検索 → `generateContentWithAI` で再生成 → 「キャプション・フック・CTA」プロパティを上書き
- 既存ロジックの再利用で実装30分程度

優先度は低い（手動コピペで十分回る）。

## 3. Mac mini での再開手順

```bash
cd ~/Developer/TASUKE-AI  # パスは環境に合わせて
git pull origin main      # PR #1 を含む最新を取得
cat docs/handoff-niki-bilingual-2026-05-02.md  # このファイル
```

その後、上記「残課題①〜③」のうち優先したいものから着手。
