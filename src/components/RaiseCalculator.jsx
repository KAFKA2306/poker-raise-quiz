import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { calculateRaise, isWithinTolerance, generateRandomValues } from '../utils/pokerUtils';

const RaiseCalculator = () => {
  const [gameState, setGameState] = useState({
    potSize: 0,
    playerBets: [],
    raisePercentage: 0,
    calculatedRaise: 0,
    options: []
  });
  const [selectedOption, setSelectedOption] = useState('');
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    generateNewProblem();
  }, []);

  const generateNewProblem = () => {
    const { potSize, playerBets, raisePercentage } = generateRandomValues();
    const currentBet = Math.max(...playerBets);
    const calculatedRaise = calculateRaise(potSize, currentBet, raisePercentage);
    const options = generateOptions(calculatedRaise);
    setGameState({ potSize, playerBets, raisePercentage, calculatedRaise, options });
    setSelectedOption('');
    setFeedback('');
  };

  const generateOptions = (correctAnswer) => {
    const options = [Math.round(correctAnswer)];
    while (options.length < 3) {
      const randomOption = Math.round(correctAnswer * (0.7 + Math.random() * 0.6));
      if (!options.includes(randomOption)) {
        options.push(randomOption);
      }
    }
    return options.sort((a, b) => a - b);
  };

  const handleSubmit = () => {
    if (!selectedOption) return;

    const isCorrect = isWithinTolerance(Number(selectedOption), gameState.calculatedRaise, 5);
    const newFeedback = isCorrect ? '正解です！' : `不正解です。正しい答えは ${Math.round(gameState.calculatedRaise)} です。`;
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
        <p>ポットサイズ: ${gameState.potSize}</p>
        <p>プレイヤーのベット:</p>
        <ul className="list-disc list-inside">
          {gameState.playerBets.map((bet, index) => (
            <li key={index}>プレイヤー{index + 1}: ${bet}</li>
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
      {feedback && <p className="text-lg font-semibold">{feedback}</p>}
      <div>
        <h3 className="text-xl font-bold mb-2">履歴</h3>
        <ul className="space-y-2">
          {history.map((entry, index) => (
            <li key={index} className={`p-2 rounded ${entry.isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
              ポット: ${entry.potSize}, ベット: ${entry.playerBets.join(', ')}, レイズ%: {entry.raisePercentage}% 
              → 正解: ${Math.round(entry.calculatedRaise)}, 回答: ${entry.userAnswer}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RaiseCalculator;
