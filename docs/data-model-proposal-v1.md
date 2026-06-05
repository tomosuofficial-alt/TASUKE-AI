# よいどころ千福 PDCA 改善カード データモデル提案 v1

- 起草: ツクル（Claude Code, Opus 4.7・Mac mini）
- 起草日: 2026-06-05 (JST)
- 上位: [senpuku-pdca-system-spec.md](senpuku-pdca-system-spec.md) §6 / [pdca-meeting-loop.md](pdca-meeting-loop.md) §2
- 経緯: [handoff-2026-06-05-pdca-senpuku.md](handoff-2026-06-05-pdca-senpuku.md)
- ステータス: **レビュー待ち**（spec §0 ①データモデル提案フェーズ）
- 出力レンジ: 本書承認 → ②MVP画面/機能定義 → ③実装（spec §0 段階制）

---

## 0. 30秒サマリー

spec §6（改善カード）と pdca-meeting-loop §2（Notion 台帳）のスキーマを統合し、§10①（C→A）・§10⑥（7分類）・§10⑦（5段階）・§10③（Phase1=AI代行）の確定事項を反映した正本スキーマ案。

- Phase1 = **Notion を主**として §6 7分類に揃えた列定義（pdca-meeting-loop §2 の旧5分類を置換）
- Phase2 アプリ資産化（A）= **技術スタック未確定**（大内 2026-06-05 判断: Phase1 検証後に決める）のため、本書はモデル定義のみ。既存資産（GAS+Sheets+Netlify）／新規（Next.js+Supabase）どちらにも翻訳可能な抽象スキーマで持つ。
- 既存チェックシート（`senpuku-manual.netlify.app`）の 6 シートとは `category × itemId` で参照関係を張る。

---

## 1. 前提整理（2026-06-05 ハンドオフ結果）

| 項目 | 値 |
|---|---|
| アプリ実構成 | GAS（[Code.gs](../../02_Web_Apps/Yoidokoro_Senpuku/Check_Sheet/Code.gs) 1963行）+ Google Sheets（6シート）+ Netlify静的HTML + Claude Haiku 3.5 + LINE通知 |
| ローカルパス | `/Volumes/Home_Mac_SSD/02_Development/02_Web_Apps/Yoidokoro_Senpuku/Check_Sheet/` |
| 公開URL | `https://senpuku-manual.netlify.app/` |
| GitHub | `github.com/tomosuofficial-alt/senpuku-check-sheet` |
| Netlify siteId | `5e8e8612-7b91-4b6b-9d37-2948dd004357` |
| シートID | `1SvnkJzDm6AzcyGHuJOUprppQWnSUUEcJUtv5HMhAuAk` |
| spec §4 想定との乖離 | 想定 Next.js/Supabase/Vercel → 実態 GAS/Sheets/Netlify |
| **§10① 配置** | **C → A**（Phase1 Notion → Phase2 アプリ資産化）確定 |
| **§10③ 入力者** | Phase1 = **AI代行（マワリ）** / Phase2 = 内製オーナー（人選未決） |
| **§10④ サイクル** | **月次定例 + 中間1回**（隔週相当） |
| **§10⑥ 原因分類** | **spec §6 の 7 分類**を採用（pdca-meeting-loop の旧 5 分類を置換） |
| **§10⑦ 達成度** | **5 段階** |
| Phase2 スタック判断 | **Phase1 検証後に決める**（大内 2026-06-05 決定） |
| spec §4 の扱い | 本体据え置き・追記ノートのみ（大内 2026-06-05 決定） |

---

## 2. 既存チェックシート 6 シートの構造（突合の土台）

[Code.gs](../../02_Web_Apps/Yoidokoro_Senpuku/Check_Sheet/Code.gs) の実装から確定した列定義。

| シート名 | 列構成 |
|---|---|
| スタッフマスタ | staffId / staffName / active |
| チェック項目マスタ | storeId / category / timing / itemId / itemName / memo / active / photoRequired / multipleAllowed |
| チェック履歴 | 日時 / 店舗ID / スタッフID / スタッフ名 / カテゴリ / 項目ID / 温度 |
| 未実施チェック | storeId / date / category / itemId / itemName |
| 確認履歴 | 確認日時 / 店舗ID / 確認者ID / 確認者名 / カテゴリ / 項目ID / ステータス / チェック者名 |
| 写真判定履歴 | 判定日時 / 店舗ID / スタッフID / スタッフ名 / カテゴリ / 項目ID / 項目名 / 判定結果 / 判定理由 / 確信度 / ファイルID / ファイルURL |

