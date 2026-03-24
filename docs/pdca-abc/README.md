# ABC / PDCA レポート（よいどころ千福）

スマレジ取引明細からカテゴリ別（または商品別）ABC を出し、PDCA 用の Markdown を生成します。**#daily-command には流しません。**

## ここで見る（Cursor / VS Code）

1. ターミナルで実行する:

   ```bash
   npm run pdca:abc -- 2026-03
   ```

2. 同じフォルダにファイルができます（`.gitignore` のため Git には含みません）:

   | ファイル | 説明 |
   |----------|------|
   | **`latest.md`** | 直近の実行結果。**いつもここを開けばよい** |
   | `pdca-abc-YYYY-MM-DD_YYYY-MM-DD.md` | 期間ごとの保存 |

3. 左のエクスプローラで **`docs/pdca-abc/latest.md`** を開く。

GitHub Actions の「Monthly PDCA ABC report」実行後は、**Artifacts** から同じ Markdown をダウンロードできます。
