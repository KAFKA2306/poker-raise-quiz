import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { calculateRaise, isWithinTolerance } from '../utils/pokerUtils';

const RaiseCalculator = () => {
  const [potSize, setPotSize] = useState('');
  const [currentBet, setCurrentBet] = useState('');
  const [raisePercentage, setRaisePercentage] = useState('');
  const [calculatedRaise, setCalculatedRaise] = useState(null);
  const [userRaise, setUserRaise] = useState('');
  const [feedback, setFeedback] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (potSize && currentBet && raisePercentage) {
      const raise = calculateRaise(Number(potSize), Number(currentBet), Number(raisePercentage));
      setCalculatedRaise(raise);
    }
  }, [potSize, currentBet, raisePercentage]);

  const handleCalculate = () => {
    if (calculatedRaise === null) return;

    const userRaiseNum = Number(userRaise);
    if (isNaN(userRaiseNum)) {
      setFeedback('無効な入力です。数値を入力してください。');
      return;
    }

    const isCorrect = isWithinTolerance(userRaiseNum, calculatedRaise, 5);
    const newFeedback = isCorrect ? '正解です！' : `不正解です。正しい答えは ${calculatedRaise.toFixed(2)} です。`;
    setFeedback(newFeedback);

    const newEntry = {
      potSize: Number(potSize),
      currentBet: Number(currentBet),
      raisePercentage: Number(raisePercentage),
      calculatedRaise,
      userRaise: userRaiseNum,
      isCorrect
    };
    setHistory([newEntry, ...history]);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="potSize">ポットサイズ</Label>
        <Input id="potSize" type="number" value={potSize} onChange={(e) => setPotSize(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="currentBet">現在のベット</Label>
        <Input id="currentBet" type="number" value={currentBet} onChange={(e) => setCurrentBet(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="raisePercentage">レイズ割合 (%)</Label>
        <Input id="raisePercentage" type="number" value={raisePercentage} onChange={(e) => setRaisePercentage(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="userRaise">あなたの回答</Label>
        <Input id="userRaise" type="number" value={userRaise} onChange={(e) => setUserRaise(e.target.value)} />
      </div>
      <Button onClick={handleCalculate}>計算</Button>
      {feedback && <p className="text-lg font-semibold">{feedback}</p>}
      <div>
        <h3 className="text-xl font-bold mb-2">履歴</h3>
        <ul className="space-y-2">
          {history.map((entry, index) => (
            <li key={index} className={`p-2 rounded ${entry.isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
              ポット: {entry.potSize}, ベット: {entry.currentBet}, レイズ%: {entry.raisePercentage}% 
              → 計算値: {entry.calculatedRaise.toFixed(2)}, 回答: {entry.userRaise}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default RaiseCalculator;