> spec §6 の「改善カード」と直接重なる列はゼロ。**改善カードは完全新規エンティティ**として追加が必要。既存 6 シートとは `category` / `itemId` を参照キーとしてリンクする。

---

## 3. 改善カード（Improvement Card）スキーマ正本

spec §6 を主軸に、pdca-meeting-loop §2 の運用列をマージし、§10 決定事項を反映。

### 3.1 主要フィールド

| field | 型 | spec §6 由来 | loop §2 由来 | 説明 | 例 |
|---|---|---|---|---|---|
| `id` | uuid / page_id | ✓ | (自動) | 一意 ID | — |
| `title` | text | ✓ | ✓（アクション） | 一行サマリ | 「ドリンク管理の継続」 |
| `description` | text | ✓ | — | 内容・現状 | — |
| `source_meeting_date` | date | ✓ | ✓（対象会議回） | 発生会議日 | 2026-06-02 |
| `source_section` | select | (新) | — | 議事の Section 番号 | Section4 / Section6 / Section10 |
| `category` | select | ✓（区分） | — | タスク / 決定事項 / 業務 / 現場オペ | タスク |
| `reporter` | select | ✓ | — | 報告者（誰の現場か） | ちい / おおうち |
| `action_owner` | select | ✓ | ✓（担当者） | 改善担当 | たつや / ひろき / なぎさ / いくえ / あきお / ちい / おおうち / 全員 |
| `due_date` | date | ✓ | ✓（期限） | 期限 | 2026-06-30 |
| `status` | select | ✓ | ✓（状態） | 未着手 / 進行中 / 検証中 / 完了 / 横展開済 / 未達 / 繰り越し | 進行中 |
| `achievement` | select（5段階） | ✓ | (新) | 達成度 | 1未着手 / 2着手 / 3部分達成 / 4ほぼ達成 / 5完了 |
| `cause_type` | select（7分類） | ✓ | △（5分類を置換） | **原因分類** | 仕組み・ルールの不備 |
| `why` | text | ✓ | ✓（なぜできなかったか） | 構造的原因 | 「いつ・どこで記録するか未確定」 |
| `where_stuck` | text | (新) | ✓（どこでつまずいたか） | 詰まり位置 | 「確認タイミング曖昧」 |
| `next_action` | text | ✓ | ✓（改善案） | 次の一手（Plan） | 「チェックシートに項目追加」 |
| `verification` | text | ✓ | — | 検証結果（Check） | 「6/14時点で項目追加済」 |
| `to_standardize` | bool | ✓ | ✓（資産化する？） | 横展開フラグ（Act） | true |
| `related_doc` | url | ✓ | ✓（資産化リンク） | 意思決定ログ / マニュアル | — |
| `related_checkitem_id` | text | (新) | — | 既存チェックシート項目への参照 | `ドリンク清掃/DR001` |
| `target_client` | select | — | ✓ | 対象クライアント | よいどころ千福 / Niki★DINER / Bistro Knocks / Mz cafe |
| `created_at` / `updated_at` | datetime | ✓ | — | 監査用 | — |
| `created_by` | select | ✓ | — | 起票者（Phase1 = マワリ） | マワリ / おおうち |

### 3.2 cause_type 7分類（spec §6 で確定）

旧 pdca-meeting-loop §2 の 5 分類は本表に置換する。

| キー | ラベル | 資産化対象 | loop §2 旧5分類との対応 |
|---|---|---|---|
| `human_error` | ヒューマンエラー（人） | ✗ | ヒューマンエラー |
| `system_rule` | 仕組み・ルールの不備 | ✓ | 仕組み/動線（一部） |
| `operation_flow` | 動線・オペレーション設計 | ✓ | 仕組み/動線（一部） |
| `info_sharing` | 情報共有不足 | ✓ | （新規） |
| `skill_education` | スキル・教育不足 | △（マニュアル化検討） | 知識/スキル不足 |
| `tool_equipment` | ツール・設備 | ✓ | （新規） |
| `other` | その他（外部要因含む） | （個別判断） | 外部要因 |

