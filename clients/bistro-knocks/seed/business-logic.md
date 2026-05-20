# 原価計算 ビジネスロジック仕様

Web app のバックエンド or フロントエンドに移植する際のロジック仕様。
Excel の関数で実装されている計算ロジックを言語非依存に記述。

## 税の前提

- **販売価格は税込**で運用（クライアントの値付けがそのまま税込）
- **業者単価は税抜**で入る（納品書の税抜表記）
- 原価率・利益率は**税抜ベース**で算出（飲食業の慣行）
- 軽減税率 8%（テイクアウト弁当）を一律適用
- `販売価格（税抜） = 販売価格（税込） / 1.08`

## エンティティ間の関係

```
MenuItem (25品)
  ├─ ingredients[] → FoodIngredient (主食材1-2品)
  ├─ side_flags    → Side (フラグ管理7サイド + 固定付与4サイド)
  ├─ sauces[]      → SubRecipeDefinition (0-2ソース)
  └─ drink_id      → Drink

Side
  └─ unit_price_excl_tax = (a) 手入力 or (b) SubRecipeDefinition から VLOOKUP or (c) RecipeIngredient から VLOOKUP

SubRecipeDefinition (ハンバーグソース・ピクルス・サラダベース 等 11品)
  ├─ batch_material_cost = Σ (qty × ingredient_unit_price) over sub_recipes
  ├─ batch_yield = batch_yield_override ?? Σ qty WHERE unit IN (cc, ml, g)
  └─ unit_cost_excl_tax = batch_material_cost / batch_yield  [円/g or 円/cc]

SubRecipeEntry (ソースレシピ・サラダベースレシピ等 1行=サブレシピ×材料)
  ├─ ingredient_name → RecipeIngredient.name (または FoodIngredient.name)
  ├─ qty (numeric or "DYNAMIC:5%_OF_TOTAL" for 粒マスタード)
  └─ unit
```

## 計算式

### 1. 食材・レシピ材料の税抜単位単価

```ts
function unit_price_excl_tax(item: { purchase_price_incl_tax, purchase_unit_qty }): number {
  if (!item.purchase_price_incl_tax || !item.purchase_unit_qty) return 0;
  return item.purchase_price_incl_tax / item.purchase_unit_qty / 1.08;
}
```

### 2. サブレシピ（ソース・サラダベース等）の単位原価

```ts
function sub_recipe_unit_cost(name: string, db: BistroKnocksSeed): number {
  const entries = db.sub_recipes.filter(s => s.recipe_name === name);

  // バッチ材料費
  const batch_cost = entries.reduce((sum, e) => {
    let qty = e.qty;
    if (qty === "DYNAMIC:5%_OF_TOTAL") {
      // 粒マスタード: 他材料の cc/ml/g 合計 × 5%
      qty = entries
        .filter(x => x.ingredient_name !== e.ingredient_name)
        .filter(x => ["cc","ml","g"].includes(x.unit))
        .reduce((s, x) => s + (typeof x.qty === "number" ? x.qty : 0), 0) * 0.05;
    }
    const ing_price = lookup_ingredient_unit_price(e.ingredient_name, db);
    return sum + (qty as number) * ing_price;
  }, 0);

  // バッチ出来上がり量
  const def = db.sub_recipe_definitions.find(d => d.name === name);
  let yield_g;
  if (def?.batch_yield_override) {
    yield_g = def.batch_yield_override;
  } else {
    yield_g = entries
      .filter(e => ["cc","ml","g"].includes(e.unit))
      .reduce((s, e) => s + (typeof e.qty === "number" ? e.qty : 0), 0);
  }

  return yield_g ? batch_cost / yield_g : 0;
}

function lookup_ingredient_unit_price(name: string, db: BistroKnocksSeed): number {
  // 順番に: FoodIngredient → RecipeIngredient → SubRecipe（サブレシピ自身を材料とする場合）
  const food = db.food_ingredients.find(f => f.name === name);
  if (food) return unit_price_excl_tax(food);
  const recipe = db.recipe_ingredients.find(r => r.name === name);
  if (recipe) return unit_price_excl_tax(recipe);
  return sub_recipe_unit_cost(name, db); // サブレシピ参照（再帰可能だが現状は浅い）
}
```

### 3. メニューの主食材原価

```ts
function main_ingredient_cost(menu: MenuItem, db: BistroKnocksSeed): number {
  return menu.ingredients.reduce((sum, ing) => {
    const unit_price = lookup_ingredient_unit_price(ing.name, db);
    return sum + unit_price * ing.qty;
  }, 0);
}
```

### 4. メニューのサイド原価

