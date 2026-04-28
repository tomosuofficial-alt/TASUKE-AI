# TASUKE.AI 画像生成ルール

**正本** — 画像生成にまつわる方針・運用フロー・命名規約を定める。
最終更新: 2026-04-29 / 制定: 2026-04-29

このドキュメントは TASUKE.AI 全体の画像生成方針を定める。AI 幹部
（特に **ミセル**＝Content Director、**ツカサ**＝CEO、エガク＝Design Director）
と **大内さん**＝Founder が参照する。

---

## 1. 役割分担

| 役割 | 担当 |
|---|---|
| **ミセル** | 場面に合わせた画像生成プロンプトを生成。形式・サイズ・品質・保存先を含む全項目を埋める |
| **大内さん** | Codex デスクトップアプリ／CLI で対象フォルダを開いてプロンプトを実行 |
| **ツカサ** | 役割振り分け、プロンプト品質チェック、配置後の JSX 反映／キャッシュバスター bump／Git コミット |
| **エガク** | DTP・印刷物・ブランドアイデンティティの場面で参照される（CMYK 入稿等） |

---

## 2. ミセルが出すプロンプト必須項目（固定構造）

ミセルは下記 **8 項目を必ず埋める**。中身は場面ごとに変わる。

1. **用途**（Web写真／OGP／SNS／印刷／装飾／ロゴ／イラスト など）
2. **主題・シーン・人物の有無**
3. **スタイル**（Kinfolk／NY POP ART／写実／水彩 など）
4. **構図とアスペクト**（4:3／1:1／16:9／9:16 等）
5. **光・色・質感**
6. **出力形式・サイズ・品質**（場面ごとに最適化、固定値ではない）
7. **保存先の絶対パス**（場面ごとに最適なフォルダを選ぶ、ファイル名は snake-case 英数）
8. **完了時の出力規約**（`DONE` 等）

固定構造は変えない。中身は毎回変わる。

---

## 3. ユースケース別の最適デフォルト早見表

| 用途 | 形式 | 解像度の目安 | 品質 |
|---|---|---|---|
| Web 写真（Hero／About／Voice 等） | WebP | 1200〜1600px | q=80–85 |
| Web 装飾・小サムネ | WebP / SVG | 〜800px | q=80 |
| OGP / SNS カード | JPEG | 1200×630 | q=88 |
| Instagram 投稿 | JPEG | 1080×1080 / 1080×1350 | q=85 |
| 印刷（POP／名刺／ポストカード） | PNG / PDF | 300dpi 換算 | 最高 |
| 大判印刷（A2以上） | TIFF / PNG | 300dpi 換算 | 最高 |
| ロゴ・アイコン（透過必須） | SVG > PNG | ベクター推奨 | 無損 |
| ファビコン | PNG マルチサイズ | 16/32/180/512 | 無損 |
| 資料スライド | PNG | 1920×1080 | 無損 |
| 動画用静止画 | PNG | 1920×1080 / 3840×2160 | 無損 |

---

## 4. 保存先パターン

### TOMOSU. コーポレートサイト

| 場面 | パス |
|---|---|
| About | `/Volumes/Home_Mac_SSD/01_Projects/_TOMOSU_Internal/06_Website/TOMOSU. - 地域ビジネス支援コンサルタント/assets/about/<slug>.webp` |
| Hero / Philosophy | `…/assets/scenes/<slug>.webp` |
| Works / Clients | `…/assets/clients/shots/<slug>.webp` |
| Services | `…/assets/services/<slug>.webp` |

### クライアント Instagram 投稿

```
/Volumes/Home_Mac_SSD/01_Projects/<Client>/02_Creative/Instagram/<YYYY>/<YYYY-MM>/<slug>.jpg
```

例:
- `Niki_Diner/02_Creative/Instagram/2026/2026-04/morning-special.jpg`
- `Mz_cafe/02_Creative/Instagram/2026/2026-05/anniversary-event.jpg`

### 印刷物・DTP

