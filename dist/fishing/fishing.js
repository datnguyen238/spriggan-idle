import * as T from '../claw/vendor/three.module.min.js';
import {FishingScene, createFishModel} from './fishing-scene.js?v=fish-approach-1';

const Life = window.FishingLife;
const $ = selector => document.querySelector(selector);
const text = (selector, value) => {const node=$(selector);if(node.textContent!==String(value))node.textContent=String(value);};
const SETTINGS_KEY='spriggan.fishing.settings.v1';
const defaults={evening:false,rain:false,sound:false,method:'hold'};
let settings={...defaults};
try {const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY));if(saved&&typeof saved==='object')settings={evening:saved.evening===true,rain:saved.rain===true,sound:saved.sound===true,method:saved.method==='toggle'?'toggle':'hold'};} catch {}
const savedAtmosphere={rain:settings.rain,sound:settings.sound};
const atmosphereQuery=new URLSearchParams(window.location.search);
let previewRain=atmosphereQuery.get('weather')==='rain',previewNature=atmosphereQuery.get('nature')==='1';
if(previewRain)settings.rain=true;if(previewNature)settings.sound=true;
let guide=Life.createProgress();
try {guide=Life.decodeProgress(localStorage.getItem(Life.KEY));} catch {}
const session=Life.createSession();
const spots={reeds:{x:3,z:-1.9},open:{x:1,z:.3},deep:{x:2.6,z:.7}};
const spotNames={reeds:'Reeds',open:'Open water',deep:'Deep pool'};
let spot='open',target=spots.open,holding=false,paused=false,scene=null,last=performance.now(),lastPhase='',guideSelection=guide.lastCatch?.species||Life.SPECIES[0].id;
let saveFailed=false,seenCatch=null,uiElapsed=0,portrait=null,portraitModel=null,portraitHost=null,suppressReelClick=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const action=$('#fishing-action'),journal=$('#field-guide'),riverSettings=$('#river-settings');
const controllerToggle=$('#toggle-controls'),controllerPanel=$('#fishing-panel'),controllerHome=$('#fishing-controls-view');
let guideOpen=false;
const isSuspended=()=>paused||riverSettings.open||document.hidden;
const discoveries=()=>Object.keys(guide.records).length;
const fishById=id=>Life.SPECIES.find(f=>f.id===id)||Life.SPECIES[0];
function saveSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify({...settings,rain:previewRain?savedAtmosphere.rain:settings.rain,sound:previewNature?savedAtmosphere.sound:settings.sound}));}catch{}}
function saveGuide(){try{localStorage.setItem(Life.KEY,Life.encodeProgress(guide));saveFailed=false;}catch{saveFailed=true;}syncSave();}
function syncSave(){text('#save-status',saveFailed?'Your guide is in memory. This browser could not save it.':'Discoveries save in this browser.');}

