# One-tap Quiz

https://kafka2306.github.io/poker-raise-quiz/

四択を1回タップして、その場で正誤を確認する静的な資格クイズです。回答状態はブラウザに保存され、回答履歴をChatGPT向けにコピーできます。

## データ

`data/catalog.json` には、実際に回答できる問題データがある試験だけを登録します。未収録の試験、未実施の試験、公開できない問題のメタデータだけを置くことはしません。

問題データは `data/exams/` 以下で、試験 → 試験回 → 問題モジュールの順に分けます。Web側へ試験名や年度を直接書きません。

## 構造

```text
web/                  # 共通のクイズ画面
data/catalog.json     # 公開する試験一覧
data/exams/           # 問題データ
scripts/              # 自動確認と公開後確認
.github/workflows/    # CI/CD
```

## 自動確認と公開

```text
node scripts/validate.mjs
node scripts/validate-g-test.mjs
```

Pull Requestと`main`で検証し、成功した`main`だけをGitHub Pagesへ公開します。公開後は本番URLのファイルがデプロイ元と一致することも確認します。