```
/Volumes/Home_Mac_SSD/01_Projects/<Client>/02_Creative/<NN_slug>/<filename>.<ext>
```

Niki★DINER 既存ナンバリング: `01_Aboard / 02_card / 04_menu / 05_POP / 06_staffT / 07_sticker / 08_stamp / 09_Calendar`。新規は `10_` 以降。

### 共通ブランド資産（複数プロジェクトで使うもの）

```
/Volumes/Home_Mac_SSD/01_Projects/_TOMOSU_Internal/00_Brand_Assets/<client>/
├─ logo.svg / logo-mark.svg
├─ brand-colors.md
├─ typography.md
└─ photo-tone.md
```

各プロジェクトには **`cp` で重複コピー** で配置する（シンボリックリンクは禁止＝Drive 同期で broken のため）。

---

## 5. Codex CLI 起動時の固定オプション

```bash
codex exec --skip-git-repo-check --full-auto \
  -c 'sandbox_workspace_write.writable_roots=["<プロジェクトルート>","/var/folders","/tmp"]' \
  "<ミセルが生成したプロンプト>"
```

### 注意

- 日本語・スペース入りパスがあると codex の websocket header が UTF-8 エラーで落ちるので、**`/tmp` から起動 + `writable_roots` で対象フォルダを許可**
- stdin は閉じる（`< /dev/null` を付ける、または run_in_background）
- ミセルのプロンプトに `mkdir -p` を含めて、保存先フォルダが存在しなくても codex 側で作成

---

## 6. 再生成フロー（採用版が正本）

```
[1] ミセル: 初回プロンプト生成
[2] 大内: codex で生成 → 結果をブラウザで確認
[3] OK → ツカサが JSX 反映 → git commit（commit message にプロンプト含める）
[4] NG → ミセル: 修正プロンプト → 大内: 再生成 → 同じパスに上書き → 再判定
```

- 「採用版が正本」を原則とし、**履歴は git commit history + commit message に残す**
- 別途リテイクログは作らない
- Codex の `~/.codex/generated_images/<session>/` には全バリアントが残るので、必要なら遡れる

---

## 7. 複数バリエーション命名

- **サイト内には採用版のみ**。バージョン suffix（`-v1` `-v2` `-a` `-b`）は使わない
- 比較検討は `~/.codex/generated_images/` で行い、採用版だけ `cp` でサイトへ移す
- ただし以下は連番 OK:

| 場面 | 連番 | 例 |
|---|---|---|
| 同じテーマで複数枚並べる | OK | `about-onsite-01-kitchen.webp` `about-onsite-02-dialogue.webp` |
| カルーセル投稿の N 枚目 | OK | `morning-coffee-01.jpg` `morning-coffee-02.jpg` |
| 同じ画像のバリエーション | NG | `<slug>-v1` は使わない |

シーン違いは slug で記述: `product-front` / `product-side` / `product-back` （`product-01/02/03` は意味不明なので避ける）。

---

## 8. AI 生成原本の保管（3 層構造）

| 層 | 場所 | 内容 | 保管期間 |
|---|---|---|---|
| **L1: 配信版**（正本）| プロジェクトの `assets/...` | 圧縮済み配信用（WebP / JPEG） | 永続（git 管理）|
| **L2: 短期オリジナル** | `~/.codex/generated_images/<session>/` | 高解像度 PNG（codex 自動保管） | 数週間〜数ヶ月（codex 任せ） |
| **L3: 長期オリジナル**（必要時のみ）| プロジェクト直下 `_originals/<slug>/` | 採用版＋ボツ案の高解像度 PNG | 永続（git 除外、Drive 同期）|

### L3 を作る判断

- **L3 必須**: 印刷物に使う／カレンダー等の高解像度アウトプット予定／クライアント納品物
- **L3 不要**: Web/SNS 限定で再印刷予定なし／単発の装飾画像

### `.gitignore` に追加（各プロジェクトリポジトリ）

