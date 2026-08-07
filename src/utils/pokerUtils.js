export const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const roundToChip = (value, chipUnit = 1) => Math.round(value / chipUnit) * chipUnit;

export const calculateRaiseState = ({
  potBeforeAction,
  heroCommitted,
  currentBet,
  lastRaiseIncrement,
  raisePercentage,
  heroStack,
  chipUnit = 1,
}) => {
  const callAmount = Math.max(0, currentBet - heroCommitted);
  const potAfterCall = potBeforeAction + callAmount;
  const minimumRaiseTo = currentBet === 0
    ? Math.max(lastRaiseIncrement, chipUnit)
    : currentBet + Math.max(lastRaiseIncrement, chipUnit);
  const requestedIncrement = roundToChip(
    potAfterCall * (raisePercentage / 100),
    chipUnit,
  );
  const recommendedRaiseTo = Math.min(
    heroStack,
    Math.max(minimumRaiseTo, currentBet + requestedIncrement),
  );
  const canRaise = heroStack >= minimumRaiseTo && recommendedRaiseTo > currentBet;

  return {
    callAmount,
    potAfterCall,
    minimumRaiseTo,
    recommendedRaiseTo: canRaise ? recommendedRaiseTo : null,
    canRaise,
  };
};

export const isLegalRaiseTo = ({
  raiseTo,
  currentBet,
  minimumRaiseTo,
  heroStack,
}) => (
  Number.isFinite(raiseTo)
  && raiseTo > currentBet
  && raiseTo >= minimumRaiseTo
  && raiseTo <= heroStack
);

export const generateRaiseOptions = ({
  correctRaiseTo,
  currentBet,
  minimumRaiseTo,
  heroStack,
  chipUnit = 1,
}) => {
  if (correctRaiseTo === null) return [];

  const candidates = [
    minimumRaiseTo,
    correctRaiseTo,
    roundToChip(correctRaiseTo * 1.25, chipUnit),
    roundToChip((minimumRaiseTo + correctRaiseTo) / 2, chipUnit),
  ];

  return [...new Set(candidates)]
    .filter((raiseTo) => isLegalRaiseTo({
      raiseTo,
      currentBet,
      minimumRaiseTo,
      heroStack,
    }))
    .sort((a, b) => a - b)
    .slice(0, 3);
};

const pick = (values, rng) => values[Math.floor(rng() * values.length)];

export const generateRandomValues = (rng = Math.random) => {
  const blindLevels = [50, 100, 200, 400, 800, 1600, 3200];
  const bigBlind = pick(blindLevels, rng);
  const smallBlind = bigBlind / 2;
  const heroIndex = Math.floor(rng() * POSITIONS.length);
  const openSizes = [0, 2, 2.5, 3];
  const openSize = pick(openSizes, rng) * bigBlind;
  const lastRaiseIncrement = openSize === 0 ? bigBlind : Math.max(bigBlind, openSize - bigBlind);
  const raisePercentage = pick([50, 75, 100, 125, 150], rng);

  const players = POSITIONS.map((position, index) => {
    const isHero = index === heroIndex;
    const folded = !isHero && rng() < 0.3;
    const committed = isHero
      ? pick([0, smallBlind, bigBlind], rng)
      : (folded ? 0 : pick([0, bigBlind, openSize], rng));
    const stack = Math.max(committed + 20 * bigBlind, pick([40, 60, 80, 100], rng) * bigBlind);
    return { position, isHero, folded, committed, stack };
  });

  const activePlayers = players.filter((player) => !player.folded);
  const currentBet = Math.max(0, ...activePlayers.map((player) => player.committed));
  const hero = players[heroIndex];
  const potBeforeAction = activePlayers.reduce((sum, player) => sum + player.committed, 0)
    + pick([2, 3, 4], rng) * bigBlind;

  return {
    bigBlind,
    smallBlind,
    heroIndex,
    heroPosition: hero.position,
    heroCommitted: hero.committed,
    heroStack: hero.stack,
    currentBet,
    lastRaiseIncrement,
    activePlayers: activePlayers.length,
    potBeforeAction,
    raisePercentage,
    players,
  };
};

export const calculatePosition = (index) => POSITIONS[index];
