const {test}=require('node:test');const assert=require('node:assert/strict');
const S=require('../dist/slots/slots-life.js'),K=require('../dist/dumplings/kitchen-life.js');
const now=new Date(2026,9,7,12).getTime();
function memory(){const data=new Map();return{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v)}}
function setup(coins=0,balance=200){const storage=memory(),k=K.create(),s=S.create(now);k.shop.coins=coins;k.shop.sales=coins/3;s.balance=balance;storage.setItem(K.KEY,JSON.stringify(k));storage.setItem(S.KEY,JSON.stringify(s));return{storage,k,s}}
const wallet=storage=>S.decode(storage.getItem(S.KEY),now),shop=storage=>S.kitchenWallet(storage,K,now),buy=storage=>S.buyKitchenSeeds(storage,K,10,now);
test('old shop coins remain coins on read and reload until an explicit purchase',()=>{
 const {storage,k}=setup(18);delete k.shop.earningsId;storage.setItem(K.KEY,JSON.stringify(k));const before=storage.getItem(S.KEY);
 for(let i=0;i<4;i++){assert.equal(shop(storage).coins,18);assert.equal(shop(storage).balance,200)}assert.equal(storage.getItem(S.KEY),before);
 assert.equal(buy(storage).status,'bought');assert.equal(shop(storage).coins,8);assert.equal(wallet(storage).balance,210);assert.equal(wallet(storage).kitchenCredits['legacy-kitchen'],10);
});
test('a real sale earns three coins without automatically adding seeds',()=>{
 const {storage,k}=setup();k.shop.guests[0].phase='waiting';k.plate=['meat'];K.step(k,.1);storage.setItem(K.KEY,JSON.stringify(k));
 assert.equal(shop(storage).coins,3);assert.equal(wallet(storage).balance,200);assert.equal(buy(storage).status,'insufficient');
 const restored=K.decode(storage.getItem(K.KEY));K.step(restored,.1);storage.setItem(K.KEY,JSON.stringify(restored));assert.equal(shop(storage).coins,3);
});
test('buying seeds uses the latest spent wallet and preserves prizes, settings and destination',()=>{
 const {storage,s}=setup(24);s.selectedMap='farm';s.settings.sound=true;s.rewards.farm={won:3,claimed:1};storage.setItem(S.KEY,JSON.stringify(s));buy(storage);
 const latest=wallet(storage);const rolls=[0,.2,.4];S.spin(latest,()=>rolls.shift(),now);storage.setItem(S.KEY,JSON.stringify(latest));buy(storage);
 const after=wallet(storage);assert.equal(after.balance,210);assert.equal(shop(storage).coins,4);assert.deepEqual(after.rewards.farm,{won:3,claimed:1});assert.equal(after.selectedMap,'farm');assert.equal(after.settings.sound,true);assert.equal(after.spins,1);
});
test('a failed purchase spends no coins and adds no seeds; retry is safe',()=>{
 const {storage}=setup(12);const write=storage.setItem;storage.setItem=(k,v)=>{if(k===S.KEY)throw Error('full');write(k,v)};
 assert.equal(buy(storage).status,'storage-error');assert.equal(wallet(storage).balance,200);assert.equal(shop(storage).coins,12);
 storage.setItem=write;assert.equal(buy(storage).status,'bought');assert.equal(buy(storage).status,'insufficient');assert.equal(wallet(storage).balance,210);assert.equal(shop(storage).coins,2);
});
test('buying seeds restores a depleted slot wallet without waiting for tomorrow',()=>{
 const {storage}=setup(12,0);assert.equal(shop(storage).balance,0);assert.equal(buy(storage).status,'bought');assert.equal(wallet(storage).balance,10);assert.equal(wallet(storage).refillAt,null);
});
test('corrupt wallet is preserved and shop coins remain saved',()=>{
 const {storage}=setup(12);storage.setItem(S.KEY,'broken');assert.equal(buy(storage).status,'invalid');assert.equal(storage.getItem(S.KEY),'broken');assert.equal(K.decode(storage.getItem(K.KEY)).shop.coins,12);
});
test('previous automatic conversions cannot be spent again, and later sales earn new coins',()=>{
 const {storage,k,s}=setup(18);s.balance=215;s.kitchenCredits[k.shop.earningsId]=15;storage.setItem(S.KEY,JSON.stringify(s));
 assert.equal(shop(storage).coins,3);assert.equal(buy(storage).status,'insufficient');assert.equal(wallet(storage).balance,215);
 k.shop.coins=27;storage.setItem(K.KEY,JSON.stringify(k));assert.equal(buy(storage).status,'bought');assert.equal(shop(storage).coins,2);assert.equal(wallet(storage).balance,225);
});
test('new wallets receive the normal starting balance only on purchase, never on a read',()=>{
 const storage=memory(),k=K.create();k.shop.coins=12;storage.setItem(K.KEY,JSON.stringify(k));assert.equal(shop(storage).balance,200);assert.equal(storage.getItem(S.KEY),null);
 buy(storage);assert.equal(wallet(storage).balance,210);const s=wallet(storage);s.balance=160;storage.setItem(S.KEY,JSON.stringify(s));assert.equal(shop(storage).balance,160);
});
test('claiming a cow preserves spent coins and cannot replay a purchase',()=>{
 const Farm=require('../dist/pixel/farm-life.js'),{storage}=setup(12);buy(storage);
 const s=wallet(storage);s.rewards.farm={won:1,claimed:0};storage.setItem(S.KEY,JSON.stringify(s));
 assert.equal(S.claimCow(s,storage,Farm,now).status,'claimed');assert.equal(buy(storage).status,'insufficient');assert.equal(wallet(storage).balance,210);assert.equal(wallet(storage).rewards.farm.claimed,1);
});
