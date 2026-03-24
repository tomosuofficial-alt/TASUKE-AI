# レシート置き場（正式）

撮影したレシート画像を **このフォルダに入れる** → プロジェクトルートで freee へ登録します。

## 手順

1. iPhone 等で撮影 → Mac に共有（AirDrop 等）
2. 画像を **`TASUKE-AI/receipts/`** に保存
3. ターミナルでリポジトリ直下から:

```bash
npm run receipt
```

（`receipt-import.js` が OCR → 仕分け → freee API で取引登録）

- 仕分けルールの再学習: `npm run receipt:learn`
- freee 明細の **備考** は **`TASUKE-AI`** のみ（`.env` の `RECEIPT_IMPORT_REMARK` で変更可）
- **初めての店**は freee に **取引先を自動作成**（同名が既にあれば紐づけのみ）。勘定は Gemini の推測が優先、曖昧なときは `RECEIPT_NEW_ACCOUNT_NAME`（既定: 消耗品費）
- **品目**は必ず付与（`item_guess`・レシート品目・勘定のヒントでマスタ照合）。最後の手段は `RECEIPT_DEFAULT_ITEM_NAME`（既定: `事務用品`）または `RECEIPT_DEFAULT_ITEM_ID`
- **部門**は `section_guess`・勘定に応じた候補・`RECEIPT_DEFAULT_SECTION_NAME`（既定: `営業`）または `RECEIPT_DEFAULT_SECTION_ID` でマスタ照合
- **飲食店**（店名に らーめん・カフェ 等）→ 勘定は **交際費**、品目は **飲食** 系を優先（事務用品にしない）。`RECEIPT_DINING_DEFAULT_ITEM_NAME` で調整可
- freee アプリの **権限**（取引先の作成など）: `FREEE_PERMISSIONS.md` を参照。変更後は再認可
- 詳細オプションは `receipt-import.js` 先頭のコメント参照
- **OCR 精度**: `receipt-rules.json` の取引先名をプロンプトに埋め込み（`--learn` で更新）。環境変数 **`RECEIPT_GEMINI_MODEL`**（既定 `gemini-2.5-flash`）、**`RECEIPT_OCR_PARTNER_PROMPT_MAX`**（プロンプトに載せる店名の最大件数、既定 120）
