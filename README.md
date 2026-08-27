# One-tap Quiz

https://kafka2306.github.io/poker-raise-quiz/

四択を1回タップするだけの静かな資格クイズです。画面上部の試験選択は `data/catalog.json` と各manifestから生成し、試験名や年度をWebコードへ直接書きません。

## 収録状況

- 応用情報技術者試験：2025年度秋期 午前 問44〜53を収録。400問化はIssue #16で進める。
- G検定：JDLA公式公開Q1〜Q20に対応する回答シートを収録。公式問題文・選択肢本文は転載しない。
- 統計検定2級：CBT過去問を転載せず、公式試験情報だけを表示する。
- 品質管理検定（QC検定）：再配布許諾を確認できないため公開問題集には登録しない。判断は `data/policies/qc.json` に保存する。
- 2027年度プロフェッショナルデジタルスキル試験3区分：本試験前のため公式メタデータだけを表示する。

## G検定

G検定は、JDLA公式ページで問題文を読み、このサイトの同じQ番号でA〜Dを回答する方式です。

https://www.jdla.org/certificate/general/issues/

リポジトリに保存するのはQ1〜Q20との対応、正答、分野、元の開催回、JDLA公式URLだけです。問題文と選択肢本文は保存しません。また、この20問は1回分の本試験として扱いません。

JDLAの過去問無断利用に関する告知
https://www.jdla.org/news/%E3%80%90%E3%81%8A%E7%9F%A5%E3%82%89%E3%81%9B%E3%80%91g%E6%A4%9C%E5%AE%9A%E9%81%8E%E5%8E%BB%E5%95%8F%E3%81%AE%E7%84%A1%E6%96%AD%E8%B2%A9%E5%A3%B2%E3%81%8A%E3%82%88%E3%81%B3%E3%81%9D%E3%81%AE%E5%AF%BE/

## 応用情報技術者試験

本番問題はIPA公式問題冊子・解答例を正準とします。第三者の解説文、自作問題、生成問題は本番データへ入れません。

2025年度秋期 問題冊子
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_qs.pdf

2025年度秋期 解答例
https://www.ipa.go.jp/shiken/mondai-kaiotu/nl10bi0000009lh8-att/2025r07a_ap_am_ans.pdf

## 統計検定2級

統計検定2級は `contentMode: "metadata-only"` です。CBT過去問は公式サイトで公開されていないため、問題本文をGitHub Pagesへ掲載しません。

https://www.toukei-kentei.jp/grade/grade2/
https://www.toukei-kentei.jp/faq
https://www.toukei-kentei.jp/preparation/kakomon/

## QC検定

QC検定は再配布許諾を確認できないため `data/catalog.json` へ登録しません。公式確認結果は `data/policies/qc.json` を正準とします。

https://webdesk.jsa.or.jp/common/W10K0500/index/qc
https://webdesk.jsa.or.jp/common/W10K0500/index/qc/qc_mondai
https://webdesk.jsa.or.jp/common/W10K0500/index/qc/qc_cbt

## 2027年度の新しい高度試験

3区分とも `status: upcoming` として管理し、本番問題は収録しません。

https://www.ipa.go.jp/shiken/minaoshi/index.html
https://www.ipa.go.jp/shiken/syllabus/henkou/2025/20260331.html
https://www.ipa.go.jp/shiken/syllabus/henkou/2026/20260622.html
https://www.ipa.go.jp/shiken/syllabus/henkou/2026/20260630.html

## 自動確認と公開

Pull Requestと`main`で構造・JavaScript・manifest・問題データ・公開可否を検査します。G検定は専用検査で20問、Q1〜Q20、公式正答、A〜Dだけの回答欄、転載防止メタデータを確認します。

`main` の自動確認に成功したコミットだけをGitHub Pagesへ公開します。公開後は `web/` と `data/` の全ファイルを本番URLから取得し、デプロイ元と完全一致することも確認します。

## 構造

```text
web/                    # 共通画面
data/catalog.json       # 試験一覧
data/exams/             # 試験・試験回・問題モジュール
data/policies/          # 公開可否の確認結果
scripts/validate.mjs    # 共通検査
scripts/validate-g-test.mjs
scripts/verify-pages.mjs
.github/workflows/      # CI/CD
```

旧ポーカークイズは `archive/poker-raise-quiz-2026-08-28` ブランチに保存しています。