**資産化判定ルール**（pdca-meeting-loop §5 を 7 分類に再適用）:
- 資産化する = `cause_type ∈ {system_rule, operation_flow, info_sharing, tool_equipment}` かつ「他担当・他月にも起きうる」
- 資産化しない = `human_error`（個別フィードバック止まり）
- ケースバイ = `skill_education`（マニュアル化が有効か別途判断）、`other`（外部要因は記録のみ）

### 3.3 achievement と status の関係

`achievement` = 会議で記入する「結果」、`status` = 運用上の「動き」。連動するが独立に持つ。

| achievement | 想定 status |
|---|---|
| 1 未着手 | 未着手 |
| 2 着手のみ | 進行中 |
| 3 部分達成 | 進行中 / 検証中 |
| 4 ほぼ達成 | 検証中 |
| 5 完了 | 完了 / 横展開済 |

---

## 4. 既存チェックシートとの参照関係

```
チェック項目マスタ
  (storeId, category, timing, itemId, itemName, memo, active, photoRequired, multipleAllowed)
        ▲
        │ related_checkitem_id（text、形式: "{category}/{itemId}"）
        │
改善カード ──→ 「ドリンク管理項目を追加」のように
              項目マスタへの追加 / 変更を改善カードで追跡可能
        │
        ▼ verification の根拠データとして参照
チェック履歴
  (日時, 店舗ID, スタッフID, スタッフ名, カテゴリ, 項目ID, 温度)
```

**ユースケース例**（[pdca-meeting-loop.md](pdca-meeting-loop.md) §3 の実データを 7 分類に再分類）:

> 「たつや: ドリンク管理」が未達 → `cause_type=operation_flow` → `next_action`「チェックシートに項目追加」 → 大内が項目マスタに `ドリンク清掃/DR001` を追加 → `related_checkitem_id=ドリンク清掃/DR001` → 次月、チェック履歴に DR001 が記録されているか `verification` で確認 → 達成なら `to_standardize=true` で意思決定ログへ。

---

## 5. Phase1 Notion DB 設計（[pdca-meeting-loop.md](pdca-meeting-loop.md) §2 改修案）

DB 名・親ページはそのまま。**列定義のみ本書 §3 で置換**。

| 列名（Notion 表示） | Notion 型 | 本書 field | 必須？ | 備考 |
|---|---|---|---|---|
| アクション | Title | title | ✓ | |
| 説明 | Text | description |  | |
| 対象会議日 | Date | source_meeting_date | ✓ | |
| 対象 Section | Select | source_section |  | Section4 / 6 / 10 |
| 区分 | Select | category | ✓ | タスク / 決定事項 / 業務 / 現場オペ |
| 報告者 | Select | reporter |  | |
| 担当者 | Select | action_owner | ✓ | ちい / たつや / ひろき / なぎさ / いくえ / あきお / おおうち / 全員 |
| 期限 | Date | due_date |  | |
| 状態 | Select | status | ✓ | 未着手 / 進行中 / 検証中 / 完了 / 横展開済 / 未達 / 繰り越し |
| 達成度 | Select | achievement |  | 1 / 2 / 3 / 4 / 5 |
| 原因分類 | Select | cause_type | （詰める時） | 7 分類 |
| なぜできなかったか | Text | why | （詰める時） | |
| どこでつまずいたか | Text | where_stuck | （詰める時） | |
| 改善案 | Text | next_action | （詰める時） | |
| 検証結果 | Text | verification | （Check 時） | |
| 資産化する？ | Checkbox | to_standardize |  | |
| 資産化リンク | URL | related_doc |  | `decision-log.js` 出力 |
| 関連チェック項目 | Text | related_checkitem_id |  | 例: `ドリンク清掃/DR001` |
| 対象クライアント | Select | target_client | ✓ | よいどころ千福 / Niki★DINER / Bistro Knocks / Mz cafe |

⚠️ [scripts/notion-create-meeting-actions-db.js](../scripts/notion-create-meeting-actions-db.js) は旧設計（5分類）のため、本書承認後に上記列定義へ改修してから実行する（handoff 未決#3 と整合）。

---

## 6. 集計ビュー（spec §9 準拠）

Phase1 Notion ビューで実装可能:

| ビュー名 | 切り口 | 目的 |
|---|---|---|
| 原因分類サマリ | cause_type × 月 | 人 vs 仕組み比率（経営インサイト） |
| 状態ボード（かんばん） | status 別 | 進行管理 |
| 期限超過 | due_date < today AND status ≠ 完了 | アラート |
| マニュアル化対象 | to_standardize = true | Act 起点リスト |
| 担当者別ロード | action_owner × status | 偏り検知 |

