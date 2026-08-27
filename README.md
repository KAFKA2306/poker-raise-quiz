# One-tap Quiz

https://kafka2306.github.io/poker-raise-quiz/

四択を1回タップするだけの、静かなタブレット向けクイズです。

画面上部で試験を選べます。問題を公開できる試験では、回答するとその場で正解・不正解と正答を表示します。回答済みの状態はブラウザに保存され、再読み込みしても残ります。保存済みの回答は、ChatGPTへ貼り付けやすい文章として一括コピーできます。

問題本文を公開できない試験や未実施の試験は、問題を作らず、公式に確認できる試験情報だけを表示します。

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
  policies/
    qc.json
  exams/
    applied-information/
      manifest.json
      sessions/
    statistics-grade-2/
      manifest.json
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
- `data/`：本番問題データ、公開可能な試験情報、未実施試験の公式メタデータ、公開可否の確認結果
- `scripts/`：自動確認と公開後確認に使う処理
- `.github/workflows/`：自動確認とGitHub Pages公開

## 応用情報技術者試験

問題データは、試験 → 試験回 → モジュールの順で分けています。

最初の本番データは、IPAが公開した2025年度秋期 応用情報技術者試験 午前の問44〜53です。現在は10問だけの部分収録であり、全80問を収録済みとは扱いません。

問題冊子
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_qs.pdf

解答例
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_ans.pdf

サンプル問題、架空問題、動作確認用のダミー問題、生成問題は `main` の本番問題として置きません。第三者サイトの問題文や解説文も収録しません。

## 統計検定2級

統計検定2級は試験一覧から選べますが、問題本文は収録していません。

統計検定公式FAQでは、CBT方式試験の過去問題は公開されておらず使用できないこと、検定問題を個人のブログやホームページへ掲載できないこと、許諾なく編集した問題も掲載できないことが明記されています。そのため、この公開リポジトリとGitHub Pagesには問題本文を置かず、公式の試験方式、出題範囲、利用条件へのリンクだけを掲載します。

2026年8月28日時点の統計検定2級は、CBT方式、4～5肢選択問題、35問程度、90分、100点満点で60点以上が合格水準で、出題範囲表は202409版です。

統計検定2級
https://www.toukei-kentei.jp/grade/grade2/

よくあるご質問
https://www.toukei-kentei.jp/faq

過去問題
https://www.toukei-kentei.jp/preparation/kakomon/

統計検定2級は `contentMode: "metadata-only"` として管理します。この状態では問題モジュールを参照できません。

将来、問題を収録できる明確な利用根拠を得た場合でも、試験ID、級、出典URL、再利用根拠、再利用確認済みであることを各問題に持たせます。これらが不足している場合は自動確認を失敗させます。

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

## QC検定

品質管理検定（QC検定）は、2026年8月28日時点では公開問題集として収録しません。

日本規格協会はQC検定の試験問題・基準解答について、コピーやホームページなどへの掲載・公開を断っています。第39回3級の販売ページにも、その条件が明記されています。そのため、購入した過去問題や第三者が転載した問題をこの公開リポジトリへ転記しません。

公式情報
https://webdesk.jsa.or.jp/common/W10K0500/index/qc

各級の問題例
https://webdesk.jsa.or.jp/common/W10K0500/index/qc/qc_mondai

3級・4級のCBT情報
https://webdesk.jsa.or.jp/common/W10K0500/index/qc/qc_cbt

第39回3級試験問題の販売ページ
https://webdesk.jsa.or.jp/books/W11M0100/index/?syohin_cd=350674

著作権について
https://webdesk.jsa.or.jp/common/W10K0030/?page_id=b_j_tyosakuken&post_type=book_common

公式の各級問題例には基準解答が掲載されていません。一方、第39回までの基準解答PDFは公式サイトで公開されていますが、問題本文を公開できないため、正答だけを使って問題集を作ることもしません。

確認結果は `data/policies/qc.json` に機械可読な形で保存しています。再配布の許諾を確認できるまでは、CIが `qc-*` の試験を `data/catalog.json` に登録できないようにします。

## 自動確認と公開

Pull Requestと`main`への変更では、GitHub Actionsが次を自動確認します。

- ディレクトリ構造
- JavaScriptの文法
- catalogとmanifestの参照
- 問題を公開する試験の試験回と問題モジュール
- 四択問題の必須項目
- 正答が選択肢に含まれていること
- 本番データ配下にサンプル・ダミー・生成問題用の名前がないこと
- `metadata-only` の試験が本番問題の試験回を参照していないこと
- 問題利用条件のURLと確認日があること
- 問題ごとの再利用根拠を必須にした試験で、必要な証拠が揃っていること
- `upcoming` の試験に本番問題の試験回が置かれていないこと
- 未実施試験に公式URL、試験方式、科目構成、シラバス状態があること
- 新制度の問題を将来追加するとき、公式の本試験問題であることを明示していること
- QC検定の再配布許諾が確認できない間はQC検定を公開問題カタログへ登録しないこと

`main` の自動確認に成功したコミットだけをGitHub Pagesへ公開し、公開後は本番URLの内容がデプロイ元と一致することも自動確認します。

## 旧ポーカークイズ

置き換え前のポーカークイズは、次のブランチに保存しています。

`archive/poker-raise-quiz-2026-08-28`
