const {test}=require('node:test');const assert=require('node:assert/strict');const L=require('../dist/slots/slots-life.js');
test('reels tolerate animation timestamps preceding the spin start',()=>{
 for(const elapsed of [-1000,-110,-.01,0]){const symbols=L.reelSymbols(elapsed);assert.equal(symbols.length,3);assert(symbols.every(id=>L.SYMBOLS.some(s=>s.id===id)));assert.deepEqual(symbols,L.reelSymbols(0))}
});
test('reel frames stay valid at frame boundaries and after a background delay',()=>{
 for(const elapsed of [109.99,110,2099,2100,600000,NaN,Infinity])assert(L.reelSymbols(elapsed).every(id=>L.SYMBOLS.some(s=>s.id===id)));
 assert.notDeepEqual(L.reelSymbols(0),L.reelSymbols(110));
});