// Share the pond's recordings, seamless rain loop, and playback recovery rules.
// A remembered preference shows a resume action; it never starts media on load.
let riverAudio=null,soundAuthorized=false,audioPageHidden=false,audioMessage='';
const audioHidden=()=>document.hidden||audioPageHidden;
function syncAudioStatus(){
 const status=$('#river-audio-status'),resume=$('#river-audio-resume');
 const needsResume=settings.sound&&!audioHidden()&&(!soundAuthorized||!riverAudio||riverAudio.needsResume);
 if(resume)resume.hidden=!needsResume;
 const message=!settings.sound?'Nature sounds are off.':audioHidden()?'Nature sounds pause while you are away.':
  !soundAuthorized?'Tap Resume nature sounds to listen.':audioMessage||
  (riverAudio?.loading.size?'Nature sounds are loading…':needsResume?'Tap Resume nature sounds to continue.':settings.rain?'Nature and rain sounds are on.':'Nature sounds are on.');
 if(status&&status.textContent!==message)status.textContent=message;
}
function pondAudio(){
 if(riverAudio)return riverAudio;
 const audio=new window.PondAudio(()=>{},message=>{
  audioMessage=message.replace(/Tap its button to retry\./,'Tap Resume nature sounds to retry.');syncAudioStatus();
 },()=>syncAudioStatus());
 // PondAudio's default filenames are relative to its page. Remap before any play().
 audio.player('ambient').src=new URL('../pond/mixkit-night-crickets-near-the-swamp-1782.wav',import.meta.url).href;
 audio.player('rain').src=new URL('../pond/rain-seamless.wav',import.meta.url).href;
 audio.setVolume(40);riverAudio=audio;return audio;
}
async function syncSound(userGesture=false){
 try{
  if(!settings.sound){
   audioMessage='';
   if(riverAudio)await Promise.all([riverAudio.toggle('ambient',false),riverAudio.toggle('rain',false)]);
  }else if(audioHidden()){
   if(riverAudio)await riverAudio.visibility(true);
  }else{
   if(userGesture)soundAuthorized=true;
   if(!soundAuthorized){syncAudioStatus();return;}
   audioMessage='';const audio=pondAudio(),jobs=[];
   for(const [name,wanted] of [['ambient',true],['rain',settings.rain]])if(audio.enabled[name]!==wanted)jobs.push(audio.toggle(name,wanted));
   if(audio.hidden)jobs.push(audio.visibility(false));
   else if(userGesture||audio.needsResume)jobs.push(audio.resume());
   await Promise.all(jobs);
  }
 }catch{audioMessage='Nature sounds could not start. Tap Resume nature sounds to retry.';}
 syncAudioStatus();
}
// Keep the fishing cues visual and let the nature recordings stay undisturbed.
function noteTone(){}
$('#river-audio-resume')?.addEventListener('click',()=>syncSound(true));

function openScene(){
 try{scene?.dispose();scene=null;scene=new FishingScene($('#river-scene'));scene.aimAt(target);$('#scene-error').hidden=true;$('.river-loading').hidden=true;}
 catch(error){$('#scene-error').hidden=false;$('.river-loading').hidden=true;}
}
$('#retry-scene').onclick=()=>{openScene();if(scene){paused=false;last=performance.now();sync();}};
$('#river-scene').addEventListener('fishing-scene-lost',()=>{holding=false;paused=true;$('#scene-error').hidden=false;text('#scene-error-copy','The river view paused. Reopen it to continue; your discoveries are safe.');sync();});
$('#river-scene').addEventListener('fishing-scene-restored',()=>{$('#scene-error').hidden=true;paused=false;last=performance.now();sync();});
$('#river-scene').addEventListener('fishing-spot',event=>{
 if(isSuspended())return;
 if(session.phase==='idle'||session.phase==='escaped'){
  if(session.phase==='escaped')Life.release(session);
  const detail=event.detail;if(!spots[detail.spot])return;
  spot=detail.spot;target=detail.target||spots[spot];scene?.aimAt(target);startCast();
 }else if(session.phase==='bite')hook();
});
for(const button of document.querySelectorAll('[data-spot]'))button.onclick=()=>{
 if(!['idle','escaped'].includes(session.phase))return;
 spot=button.dataset.spot;target=spots[spot];scene?.aimAt(target);sync();
};
function startCast(){holding=false;scene?.aimAt(target);Life.cast(session,{spot,rain:settings.rain,evening:settings.evening});syncSound(true);sync();}
function hook(){if(Life.hook(session)){holding=false;noteTone('hook');sync();}}
function releaseFish(){holding=false;Life.release(session);$('#catch-note').hidden=true;sync();}
function act(){
 if(riverSettings.open)return;
 if(paused){paused=false;last=performance.now();sync();return;}
 if(session.phase==='idle')startCast();
 else if(session.phase==='bite')hook();
 else if(session.phase==='caught')releaseFish();
 else if(session.phase==='escaped'){Life.release(session);startCast();}
}
action.addEventListener('click',event=>{
 if(suppressReelClick){suppressReelClick=false;return;}
 if(session.phase==='reeling'&&!isSuspended()){
  if(settings.method==='toggle'){holding=!holding;sync();}
  return;
 }
 act();
});
action.addEventListener('pointerdown',event=>{
 suppressReelClick=false;
 if(event.button!==0||session.phase!=='reeling'||isSuspended()||settings.method==='toggle')return;
 event.preventDefault();action.focus({preventScroll:true});holding=true;suppressReelClick=true;action.setPointerCapture(event.pointerId);sync();
});
function stopHolding(){if(settings.method==='hold'&&holding){holding=false;sync();}}
action.addEventListener('pointerup',stopHolding);action.addEventListener('pointercancel',()=>{holding=false;suppressReelClick=false;sync();});action.addEventListener('lostpointercapture',stopHolding);
$('#lift-line').onclick=()=>{holding=false;Life.release(session);sync();};
function controlKey(event){
 if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey)return;
 if(event.code!=='Space'&&event.key!=='Enter')return;
 const onAction=event.target===action||action.contains(event.target);
 if(!onAction&&event.target.closest?.('button,a,input,select,textarea,summary,dialog,[contenteditable=true]'))return;
 if(!onAction&&event.code!=='Space')return;
 if(session.phase==='reeling'&&!isSuspended()){
  event.preventDefault();if(settings.method==='toggle'){if(!event.repeat)holding=!holding;}else holding=true;sync();
 }else if(!onAction){event.preventDefault();if(!event.repeat)act();}
}
document.addEventListener('keydown',controlKey);
document.addEventListener('keyup',event=>{if(event.code==='Space'||event.key==='Enter')stopHolding();});
window.addEventListener('blur',()=>{holding=false;last=performance.now();sync();});
document.addEventListener('visibilitychange',()=>{holding=false;last=performance.now();syncSound();sync();});
window.addEventListener('pagehide',()=>{holding=false;audioPageHidden=true;saveSettings();syncSound();});
window.addEventListener('pageshow',()=>{audioPageHidden=false;last=performance.now();syncSound();});
window.addEventListener('storage',event=>{
 if(event.key!==Life.KEY||!event.newValue)return;
 const latest=Life.decodeProgress(event.newValue);if(latest.total>=guide.total){guide=latest;syncGuide();}
});

