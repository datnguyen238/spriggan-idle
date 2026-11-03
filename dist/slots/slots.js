(()=>{
'use strict';
function boot(){
const storage=globalThis.SprigganStorage||localStorage;
const Accounts=globalThis.SprigganAccounts;
const Life=SlotsLife,Art=SlotsArt,Runtime=SprigganRuntime,$=s=>document.querySelector(s),reduce=matchMedia('(prefers-reduced-motion: reduce)');
let state;try{state=Life.decode(storage.getItem(Life.KEY))}catch{}state||=Life.create();
let busy=false,animation=null,audio=null,storageOK=true,claimMessage='',lastFrame=0,ready=false,emptyNoticeFor=null,pendingVisit=null;
const reels=[...document.querySelectorAll('.symbol-art')],names=[...document.querySelectorAll('.symbol-name')],mapSelect=$('#destination');
const lock=fn=>navigator.locks?.request?navigator.locks.request('spriggan-seed-wallet',fn):Promise.resolve().then(fn);
const friend=map=>Life.destination(map).friend;
const visitLabel=map=>`Save & visit ${Life.destination(map).shortName}`;
const recoveryFor=map=>map==='pond'?Life.goldenRecovery(state,storage,PondLife):{status:'locked'};
const canRecover=recovery=>['available','full'].includes(recovery.status);
const saveProgress=()=>{void Accounts?.saveProgress?.().catch(()=>{})};
async function checkpointPrize(){
 const user=Accounts?.state?.user;
 if(!user?.emailVerified)return;
 if(typeof Accounts.checkpoint!=='function'){
  const error=Error('Reload this page to reconnect account saving.');error.code='account/checkpoint-unavailable';throw error;
 }
 await Accounts.checkpoint();
 storage.assertCurrent?.();
 if(Accounts.state.status==='conflict'){
  const error=Error('Choose which account save to keep before continuing.');error.code='account/conflict';throw error;
 }
 if(Accounts.state.user?.uid!==user.uid||!Accounts.state.user?.emailVerified||['changed','conflict'].includes(Accounts.state.status)){
  const error=Error('Your account changed before the save finished.');error.code='account/changed';throw error;
 }
}
function saveStatus(){
 if(!storageOK)return'Storage unavailable · seeds have not been spent';
 const account=Accounts?.state;
 if(!account?.user)return'Saved in this browser';
 if(!account.user.emailVerified)return'Saved on this device · verify email for account saves';
 if(account.status==='synced')return'Saved to your account';
 if(account.status==='saving')return'Saved on this device · saving to your account…';
 if(account.status==='changed')return'Account changed · reload before rolling';
 if(['offline','error','conflict'].includes(account.status))return'Saved on this device · account save needs attention';
 return'Saved on this device · account save pending';
}
for(const map of Life.DESTINATIONS){const option=document.createElement('option');option.value=map.id;option.textContent=map.name;mapSelect.append(option)}
const label=(id,map)=>id==='friend'?friend(map):Life.SYMBOLS.find(s=>s.id===id).label;
const motion=()=>state.settings.motion&&!reduce.matches;
function read(){try{const raw=storage.getItem(Life.KEY),saved=Life.decode(raw);if(raw!==null&&!saved){storageOK=false;return false}if(saved)state=saved;return true}catch{storageOK=false;return false}}
function save(){try{state.savedAt=Date.now();storage.setItem(Life.KEY,JSON.stringify(state));storageOK=true;return true}catch{storageOK=false;return false}}
function message(title,detail,kind='',map=state.selectedMap){ $('#result-title').textContent=title;$('#result-detail').textContent=detail;$('#result-detail').hidden=!detail;$('#result').dataset.kind=kind;$('#result').dataset.map=map;syncAnnouncement() }
function syncAnnouncement(){
 const result=$('#result'),map=result.dataset.map||state.selectedMap,counts=Life.reward(state,map),button=$('#claim-hint'),recovery=recoveryFor(map),recover=counts.won===counts.claimed&&canRecover(recovery);
 button.hidden=result.dataset.kind!=='triple'||(counts.won<=counts.claimed&&pendingVisit!==map&&!recover)||!!animation;
 button.disabled=busy||(recover&&recovery.status==='full');button.textContent=pendingVisit===map?visitLabel(map):recover?'Recover Kin':`Welcome ${friend(map)} home`;
}
function paint(symbols,map=state.selectedMap){symbols.forEach((id,i)=>{reels[i].innerHTML=Art.icon(id,map);names[i].textContent=label(id,map).toUpperCase()});$('#reels').setAttribute('aria-label',symbols.map(id=>label(id,map)).join(', '))}
function sync(){
 const map=state.selectedMap,destination=Life.destination(map),counts=Life.reward(state,map),pending=counts.won-counts.claimed,unlocked=counts.won>0,claimed=pending===0,recovery=recoveryFor(map),recover=!pending&&canRecover(recovery);
 $('#balance').textContent=animation?animation.spentBalance:state.balance;
 $('#spin').disabled=$('#lever').disabled=busy||!!animation||state.balance<Life.COST;
 $('#spin-label').textContent=animation?'Turning…':'Turn the reels';
 mapSelect.disabled=busy||!!animation;mapSelect.value=map;
 $('#claim').disabled=busy||!!animation||(!pending&&pendingVisit!==map&&!recover)||(recover&&recovery.status==='full');
 $('#claim').hidden=!pending&&pendingVisit!==map&&!recover;$('#claim').textContent=pendingVisit===map?visitLabel(map):recover?'Recover Kin':`Welcome ${friend(map)} home`;
 $('#reward-art').innerHTML=Art.icon(destination.art);$('.reward').dataset.map=map;
 syncAnnouncement();
 $('.reward').dataset.ready=String((unlocked&&!claimed)||recover);
 $('#reward-badge').textContent=pending?'A FRIEND IS WAITING':recover?'A FRIEND CAN RETURN':counts.claimed?'AT HOME IN YOUR WORLD':`A FRIEND FOR YOUR ${destination.shortName.toUpperCase()}`;
 $('#reward-name').textContent=destination.title;
 $('#reward-description').textContent=recover?'Your saved prize claim can bring Kin back to this pond. No seeds are spent.':destination.description;
 $('#reward-count').textContent=pending?`${pending} waiting`:'';
 $('#claim-status').textContent=claimMessage||(recover&&recovery.status==='full'?'Your pond is full. Make room for a koi to recover Kin.':'');
 $('#sound').textContent=state.settings.sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(state.settings.sound));
 $('#motion').textContent=motion()?'Motion on':'Motion off';$('#motion').setAttribute('aria-pressed',String(motion()));
 $('#save-status').textContent=saveStatus();
 $('#reels').setAttribute('aria-busy',String(!!animation));
 syncEmptyNotice();
}
function syncEmptyNotice(){
 const dialog=$('#seed-dialog');
 if(state.balance>=Life.COST){emptyNoticeFor=null;if(dialog.open)dialog.close();return}
 if(!ready||busy||animation||document.hidden||emptyNoticeFor===state.refillAt)return;
 emptyNoticeFor=state.refillAt;dialog.showModal();
}
document.querySelector('.earn-seeds').onclick=()=>{try{sessionStorage.setItem('spriggan.map-entry',JSON.stringify({path:new URL('../dumplings/',location.href).pathname,at:Date.now()}))}catch{}};
$('#seed-dialog-close').onclick=()=>$('#seed-dialog').close();
async function transaction(fn){if(busy)return;busy=true;sync();try{return await lock(()=>{if(!read())return;return fn()})}finally{busy=false;sync()}}
function describe(r){
 const counts=Life.reward(state,r.map),waiting=counts.won>counts.claimed;
 const title=r.kind==='triple'?(waiting?`${friend(r.map)} is yours to welcome home.`:`${friend(r.map)} is home. Roll again for another.`):r.kind==='pair'?'A matching pair. 20 seeds won.':'Three different symbols. A quiet turn.';
 message(title,r.kind==='triple'?(waiting?`A new friend for your ${Life.destination(r.map).shortName}.`:'A little luck, a new friend.'):r.kind==='pair'?'':'10 seeds spent · 0 returned',r.kind,r.map);
}
function finish(){if(!animation)return;const r=animation.result;animation=null;$('#machine').classList.remove('spinning');paint(r.symbols,r.map);read();sync();describe(r);if(r.kind==='triple')chime()}
function animate(now){if(!animation)return;const elapsed=Math.max(0,now-animation.start);if(elapsed>=2100){finish();return}if(now-lastFrame>110){lastFrame=now;paint(Life.reelSymbols(elapsed),animation.result.map);names.forEach(n=>n.textContent='· · ·')}requestAnimationFrame(animate)}
async function start(){if(animation||busy)return;let prizeWon=false,rolled=false;await transaction(()=>{
 const before=JSON.stringify(state),r=Life.spin(state);if(!r){save();return}
 if(!save()){state=Life.decode(before);message('A little pause.','Enable browser storage before spending seeds.');return}
 rolled=true;prizeWon=r.kind==='triple';
 claimMessage='';lastFrame=-Infinity;animation={result:r,start:performance.now(),spentBalance:state.balance-r.payout};$('#machine').classList.add('spinning');message('A little luck in motion.','Your result is saved while the reels turn.');
 if(motion())requestAnimationFrame(animate);else finish();
 });if(prizeWon)void checkpointPrize().catch(()=>{});else if(rolled)saveProgress()}
$('#spin').onclick=$('#lever').onclick=start;
for(const button of [$('#spin'),$('#lever')])button.addEventListener('keydown',e=>{if(e.repeat&&(e.key===' '||e.key==='Enter'))e.preventDefault()});
mapSelect.onchange=()=>{if(animation||busy)return;const selected=mapSelect.value;transaction(()=>{state.selectedMap=Life.destination(selected).id;claimMessage='';save();paint(['leaf','moon','friend']);message(`Playing for ${Life.destination(state.selectedMap).name}.`,`Any three matching symbols unlock ${friend(state.selectedMap)}.`)})};
async function claimReward(map){
 if(busy||animation)return;
 busy=true;sync();
 try{
  const result=await lock(()=>{
   if(!read())return{status:'storage-error'};
   if(pendingVisit===map)return{status:'existing'};
   const counts=Life.reward(state,map);
   if(map==='pond'&&counts.won===counts.claimed&&counts.claimed>0)return Life.recoverGolden(state,storage,PondLife);
   const handlers={claimCow:()=>Life.claimCow(state,storage,FarmLife),claimGolden:()=>Life.claimGolden(state,storage,PondLife)};
   return handlers[Life.destination(map).claim]();
  });
  const messages={claimed:`${friend(map)} is home. Go say hello.`,recovered:'Kin is back in your pond. Go say hello.',existing:'This friend is already home.',full:'Your pond is full. Make room for a koi, then claim Kin.',invalid:'Your map save could not be read. It has not been changed.','storage-error':'Could not save your prize. Please try again. Your friend is still waiting.',locked:'Match three to welcome this friend.'};
  if(result.status==='claimed'||result.status==='existing'||result.status==='recovered'){
   pendingVisit=map;
   if(Accounts?.state?.user?.emailVerified){
    claimMessage=`Saving ${friend(map)} to your account before visiting your ${Life.destination(map).shortName}…`;sync();
    try{await checkpointPrize()}
    catch(error){
     claimMessage=error?.code==='account/changed'?`${friend(map)} is saved on this device. Your account changed in another tab; reload before continuing.`:error?.code==='account/conflict'?`${friend(map)} is saved on this device. Open Account to resolve the different saves before continuing.`:`${friend(map)} is saved on this device, but the account save did not finish. Keep this tab open and choose “${visitLabel(map)}” to try again.`;
     if(state.lastResult?.map===map)describe(state.lastResult);
     if($('#result').dataset.map===map){$('#result-detail').textContent=claimMessage;$('#result-detail').hidden=false}
     return;
    }
   }
   const target=new URL(Life.destination(map).href,location.href);
   try{sessionStorage.setItem('spriggan.map-entry',JSON.stringify({path:target.pathname,at:Date.now()}))}catch{}
   location.assign(target.href);return;
  }
  claimMessage=messages[result.status];
  if(state.lastResult?.map===map)describe(state.lastResult);
  if($('#result').dataset.map===map){$('#result-detail').textContent=claimMessage;$('#result-detail').hidden=false}
 }finally{busy=false;sync()}
}
$('#claim-hint').onclick=()=>claimReward($('#result').dataset.map);
$('#claim').onclick=()=>claimReward(state.selectedMap);
async function prepareAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audio||=new C();await audio.resume()}catch{}}
function chime(){if(!state.settings.sound||audio?.state!=='running'||(document.hidden&&Runtime.mobile))return;[392,493.88,587.33].forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.12;o.frequency.value=hz;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.025,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.6);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.65);o.onended=()=>{o.disconnect();g.disconnect()}})}
$('#sound').onclick=()=>{if(!state.settings.sound)void prepareAudio();transaction(()=>{state.settings.sound=!state.settings.sound;save()})};
$('#motion').onclick=()=>transaction(()=>{state.settings.motion=!state.settings.motion;save();if(!motion())finish()});
reduce.addEventListener('change',()=>{if(!motion())finish();sync()});
async function checkDay(){
 if(busy||animation)return;
 let refilled=false;
 await transaction(()=>{const before=JSON.stringify(state);if(Life.refill(state)){if(save())refilled=true;else state=Life.decode(before)}});
 if(refilled)saveProgress();
}
setInterval(()=>{if((!document.hidden||!Runtime.mobile)&&state.balance<Life.COST&&state.refillAt<=Date.now())checkDay()},1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(Runtime.mobile){finish();if(audio?.state==='running')void audio.suspend()}}else{checkDay();if(state.settings.sound&&audio)void audio.resume().catch(()=>{})}});
Runtime.runBackground(null,()=>{if(animation&&performance.now()-animation.start>=2100)finish()});
window.addEventListener('pagehide',()=>{finish();if(audio?.state==='running')void audio.suspend()});
// Every slot mutation is already durable. A checkpoint must not end the reveal
// or overwrite a wallet another open world has just updated.
window.addEventListener('spriggan:flush',()=>{read();sync()});
window.addEventListener('storage',e=>{if([Life.KEY,PondLife.KEY].includes(e.key)&&!animation&&!busy){read();sync();if(state.lastResult)paint(state.lastResult.symbols,state.lastResult.map)}});
$('#seed-icon').innerHTML=Art.icon('seed');document.querySelectorAll('[data-art]').forEach(el=>el.innerHTML=Art.icon(el.dataset.art));
paint(state.lastResult?.symbols||['leaf','flower','seed'],state.lastResult?.map||state.selectedMap);if(state.lastResult)describe(state.lastResult);
Accounts?.subscribe?.(()=>sync());
sync();
void(async()=>{
 let refilled=false;
 await transaction(()=>{const changed=Life.refill(state);refilled=save()&&changed;ready=true});
 if(refilled)saveProgress();
})();
}
if(globalThis.SprigganWorldLoading)SprigganWorldLoading.start(boot);
else if(globalThis.SprigganAccounts){
 let started=false;
 SprigganAccounts.ready.then(()=>{
  const start=()=>{const state=SprigganAccounts.state||{};if(started||state.loading||state.worldsReady===false||state.status==='changed')return;started=true;boot();if(typeof globalThis.dispatchEvent==='function'&&typeof Event==='function')globalThis.dispatchEvent(new Event('spriggan:world-ready'))};
  if(SprigganAccounts.subscribe)SprigganAccounts.subscribe(start);
  start();
 });
}else boot();
})();
