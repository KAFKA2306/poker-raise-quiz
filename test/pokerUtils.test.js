import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateRaiseState,
  generateRaiseOptions,
  isLegalRaiseTo,
} from '../src/utils/pokerUtils.js';

test('unopened preflop applies the big blind as the minimum opening increment', () => {
  const result = calculateRaiseState({
    potBeforeAction: 150,
    heroCommitted: 0,
    currentBet: 0,
    lastRaiseIncrement: 100,
    raisePercentage: 50,
    heroStack: 10000,
    chipUnit: 50,
  });

  assert.deepEqual(result, {
    callAmount: 0,
    potAfterCall: 150,
    minimumRaiseTo: 100,
    recommendedRaiseTo: 100,
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

test('postflop raise never falls below the last full raise increment', () => {
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

test('short stack that cannot make a minimum raise is not offered a raise', () => {
  const result = calculateRaiseState({
    potBeforeAction: 1000,
    heroCommitted: 100,
    currentBet: 500,
    lastRaiseIncrement: 400,
    raisePercentage: 100,
    heroStack: 850,
    chipUnit: 50,
  });

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