function syncSettings(){
 document.body.dataset.evening=String(settings.evening);
 $('#river-evening').setAttribute('aria-pressed',String(settings.evening));text('#river-evening',settings.evening?'Daylight':'Evening');
 $('#river-rain').setAttribute('aria-pressed',String(settings.rain));text('#river-rain',settings.rain?'Remove rain':'Add rain');
 $('#river-sound').setAttribute('aria-pressed',String(settings.sound));text('#river-sound',settings.sound?'Nature sounds on':'Nature sounds off');
 $('#river-pause').setAttribute('aria-pressed',String(paused));text('#river-pause',paused?'Resume fishing':'Pause fishing');
 for(const b of document.querySelectorAll('[data-method]'))b.setAttribute('aria-pressed',String(b.dataset.method===settings.method));
 text('#river-condition',`${settings.evening?'Evening':'Daylight'} · ${settings.rain?'A passing shower':'The river is open'}`);
 text('.keyboard-note',`Space to cast · ${settings.method==='hold'?'Hold':'Tap'} Space to reel`);
 syncAudioStatus();
}
$('#river-evening').onclick=()=>{settings.evening=!settings.evening;saveSettings();syncSettings();};
$('#river-rain').onclick=()=>{previewRain=false;settings.rain=!settings.rain;saveSettings();syncSettings();syncSound(true);};
$('#river-sound').onclick=()=>{previewNature=false;settings.sound=!settings.sound;saveSettings();syncSettings();syncSound(true);};
$('#river-pause').onclick=()=>{paused=!paused;holding=false;syncSettings();sync();};
for(const b of document.querySelectorAll('[data-method]'))b.onclick=()=>{settings.method=b.dataset.method;holding=false;saveSettings();syncSettings();sync();};
function setGuideView(open){
 const wasOpen=guideOpen;guideOpen=open;journal.hidden=!open;controllerHome.hidden=open;$('#close-guide').hidden=!open;
 if(wasOpen!==open)$('#fishing-panel-scroll').scrollTop=0;
 text('#controller-title',open?'Field guide':'By the river');
 if(wasOpen&&!open&&session.phase==='caught')showPortrait($('#catch-portrait'),session.fish);
}
function syncController(){
 const open=riverSettings.open;
 controllerToggle.setAttribute('aria-expanded',String(open));
 controllerToggle.setAttribute('aria-label',open?'Close fishing controls':'Open fishing controls');
 controllerPanel.inert=!open;controllerPanel.setAttribute('aria-hidden',String(!open));
 if(!open&&guideOpen)setGuideView(false);
}
function openController(){
 holding=false;riverSettings.open=true;last=performance.now();sync();
}
function closeController(restoreFocus=true){
 const wasOpen=riverSettings.open;holding=false;riverSettings.open=false;last=performance.now();sync();
 if(wasOpen&&restoreFocus)controllerToggle.focus({preventScroll:true});
}
controllerToggle.addEventListener('click',event=>{
 event.preventDefault();if(riverSettings.open)closeController();else openController();
});
$('#close-fishing-controls').onclick=()=>closeController();
// Native details toggle events are queued. An opening notification must not reset a guide just opened by the catch card.
riverSettings.addEventListener('toggle',()=>{holding=false;last=performance.now();sync();});
document.addEventListener('pointerdown',event=>{
 if(!riverSettings.open||riverSettings.contains(event.target))return;
 const focusWouldStayHidden=controllerPanel.contains(document.activeElement)&&!event.target.closest?.('button,a,input,select,textarea,summary,[tabindex],[contenteditable=true]');
 closeController(focusWouldStayHidden);
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&riverSettings.open){event.preventDefault();closeController();}
});

