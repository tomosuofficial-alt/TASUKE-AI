# Bistro Knocks Seed Data

Bistro Knocks 原価表 を Web app に移植するためのシードデータ＆仕様書バンドル。
スタック非依存（Next.js / Remix / Astro / Vite / Flutter / SwiftUI どれでも使える）。

## ファイル構成

| ファイル | 内容 |
|---|---|
| `01_food_ingredients.json` | 食材マスタ（主食材 16品） |
| `02_drinks.json` | 飲料マスタ（4種） |
| `03_sides.json` | サイドマスタ（11品 = フラグ管理7 + 固定付与4） |
| `04_packaging_materials.json` | 資材マスタ（9品） |
| `05_recipe_ingredients.json` | レシピ材料マスタ（味醂・醤油・野菜など 47品） |
| `06_sub_recipes.json` | サブレシピ（ソース・ピクルス・サラダベース・蒸し野菜 のレシピ 55行） |
| `07_sub_recipe_definitions.json` | サブレシピ定義（バッチ出来上がり量・基準 11品） |
| `08_menus.json` | メニュー（黒弁当12 + 新弁当13 = 25品、ソース割当含む） |
| `all.json` | 上記8ファイルを束ねた1ファイル（フェッチ用） |
| `types.ts` | TypeScript 型定義（任意スタックで使える） |
| `business-logic.md` | 原価計算ロジック仕様（各計算式の実装例付き） |
| `README.md` | このファイル |

## 使い方

### Next.js / TypeScript フロントエンド系

```ts
import seed from "./seed/all.json";
import type { BistroKnocksSeed } from "./seed/types";

const db = seed as BistroKnocksSeed;
// → db.menus, db.food_ingredients, etc.
```

### Prisma（PostgreSQL）

`prisma/seed.ts` で `08_menus.json` などを順番に `prisma.menu.createMany({ data })` で投入。

### Supabase（PostgreSQL）

SQL INSERT 文に変換するか、Supabase JS Client で `from('menus').upsert(data)`。

### REST/GraphQL API のモック

`all.json` をそのままレスポンスとして返せば API スタブとして機能。

## データ更新フロー

1. `bistro_knocks_cost_master.xlsx` を Excel で開いて単価を編集
2. `python3 export_seed.py` でJSONを再生成
3. Web app 側でシード再投入

ただし**xlsxを直接編集すると次回 build_knocks_cost.py を走らせたら上書きされる**ので注意。
データの正本は `clients/bistro-knocks/build_knocks_cost.py` 内のリスト群。

## 移植時のポイント

`business-logic.md` を読みながら、Excel の VLOOKUP/SUMIFS/IFERROR 関数で組まれた計算を
プログラムコードに置き換える。データモデルは `types.ts` の通り。

特に注意:
- **税の扱い**: 入力は税込混在、計算は税抜統一（`/1.08`）
- **粒マスタード**: ハンバーグソースの「ソース全量×5%」動的計算
- **ピクルス・蒸し野菜**: 出来上がり量を override で設定（実測 or 推定値）
- **サラダベース**: 実測値未設定（バッチ材料費 / バッチ出来上がり量 の分母が0だと原価0になる）
