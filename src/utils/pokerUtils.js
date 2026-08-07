export const POSITIONS = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const roundToChip = (value, chipUnit = 1) => Math.round(value / chipUnit) * chipUnit;
const pick = (values, rng) => values[Math.floor(rng() * values.length)];

export const deriveTableState = ({ players, heroIndex }) => {
  const hero = players[heroIndex];
  if (!hero || !hero.isHero || hero.folded) {
    throw new Error('hero must reference an active hero player');
  }

  const activePlayers = players.filter((player) => !player.folded);
  const activeOpponents = activePlayers.filter((player) => !player.isHero);
  const currentBet = Math.max(0, ...activePlayers.map((player) => player.committed));
  const contributedPot = players.reduce((sum, player) => sum + player.committed, 0);
  const deepestOpponentStack = Math.max(0, ...activeOpponents.map((player) => player.stack));
  const heroEffectiveStack = activeOpponents.length > 0
    ? Math.min(hero.stack, deepestOpponentStack)
    : hero.stack;

  return {
    hero,
    activePlayers: activePlayers.length,
    currentBet,
    contributedPot,
    heroEffectiveStack,
  };
};

export const calculateRaiseState = ({
  potBeforeAction,
  heroCommitted,
  currentBet,
  lastRaiseIncrement,
  raisePercentage,
  heroStack,
  heroEffectiveStack,
  chipUnit = 1,
}) => {
  const maximumRaiseTo = heroEffectiveStack ?? heroStack;
  const callAmount = Math.max(0, currentBet - heroCommitted);
  const potAfterCall = potBeforeAction + callAmount;
  const minimumRaiseTo = currentBet === 0
    ? Math.max(lastRaiseIncrement, chipUnit)
    : currentBet + Math.max(lastRaiseIncrement, chipUnit);
  const requestedIncrement = roundToChip(
    potAfterCall * (raisePercentage / 100),
    chipUnit,
  );
  const requestedRaiseTo = Math.max(minimumRaiseTo, currentBet + requestedIncrement);
  const recommendedRaiseTo = Math.min(maximumRaiseTo, requestedRaiseTo);
  const canRaise = maximumRaiseTo >= minimumRaiseTo && recommendedRaiseTo > currentBet;

  return {
    callAmount,
    potAfterCall,
    minimumRaiseTo,
    maximumRaiseTo,
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

export const generateRandomValues = (rng = Math.random) => {
  const blindLevels = [50, 100, 200, 400, 800, 1600, 3200];
  const bigBlind = pick(blindLevels, rng);
  const smallBlind = bigBlind / 2;
  const heroIndex = Math.floor(rng() * POSITIONS.length);
  const scenarioType = pick(['unopened_preflop', 'facing_open_preflop', 'postflop_bet'], rng);
  const raisePercentage = pick([50, 75, 100, 125, 150], rng);

  const players = POSITIONS.map((position, index) => {
    const isHero = index === heroIndex;
    return {
      position,
      isHero,
      folded: !isHero && rng() < 0.3,
      committed: 0,
      stack: pick([40, 60, 80, 100], rng) * bigBlind,
    };
  });

  const opponentIndices = POSITIONS
    .map((_, index) => index)
    .filter((index) => index !== heroIndex);
  const forcedOpponentIndex = pick(opponentIndices, rng);
  players[forcedOpponentIndex].folded = false;

  let lastRaiseIncrement = bigBlind;
  let basePot = 0;

  if (scenarioType === 'postflop_bet') {
    const betSize = pick([2, 3, 4], rng) * bigBlind;
    players[forcedOpponentIndex].committed = betSize;
    lastRaiseIncrement = betSize;
    basePot = pick([4, 6, 8], rng) * bigBlind;
  } else {
    const smallBlindIndex = POSITIONS.indexOf('SB');
    const bigBlindIndex = POSITIONS.indexOf('BB');
    players[smallBlindIndex].committed = smallBlind;
    players[bigBlindIndex].committed = bigBlind;
    players[bigBlindIndex].folded = false;

    if (scenarioType === 'facing_open_preflop') {
      const openSize = pick([2, 2.5, 3], rng) * bigBlind;
      players[forcedOpponentIndex].committed = openSize;
      lastRaiseIncrement = openSize - bigBlind;
    } else if (heroIndex === bigBlindIndex) {
      players[forcedOpponentIndex].committed = bigBlind;
    }
  }

  const tableState = deriveTableState({ players, heroIndex });
  const hero = tableState.hero;
  const potBeforeAction = basePot + tableState.contributedPot;

  return {
    scenarioType,
    bigBlind,
    smallBlind,
    heroIndex,
    heroPosition: hero.position,
    heroCommitted: hero.committed,
    heroStack: hero.stack,
    heroEffectiveStack: tableState.heroEffectiveStack,
    currentBet: tableState.currentBet,
    lastRaiseIncrement,
    activePlayers: tableState.activePlayers,
    potBeforeAction,
    raisePercentage,
    players,
  };
};

export const calculatePosition = (index) => POSITIONS[index];