**Phase2 で追加される資産化指標**:
- `to_standardize=true` 件数 / 月
- 平均クローズ日数（`status=完了` 到達までの日数）
- `related_checkitem_id` 紐付き件数 = チェックシート資産が PDCA で増えた量

---

## 7. 既存 6 シートとの統合方針（Phase2 用・参考）

**Phase2 で技術スタックが確定したらどちらに翻訳するかの参考図**。今は決めない。

### 案 A-1: GAS+Sheets 拡張案

```
SHEETS.IMPROVEMENT_CARDS（新規、7シート目）
  cardId | title | description | sourceMeetingDate | sourceSection | category
  | reporter | actionOwner | dueDate | status | achievement | causeType
  | why | whereStuck | nextAction | verification | toStandardize
  | relatedDoc | relatedCheckitemId | targetClient | createdAt | updatedAt | createdBy
```

- Code.gs に CRUD 関数を追加（既存 `submitChecks` の流儀に揃える）
- UI は [deploy/index.html](../../02_Web_Apps/Yoidokoro_Senpuku/Check_Sheet/deploy/index.html) にタブ追加 or 別ページ
- 移行コスト: 小（既存資産流用）
- 制約: 集計が Sheets 関数依存、UX 自由度低、長期メンテ性課題

### 案 A-2: Next.js+Supabase 新規案

```sql
CREATE TABLE improvement_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  source_meeting_date date NOT NULL,
  source_section text,
  category text NOT NULL CHECK (category IN ('タスク','決定事項','業務','現場オペ')),
  reporter text,
  action_owner text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT '未着手',
  achievement smallint CHECK (achievement BETWEEN 1 AND 5),
  cause_type text CHECK (cause_type IN
    ('human_error','system_rule','operation_flow','info_sharing',
     'skill_education','tool_equipment','other')),
  why text,
  where_stuck text,
  next_action text,
  verification text,
  to_standardize boolean DEFAULT false,
  related_doc text,
  related_checkitem_id text,
  target_client text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text
);
```

- 既存チェックシートも順次 Supabase 移行（spec §4 想定通り）
- 移行コスト: 大（GAS→Edge Functions / Sheets→Postgres / Netlify→Vercel）
- 利点: TOMOSU. ブランドのプロダクト資産化（spec §3 KGI）達成

---

## 8. 未決事項（次の関所）

| # | 内容 | 起案者 / 提出先 | タイミング |
|---|---|---|---|
| 1 | **本提案の承認** | 大内 | レビュー次第 |
| 2 | Phase2 スタック（A-1 / A-2 / その他） | 大内 | Phase1 検証後（〜2026-09 目安） |
| 3 | 内製オーナー（spec §10⑤） | 大内 | 7月定例まで |
| 4 | `source_section` の選択肢確定 | マワリ | 6/2 議事メモ受領後 |
| 5 | `related_checkitem_id` のキー形式（"{category}/{itemId}" で良いか） | ツクル | Notion DB 作成時 |
| 6 | スタッフ名と Notion セレクト名の表記揺れ整理 | 大内 / マワリ | Notion DB 作成前 |
| 7 | NOTION_TOKEN ローカル取得 | 大内 | DB 作成前（handoff 未決#3） |
| 8 | [scripts/notion-create-meeting-actions-db.js](../scripts/notion-create-meeting-actions-db.js) を本書 §5 に改修 | ツクル | 本提案承認後 |

---

## 9. レビュー観点（大内さんへ）

特に握ってもらいたい3点:

1. **cause_type 7 分類の文言**（§3.2）— 現場が会議で迷わず選べる粒度になっているか
2. **achievement = 5 段階の意味付け**（§3.3）— 「3 部分達成」「4 ほぼ達成」の境界は会議で運用可能か
3. **`related_checkitem_id` の必要性**（§4）— 改善カードと既存チェック項目を紐付ける「機械的な追跡」は、Phase1 から導入する価値があるか（運用負荷とのトレードオフ）

---

確実性: 既存コードと spec / pdca-meeting-loop の突合は完了。設計判断は本書に集約し、未決は §8 に明示。Phase2 スタックは意図的に未確定のまま、Notion 主・将来両胸開きで起草した。