```
# AI 生成原本・印刷版下・Photoshop 合成元データ
_originals/
*.psd
*.ai
*.psb
```

---

## 9. AI 生成の明示が必要かの判定

### 実写を必須にする領域（AI 不可）

| 対象 | 理由 |
|---|---|
| 料理写真（メニュー・商品写真） | 景品表示法・優良誤認のリスク |
| 代表者・スタッフの顔写真 | 「架空の人物が代表」状態は信頼を損なう |
| 店舗内装・外観 | 実際とは違う誤認リスク |
| クライアントの実績写真 | 同上 |

### AI 生成 OK な領域

| 対象 | 例 |
|---|---|
| 象徴的イメージカット（雰囲気・概念） | TOMOSU. About の "厨房に立つ職人" 像 |
| 装飾・背景（抽象的） | 暗い夜道・木目テクスチャ・幾何学パターン |
| イラスト・キャラクター（明らかに絵） | Niki★DINER カレンダー（Max Narita 名義）|
| アイキャッチ・OGP の装飾 | 写実でなければ誤認しにくい |

### 明示ルール

| 場面 | 明示 |
|---|---|
| TOMOSU. サイトの象徴的イメージ | 不要 |
| Instagram 投稿（写実的 AI） | Meta の「AI Info」ラベルを投稿時に付与 |
| Niki★DINER カレンダー | クレジットに `Illustration: Max Narita` |
| キャプション内テキスト | 必要に応じて `※ AI生成イメージ` を添える |

---

## 10. 写真素材 vs AI 生成の使い分け（ストック先行）

### ソース選定の優先順位

| 場面 | 1st choice | 2nd choice |
|---|---|---|
| 商品（料理・サービス）／代表者顔／店舗内装外観 | 自前撮影（or クライアント提供）| —（AI 不可） |
| 汎用イメージカット（人物あり、顔判別なし）| Unsplash / Pexels | AI 生成 |
| 汎用イメージカット（人物なし）| Unsplash / Pexels | AI 生成 |
| ピンポイントの構図・雰囲気・コンセプト | AI 生成 | Adobe Stock |
| 装飾・背景・テクスチャ | AI 生成 | Unsplash |
| イラスト・架空キャラ（Niki★DINER カレンダー等）| AI 生成 | 自前イラスト |
| ロゴ・アイコン・UI 装飾 | 自前デザイン（SVG）| — |

### AI 生成に切り替える条件

- ストック検索で 15-30 分以内に納得行くものが見つからない
- 構図・雰囲気・色味がピンポイントで指定されたブランドトーンに必須
- ストックでは「あり得ない」シーン（架空キャラ、抽象的概念）

### 推奨ストックサイト

| サイト | 用途 | 無料 |
|---|---|---|
| **Unsplash** (unsplash.com) | 全般、欧米系 | ◎ |
| **Pexels** (pexels.com) | 全般、動画も | ◎ |
| **photoAC** (photo-ac.com) | 日本人モデル・日本の風景 | ◎（要無料登録） |
| **PIXTA** | 日本人モデル高品質 | △（有料） |
| **Adobe Stock** | プロ品質・特殊な構図 | △（サブスク） |

---

## 11. 素材の使用前リタッチ（必須）

**原則**: 撮影・ストック・AI 生成のいずれも、**そのまま配置せずブランドトーンに合わせて必ずリタッチしてから使う**。

### リタッチ強度

| 種類 | 内容 | 担当・ツール |
|---|---|---|
| **ライトリタッチ**（標準）| 色温度・彩度・露出・コントラスト・トリミング・ノイズ除去・サイズ・形式変換 | Codex 一気通貫 or Pillow スクリプト |
| **ヘビーリタッチ**（必要時のみ）| 要素除去・人物の合成・複雑なマスク・文字入れ・他画像との合成 | 大内さんが Photoshop / Pixelmator / Affinity で手動 |

### ブランド別リタッチプリセット（ミセル指示用）

