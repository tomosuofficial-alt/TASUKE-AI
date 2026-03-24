# KPI・売上（freee → Notion）収益タイプの分類ルール

`freee-sales.js` は月次の **収入取引** を集計し、Notion の KPI・売上DB に書き込みます。  
**月合計行**（`月` = `YYYY-MM`）について、次の3列に金額を振り分けます。

| 内部キー | Notion の列（既定） | 意味（編集してよい「定義」） |
|----------|---------------------|------------------------------|
| `consulting` | コンサル収益 | プロジェクト型・提案・設計・導入支援など |
| `ops` | 運用代行収益 | 月額・継続契約・SNS運用など |
| `spot` | スポット収益 | 単発制作・研修・上記に当てはまらない収入（**どのルールにも当たらない場合の既定**） |

取引先別行（`月` = `YYYY-MM｜取引先名`）は従来どおり **売上合計のみ**（3分割列は更新しません）。

---

## ルールファイル

- **パス**: リポジトリ直下 `kpi-revenue-rules.json`
- **上書き**: 環境変数 `KPI_REVENUE_RULES_PATH` で別ファイルを指定可

### 構造

```json
{
  "default_bucket": "spot",
  "rules": [
    { "if": { "item_name_contains": "月額" }, "bucket": "ops" },
    { "if": { "partner_name_contains": "よいどころ" }, "bucket": "ops" }
  ]
}
```

- `default_bucket`: `consulting` / `ops` / `spot` のいずれか。どの `rules` にも当たらなかった取引はここへ。
- `rules`: **配列の上から**評価し、**最初に条件がすべて満たされた**ルールの `bucket` を採用。

### `if` で使える条件（1ルール内は AND）

すべて省略可。1つも書かないルールは無視されます。

| キー | 意味 |
|------|------|
| `partner_name_contains` | 取引先名に部分一致（大小文字は無視） |
| `partner_name_equals` | 取引先名と完全一致 |
| `account_name_contains` | いずれかの明細の**勘定科目名**に部分一致 |
| `item_name_contains` | いずれかの明細の**品目名**に部分一致 |
| `description_contains` | いずれかの明細の**備考**に部分一致 |
| `account_item_id` | 明細の勘定科目ID（数値、または数値の配列のいずれか一致） |
| `item_id` | 明細の品目ID（同上） |

### メモ用キー（無視される）

`_comment`, `_doc`, `version` など `_` で始まるキーは処理されません。

---

## freee 側のデータについて

- 取引一覧APIには **取引先名が含まれない** ため、スクリプトは **取引先マスタ** を別取得して `partner_id` から名前を解決しています。
- 明細の勘定・品目は **ID → 名前** をマスタAPIで解決してからマッチします。

分類を安定させるには、freee で **取引先の紐づけ** と **品目（または勘定）の統一** が効きます。

---

## 環境変数（列名がDBと違う場合）

| 変数 | 既定 |
|------|------|
| `KPI_DB_CONSULT_PROP` | コンサル収益 |
| `KPI_DB_OPS_PROP` | 運用代行収益 |
| `KPI_DB_SPOT_PROP` | スポット収益 |
| `KPI_SALES_SUMMARY_BREAKDOWN` | `1`（`0` にすると月合計行でも3列を送らない・売上合計のみ） |

---

## 運用のコツ

1. まず **`node freee-sales.js --dry-run YYYY-MM`** でコンソールの内訳を確認する。  
2. 意図と違う取引があれば `kpi-revenue-rules.json` の **上の方に** より具体的なルールを追加する。  
3. 迷う案件は `default_bucket` を `spot` のままにしておき、後からルールを足す。

---

## 運用クローズ（チェックリスト）

- [ ] `node freee-sales.js --dry-run` で当月の分類が意図どおりか確認した  
- [ ] `kpi-revenue-rules.json` をコミットし、取引先・品目の変更に追随した  
- [ ] GitHub の `monthly-freee-kpi.yml` 用に `FREEE_TOKEN_JSON` を90日以内に更新できる状態にした（`docs/github-actions-freee-kpi.md`）
