# Gemini API スクリプト アーカイブ

2026-06-02 にこのディレクトリへ移動。理由は **Google Cloud API 課金（NanoBanana 系画像生成）の停止**。

## 移動対象

| ファイル | 用途 | 移行先 |
|---|---|---|
| `generate-pop-images.js` | Niki POP / カレンダー用画像をNanoBanana(`gemini-3.1-flash-image-preview`)で生成 | **Google AI Studio Web UI**（Gemini Advanced／AI Pro契約に含む）で手動生成 |
| `content-prepare.js` | Instagram投稿写真のリタッチ＋トリミング | 同上（AI Studio Web UI で手動）。撮影元データは `01_Material/02_Photos/` |
| `test-gemini-image.js` | 画像加工テストハーネス | 不要時は削除可。再利用時は Web UI で代替 |

## 復活させる場合

API課金が許容できる場合のみ、リポジトリルートに戻す。`.env` の `GEMINI_API_KEY` は引き続き他のスクリプト（task-siphon 等）でも使用していたが、2026-06-02 の改修で全テキスト処理は Claude Code CLI に移行済み。

## 関連

- 改修記録: `docs/revision-log.md`（2026-06-02 エントリ）
- 画像生成ルール: `docs/image-generation-rules.md`