| プロジェクト | プリセット |
|---|---|
| **TOMOSU.** | 色温度 +150K（温かく）／彩度 -10%（抑制的）／シャドウを少し持ち上げ／グレー寄りの暗部／粒状感わずか追加（紙質感） |
| **Niki★DINER**（POP ART系）| 彩度 +15%／コントラスト +10%／黒締め／NY ビビッド |
| **Niki★DINER**（実写）| 暖色寄り／彩度標準／食欲をそそる赤・橙を強調 |
| **M'z cafe** | 自然光重視／彩度標準／ハイライト柔らかく／木目とアースカラーを保つ |
| **よいどころ千福** | 暖色強め／コントラスト中／居酒屋の温度感 |
| **Bistro knocks** | コントラスト強め／影をしっかり／ビストロの照明感 |

### ライトリタッチ手順（Codex プロンプトに含める例）

```
[Light retouch] TOMOSU brand preset:
  - color temp +150K (warmer)
  - saturation -10%
  - shadows +5 (lift slightly)
  - subtle film grain
```

---

## 12. 印刷物の解像度・色域

### 解像度の基準

| 用途 | 解像度 | A4=210×297mm 相当 |
|---|---|---|
| Web 表示 | 表示幅の 2x（〜1500px）| — |
| 印刷物（標準）| 300 dpi | 2480 × 3508 px |
| 印刷物（A3）| 300 dpi | 3508 × 4961 px |
| 大判印刷（B2 以上）| 200〜300 dpi | サイズに応じて |

> gpt-image-2 の最大出力は 1024×1792 程度。**印刷物用は AI 生成だけでは解像度不足** ので、拡大ツール（Topaz Gigapixel／sips／Pillow LANCZOS）で補完するか、AI 生成自体を避ける。

### 色域・カラープロファイル

| 入稿先タイプ | 色域 | プロファイル |
|---|---|---|
| オンラインプリント（プリントパック／グラフィック等）| RGB 入稿 OK | sRGB（埋め込み）|
| 一般オフセット印刷 | CMYK 必須 | Japan Color 2001 Coated（一般）／Coated v2 |
| 大型出力（看板／POP の大判） | 印刷所による | 確認必須 |

### 入稿先のレギュレーションを記録

各クライアントの `00_Admin/print-vendors.md` に **いつもの印刷所のレギュレーション** を記録（入稿形式・解像度・色域・塗り足し・トリムマーク必要性）。

---

## 13. 元データ（PSD / AI / SVG）の扱い

| ファイル種類 | 保存場所 | git |
|---|---|---|
| PSD（Photoshop 合成）| `_originals/<slug>/<slug>.psd` | ✗ 除外 |
| AI（Illustrator 版下）| `_originals/<slug>/<slug>.ai` | ✗ 除外 |
| SVG（ロゴ・アイコン・UI 装飾）| `assets/...<slug>.svg`（直配置） | ✓ 含める |
| AI 生成オリジナル PNG | `_originals/<slug>/<slug>.png` | ✗ 除外 |
| 配信版（WebP/JPEG）| `assets/...<slug>.webp` | ✓ 含める |

### 元データを残す場面

名刺・ショップカード／ポストカード／メニュー版下／POP・チラシ・バナー（合成あり）／ロゴ新規作成 → **必須**。

AI 生成だけで完結する装飾画像／ストック写真の単純加工 → **不要**（再生成・再加工で復元可能）。

### ベクター化の判断

- 新規ロゴ・アイコン → Illustrator / Figma でベクターネイティブ作成
- 既存 PNG ロゴをベクター化 → Illustrator の画像トレース or Vector Magic
- 写真 → ベクター化しない（不要・不適）

---

## 14. Niki★DINER「Max Narita」名義との整合

**Max Narita = Niki★DINER 専属の架空イラストレーター。NY POP ART スタイル限定で一貫運用**。

### 使う／使わないの判定

