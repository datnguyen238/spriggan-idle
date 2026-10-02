(()=>{
'use strict';
const Life=SlotsLife,Art=SlotsArt,Runtime=SprigganRuntime,$=s=>document.querySelector(s),reduce=matchMedia('(prefers-reduced-motion: reduce)');
let state;try{state=Life.decode(localStorage.getItem(Life.KEY))}catch{}state||=Life.create();
let busy=false,animation=null,audio=null,storageOK=true,claimMessage='',lastFrame=0,ready=false,emptyNoticeFor=null;
const reels=[...document.querySelectorAll('.symbol-art')],names=[...document.querySelectorAll('.symbol-name')],mapSelect=$('#destination');
const lock=fn=>navigator.locks?.request?navigator.locks.request('spriggan-seed-wallet',fn):Promise.resolve().then(fn);
const friend=map=>Life.destination(map).friend;
for(const map of Life.DESTINATIONS){const option=document.createElement('option');option.value=map.id;option.textContent=map.name;mapSelect.append(option)}
const label=(id,map)=>id==='friend'?friend(map):Life.SYMBOLS.find(s=>s.id===id).label;
const motion=()=>state.settings.motion&&!reduce.matches;
function read(){try{const saved=Life.decode(localStorage.getItem(Life.KEY));if(saved)state=saved}catch{storageOK=false}}
function save(){try{state.savedAt=Date.now();localStorage.setItem(Life.KEY,JSON.stringify(state));storageOK=true;return true}catch{storageOK=false;return false}}
function message(title,detail,kind=''){ $('#result-title').textContent=title;$('#result-detail').textContent=detail;$('#result-detail').hidden=!detail;$('#result').dataset.kind=kind }
function paint(symbols,map=state.selectedMap){symbols.forEach((id,i)=>{reels[i].innerHTML=Art.icon(id,map);names[i].textContent=label(id,map).toUpperCase()});$('#reels').setAttribute('aria-label',symbols.map(id=>label(id,map)).join(', '))}
function sync(){
 const map=state.selectedMap,destination=Life.destination(map),counts=Life.reward(state,map),pending=counts.won-counts.claimed,unlocked=counts.won>0,claimed=pending===0;
 $('#balance').textContent=animation?animation.spentBalance:state.balance;
 $('#spin').disabled=$('#lever').disabled=busy||!!animation||state.balance<Life.COST;
 $('#spin-label').textContent=animation?'Turning…':'Turn the reels';
 mapSelect.disabled=busy||!!animation;mapSelect.value=map;
 $('#claim').disabled=busy||!!animation||!unlocked||(claimed&&state.balance<Life.COST);
 $('#claim').textContent=pending?`Claim ${friend(map)} here${pending>1?` · ${pending} waiting`:''}`:counts.claimed?`Roll for another ${friend(map)}`:`Match three to welcome ${friend(map)}`;
 $('#reward-art').innerHTML=Art.icon(destination.art);$('.reward').dataset.map=map;
 $('#claim-hint').hidden=!unlocked||claimed||busy||!!animation;
 $('#claim-hint').textContent=`Claim ${friend(map)} here ↓${pending>1?` · ${pending} waiting`:''}`;
 $('.reward').dataset.ready=String(unlocked&&!claimed);
 $('#reward-badge').textContent=pending?'READY TO CLAIM ↓':counts.claimed?'ROLL AGAIN FOR ANOTHER':`A FRIEND FOR YOUR ${destination.shortName.toUpperCase()}`;
 $('#reward-name').textContent=destination.title;
 $('#reward-description').textContent=destination.description+(counts.claimed?` ${counts.claimed} claimed · every triple wins another.`:'');
 $('#claim-status').textContent=claimMessage;
 $('#visit').hidden=!unlocked;$('#visit').href=destination.href;$('#visit').textContent=`Visit your ${destination.shortName} ↗`;
 $('#sound').textContent=state.settings.sound?'Sound on':'Sound off';$('#sound').setAttribute('aria-pressed',String(state.settings.sound));
 $('#motion').textContent=motion()?'Motion on':'Motion off';$('#motion').setAttribute('aria-pressed',String(motion()));
 $('#save-status').textContent=storageOK?'Saved in this browser':'Storage unavailable · seeds have not been spent';
 $('#reels').setAttribute('aria-busy',String(!!animation));
 syncEmptyNotice();
}
function syncEmptyNotice(){
 const dialog=$('#seed-dialog');
 if(state.balance>=Life.COST){emptyNoticeFor=null;if(dialog.open)dialog.close();return}
 if(!ready||busy||animation||document.hidden||emptyNoticeFor===state.refillAt)return;
 emptyNoticeFor=state.refillAt;dialog.showModal();
}
$('#seed-dialog-close').onclick=()=>$('#seed-dialog').close();
async function transaction(fn){if(busy)return;busy=true;sync();try{return await lock(()=>{read();return fn()})}finally{busy=false;sync()}}
function describe(r){
 const counts=Life.reward(state,r.map),waiting=counts.won>counts.claimed;
 const title=r.kind==='triple'?(waiting?`${friend(r.map)} is yours to welcome home.`:`${friend(r.map)} is home. Roll again for another.`):r.kind==='pair'?'A matching pair. 20 seeds won.':'Three different symbols. A quiet turn.';
 message(title,r.kind==='triple'?(waiting?`10 seeds spent · ${friend(r.map)} won · claim your new friend below`:'Every new spin has the same 1 in 36 chance.'):r.kind==='pair'?'':'10 seeds spent · 0 returned',r.kind);
}
function finish(){if(!animation)return;const r=animation.result;animation=null;$('#machine').classList.remove('spinning');paint(r.symbols,r.map);read();sync();describe(r);if(r.kind==='triple')chime()}
function animate(now){if(!animation)return;const elapsed=now-animation.start;if(elapsed>=2100){finish();return}if(now-lastFrame>110){lastFrame=now;paint(Life.SYMBOLS.slice(0,3).map((_,i)=>Life.SYMBOLS[(Math.floor(elapsed/110)+i*2)%6].id),animation.result.map);names.forEach(n=>n.textContent='· · ·')}requestAnimationFrame(animate)}
async function start(){if(animation||busy)return;await transaction(()=>{
 const before=JSON.stringify(state),r=Life.spin(state);if(!r){save();return}
 if(!save()){state=Life.decode(before);message('A little pause.','Enable browser storage before spending seeds.');return}
 claimMessage='';animation={result:r,start:performance.now(),spentBalance:state.balance-r.payout};$('#machine').classList.add('spinning');message('A little luck in motion.','Your result is saved while the reels turn.');
 if(motion())requestAnimationFrame(animate);else finish();
 })}
$('#spin').onclick=$('#lever').onclick=start;
for(const button of [$('#spin'),$('#lever')])button.addEventListener('keydown',e=>{if(e.repeat&&(e.key===' '||e.key==='Enter'))e.preventDefault()});
mapSelect.onchange=()=>{if(animation||busy)return;const selected=mapSelect.value;transaction(()=>{state.selectedMap=Life.destination(selected).id;claimMessage='';save();paint(['leaf','moon','friend']);message(`Playing for ${Life.destination(state.selectedMap).name}.`,`Any three matching symbols unlock ${friend(state.selectedMap)}.`)})};
$('#claim-hint').onclick=()=>{if($('#claim').disabled)return;$('#reward').scrollIntoView({behavior:motion()?'smooth':'instant',block:'center'});$('#claim').focus({preventScroll:true})};
$('#claim').onclick=()=>{const counts=Life.reward(state,state.selectedMap);if(counts.won&&counts.won===counts.claimed)return start();return transaction(()=>{
 const handlers={claimCow:()=>Life.claimCow(state,localStorage,FarmLife),claimGolden:()=>Life.claimGolden(state,localStorage,PondLife)};
 const result=handlers[Life.destination(state.selectedMap).claim]();
 const messages={claimed:`${friend(state.selectedMap)} is home. Go say hello.`,existing:'This reward has already been delivered. Roll again for another friend.',full:'Your pond is full. Remove a koi, then come back to claim Kin.',invalid:'Your map save could not be read. It has not been changed.','storage-error':'Could not save your prize. Please try again. Your unlock is kept.',locked:'Match three to unlock this friend.'};claimMessage=messages[result.status];if(state.lastResult)describe(state.lastResult);
})};
async function prepareAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audio||=new C();await audio.resume()}catch{}}
function chime(){if(!state.settings.sound||audio?.state!=='running'||(document.hidden&&Runtime.mobile))return;[392,493.88,587.33].forEach((hz,i)=>{const o=audio.createOscillator(),g=audio.createGain(),t=audio.currentTime+i*.12;o.frequency.value=hz;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.025,t+.02);g.gain.exponentialRampToValueAtTime(.0001,t+.6);o.connect(g);g.connect(audio.destination);o.start(t);o.stop(t+.65);o.onended=()=>{o.disconnect();g.disconnect()}})}
$('#sound').onclick=()=>{if(!state.settings.sound)void prepareAudio();transaction(()=>{state.settings.sound=!state.settings.sound;save()})};
$('#motion').onclick=()=>transaction(()=>{state.settings.motion=!state.settings.motion;save();if(!motion())finish()});
reduce.addEventListener('change',()=>{if(!motion())finish();sync()});
function checkDay(){if(busy||animation)return;transaction(()=>{const before=JSON.stringify(state);if(Life.refill(state)&&!save())state=Life.decode(before)})}
setInterval(()=>{if((!document.hidden||!Runtime.mobile)&&state.balance<Life.COST&&state.refillAt<=Date.now())checkDay()},1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(Runtime.mobile){finish();if(audio?.state==='running')void audio.suspend()}}else{checkDay();if(state.settings.sound&&audio)void audio.resume().catch(()=>{})}});
Runtime.runBackground(null,()=>{if(animation&&performance.now()-animation.start>=2100)finish()});
window.addEventListener('pagehide',()=>{finish();if(audio?.state==='running')void audio.suspend()});
window.addEventListener('storage',e=>{if(e.key===Life.KEY&&!animation&&!busy){read();sync();if(state.lastResult)paint(state.lastResult.symbols,state.lastResult.map)}});
$('#seed-icon').innerHTML=Art.icon('seed');document.querySelectorAll('[data-art]').forEach(el=>el.innerHTML=Art.icon(el.dataset.art));
paint(state.lastResult?.symbols||['leaf','flower','seed'],state.lastResult?.map||state.selectedMap);if(state.lastResult)describe(state.lastResult);
sync();transaction(()=>{Life.refill(state);save();ready=true});
})();
