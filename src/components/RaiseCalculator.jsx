import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { calculateRaise, isWithinTolerance, generateRandomValues } from '../utils/pokerUtils';

const RaiseCalculator = () => {
  const [gameState, setGameState] = useState({
    potSize: 0,
    currentBet: 0,
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
    const { potSize, currentBet, raisePercentage } = generateRandomValues();
    const calculatedRaise = calculateRaise(potSize, currentBet, raisePercentage);
    const options = generateOptions(calculatedRaise);
    setGameState({ potSize, currentBet, raisePercentage, calculatedRaise, options });
    setSelectedOption('');
    setFeedback('');
  };

  const generateOptions = (correctAnswer) => {
    const options = [correctAnswer];
    while (options.length < 3) {
      const randomOption = correctAnswer * (0.7 + Math.random() * 0.6);
      if (!options.some(option => Math.abs(option - randomOption) < 1)) {
        options.push(randomOption);
      }
    }
    return options.sort(() => Math.random() - 0.5).map(option => option.toFixed(2));
  };

  const handleSubmit = () => {
    if (!selectedOption) return;

    const isCorrect = isWithinTolerance(Number(selectedOption), gameState.calculatedRaise, 5);
    const newFeedback = isCorrect ? '正解です！' : `不正解です。正しい答えは ${gameState.calculatedRaise.toFixed(2)} です。`;
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
        <p>現在のベット: ${gameState.currentBet}</p>
        <p>レイズ割合: {gameState.raisePercentage}%</p>
      </div>
      <div>
        <Label className="text-lg font-semibold">正しいレイズ額を選んでください：</Label>
        <RadioGroup value={selectedOption} onValueChange={setSelectedOption} className="mt-2">
          {gameState.options.map((option, index) => (
            <div key={index} className="flex items-center space-x-2">
              <RadioGroupItem value={option} id={`option-${index}`} />
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
              ポット: ${entry.potSize}, ベット: ${entry.currentBet}, レイズ%: {entry.raisePercentage}% 
              → 正解: ${entry.calculatedRaise.toFixed(2)}, 回答: ${entry.userAnswer.toFixed(2)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RaiseCalculator;