| 場面 | Max Narita 名義 |
|---|---|
| カレンダー（12 枚イラスト）| ◎ |
| ポストカード（カレンダー切り出し or 単体）| ◎ |
| Tシャツ・ステッカー（POP ART スタイル）| ◎ |
| 店内 POP（イラスト調・POP ART）| ○ |
| Instagram 投稿（POP ART イラスト）| ○ |
| メニュー（料理写真）| × 実写、Max Narita 名義使わない |
| Instagram 投稿（料理写真）| × 同上 |
| 店舗写真・スタッフ写真 | × 実写 |
| 公式サイト（料理・店舗系セクション） | × |
| 公式サイト（イラスト装飾セクション） | ○ POP ART 限定 |

### クレジット表記

| 媒体 | 表記 |
|---|---|
| カレンダー裏面 | `Illustration by Max Narita` |
| ポストカード裏 | `© Max Narita` |
| Instagram キャプション | `Art: Max Narita / @max_narita_art`（SNS 公式アカウント保有時）|
| グッズパッケージ | `Designed by Max Narita` |
| Web サイト | `Illustration: Max Narita`（hover で「Niki★DINER 専属イラストレーター」など補足可）|

### 法的注意

- 架空作家としての運用は適法（実在人物の詐称ではない）
- 実在風の経歴（学歴・所属事務所等）を載せない
- 問い合わせ窓口は「店舗経由のフィルター」を一つ設ける

---

## 15. インスタ投稿の蓄積運用

`02_Creative/Instagram/<YYYY>/<YYYY-MM>/<slug>.jpg` 形式で年フォルダ前提に蓄積する。

```
02_Creative/Instagram/
├─ 2026/
│  ├─ 2026-04/
│  ├─ 2026-05/
│  └─ ...
├─ 2027/
└─ 2028/
```

容量は年 100MB 程度（インスタ画像 1 枚 ~300KB × 月 30 投稿）で問題にならない。物理アーカイブ（zip 化、Drive 隔離）は不要。

---

## 16. 共通ブランド資産の扱い（複数プロジェクトでの再利用）

シンボリックリンク禁止（Drive 同期で broken）。**重複コピーで配置**。

```
01_Projects/_TOMOSU_Internal/00_Brand_Assets/<client>/   ← 正本
01_Projects/<Client>/...                                 ← 各プロジェクトには cp で配置
```

### 正本更新フロー

```
[1] _TOMOSU_Internal/00_Brand_Assets/<client>/<file> を更新 → git commit
[2] 配信プロジェクトに伝搬（手動 cp、または scripts/sync-brand-assets.sh）
[3] 各プロジェクトでも git commit（独立リポ）
```

---

## 17. プロンプトの言語ポリシー

### 推奨: 日英ハイブリッド

| 項目 | 言語 |
|---|---|
| 用途・場面（人間用メタ情報）| 日本語 |
| 主題・被写体（人物・物・場所）| 日本語 + 英語キーワード併記 |
| 文化的固有要素（和食・着物・畳・居酒屋）| ローマ字 + 注記 |
| スタイル指示（editorial, cinematic, kinfolk）| **英語** |
| ライティング・色味・質感 | **英語** |
| カメラ・レンズ・ボケ感 | **英語** |
| 構図・アスペクト・ピクセル数 | 英語 or 数字 |
| 保存先パス・完了出力規約 | 日本語 or 英語どちらでも |

### 例

```
[Use case] Web 写真（TOMOSU. About セクション）
[Brand tone] TOMOSU. — Kinfolk editorial, restrained, warm, natural light

[Subject] 50代の日本人男性が和食店の厨房・カウンターに立つ。手元の所作で職人感。顔ははっきり映さない。
  English keywords:
    50-year-old Japanese chef, traditional izakaya kitchen counter,
    hands tying apron, face partially turned away

[Style]
  - editorial photography, Kinfolk magazine aesthetic
  - soft natural window light, golden hour warmth
  - shallow depth of field (35mm look, f/2.0)
  - photorealistic, no illustrative elements
```

---

## 18. 顔・人物が映る画像の運用