function makeIcon(){
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
 icon.innerHTML='<path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0Zm15 0 4-4v8l-4-4Z"/><circle cx="8" cy="11" r=".7"/>';return icon;
}
function syncGuide(){
 const count=discoveries();text('#guide-count',`${count} of ${Life.SPECIES.length} discovered`);
 $('#open-guide').setAttribute('aria-label',`Open field guide, ${count} of ${Life.SPECIES.length} fish discovered`);
 text('#journal-progress',count===Life.SPECIES.length?'Every little mystery has a name.':`${count} of ${Life.SPECIES.length} fish discovered · ${guide.total} ${guide.total===1?'catch':'catches'} recorded`);
 const list=$('#fish-index');list.replaceChildren();
 Life.SPECIES.forEach((fish,i)=>{
  const known=!!guide.records[fish.id],b=document.createElement('button');b.type='button';b.dataset.species=fish.id;b.dataset.discovered=String(known);b.setAttribute('aria-current',String(fish.id===guideSelection));
  const icon=makeIcon(),copy=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
  name.textContent=known?fish.name:`Unknown fish ${String(i+1).padStart(2,'0')}`;detail.textContent=known?`${guide.records[fish.id].count} ${guide.records[fish.id].count===1?'encounter':'encounters'}`:'Waiting to be discovered';copy.append(name,detail);b.append(icon,copy);b.onclick=()=>selectSpecimen(fish.id);list.append(b);
 });
 if(guideOpen)selectSpecimen(guideSelection);
}
function selectSpecimen(id){
 guideSelection=id;const fish=fishById(id),record=guide.records[id],known=!!record;
 for(const b of document.querySelectorAll('[data-species]')){
  const selected=b.dataset.species===id;b.setAttribute('aria-current',String(selected));
  if(selected&&guideOpen)b.scrollIntoView?.({block:'nearest',inline:'nearest'});
 }
 text('#specimen-number',`${String(Life.SPECIES.indexOf(fish)+1).padStart(2,'0')} / ${String(Life.SPECIES.length).padStart(2,'0')}`);
 text('#specimen-name',known?fish.name:'A quiet silhouette');text('#specimen-note',fish.hint);
 text('#specimen-count',known?`${record.count} ${record.count===1?'time':'times'}`:'Not yet');text('#specimen-best',known?`${record.bestLength.toFixed(1)} cm`:'—');
 text('#specimen-habitat',known?`${fish.rarity} · ${spotNames[fish.habitat]}`:`Look near ${spotNames[fish.habitat].toLowerCase()}.`);
 $('#guide-portrait').setAttribute('aria-label',known?`${fish.name}, a miniature fish specimen`:'Silhouette of an undiscovered fish');
 showPortrait($('#guide-portrait'),fish,!known);
}
function openGuide(id){
 openController();if(id)guideSelection=id;setGuideView(true);
 syncGuide();last=performance.now();sync();$('#close-guide').focus({preventScroll:true});
}
function closeGuide(){setGuideView(false);last=performance.now();holding=false;sync();$('#open-guide').focus({preventScroll:true});}
$('#open-guide').onclick=()=>openGuide();$('#catch-guide').onclick=()=>openGuide(session.catch?.species);
$('#close-guide').onclick=closeGuide;$('#return-river').onclick=closeGuide;

