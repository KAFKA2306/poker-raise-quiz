# One-tap Quiz

https://kafka2306.github.io/poker-raise-quiz/

四択を1回タップするだけの、タブレット向けクイズです。回答直後に正誤と正答を表示し、回答済み状態をブラウザへ保存します。回答履歴はChatGPT向けに一括コピーできます。

## 収録問題

応用情報技術者試験の午前問題を、2015年度春期から2025年度秋期まで収録します。2020年度春期は試験中止のためありません。

- 21試験回
- 各回80問
- 合計1680問
- 1モジュール20問
- 1試験回4モジュール

画面上部の「試験回」から21回を切り替えられます。既定は2025年度秋期です。図表がある問題は図表も表示します。

問題文・選択肢・図表の入力補助には次の公開データを使います。

https://github.com/sk0517/oyojoho_am

入力は次のcommitへ固定しています。

7ee871e613b4f1013c12935b16f6725bd2c6a120

ただし、この外部リポジトリを正準にはしません。第三者が作成した解説、難易度、重要度、タグは取り込みません。正答はIPA公式の解答PDFと照合し、各問題には試験回と問題番号を含む出典表記を付けます。

IPA 過去問題
https://www.ipa.go.jp/shiken/mondai-kaiotu/index.html

IPA 試験問題・解答例の利用条件
https://www.ipa.go.jp/shiken/faq.html

`sk0517/ExamPractice` の400問は上記1680問に含まれるため二重登録しません。

https://github.com/sk0517/ExamPractice

`sk0517/PmExam` は応用情報の午後問題231問ですが、記述式を含むため、現在の四択UIへ無理に変換しません。

https://github.com/sk0517/PmExam

棚卸し結果は `data/sources/sk0517-repositories.json` に保存しています。

## データ生成

1680問を手で管理しません。`data/sources/ap-morning-import.json` を入力契約として、`scripts/prepare-data.mjs` が試験回ごとのmanifest、20問単位のJSON、図表を生成します。

```text
data/
  catalog.json
  sources/
    ap-morning-import.json
    sk0517-repositories.json
  policies/
    qc.json
  exams/
    applied-information/
      manifest.json
      sessions/
        <試験回>/
          manifest.json
          modules/
            q001-q020.json
            q021-q040.json
            q041-q060.json
            q061-q080.json
          assets/
    professional-digital-skills/
      management/manifest.json
      data-ai/manifest.json
      system/manifest.json
web/
  index.html
  css/app.css
  js/
    main.js
    quiz/
      data.js
      session.js
      export.js
scripts/
  prepare-data.mjs
  validate.mjs
  verify-pages.mjs
.github/workflows/
  ci.yml
  pages.yml
```

ローカルで同じデータを再生成して確認する場合は、Popplerの `pdftotext` が必要です。

```bash
node scripts/prepare-data.mjs
node scripts/validate.mjs
```

## 2027年度の新しい高度試験

IPAは2027年度から新試験制度へ移行し、現在の応用情報技術者試験と高度試験を再編した次の3区分を新設する予定です。

- プロフェッショナルデジタルスキル（マネジメント）試験（仮称）
- プロフェッショナルデジタルスキル（データ・AI）試験（仮称）
- プロフェッショナルデジタルスキル（システム）試験（仮称）

2026年8月28日時点では本試験前なので、3区分とも `status: upcoming` として管理し、本番問題は収録していません。サンプル問題も本番問題としては収録しません。

制度見直し
https://www.ipa.go.jp/shiken/minaoshi/index.html

試験構成と開始予定
https://www.ipa.go.jp/shiken/syllabus/henkou/2025/20260331.html

新制度のサンプル問題
https://www.ipa.go.jp/shiken/syllabus/henkou/2026/20260622.html

新制度のシラバス案
https://www.ipa.go.jp/shiken/syllabus/henkou/2026/20260630.html

## QC検定

品質管理検定（QC検定）は、2026年8月28日時点では公開問題集として収録しません。日本規格協会が試験問題・基準解答のコピーやホームページなどへの掲載・公開を断っているためです。確認結果は `data/policies/qc.json` に保存し、再配布の許諾を確認できるまではCIがQC検定を公開問題カタログへ登録できないようにします。

公式情報
https://webdesk.jsa.or.jp/common/W10K0500/index/qc

各級の問題例
https://webdesk.jsa.or.jp/common/W10K0500/index/qc/qc_mondai

3級・4級のCBT情報
https://webdesk.jsa.or.jp/common/W10K0500/index/qc/qc_cbt

著作権について
https://webdesk.jsa.or.jp/common/W10K0030/?page_id=b_j_tyosakuken&post_type=book_common

## 自動確認と公開

Pull Requestと`main`への変更では、GitHub Actionsが次を自動確認します。

- 応用情報21回・1680問を再生成できること
- 各回が80問、20問×4モジュールであること
- 問1〜80が重複なく揃うこと
- 正答がア・イ・ウ・エの選択肢に含まれること
- IPA公式の問題PDF・解答PDF・試験回ページを追跡できること
- 問題ごとに出典表記があること
- 参照する図表が実在すること
- 第三者の解説・難易度・重要度・タグを本番問題へ混ぜていないこと
- サンプル、ダミー、生成問題を本番問題として置いていないこと
- `upcoming` の試験に本番問題を置いていないこと
- QC検定の再配布許諾がない間は公開問題カタログへ登録しないこと

`main` の自動確認に成功したコミットだけをGitHub Pagesへ公開します。公開後は `web/` と生成済み `data/` の全ファイルを本番URLから再取得し、バイナリ一致まで確認します。

## 旧ポーカークイズ

置き換え前のポーカークイズは次のブランチに保存しています。

`archive/poker-raise-quiz-2026-08-28`