```ts
function side_cost(menu: MenuItem, db: BistroKnocksSeed): number {
  // フラグ管理7サイド: フラグ × 量 × 単価
  // 固定付与4サイド: 量 × 単価
  const FLAG_SIDES = ["pickles","potato_salad","egg","rice","pumpkin","small_shrimp","head_on_shrimp"];
  const ALWAYS_SIDES = ["サラダベース","ミニトマト","蒸し野菜","ブロッコリー"];
  const SIDE_KEY_MAP: Record<string,string> = {
    pickles: "ピクルス",
    potato_salad: "ポテトサラダ",
    egg: "卵",
    rice: "ご飯",
    pumpkin: "かぼちゃ",
    small_shrimp: "小エビ",
    head_on_shrimp: "有頭エビ",
  };

  let cost = 0;
  for (const key of FLAG_SIDES) {
    const flag = (menu.side_flags as any)[key];
    if (!flag) continue;
    const side = db.sides.find(s => s.name === SIDE_KEY_MAP[key]);
    if (!side) continue;
    const qty = menu.category === "黒弁当" ? side.qty_black_bento : side.qty_new_bento;
    cost += (qty ?? 0) * side_unit_price(side, db);
  }
  for (const name of ALWAYS_SIDES) {
    const side = db.sides.find(s => s.name === name);
    if (!side) continue;
    const qty = menu.category === "黒弁当" ? side.qty_black_bento : side.qty_new_bento;
    cost += (qty ?? 0) * side_unit_price(side, db);
  }
  return cost;
}

function side_unit_price(side: Side, db: BistroKnocksSeed): number {
  if (side.unit_price_excl_tax != null) return side.unit_price_excl_tax;
  // サラダベース・ピクルス → サブレシピ参照
  if (db.sub_recipe_definitions.some(d => d.name === side.name)) {
    return sub_recipe_unit_cost(side.name, db);
  }
  // ブロッコリー → "ブロッコリー(冷凍)" の RecipeIngredient を参照
  if (side.name === "ブロッコリー") {
    return unit_price_excl_tax(db.recipe_ingredients.find(r => r.name === "ブロッコリー(冷凍)")!);
  }
  return 0;
}
```

### 5. メニューの資材原価

```ts
function packaging_cost(menu: MenuItem, db: BistroKnocksSeed): number {
  // サイズ別: 容器・蓋を黒/新で切り替え
  // 共通: 箸・ワサガード・帯・シーザー・おしぼり 全メニュー
  const size_specific = menu.category === "黒弁当"
    ? ["容器（黒）", "蓋（黒）"]
    : ["容器（新）", "蓋（新）"];
  const common = ["箸", "ワサガード", "帯", "シーザードレッシング", "おしぼり"];
  const names = [...size_specific, ...common];
  return names.reduce((sum, name) => {
    const m = db.packaging_materials.find(p => p.name === name);
    return sum + (m?.price_excl_tax ?? 0);
  }, 0);
}
```

### 6. メニューのソース原価

```ts
function sauce_cost(menu: MenuItem, db: BistroKnocksSeed): number {
  return menu.sauces.reduce((sum, s) => {
    const unit_cost = sub_recipe_unit_cost(s.name, db);
    return sum + unit_cost * s.qty_cc;
  }, 0);
}
```

### 7. メニューの飲料原価

```ts
function drink_cost(menu: MenuItem, db: BistroKnocksSeed): number {
  const d = db.drinks.find(x => x.id === menu.drink_id);
  return d?.cost_excl_tax ?? 0;
}
```

### 8. 総合原価率・利益率

```ts
function compute_breakdown(menu: MenuItem, db: BistroKnocksSeed): MenuCostBreakdown {
  const main = main_ingredient_cost(menu, db);
  const side = side_cost(menu, db);
  const pkg = packaging_cost(menu, db);
  const sauce = sauce_cost(menu, db);
  const drink = drink_cost(menu, db);
  const total = main + side + pkg + sauce + drink;
  const sales_excl = menu.sales_price_incl_tax / 1.08;
  return {
    menu_id: menu.id,
    main_ingredient_cost_excl_tax: main,
    side_cost_excl_tax: side,
    packaging_cost_excl_tax: pkg,
    sauce_cost_excl_tax: sauce,
    drink_cost_excl_tax: drink,
    total_cost_excl_tax: total,
    sales_price_excl_tax: sales_excl,
    cost_rate: sales_excl ? total / sales_excl : 0,
    profit_rate: sales_excl ? 1 - total / sales_excl : 0,
  };
}
```

## ピクルスの特殊処理

- レシピは生材料を登録（玉ねぎ10個・大根3本・人参10本・パプリカ12個・ヤングコーン8缶・きゅうり12本・調味液6種）
- 出来上がり量 = `batch_yield_override` で **9,200g** を上書き設定
  - 計算根拠: 生11,600g → 廃棄率反映10,670g → 塩漬け×85% → 水晒し×105% → 水切り×97%
  - 調味液は最終的に切るため重量加算なし

## 蒸し野菜の特殊処理

- レシピ: キャベツ2個・白菜0.5個・人参3本・玉ねぎ3個・もやし8000g
- 出来上がり量 = `batch_yield_override` で **10,280g**（生重量×80% 仮算）

## ブールブランソースの特殊処理

- レシピは 1食分（白ワイン15ml + クラム2.5g + 生クリーム20ml）で登録
- `basis: "per_serving"`, `batch_yield_override: 30` (1食=30cc完成)
- メニュー側で「ブールブランソース 30cc」と指定すれば1食分の原価がそのまま乗る

## 粒マスタードの動的計算

- ハンバーグソースに含まれる粒マスタードは「ソース全量×5%」
- レシピマスタの qty 値は `"DYNAMIC:5%_OF_TOTAL"` センチネル
- 計算時に他材料の cc/ml/g 合計 × 0.05 を qty として扱う

## 条件付き書式 (UI 表現用)

原価率の表示色:
- < 25% → 緑（高利益）
- 25% ≤ x < 35% → 通常（白）
- 35% ≤ x < 45% → オレンジ（警戒）
- ≥ 45% → 赤（危険）
