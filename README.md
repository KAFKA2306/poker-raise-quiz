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
    professional-digital-skills/
      management/
        manifest.json
      data-ai/
        manifest.json
      system/
        manifest.json
scripts/
  validate.mjs
  verify-pages.mjs
.github/
  workflows/
    ci.yml
    pages.yml
```

- `web/`：ブラウザで使う画面と処理
- `data/`：本番の問題データと、未実施試験の公式メタデータ
- `scripts/`：自動確認と公開後確認に使う処理
- `.github/workflows/`：自動確認とGitHub Pages公開

## 問題データ

問題データは、試験 → 試験回 → モジュールの順で分けています。

最初の本番データは、IPAが公開した2025年度秋期 応用情報技術者試験 午前の問44〜53です。現在は10問だけの部分収録であり、全80問を収録済みとは扱いません。

問題冊子
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_qs.pdf

解答例
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_ans.pdf

サンプル問題、架空問題、動作確認用のダミー問題、生成問題は `main` の本番問題として置きません。第三者サイトの問題文や解説文も収録しません。

新しい年度や別の試験を追加するときは、`data/` に新しいmanifestと問題モジュールを追加します。Web側に試験名や年度を直接書く必要はありません。

## 2027年度の新しい高度試験

IPAは2027年度から新試験制度へ移行し、現在の応用情報技術者試験と高度試験を再編した次の3区分を新設する予定です。

- プロフェッショナルデジタルスキル（マネジメント）試験（仮称）
- プロフェッショナルデジタルスキル（データ・AI）試験（仮称）
- プロフェッショナルデジタルスキル（システム）試験（仮称）

3区分とも2027年度夏頃から秋頃の開始予定で、CBT方式です。予定されている出題数は、科目A-1が60問、科目A-2が23問、科目Bが12問です。

2026年8月28日時点では本試験前なので、3区分とも `status: upcoming` として管理し、本番問題は収録していません。3区分のサンプル問題もIPAでは準備中です。サンプル問題が公開されても、本番問題としては収録しません。

マネジメントとシステムのシラバス案は2026年7月31日更新のVer.0.2です。データ・AIのシラバス案は準備中です。

制度見直し
https://www.ipa.go.jp/shiken/minaoshi/index.html

試験構成と開始予定
https://www.ipa.go.jp/shiken/syllabus/henkou/2025/20260331.html

新制度のサンプル問題
https://www.ipa.go.jp/shiken/syllabus/henkou/2026/20260622.html

新制度のシラバス案
https://www.ipa.go.jp/shiken/syllabus/henkou/2026/20260630.html

## 自動確認と公開

Pull Requestと`main`への変更では、GitHub Actionsが次を自動確認します。

- ディレクトリ構造
- JavaScriptの文法
- manifestから問題モジュールまでの参照
- 四択問題の必須項目
- 正答が選択肢に含まれていること
- 本番データ配下にサンプル・ダミー・生成問題用の名前がないこと
- `upcoming` の試験に本番問題の試験回が置かれていないこと
- 未実施試験に公式URL、試験方式、科目構成、シラバス状態があること
- 新制度の問題を将来追加するとき、公式の本試験問題であることを明示していること

`main` の自動確認に成功したコミットだけをGitHub Pagesへ公開し、公開後は本番URLの内容がデプロイ元と一致することも自動確認します。

## 旧ポーカークイズ

置き換え前のポーカークイズは、次のブランチに保存しています。

`archive/poker-raise-quiz-2026-08-28`