AI 生成で人物が登場する場合、**顔をはっきり映さない指示を必須化**。

| アプローチ | 英語プロンプト例 |
|---|---|
| 顔の向き | `face partially turned away`, `looking down`, `looking away from camera` |
| 距離 | `medium-long shot`, `wide shot`（クローズアップ禁止）|
| シルエット | `silhouette`, `backlit silhouette` |
| 部位フォーカス | `focus on hands and gestures` |
| ボケで隠す | `face out of focus`, `shallow depth of field, face slightly blurred` |
| 後ろ向き | `shot from behind`, `back view of figure` |

### 運用ルール

1. AI 生成で人物が登場する画像は、顔を強調しない指示を必ずプロンプトに含める
2. 商用利用前に「**この顔、誰かに似ていないか**」を目視確認
3. 似ていると感じたら再生成
4. 「特定の有名人風に」「○○俳優のような」など、実在人物に寄せるプロンプトは**絶対 NG**

---

## 19. 失敗作・没作品の物理的削除

**Codex の自動管理に任せる**。容量逼迫時のみ月次メンテで 30 日以上前のセッション削除。

### 月次メンテ（必要時のみ）

```bash
# 30日以上前のセッションフォルダを削除
find ~/.codex/generated_images/ -maxdepth 1 -type d -mtime +30 -name "0*" -exec rm -rf {} +
du -sh ~/.codex/generated_images/   # 確認
```

`_originals/<slug>/` に手動 cp した分（L3 層）は **削除しない**。Drive に同期されるので、ローカル容量問題はない。

---

## 20. 商品写真（料理）に AI 合成を使う場合の品質基準

### 主題による判定

| 主題 | AI 合成 | 例 |
|---|---|---|
| **主題 = 料理（実物の販売対象）** | × NG | メニュー写真、商品ページ、SNS の商品紹介、広告メイン |
| **主題 = 料理（象徴的、特定の実物ではない）** | △ 条件付OK | 「春の食卓」「コーヒーのある朝」のイメージカット |
| **主題 = 雰囲気で料理は背景小道具** | ○ OK | 木の机にカップが置かれた雰囲気カット（特定商品でない）|
| **主題 = 食材・素材**（料理ではない）| ○ OK | 「春の食材」イラスト、抽象的季節感 |
| **既存実物写真の背景拡張・装飾追加・不要要素除去** | △ 条件付OK | 写り込んだ他客除去、料理の周りに花追加 |

### 条件付 OK の「条件」

1. 特定店舗の特定メニューに似せない（誤認誘発禁止）
2. 販促・広告では使わない
3. キャプションに必要に応じて「※ イメージ」「※ 写真はイメージです」明記
4. コラム・ブログ・装飾セクションに限定
5. 広告法・景品表示法に抵触しない範囲（実物よりも豪華に見せる詐称 NG）

### スタイル指示で安全側に振る

写実的すぎる AI 料理画像は誤認リスクが高い。意図的に抽象度を上げる:

| 安全側のスタイル | プロンプト例 |
|---|---|
| 水彩・イラスト調 | `watercolor illustration, soft brushstrokes, hand-drawn feel` |
| 抽象寄り | `abstract composition, minimalist, conceptual food photography` |
| グラフィカル | `flat illustration, kinfolk inspired graphics` |
| ぼかし強調 | `extremely shallow depth of field, food blurred, focus on atmosphere` |

### 既存実物写真のレタッチ・合成 OK ライン

- 不要要素（他客・看板・コンセント・汚れ）の除去 → ◯
- 背景に小物追加（花・葉・紙ナプキン）→ ◯
- 料理自体の見栄え修正（量増・色鮮やか・ツヤ追加） → **× 景品表示法違反リスク**
- 白皿を別デザインの皿に差し替え → × 商品表示の偽装

---

## 21. 改定履歴

| 日付 | 内容 | 担当 |
|---|---|---|
| 2026-04-29 | 初版制定（論点 1〜15、21項目） | 大内さん × ツカサ |

