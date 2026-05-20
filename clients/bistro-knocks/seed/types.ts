/**
 * Bistro Knocks 原価管理 - データモデル型定義
 *
 * Excel シートのカラム構造をそのままマップ。
 * Web app の DB スキーマ / Prisma model / Drizzle schema / API レスポンスの
 * リファレンスとして使う。
 *
 * 命名規則:
 *   - エンティティ名は英語スネーク (ファイル名と一致)
 *   - フィールド名は snake_case（JSON 出力と一致）
 *   - 金額は税込/税抜を必ず接尾辞で明示
 */

// ============================================================
// 食材マスタ (主食材: ハンバーグ・牛肉・豚肉・鶏肉・魚など16品)
// ============================================================
export interface FoodIngredient {
  name: string;                          // 例: "150gバーグ", "豚ヒレ"
  unit: "個" | "g" | "カット" | "丁";    // 使用単位
  purchase_price_incl_tax: number | null;// 仕入単価（税込・円） 入力
  purchase_unit_qty: number | null;       // 仕入単位量（例: 100g単位なら100）入力
  note: string | null;
}

// ============================================================
// 飲料マスタ
// ============================================================
export interface Drink {
  id: "none" | "pet_free" | "pet" | "pack";
  name: string;
  sales_price_incl_tax: number;          // 販売価格（税込・円）
  cost_excl_tax: number | null;           // 税抜原価 入力
  note: string | null;
}

// ============================================================
// サイドマスタ (11品: 7フラグ管理 + 4固定付与)
// ============================================================
export interface Side {
  name: string;
  unit: "g" | "個";
  qty_black_bento: number | null;        // 黒弁当1食あたり量
  qty_new_bento: number | null;          // 新弁当1食あたり量
  unit_price_excl_tax: number | null;    // 税抜単位単価 入力 or サブレシピ自動算出
  note: string | null;
}

// ============================================================
// 資材マスタ (容器・蓋・箸・ワサガード・帯・シーザー・おしぼり)
// ============================================================
export interface PackagingMaterial {
  name: string;
  category: "サイズ別" | "共通";          // サイズ別=黒弁当/新弁当で違う
  price_excl_tax: number | null;
  applies_to: string;                    // 例: "黒弁当のみ", "全メニュー"
}

// ============================================================
// レシピ材料マスタ (ソース・ピクルス・サラダベース・蒸し野菜のサブ材料)
// ============================================================
export interface RecipeIngredient {
  name: string;
  unit: string;                          // cc, ml, g, 個, 株, 缶, 本, 粒, pc
  purchase_price_incl_tax: number | null;
  purchase_unit_qty: number | null;
  note: string | null;
}

// ============================================================
// サブレシピ (ソースレシピマスタ): 1行 = レシピ × 材料
// ============================================================
export interface SubRecipeEntry {
  recipe_name: string;                   // 例: "ハンバーグソース", "ピクルス", "サラダベース"
  ingredient_name: string;               // RecipeIngredient.name または FoodIngredient.name
  qty: number | "DYNAMIC:5%_OF_TOTAL";  // 粒マスタードは動的計算
  unit: string;
  note: string | null;
}

// ============================================================
// サブレシピ定義: バッチ単位の集計設定
// ============================================================
export interface SubRecipeDefinition {
  name: string;                          // SubRecipeEntry.recipe_name と同一
  batch_yield_override: number | null;   // 出来上がり量(g) 上書き入力。null ならレシピ材料の cc/ml/g 合算
  basis: "batch" | "per_serving" | "market" | "condiment";
  note: string | null;
}

// ============================================================
// メニュー (黒弁当12 + 新弁当13 = 25メニュー)
// ============================================================
export type BentoCategory = "黒弁当" | "新弁当";

export interface MenuItem {
  id: number;                            // 1-25
  name: string;
  category: BentoCategory;
  sales_price_incl_tax: number;
  ingredients: { name: string; qty: number }[]; // 主食材1-2品
  side_flags: {
    pickles: 0 | 1;
    potato_salad: 0 | 1;
    egg: 0 | 1;
    rice: 0 | 1;
    pumpkin: 0 | 1;
    small_shrimp: 0 | 1;
    head_on_shrimp: 0 | 1;
  };
  drink_id: Drink["id"];
  sauces: { name: string; qty_cc: number }[]; // 0-2 ソース
}

// ============================================================
// 計算結果 (Web app 側で算出する)
// ============================================================
export interface MenuCostBreakdown {
  menu_id: number;
  main_ingredient_cost_excl_tax: number;
  side_cost_excl_tax: number;
  packaging_cost_excl_tax: number;
  sauce_cost_excl_tax: number;
  drink_cost_excl_tax: number;
  total_cost_excl_tax: number;
  sales_price_excl_tax: number;          // sales_price_incl_tax / 1.08
  cost_rate: number;                      // total_cost / sales_price_excl
  profit_rate: number;                    // 1 - cost_rate
}

// ============================================================
// 集合 (シードファイル all.json のルート)
// ============================================================
export interface BistroKnocksSeed {
  food_ingredients: FoodIngredient[];
  drinks: Drink[];
  sides: Side[];
  packaging_materials: PackagingMaterial[];
  recipe_ingredients: RecipeIngredient[];
  sub_recipes: SubRecipeEntry[];
  sub_recipe_definitions: SubRecipeDefinition[];
  menus: MenuItem[];
}
