const test = require('node:test');
const assert = require('node:assert/strict');
const Life = require('../dist/slots/slots-life.js');

const now = 1800000000000;
function draws(...values) {
  let count = 0;
  const random = () => {
    assert(count < values.length,'a spin must use only its two outcome/pattern draws');
    return values[count++];
  };
  random.calls = () => count;
  return random;
}
function spinAt(outcome,pattern = .5,map = 'pond') {
  const state = Life.create(now);state.selectedMap = map;
  const random = draws(outcome,pattern), result = Life.spin(state,random,now);
  assert.equal(random.calls(),2);
  return {state,result};
}

test('jackpots occupy exactly one in fifty outcome draws while pair payouts retain their rate',()=>{
  assert.equal(Life.JACKPOT_CHANCE,1/50);
  assert.equal(Life.PAIR_CHANCE,5/12);
  const counts = {triple:0,pair:0,miss:0};
  // Both probabilities are exact multiples of this deterministic partition.
  for (let i=0;i<1500;i++) {
    const {state,result} = spinAt((i+.5)/1500,.5,i%2 ? 'farm' : 'pond');
    counts[result.kind]++;
    assert.deepEqual(Life.evaluate(result.symbols),{kind:result.kind,payout:result.payout});
    assert.equal(state.balance,Life.START-Life.COST+result.payout);
    assert.equal(state.spins,1);
    assert.equal(result.newReward,result.kind === 'triple');
    for (const map of ['pond','farm']) assert.equal(Life.reward(state,map).won,result.kind === 'triple' && result.map === map ? 1 : 0);
  }
  assert.deepEqual(counts,{triple:30,pair:625,miss:845});
});

test('the jackpot and pair thresholds use strict boundaries, including RNG endpoints',()=>{
  const jackpot = Life.JACKPOT_CHANCE, pairEnd = jackpot+Life.PAIR_CHANCE;
  for (const [value,kind] of [[0,'triple'],[jackpot-Number.EPSILON,'triple'],[jackpot,'pair'],[pairEnd-Number.EPSILON,'pair'],[pairEnd,'miss'],[1,'miss']]) {
    assert.equal(spinAt(value).result.kind,kind,'outcome draw '+value);
  }
});

test('each outcome branch samples every valid visible pattern once without a hidden extra prize',()=>{
  const branches = [
    ['triple',Life.JACKPOT_CHANCE/2,6],
    ['pair',Life.JACKPOT_CHANCE+Life.PAIR_CHANCE/2,90],
    ['miss',(1+Life.JACKPOT_CHANCE+Life.PAIR_CHANCE)/2,120]
  ];
  const allPatterns = new Set();
  for (const [kind,outcome,count] of branches) {
    const patterns = new Set();
    for (let i=0;i<count;i++) {
      const {state,result} = spinAt(outcome,(i+.5)/count,'farm');
      assert.equal(result.kind,kind);
      assert.equal(result.symbols.length,3);
      assert(result.symbols.every(symbol => Life.SYMBOLS.some(item => item.id === symbol)));
      assert.equal(Life.evaluate(result.symbols).kind,kind);
      patterns.add(result.symbols.join(','));allPatterns.add(result.symbols.join(','));
      assert.equal(Life.reward(state,'farm').won,kind === 'triple' ? 1 : 0);
      assert.equal(Life.reward(state,'pond').won,0);
    }
    assert.equal(patterns.size,count,kind+' patterns must receive equal-sized buckets');
    assert.equal(spinAt(outcome,0).result.kind,kind);
    assert.deepEqual(spinAt(outcome,1).result.symbols,spinAt(outcome,(count-.5)/count).result.symbols,'an inclusive RNG endpoint clamps to the last valid '+kind+' pattern');
  }
  assert.equal(allPatterns.size,216,'weighting changes probabilities, not the available reel artwork');
});

test('invalid outcome or pattern draws fail before charging or changing funded progress',()=>{
  const invalid = [-1,NaN,Infinity,-Infinity,undefined,1.000001];
  for (const value of invalid) {
    for (const values of [[value,0],[0,value],[.2,value],[.8,value]]) {
      const state = Life.create(now);state.balance = 750;state.spins = 19;state.selectedMap = 'farm';
      const before = JSON.stringify(state);
      assert.throws(()=>Life.spin(state,draws(...values),now),RangeError);
      assert.equal(JSON.stringify(state),before,'invalid draws must preserve the wallet, rewards and last result');
    }
  }
});

test('the fiftieth spin and a reload do not force a jackpot or reset the configured odds',()=>{
  let state = Life.create(now);state.balance = 2000;
  for (let i=0;i<49;i++) assert.equal(Life.spin(state,draws(.8,.5),now).kind,'miss');
  state = Life.decode(JSON.stringify(state),now);
  assert.equal(state.spins,49);
  assert.equal(Life.spin(state,draws(.8,.5),now).kind,'miss');
  assert.equal(state.spins,50);assert.equal(Life.reward(state,'pond').won,0);
  assert.equal(Life.spin(state,draws(0,0),now).kind,'triple');
  assert.equal(state.spins,51);assert.equal(Life.reward(state,'pond').won,1);
});
