import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { calculateRaise, isWithinTolerance, generateRandomValues, calculateEffectiveStacks, calculatePosition } from '../utils/pokerUtils';

const RaiseCalculator = () => {
  const [gameState, setGameState] = useState({
    potSize: 0,
    playerBets: [],
    raisePercentage: 0,
    calculatedRaise: 0,
    options: [],
    bigBlind: 0,
    smallBlind: 0,
    effectiveStacks: []
  });
  const [selectedOption, setSelectedOption] = useState('');
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    generateNewProblem();
  }, []);

  const generateNewProblem = () => {
    const { potSize, playerBets, raisePercentage, bigBlind, smallBlind } = generateRandomValues();
    const currentBet = Math.max(...playerBets);
    const calculatedRaise = calculateRaise(potSize, currentBet, raisePercentage);
    const options = generateOptions(calculatedRaise);
    const effectiveStacks = calculateEffectiveStacks(playerBets, bigBlind);
    setGameState({ potSize, playerBets, raisePercentage, calculatedRaise, options, bigBlind, smallBlind, effectiveStacks });
    setSelectedOption('');
    setFeedback('');
  };

  const generateOptions = (correctAnswer) => {
    const options = [Math.round(correctAnswer)];
    while (options.length < 3) {
      const randomOption = Math.round(correctAnswer * (0.9 + Math.random() * 0.2));
      if (!options.includes(randomOption)) {
        options.push(randomOption);
      }
    }
    return options.sort((a, b) => a - b);
  };

  const handleSubmit = () => {
    if (!selectedOption) return;

    const isCorrect = isWithinTolerance(Number(selectedOption), gameState.calculatedRaise, 2);
    const correctAnswer = Math.round(gameState.calculatedRaise);
    const currentBet = Math.max(...gameState.playerBets);
    const totalPot = gameState.potSize + currentBet;
    const calculationExample = `計算例: ${totalPot} (トータルポット) × ${gameState.raisePercentage}% = ${correctAnswer}`;
    const newFeedback = isCorrect 
      ? `正解です！\n${calculationExample}`
      : `不正解です。正しい答えは ${correctAnswer} です。\n${calculationExample}`;
    setFeedback(newFeedback);

    const newEntry = {
      ...gameState,
      userAnswer: Number(selectedOption),
      isCorrect
    };
    setHistory([newEntry, ...history]);
  };

  return (
    <div className="space-y-4">
      <div className="text-lg">
        <p>ブラインド: {gameState.smallBlind}/{gameState.bigBlind}</p>
        <p>ポットサイズ: ${gameState.potSize}</p>
        <p>プレイヤーのベットとスタック:</p>
        <ul className="list-disc list-inside">
          {gameState.playerBets.map((bet, index) => (
            <li key={index}>
              {calculatePosition(index)}: ${bet} (スタック: ${gameState.effectiveStacks[index]})
            </li>
          ))}
        </ul>
        <p>レイズ割合: {gameState.raisePercentage}%</p>
      </div>
      <div>
        <Label className="text-lg font-semibold">正しいレイズ額を選んでください：</Label>
        <RadioGroup value={selectedOption} onValueChange={setSelectedOption} className="mt-2">
          {gameState.options.map((option, index) => (
            <div key={index} className="flex items-center space-x-2">
              <RadioGroupItem value={option.toString()} id={`option-${index}`} />
              <Label htmlFor={`option-${index}`}>${option}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <Button onClick={handleSubmit}>回答する</Button>
      <Button onClick={generateNewProblem}>新しい問題</Button>
      {feedback && <p className="text-lg font-semibold whitespace-pre-line">{feedback}</p>}
      <div>
        <h3 className="text-xl font-bold mb-2">履歴</h3>
        <ul className="space-y-2">
          {history.map((entry, index) => (
            <li key={index} className={`p-2 rounded ${entry.isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
              ブラインド: {entry.smallBlind}/{entry.bigBlind}, ポット: ${entry.potSize}, レイズ%: {entry.raisePercentage}% 
              → 正解: ${Math.round(entry.calculatedRaise)}, 回答: ${entry.userAnswer}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RaiseCalculator;
