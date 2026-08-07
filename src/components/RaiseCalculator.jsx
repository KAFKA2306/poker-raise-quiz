import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  calculateRaiseState,
  generateRaiseOptions,
  generateRandomValues,
} from '../utils/pokerUtils';

const RaiseCalculator = () => {
  const [gameState, setGameState] = useState(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    generateNewProblem();
  }, []);

  const generateNewProblem = () => {
    const scenario = generateRandomValues();
    const calculation = calculateRaiseState(scenario);
    const options = generateRaiseOptions({
      correctRaiseTo: calculation.recommendedRaiseTo,
      currentBet: scenario.currentBet,
      minimumRaiseTo: calculation.minimumRaiseTo,
      heroStack: scenario.heroStack,
      chipUnit: scenario.smallBlind,
    });

    setGameState({ ...scenario, ...calculation, options });
    setSelectedOption('');
    setFeedback('');
  };

  const handleSubmit = () => {
    if (!selectedOption || !gameState) return;

    const userAnswer = Number(selectedOption);
    const isCorrect = userAnswer === gameState.recommendedRaiseTo;
    setFeedback(
      isCorrect
        ? '正解です！'
        : `不正解です。正しいraise-to額は ${gameState.recommendedRaiseTo} です。`,
    );
    setHistory([{ ...gameState, userAnswer, isCorrect }, ...history]);
  };

  if (!gameState) return null;

  return (
    <div className="space-y-4">
      <div className="text-lg">
        <p>ブラインド: {gameState.smallBlind}/{gameState.bigBlind}</p>
        <p>アクション前ポット: {gameState.potBeforeAction}</p>
        <p>ヒーロー: {gameState.heroPosition}（投入済み {gameState.heroCommitted} / スタック上限 {gameState.heroStack}）</p>
        <p>現在ベット: {gameState.currentBet}</p>
        <p>直前レイズ増分: {gameState.lastRaiseIncrement}</p>
        <p>アクティブ人数: {gameState.activePlayers}</p>
        <ul className="list-disc list-inside">
          {gameState.players.map((player) => (
            <li key={player.position}>
              {player.position}: {player.folded ? 'folded' : `${player.committed} 投入`} / stack {player.stack}
              {player.isHero ? '（Hero）' : ''}
            </li>
          ))}
        </ul>
        <p>コール額: {gameState.callAmount}</p>
        <p>コール後ポット: {gameState.potAfterCall}</p>
        <p>最小raise-to: {gameState.minimumRaiseTo}</p>
        <p>推奨割合: {gameState.raisePercentage}%</p>
      </div>
      <div>
        <Label className="text-lg font-semibold">合法なraise-to額を選んでください：</Label>
        <RadioGroup value={selectedOption} onValueChange={setSelectedOption} className="mt-2">
          {gameState.options.map((option, index) => (
            <div key={option} className="flex items-center space-x-2">
              <RadioGroupItem value={option.toString()} id={`option-${index}`} />
              <Label htmlFor={`option-${index}`}>{option}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <Button onClick={handleSubmit}>回答する</Button>
      <Button onClick={generateNewProblem}>新しい問題</Button>
      {feedback && <p className="text-lg font-semibold">{feedback}</p>}
      <div>
        <h3 className="text-xl font-bold mb-2">履歴</h3>
        <ul className="space-y-2">
          {history.map((entry, index) => (
            <li key={index} className={`p-2 rounded ${entry.isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
              {entry.heroPosition}: call {entry.callAmount}, minimum {entry.minimumRaiseTo},
              正解 {entry.recommendedRaiseTo}, 回答 {entry.userAnswer}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RaiseCalculator;
