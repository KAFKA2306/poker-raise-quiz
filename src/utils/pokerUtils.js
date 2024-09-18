export const calculateRaise = (potSize, currentBet, raisePercentage) => {
  const totalPot = potSize + currentBet;
  return (totalPot * raisePercentage) / 100;
};

export const isWithinTolerance = (userValue, correctValue, tolerancePercentage) => {
  const tolerance = (correctValue * tolerancePercentage) / 100;
  return Math.abs(userValue - correctValue) <= tolerance;
};

export const generateRandomValues = () => {
  const blindLevels = [50, 100, 200, 400, 800, 1600, 3200];
  const bigBlind = blindLevels[Math.floor(Math.random() * blindLevels.length)];
  const smallBlind = bigBlind / 2;

  const potMultipliers = [3, 4, 5, 6, 7, 8];
  const potSize = bigBlind * potMultipliers[Math.floor(Math.random() * potMultipliers.length)];

  const playerBets = Array(6).fill(0).map(() => {
    const betMultipliers = [1, 1.5, 2, 2.5, 3];
    return bigBlind * betMultipliers[Math.floor(Math.random() * betMultipliers.length)];
  });

  const raisePercentages = [50, 75, 100, 125, 150];
  const raisePercentage = raisePercentages[Math.floor(Math.random() * raisePercentages.length)];

  return { potSize, playerBets, raisePercentage, bigBlind, smallBlind };
};

export const calculateEffectiveStacks = (playerBets, bigBlind) => {
  return playerBets.map(bet => {
    const minStack = bet * 5; // Minimum 5x the bet
    const maxStack = bet * 200; // Maximum 200x the bet
    return Math.round((Math.random() * (maxStack - minStack) + minStack) / bigBlind) * bigBlind;
  });
};

export const calculatePosition = (index) => {
  const positions = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
  return positions[index];
};
