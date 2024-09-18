export const calculateRaise = (potSize, currentBet, raisePercentage) => {
  const totalPot = potSize + currentBet;
  return (totalPot * raisePercentage) / 100;
};

export const isWithinTolerance = (userValue, correctValue, tolerancePercentage) => {
  const tolerance = (correctValue * tolerancePercentage) / 100;
  return Math.abs(userValue - correctValue) <= tolerance;
};

export const generateRandomValues = () => {
  const potSize = Math.floor(Math.random() * 1000) + 100; // 100 to 1099
  const currentBet = Math.floor(Math.random() * (potSize / 2)) + 10; // 10 to half of potSize
  const raisePercentage = Math.floor(Math.random() * 75) + 25; // 25% to 100%
  return { potSize, currentBet, raisePercentage };
};
