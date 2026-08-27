# One-tap Quiz

静かなタブレット向け四択クイズです。操作は選択肢を1回タップするだけです。

- タップ直後に正誤と正答を表示
- 回答済み問題はブラウザに保存して再読込後も復元
- 保存済みの全回答をChatGPT向けMarkdownとして一括コピー
- `data/questions.json` を差し替えるだけで別テーマに再利用
- ビルド工程、バックエンド、ログインは不要

## Open

GitHub Pagesなど、任意の静的HTTP配信でそのまま動きます。ビルドは不要です。

## Question data

正準問題データは [`data/questions.json`](data/questions.json) です。通常の四択は SurveyJS の `radiogroup` と `correctAnswer` を使います。

```json
{
  "type": "radiogroup",
  "name": "q001",
  "title": "Question text",
  "choices": [
    { "value": "A", "text": "Choice A" },
    { "value": "B", "text": "Choice B" }
  ],
  "correctAnswer": "B",
  "explanation": "Optional explanation",
  "source": "Optional source"
}
```

`explanation` と `source` は任意です。問題内容や正答を変更したときは `dataset.version` も更新すると、以前の回答キャッシュと分離できます。

問題本文はブラウザ保存しません。ブラウザには問題ID・ユーザー回答・正誤だけを保存します。

## Previous poker trainer

旧ポーカートレーナーは `archive/poker-raise-quiz-2026-08-28` ブランチに保存しています。
