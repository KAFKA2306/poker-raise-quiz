# AGENTS.md

## 正本

- 公開対象: `data/catalog.json`
- 問題データ: `data/exams/`
- 共通UI: `web/`
- 共通検証: `scripts/validate.mjs`
- CI/CD: `.github/workflows/ci.yml` と `.github/workflows/pages.yml`

README、Issue、過去の説明より現在のデータ・実装・workflowを優先する。

## ルール

- 公開するのは、実際に回答できる本番問題データがある試験だけとする。
- synthetic、fixture、placeholder、未収録試験のメタデータだけを本番データとして置かない。
- 試験名、年度、問題数などのauthorityをWeb側へ重複して直書きしない。正準データから読む。
- 試験ごとの個別検証scriptを増やさない。必要な検証は共通validatorへ統合する。
- 読み込み失敗や不整合を別データへのfallbackで隠さない。明示的に失敗させる。
- broad exception、空catch、根拠のないdefaultで失敗を成功扱いにしない。
- コメントはコードから分からない理由や外部仕様だけに使う。処理内容の言い換えは書かない。
- 未使用・重複を実参照で確認できた場合は残さず削除する。

## 検証

変更後は最低限、共通validatorを実行する。

```bash
node scripts/validate.mjs
```

Pull Requestでは変更したhead SHAのCI成功を確認する。merge後は`main`を読み返す。公開物に影響する変更はGitHub Pagesの実URLを確認し、デプロイ元と本番の不一致、取得失敗、表示失敗を成功扱いにしない。

## 完了条件

1. 共通validatorが成功する。
2. PR head SHAのCIが成功する。
3. merge後の`main`に変更が存在する。
4. 公開物に影響する場合、GitHub Pagesで実際に動作する。
5. 古い説明、重複データ、one-off scriptを残していない。

確認できない項目は`UNVERIFIED`とする。
