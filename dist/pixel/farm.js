(()=>{
'use strict';
const Life=FarmLife,Runtime=SprigganRuntime,canvas=document.querySelector('#farm'),ctx=canvas.getContext('2d',{alpha:false});
let state;try{state=Life.decode(localStorage.getItem(Life.KEY))}catch{}const returning=!!state;state||=Life.create();
const seenCows=new Set(state.cows.map(c=>c.id));
const animals=()=>[...state.birds,...state.cows];
let W=400,H=240,sceneTop=0,sceneBottom=0,last=0,clock=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,selected=null,lastRules=0;
let foxVisitor=null;
const grain=[],walk=new Map(),hearts=[];const moment=document.querySelector('#moment'),card=document.querySelector('#bird-card');
const musicButton=document.querySelector('#music');
const resumeAudioButton=document.querySelector('#resume-audio');
const musicVolumeInput=document.querySelector('#music-volume');
const musicVolumeValue=document.querySelector('#music-volume-value');
const audioStatus=document.querySelector('#audio-status');

const farmAudio=new FarmAudio(snapshot=>{
 musicButton.setAttribute('aria-pressed',String(snapshot.enabled));
 musicButton.textContent=snapshot.enabled?'Gentle music on':'Gentle music';
 musicVolumeInput.value=String(Math.round(snapshot.volume*100));
 musicVolumeValue.textContent=`${Math.round(snapshot.volume*100)}%`;
 resumeAudioButton.hidden=!snapshot.needsResume;
 audioStatus.textContent=snapshot.needsResume?'Tap Resume music to continue music.':snapshot.playing?'Gentle music is playing.':'';
});

farmAudio.notify();

musicButton.onclick=async()=>{
 if(farmAudio.enabled)farmAudio.stop();
 else{
  const started=await farmAudio.start();
  if(!started)audioStatus.textContent='Tap Resume music to start music.';
 }
};

resumeAudioButton.onclick=async()=>{
 const started=await farmAudio.start();
 if(started)audioStatus.textContent='Gentle music is playing.';
};

musicVolumeInput.oninput=()=>{
 farmAudio.setVolume(Number(musicVolumeInput.value)/100);
};

document.addEventListener('visibilitychange',()=>farmAudio.visibility(document.hidden&&Runtime.mobile));
window.addEventListener('pagehide',()=>farmAudio.visibility(true));
window.addEventListener('pageshow',()=>farmAudio.visibility(document.hidden&&Runtime.mobile));
function recoverMusic(){if(farmAudio.enabled&&farmAudio.needsResume&&!document.hidden)farmAudio.start()}
document.addEventListener('pointerdown',recoverMusic,{passive:true});
document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')recoverMusic()});

const rain=new MapRain(document.querySelector('[data-map-rain]'),'spriggan.farm.rain.v1','pixel');
let noticeUntil=Date.now()+7000;
function notice(text){moment.textContent=text;noticeUntil=Date.now()+7000}
function receiveCow(){
 try{
  const incoming=Life.decode(localStorage.getItem(Life.KEY));
  for(const c of incoming?.cows||[])if(!seenCows.has(c.id)){
   state.cows.push(c);seenCows.add(c.id);notice(`${c.name} has arrived from Golden Seed. A gentle new friend.`);
  }
 }catch{}
}
function save(){try{receiveCow();localStorage.setItem(Life.KEY,JSON.stringify(state));document.querySelector('#save-status').textContent='Saved on this device'}catch{document.querySelector('#save-status').textContent='Storage unavailable — this visit only'}}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
function resize(){
 const r=canvas.getBoundingClientRect(),density=Math.min(devicePixelRatio||1,2);
 // Draw each art pixel on a whole number of screen pixels: no stretched low-res canvas.
 const scale=Math.max(1,Math.round((r.width<600?2:3)*density));
 canvas.width=Math.round(r.width*density);canvas.height=Math.round(r.height*density);
 W=canvas.width/scale;sceneTop=r.width<600?130*density/scale:0;sceneBottom=r.width<600?145*density/scale:0;
 H=Math.max(80,canvas.height/scale-sceneTop-sceneBottom);
 ctx.setTransform(scale,0,0,scale,0,Math.round(sceneTop)*scale);ctx.imageSmoothingEnabled=false;draw();
}
function tree(x,y,s=1){ctx.save();ctx.translate(Math.round(x),Math.round(y));rect(-3,-8,6,23,'#796445');rect(0,1,2,13,'#ad8a53');rect(-18,-24,35,24,'#3d613e');rect(-13,-33,27,12,'#3d613e');rect(-22,-20,41,13,'#3d613e');rect(-16,-26,29,20,'#588349');rect(-10,-32,21,18,'#79a15a');rect(-15,-20,8,5,'#94b774');rect(5,-12,10,5,'#315136');ctx.restore()}
function fence(x,y,width){rect(x,y+3,width,3,'#a88a54');rect(x,y+10,width,3,'#a88a54');for(let i=0;i<=width;i+=12){rect(x+i,y,3,18,'#d4bd7e');rect(x+i,y,2,2,'#efdaa1');rect(x+i+2,y+2,1,16,'#8e774c')}}
function background(){
 rect(0,-sceneTop-1,W,H+sceneTop+sceneBottom+2,'#809c60');rect(0,0,W,H*.28,'#718f55');
 for(let i=0;i<240;i++){const x=(i*71+13)%W,y=(i*43+17)%H;rect(x,y,2,1,i%3?'#739757':'#aac780');if(i%6===0)rect(x+1,y-2,1,2,'#65874b')}
 rect(W*.14,H*.38,W*.72,H*.48,'#97b16e');
 for(let i=0;i<120;i++){const x=W*.14+(i*37)%(W*.72),y=H*.38+(i*23)%(H*.48);rect(x,y,1,1,'#7f9c5b')}
 // A worn path from the coop to the gate.
 rect(W*.46,H*.29,W*.12,H*.64,'#c3a77a');rect(W*.44,H*.45,W*.16,H*.27,'#c3a77a');
 for(let i=0;i<36;i++)rect(W*.46+(i*7)%(W*.12),H*.38+(i*13)%(H*.48),2,1,'#a68a5c');
 // Distant hedges and an orchard.
 for(let i=0;i<W;i+=19){rect(i,0,17,12,'#5e804d');rect(i+2,0,12,16,'#769456')}
 tree(W*.09,H*(W>300?.31:.22),.95);tree(W*.91,H*.2,1.1);tree(W*.79,H*.08,.7);
 fence(W*.13,H*.34,W*.73);
 // The coop, built from blocks and shingles.
 const x=W*.32,cw=Math.min(68,W*.3),ch=Math.min(46,H*.22),y=H*.34-ch;
 rect(x+5,y+ch+5,cw,6,'#74865b');rect(x,y,cw,ch,'#d4a469');rect(x+4,y+4,cw-8,ch-4,'#e1b67b');
 for(let i=8;i<cw;i+=10)rect(x+i,y+4,1,ch-4,'#c29259');
 rect(x-5,y-3,cw+10,8,'#744e40');rect(x,y-10,cw,8,'#925d48');rect(x+6,y-16,cw-12,7,'#ae7251');rect(x+13,y-20,cw-26,5,'#bc805a');
 for(let i=4;i<cw;i+=12)rect(x+i,y-8,7,1,'#c18a60');
 rect(x+cw*.58,y+ch*.36,17,ch*.64,'#695440');rect(x+cw*.58+2,y+ch*.36+2,13,ch*.64-2,'#3c4134');
 rect(x+10,y+8,15,14,'#f4d899');rect(x+12,y+10,11,10,'#7f9e99');rect(x+17,y+9,1,12,'#f7dfab');rect(x+11,y+14,13,1,'#f7dfab');
 rect(x+cw*.58-3,y+ch,23,4,'#b68c57');rect(x+cw*.58-5,y+ch+4,27,3,'#d4b078');
 // Vegetable beds and a little water trough.
 const bx=W*.76,by=H*.57;rect(bx-2,by-2,W*.14+4,H*.17+4,'#b89865');rect(bx,by,W*.14,H*.17,'#80674b');
 for(let r=0;r<3;r++)for(let c=0;c<3;c++){const px=bx+4+c*W*.039,py=by+5+r*H*.045;rect(px,py,2,4,'#d88f4c');rect(px-2,py-2,6,2,'#507249');rect(px,py-4,2,3,'#759451')}
 rect(W*.18,H*.43,23,13,'#8d9272');rect(W*.18+2,H*.43+2,19,8,'#719d9d');rect(W*.18+4,H*.43+3,9,1,'#b1d1bd');
 for(const [fx,fy] of [[.1,.55],[.9,.45],[.11,.83],[.91,.83]]){rect(W*fx,H*fy,1,5,'#6a9154');rect(W*fx-2,H*fy-1,5,3,'#eee2a4');rect(W*fx,H*fy,1,1,'#cbab51')}
 fence(W*.13,H*.87,W*.3);fence(W*.59,H*.87,W*.27);
 rect(W*.13,H*.36,2,H*.5,'#af965e');rect(W*.86,H*.36,2,H*.5,'#af965e');
}
function chicken(b,carried=false){
 const m=carried?null:walk.get(b.id),small=b.stage==='chick',moving=m?.moving,phase=m?.phase||0;
 const step=Math.sin(clock*11+phase),bob=moving&&step>0?1:0;
 const blink=(clock+phase)%5.7>5.52,peck=!carried&&!moving&&(clock+phase)%4.8>4.3;
 ctx.save();if(!carried)ctx.translate(Math.round(b.x*W),Math.round(b.y*H));if(m?.left)ctx.scale(-1,1);
 if(!carried)rect(small?-5:-8,4,small?11:17,2,'#39563c40');
 const foot=moving?Math.round(step):0;
 rect(small?-2:-4,3,2,3+foot,'#d79950');rect(small?2:4,3,2,3-foot,'#d79950');
 ctx.translate(0,bob+(peck?1:0));
 if(small){
  // A round butter-yellow puff, tiny wing and oversized shining eye.
  rect(-4,-7,8,1,'#d4a957');rect(-6,-5,12,7,'#d4a957');rect(-4,2,9,2,'#d4a957');
  rect(-4,-6,9,8,'#ffe7a0');rect(-5,-4,11,5,'#ffe7a0');rect(-3,-7,5,2,'#fff1bb');
  rect(-6,-3,2,3,'#f4ce79');rect(-3,-1,3,3,'#edc573');rect(-3,-1,2,1,'#fff0b2');
  rect(5,-3,3,2,'#e3a158');rect(6,-2,1,1,'#bf7d43');rect(3,0,2,1,'#eca48a');
  if(blink)rect(2,-4,2,1,'#493f32');else{rect(2,-5,2,3,'#493f32');rect(2,-5,1,1,'#fffdf0')}
  rect(-1,-9,1,2,'#f5d57f');rect(0,-8,2,1,'#ffe7a0');
 }else{
  const hen=b.sex==='hen',edge=hen?'#b8a181':'#9c7251',cream=hen?'#fff7e5':'#f9e8c8',shade=hen?'#e6d3b0':'#dfbd8c';
  // Short, rounded silhouette with a little fan tail instead of a long neck.
  rect(-12,-8,3,5,hen?'#dfcfb0':'#467262');rect(-13,-10,3,3,hen?'#f4e9d1':'#64927a');
  rect(-10,-11,3,5,hen?'#fff4db':'#305647');
  rect(-5,-13,12,1,edge);rect(-8,-11,17,3,edge);rect(-10,-8,20,8,edge);rect(-8,0,16,3,edge);rect(-5,3,10,1,edge);
  rect(-5,-12,11,14,cream);rect(-8,-9,16,10,cream);rect(-9,-6,18,5,cream);rect(-6,1,12,2,shade);
  rect(-5,-11,8,2,'#fffdf2');
  if(!hen){rect(3,-12,4,6,'#d39865');rect(6,-9,2,6,'#dfa676');rect(2,-11,3,2,'#ebbc85')}
  rect(0,-16,3,4,'#d87869');rect(4,-17,3,5,'#d87869');rect(1,-16,1,1,'#f3a191');rect(5,-17,1,1,'#f3a191');
  rect(-6,-4,6,5,shade);rect(-5,-5,4,1,shade);rect(-5,-4,4,1,'#fff4d8');rect(-3,0,2,1,edge);
  rect(8,-7,4,2,'#edb46b');rect(9,-5,2,1,'#cb904e');rect(6,-3,2,2,'#dc8778');rect(5,-4,2,1,'#efb1a0');
  if(blink)rect(5,-8,2,1,'#493f32');else{rect(5,-10,2,3,'#493f32');rect(5,-10,1,1,'#fffdf0')}
 }
 if(!carried&&selected===b.id){rect(-9,9,18,1,'#fff0b4');rect(-10,8,1,1,'#fff0b4');rect(9,8,1,1,'#fff0b4')}
 ctx.restore();
}
function cow(b){
 const m=walk.get(b.id),step=m?.moving?Math.sin(clock*7+(m.phase||0)):0;
 ctx.save();ctx.translate(Math.round(b.x*W),Math.round(b.y*H));if(m?.left)ctx.scale(-1,1);
 rect(-14,8,28,3,'#39563c35');
 for(const x of [-10,7]){rect(x,3,4,7+Math.round(step*(x<0?1:-1)),'#ded6bd');rect(x,9+Math.round(step*(x<0?1:-1)),4,2,'#53645a')}
 ctx.translate(0,step>0?1:0);
 rect(-14,-7,24,14,'#b8ab8c');rect(-12,-10,19,18,'#fff5df');rect(-14,-6,24,10,'#fff5df');
 rect(-12,-7,7,7,'#5b7262');rect(-7,-10,6,5,'#5b7262');rect(0,0,7,6,'#657c69');
 rect(6,-12,11,14,'#e5dbc4');rect(8,-11,9,12,'#fff5df');rect(5,-15,4,5,'#d5ba82');rect(14,-16,3,5,'#d5ba82');
 rect(4,-10,4,3,'#657c69');rect(17,-10,4,3,'#657c69');rect(8,-5,12,7,'#e5adac');rect(10,-3,1,2,'#946e6b');rect(17,-3,1,2,'#946e6b');
 rect(10,-9,2,2,'#3b5145');rect(16,-9,2,2,'#3b5145');rect(10,-9,1,1,'#fff');
 rect(-17,-5,2,9,'#cbb887');rect(-18,3,3,3,'#566d5c');
 if(selected===b.id)rect(-15,13,33,1,'#fff0b4');ctx.restore();
}
function egg(e){const x=e.x*W,y=e.y*H,wiggle=Date.now()>e.hatchesAt-15000&&!paused?Math.sin(clock*8):0;rect(x-6,y+2,12,4,'#ad9259');rect(x-4,y,8,5,'#c6ab6c');rect(x-3+wiggle,y-5,6,7,'#fff1d0');rect(x-2+wiggle,y-7,4,2,'#fff1d0');rect(x+1+wiggle,y-3,2,4,'#e0d1a9')}
function fox(){
 if(!foxVisitor)return;
 const f=foxVisitor,bob=Math.sin(f.phase*12)>0?1:0;
 ctx.save();ctx.translate(Math.round(f.x*W),Math.round(f.y*H));if(f.left)ctx.scale(-1,1);
 rect(-14,5,29,2,'#34453235');ctx.translate(0,bob);
 // Round ginger body, cream cheeks and a big white-tipped tail.
 rect(-20,-5,13,6,'#b7653e');rect(-23,-8,7,6,'#f5e3bc');rect(-18,-3,9,6,'#d78c50');
 rect(-9,-6,18,11,'#cc7946');rect(-6,-9,12,12,'#e59d58');rect(-5,1,12,4,'#f1d9ac');
 rect(4,-12,12,11,'#e8a264');rect(5,-17,4,7,'#b36744');rect(12,-16,4,6,'#b36744');rect(6,-15,2,4,'#edbf91');rect(13,-14,2,3,'#edbf91');
 rect(9,-5,9,4,'#fff0cf');rect(16,-5,3,2,'#453e35');rect(12,-9,2,2,'#3c3d32');rect(12,-9,1,1,'#fff3dc');
 const step=Math.round(Math.sin(f.phase*12));rect(-6,4,3,3+step,'#644a36');rect(6,4,3,3-step,'#644a36');
 if(f.carrying){
  // Reuse the exact flock sprite, including the hen/rooster coloring and tail.
  const sway=Math.round(Math.sin(f.phase*8));
  ctx.save();ctx.translate(24,12+sway);chicken(f.carrying,true);ctx.restore();
 }
 ctx.restore();
}
function draw(){background();for(const g of grain){rect(g.x*W,g.y*H,2,1,'#e5cc83');rect(g.x*W+1,g.y*H-1,1,1,'#fbdf96')}const objects=[...(foxVisitor?[{y:foxVisitor.y,draw:fox}]:[]),...animals().map(b=>({y:b.y,draw:()=>b.species==='cow'?cow(b):chicken(b)})),...state.eggs.map(e=>({y:e.y,draw:()=>egg(e)}))];objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());for(const h of hearts){const x=h.x*W,y=h.y*H-(1-h.life)*15;ctx.globalAlpha=h.life;rect(x-2,y-1,2,2,'#bc7962');rect(x+1,y-1,2,2,'#bc7962');rect(x-1,y+1,3,2,'#bc7962');rect(x,y+3,1,1,'#bc7962');ctx.globalAlpha=1}if(rain.enabled)rain.draw(ctx,W,H,clock,{top:-sceneTop,bottom:H+sceneBottom,splashes:Array.from({length:12},(_,i)=>({x:W*(.2+(i*7%11)/18),y:H*(.43+(i*3%7)/20)}))})}
function scatter(x=.5,y=.62){if(grain.length>=60)return notice('Plenty of grain already. Let them finish a little.');for(let i=0;i<10&&grain.length<60;i++)grain.push({x:Math.max(.17,Math.min(.82,x+(Math.random()-.5)*.13)),y:Math.max(.4,Math.min(.82,y+(Math.random()-.5)*.1)),life:60});notice('A little grain, a little gathering.');draw()}
function inspect(){if(!selected)return;const b=animals().find(b=>b.id===selected),e=state.eggs.find(e=>e.id===selected);if(!b&&!e){card.hidden=true;selected=null;return}card.hidden=false;document.querySelector('#bird-name').textContent=b?b.name:'A warm little egg';let detail;
 if(e)detail=`Hatching in ${Math.max(1,Math.ceil((e.hatchesAt-Date.now())/1000))} seconds. A tiny life is on its way.`;
 else if(b.species==='cow')detail=`Cow · ${b.meals} meals shared. A Golden Seed friend, here to wander with your flock.`;
 else if(b.stage==='chick')detail=`Little chick · ${Math.min(Life.GROW_MEALS,b.meals)}/${Life.GROW_MEALS} meals to grow into an adult.`;
 else if(b.sex==='hen')detail=`Hen · ${b.layFood}/${Life.LAY_MEALS} meals for her next egg. ${state.birds.length+state.eggs.length>=Life.LIMIT?'The yard is full.':'Every grain she eats counts.'}`;
 else detail='Rooster · Keeping the little family company. Scatter some grain and he’ll come running.';
 document.querySelector('#bird-detail').textContent=detail;document.querySelector('#remove-bird').hidden=!b;
}
canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=((e.clientY-r.top)/r.height*(H+sceneTop+sceneBottom)-sceneTop)/H;let nearest=null,dist=14;for(const b of [...animals(),...state.eggs]){const d=Math.hypot((b.x-x)*W,(b.y-y)*H);if(d<dist){nearest=b;dist=d}}if(nearest){selected=nearest.id;inspect();draw()}else scatter(x,y)});
document.querySelector('#feed').onclick=()=>scatter();document.querySelector('#close-card').onclick=()=>{selected=null;card.hidden=true;draw()};
const controlsToggle=document.querySelector('#toggle-controls'),controls=document.querySelector('#farm-controls');
controlsToggle.onclick=()=>{const expanded=controlsToggle.getAttribute('aria-expanded')==='true';controlsToggle.setAttribute('aria-expanded',String(!expanded));controls.inert=expanded;controls.setAttribute('aria-hidden',String(expanded));document.querySelector('.dashboard').classList.toggle('collapsed',expanded)};
const motion=document.querySelector('#motion');function syncMotion(){motion.setAttribute('aria-pressed',String(paused));motion.setAttribute('aria-label',paused?'Resume farm animation':'Pause farm animation');motion.textContent=paused?'▶':'Ⅱ'}motion.onclick=()=>{paused=!paused;syncMotion();if(paused)notice('A quiet moment. Egg and growth timers still continue.');draw()};syncMotion();
const picker=document.querySelector('#flock-picker'),restart=document.querySelector('#restart-flock');let flockOptions='';
picker.onchange=()=>{selected=picker.value||null;card.hidden=!selected;inspect();draw()};
document.querySelector('#remove-bird').onclick=()=>{
 const b=animals().find(b=>b.id===selected);if(!b)return;
 const lastRooster=b.stage==='adult'&&b.sex==='rooster'&&!state.birds.some(other=>other.id!==b.id&&other.stage==='adult'&&other.sex==='rooster');
 if(!confirm(`Remove ${b.name} from your farm?${lastRooster?" Hens need an adult rooster in the yard to lay eggs.":''}`))return;
 if(b.species==='cow')state.cows=state.cows.filter(c=>c.id!==b.id);else Life.removeBird(state,b.id);walk.delete(b.id);selected=null;card.hidden=true;picker.value='';notice(`${b.name} has left the farm.`);ui();save();draw();picker.focus();
};
restart.onclick=()=>{if(state.birds.length||state.eggs.length)return;state.birds=Life.create().birds;notice('Clover & Bramble. A fresh little beginning.');ui();save();draw()};
function ui(){
 const signature=JSON.stringify(animals().map(b=>[b.id,b.name,b.stage,b.sex]));
 if(signature!==flockOptions){flockOptions=signature;picker.replaceChildren(new Option('Meet a farm friend…',''));for(const b of animals())picker.add(new Option(`${b.name} · ${b.stage==='chick'?'chick':b.sex}`,b.id))}
 picker.value=animals().some(b=>b.id===selected)?selected:'';picker.disabled=!animals().length;restart.hidden=!!(state.birds.length||state.eggs.length);
document.querySelector('#adults').textContent=state.birds.filter(b=>b.stage==='adult').length;document.querySelector('#chicks').textContent=state.birds.filter(b=>b.stage==='chick').length;document.querySelector('#eggs').textContent=state.eggs.length;inspect();if(Date.now()>noticeUntil)moment.textContent=state.eggs.length?'Something small is on its way.':state.birds.length+state.eggs.length>=Life.LIMIT?'A full little family. Room for 16, love for everyone.':'Feed, hatch, grow. No hurry at all.'}
function tick(now){const events=Life.advance(state,now);if(events.length)notice(events.at(-1));ui();save()}
function update(dt){
 if(!paused){
  // Predation counts only time spent visibly in the farm, never hidden/offline catch-up.
  if(!document.hidden){const result=Life.foxStep(state,foxVisitor,dt);foxVisitor=result.visitor;if(result.lost){walk.delete(result.lost.id);notice(`A fox caught ${result.lost.name}. It is carrying the chicken away.`);ui();save()}}

  clock+=dt;
  for(const b of animals()){
   let m=walk.get(b.id);
   if(!m){m={x:b.x,y:b.y,rest:0,hasGoal:false,left:false,phase:Math.random()*8,angle:Math.random()*Math.PI*2,routeIn:0,pace:.85+Math.random()*.3};walk.set(b.id,m)}
   m.rest=Math.max(0,m.rest-dt);m.routeIn-=dt;
   let target=null,best=Infinity;
   for(const g of grain){const d=Math.hypot((g.x-b.x)*W,(g.y-b.y)*H);if(d<best){best=d;target=g}}
   if(target){m.x=target.x;m.y=target.y;m.hasGoal=true;m.rest=0}
   else if(m.rest<=0&&(!m.hasGoal||m.routeIn<=0||Math.hypot((m.x-b.x)*W,(m.y-b.y)*H)<15)){
    // Independent waypoints and gentle steering keep the flock meandering like the koi.
    for(let attempt=0;attempt<6;attempt++){m.x=.19+Math.random()*.61;m.y=.41+Math.random()*.4;if(Math.hypot((m.x-b.x)*W,(m.y-b.y)*H)>30)break}
    m.hasGoal=true;m.routeIn=4+Math.random()*5;m.pace=.85+Math.random()*.3;
    if(Math.random()<.08)m.rest=.25+Math.random()*.5;
   }
   const dx=(m.x-b.x)*W,dy=(m.y-b.y)*H,d=Math.hypot(dx,dy);
   const reach=b.stage==='chick'?6:10;
   if(target&&d<=reach){
    grain.splice(grain.indexOf(target),1);Life.feed(b);hearts.push({x:b.x,y:b.y-.04,life:1});m.hasGoal=false;m.moving=false;m.rest=.18;
   }else if(m.hasGoal&&m.rest<=0){
    const sway=target?0:Math.sin(clock*.65+m.phase)*.35;
    const desired=Math.atan2(dy,dx)+sway,delta=Math.atan2(Math.sin(desired-m.angle),Math.cos(desired-m.angle));
    const turn=(target?3.8:1.65)*dt;m.angle+=Math.max(-turn,Math.min(turn,delta));
    const speed=(target?19:12)*m.pace*(b.species==='cow'?.7:b.stage==='chick'?1.12:1)*(1+.08*Math.sin(clock*1.4+m.phase));
    const vx=Math.cos(m.angle),vy=Math.sin(m.angle);
    b.x+=vx*speed*dt/W;b.y+=vy*speed*dt/H;
    // Turn back into the yard at its edges instead of waiting against a fence.
    if(b.x<.17||b.x>.82){b.x=Math.max(.17,Math.min(.82,b.x));m.angle=Math.PI-m.angle;m.hasGoal=false}
    if(b.y<.4||b.y>.82){b.y=Math.max(.4,Math.min(.82,b.y));m.angle=-m.angle;m.hasGoal=false}
    if(Math.abs(vx)>.18)m.left=vx<0;m.moving=true;
   }else m.moving=false;

  }
 // Give the little flock room even when several birds chase the same grain.
 const herd=animals();
 for(let i=0;i<herd.length;i++)for(let j=i+1;j<herd.length;j++){
  const a=herd[i],b=herd[j],dx=(b.x-a.x)*W,dy=(b.y-a.y)*H,d=Math.hypot(dx,dy),space=(a.species==='cow'?15:a.stage==='chick'?5:8)+(b.species==='cow'?15:b.stage==='chick'?5:8);
  if(d<space){const ux=d>0?dx/d:1,uy=d>0?dy/d:0,push=(space-d)*.5;
   a.x=Math.max(.17,Math.min(.82,a.x-ux*push/W));a.y=Math.max(.4,Math.min(.82,a.y-uy*push/H));
   b.x=Math.max(.17,Math.min(.82,b.x+ux*push/W));b.y=Math.max(.4,Math.min(.82,b.y+uy*push/H));
  }
 }
 for(let i=grain.length-1;i>=0;i--){grain[i].life-=dt;if(grain[i].life<=0)grain.splice(i,1)}for(let i=hearts.length-1;i>=0;i--){hearts[i].life-=dt*.7;if(hearts[i].life<=0)hearts.splice(i,1)}}
}
function frame(ts){
 requestAnimationFrame(frame);
 const dt=Math.min(.05,(ts-last)/1000||0);last=ts;
 if(document.hidden)return;
 update(dt);
 if(ts-lastRules>1000){lastRules=ts;tick(Date.now())}draw();
}
window.addEventListener('storage',e=>{if(e.key===Life.KEY){receiveCow();ui();draw()}});
window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',()=>{if(document.hidden)save();else{last=performance.now();tick(Date.now())}});new ResizeObserver(resize).observe(canvas);tick(Date.now());if(returning)notice('Welcome back. Your little family is right here.');resize();Runtime.runBackground(update,()=>{const now=performance.now();if(now-lastRules>1000){lastRules=now;tick(Date.now())}},()=>paused);requestAnimationFrame(frame);
})();
