【やることは2つだけ】
1) LINE のトークを「保存」で出した .txt を、このフォルダに入れる（README.txt は無視されます）
2) リポジトリで:  npm run line:ingest
   → 各 .txt を Gemini で吸い出し、
     ・Notion「LINE取り込み」にレポート1ページ
     ・Notion「タスク（LINE吸い出し）」に 1 タスク 1 行（表ビューで管理）
   初回のみ: npm run notion:create-tasks-db（タスク用 DB が無いとき）
   （同じ内容の .txt は再実行してもスキップ。再取り込み: npm run line:ingest -- --force）

※ .txt は git に含めません（プライバシー）。