function showPortrait(host,fish,silhouette=false){
 try{
  if(!portrait){
   const renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=T.SRGBColorSpace;
   const scene=new T.Scene();scene.add(new T.HemisphereLight(0xfff5dc,0x758a78,2));const light=new T.DirectionalLight(0xfff2d7,2.3);light.position.set(-1,3,4);scene.add(light);
   const camera=new T.OrthographicCamera(-1,1,.5,-.5,.01,20);camera.position.set(.8,.55,2.6);camera.lookAt(0,0,0);portrait={renderer,scene,camera};renderer.domElement.setAttribute('aria-hidden','true');
  }
  if(portraitModel){portrait.scene.remove(portraitModel);const geometries=new Set(),materials=new Set();portraitModel.traverse(n=>{if(n.geometry)geometries.add(n.geometry);if(n.material)materials.add(n.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}
  portraitModel=createFishModel(fish);portraitModel.rotation.y=-.1;
  if(silhouette)portraitModel.traverse(n=>{if(n.material){n.material.color?.set(0x566d60);n.material.emissive?.set(0x000000);n.material.roughness=1;}});
  portrait.scene.add(portraitModel);portraitHost=host;host.replaceChildren(portrait.renderer.domElement);renderPortrait();
 }catch{host.replaceChildren(makeIcon());}
}
function renderPortrait(){
 if(!portrait||!portraitHost?.isConnected)return;
 const width=portraitHost.clientWidth||240,height=portraitHost.clientHeight||140,aspect=width/height;
 portraitModel.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(portraitModel),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
 const halfHeight=Math.max(size.y*.75,size.x/aspect*.7,size.z*.7,.21);
 portrait.camera.position.set(center.x+.8,center.y+.55,center.z+2.6);portrait.camera.lookAt(center);
 portrait.camera.left=-halfHeight*aspect;portrait.camera.right=halfHeight*aspect;portrait.camera.top=halfHeight;portrait.camera.bottom=-halfHeight;portrait.camera.updateProjectionMatrix();
 portrait.renderer.setSize(width,height,false);portrait.renderer.render(portrait.scene,portrait.camera);
}
new ResizeObserver(()=>renderPortrait()).observe($('#guide-portrait'));
new ResizeObserver(()=>renderPortrait()).observe($('#catch-portrait'));
new ResizeObserver(()=>document.body.style.setProperty('--fishing-action-height',`${$('.fishing-action').offsetHeight}px`)).observe($('.fishing-action'));

function landed(){
 const receipt=session.catch;if(!receipt||seenCatch===receipt.id)return;seenCatch=receipt.id;holding=false;
 try{const saved=Life.decodeProgress(localStorage.getItem(Life.KEY));if(saved.total>=guide.total)guide=saved;}catch{}
 const first=!guide.records[receipt.species],oldBest=guide.records[receipt.species]?.bestLength||0;
 if(Life.recordCatch(guide,receipt))saveGuide();
 text('#catch-discovery',first?'A new discovery':receipt.length>oldBest?'Your largest yet':'Hello again');text('#catch-name',session.fish.name);text('#catch-size',`${receipt.length.toFixed(1)} cm · ${session.fish.rarity}`);
 text('#catch-description',first?'A new page in your field guide.':receipt.length>oldBest?'A new measurement for your notes.':'A brief hello, then back to the river.');
 $('#catch-note').hidden=false;showPortrait($('#catch-portrait'),session.fish);syncGuide();noteTone('catch');
}
function sync(){
 syncController();
 document.body.dataset.phase=session.phase;document.body.dataset.holding=String(holding);
 const suspended=isSuspended(),phase=session.phase;
 const labels={idle:'Cast a line',casting:'Casting…',waiting:'Watching the float…',bite:'Hook!',reeling:settings.method==='toggle'?(holding?'Give it slack':'Reel in'):'Hold to reel',caught:'Release fish',escaped:'Cast again'};
 text('#action-label',paused?'Resume fishing':labels[phase]);
 action.disabled=!paused&&(phase==='casting'||phase==='waiting');
 if(phase==='reeling')action.setAttribute('aria-pressed',String(holding));else action.removeAttribute('aria-pressed');
 action.setAttribute('aria-label',paused?'Resume fishing':phase==='reeling'?`${labels.reeling}. Release when the line grows tight.`:labels[phase]);
 $('#lift-line').hidden=!['waiting','bite','reeling'].includes(phase);$('#reel-readout').hidden=phase!=='reeling';
 $('#cast-spots').hidden=false;
 for(const b of document.querySelectorAll('[data-spot]')){b.setAttribute('aria-pressed',String(b.dataset.spot===spot));b.disabled=!['idle','escaped'].includes(phase);}
 const hints={idle:'Choose a spot, or tap the water to cast.',casting:'A small arc, a quiet splash.',waiting:'Watch the fish approach. Wait for the float to dip.',bite:'The float is under. Tap to set the hook!',reeling:settings.method==='toggle'?'Tap to reel. Tap again to give the fish slack.':'Hold to reel. Let go when the line tightens.',caught:'Recorded in your guide. Ready to swim another day.',escaped:session.escapeReason+' Nothing lost. Cast again.'};
 text('#action-hint',paused?'Fishing paused. Resume whenever you like.':guideOpen?'Your line can wait while you read.':riverSettings.open?'A quiet moment while you adjust the river.':hints[phase]);
 if(!suspended&&phase==='reeling')syncReel();
 syncSettings();
}
function syncReel(){
 $('#line-tension').value=session.tension;$('#reel-progress').value=session.progress;
 $('#reel-readout').style.setProperty('--line-tension',`${session.tension*100}%`);$('#reel-readout').dataset.tight=String(session.tension>.77);
 text('#line-feel',session.tension>.77?'Line is tight':session.struggling?'The fish is pulling':'Line is relaxed');
 text('#reel-guidance',session.tension>.77?'Give it some slack':holding?'Easy does it':settings.method==='hold'?'Hold to reel':'Tap to reel');
}
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min(.06,Math.max(0,(now-last)/1000));last=now;
 if(document.hidden)return;
 if(!isSuspended())Life.step(session,dt,holding);
 if(session.phase!==lastPhase){lastPhase=session.phase;if(session.phase==='bite')noteTone('bite');if(session.phase==='caught')landed();sync();}
 uiElapsed+=dt;if(uiElapsed>.08){uiElapsed=0;if(session.phase==='reeling')syncReel();}
 try{scene?.update(session,isSuspended()?0:dt,{evening:settings.evening,rain:settings.rain,reducedMotion:reduced.matches||isSuspended(),discoveries:discoveries()});}
 catch{scene?.dispose();scene=null;holding=false;$('#scene-error').hidden=false;sync();}
}
syncSettings();syncGuide();syncSave();sync();openScene();requestAnimationFrame(frame);
