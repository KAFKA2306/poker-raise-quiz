export const calculateRaise = (potSize, currentBet, raisePercentage) => {
  const totalPot = potSize + currentBet;
  return (totalPot * raisePercentage) / 100;
};

export const isWithinTolerance = (userValue, correctValue, tolerancePercentage) => {
  const tolerance = (correctValue * tolerancePercentage) / 100;
  return Math.abs(userValue - correctValue) <= tolerance;
};