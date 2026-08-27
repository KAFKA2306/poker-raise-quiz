# One-tap Quiz

https://kafka2306.github.io/poker-raise-quiz/

四択を1回タップするだけの、静かなタブレット向けクイズです。

回答すると、その場で正解・不正解と正答を表示します。回答済みの状態はブラウザに保存され、再読み込みしても残ります。保存済みの回答は、ChatGPTへ貼り付けやすい文章として一括コピーできます。

## リポジトリ構造

役割ごとにディレクトリを分けています。

```text
README.md
web/
  index.html
  css/
    app.css
  js/
    main.js
    quiz/
      data.js
      session.js
      export.js
data/
  catalog.json
  exams/
    applied-information/
      manifest.json
      sessions/
        2025-autumn/
          manifest.json
          modules/
            q044-q053.json
scripts/
  validate.mjs
.github/
  workflows/
    ci.yml
    pages.yml
```

- `web/`：ブラウザで使う画面と処理
- `data/`：本番の問題データ
- `scripts/`：自動確認に使う処理
- `.github/workflows/`：自動確認とGitHub Pages公開

## 問題データ

問題データは、試験 → 試験回 → モジュールの順で分けています。

最初の本番データは、IPAが公開した2025年度秋期 応用情報技術者試験 午前の問44〜53です。現在は10問だけの部分収録であり、全80問を収録済みとは扱いません。

問題冊子
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_qs.pdf

解答例
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_ans.pdf

サンプル問題、架空問題、動作確認用のダミー問題は `main` の本番データに置きません。第三者サイトの解説文も収録しません。

新しい年度や別の試験を追加するときは、`data/` に新しいmanifestと問題モジュールを追加します。Web側に試験名や年度を直接書く必要はありません。

## 自動確認と公開

Pull Requestと`main`への変更では、GitHub Actionsが次を自動確認します。

- ディレクトリ構造
- JavaScriptの文法
- manifestから問題モジュールまでの参照
- 四択問題の必須項目
- 正答が選択肢に含まれていること
- 本番データ配下にサンプル用データがないこと

`main` の自動確認に成功したコミットだけをGitHub Pagesへ公開します。

## 旧ポーカークイズ

置き換え前のポーカークイズは、次のブランチに保存しています。

`archive/poker-raise-quiz-2026-08-28`
