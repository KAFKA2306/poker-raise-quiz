import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POSITIONS,
  calculateRaiseState,
  deriveTableState,
  generateRaiseOptions,
  generateRandomValues,
  isLegalRaiseTo,
} from '../src/utils/pokerUtils.js';

test('unopened preflop treats the big blind as the live bet and requires at least a 2BB raise-to', () => {
  const result = calculateRaiseState({
    potBeforeAction: 150,
    heroCommitted: 0,
    currentBet: 100,
    lastRaiseIncrement: 100,
    raisePercentage: 25,
    heroStack: 10000,
    chipUnit: 50,
  });

  assert.deepEqual(result, {
    callAmount: 100,
    potAfterCall: 250,
    minimumRaiseTo: 200,
    maximumRaiseTo: 10000,
    recommendedRaiseTo: 200,
    canRaise: true,
  });
});

test('three-bet fixture separates call amount, post-call pot, minimum and recommended raise-to', () => {
  const result = calculateRaiseState({
    potBeforeAction: 750,
    heroCommitted: 100,
    currentBet: 300,
    lastRaiseIncrement: 200,
    raisePercentage: 75,
    heroStack: 10000,
    chipUnit: 50,
  });

  assert.equal(result.callAmount, 200);
  assert.equal(result.potAfterCall, 950);
  assert.equal(result.minimumRaiseTo, 500);
  assert.equal(result.recommendedRaiseTo, 1000);
});

test('postflop raise never falls below the last full bet increment', () => {
  const result = calculateRaiseState({
    potBeforeAction: 1200,
    heroCommitted: 0,
    currentBet: 400,
    lastRaiseIncrement: 400,
    raisePercentage: 25,
    heroStack: 5000,
    chipUnit: 50,
  });

  assert.equal(result.minimumRaiseTo, 800);
  assert.equal(result.recommendedRaiseTo, 800);
});

test('short effective stack that cannot make a minimum raise is not offered a raise', () => {
  const result = calculateRaiseState({
    potBeforeAction: 1000,
    heroCommitted: 100,
    currentBet: 500,
    lastRaiseIncrement: 400,
    raisePercentage: 100,
    heroStack: 2000,
    heroEffectiveStack: 850,
    chipUnit: 50,
  });

  assert.equal(result.maximumRaiseTo, 850);
  assert.equal(result.canRaise, false);
  assert.equal(result.recommendedRaiseTo, null);
});

test('all generated options are legal raise-to values', () => {
  const options = generateRaiseOptions({
    correctRaiseTo: 1200,
    currentBet: 400,
    minimumRaiseTo: 800,
    heroStack: 1500,
    chipUnit: 50,
  });

  assert.ok(options.includes(1200));
  assert.ok(options.every((raiseTo) => isLegalRaiseTo({
    raiseTo,
    currentBet: 400,
    minimumRaiseTo: 800,
    heroStack: 1500,
  })));
});

test('folded chips stay in the pot but folded players do not set current bet or effective stack', () => {
  const players = [
    { position: 'UTG', isHero: true, folded: false, committed: 100, stack: 5000 },
    { position: 'MP', isHero: false, folded: true, committed: 300, stack: 10000 },
    { position: 'CO', isHero: false, folded: false, committed: 200, stack: 3000 },
  ];

  const state = deriveTableState({ players, heroIndex: 0 });

  assert.equal(state.currentBet, 200);
  assert.equal(state.contributedPot, 600);
  assert.equal(state.activePlayers, 2);
  assert.equal(state.heroEffectiveStack, 3000);
});

test('random generator can create an uncommitted hero while keeping a legal live preflop blind', () => {
  const scenario = generateRandomValues(() => 0);

  assert.ok(POSITIONS.includes(scenario.heroPosition));
  assert.equal(scenario.scenarioType, 'unopened_preflop');
  assert.equal(scenario.heroCommitted, 0);
  assert.equal(scenario.currentBet, scenario.bigBlind);
  assert.equal(scenario.lastRaiseIncrement, scenario.bigBlind);
  assert.ok(scenario.players.some((player) => player.folded));
});
