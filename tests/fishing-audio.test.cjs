const test=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/fishing-ui.cjs');
function setup(options){const h=harness(options);h.openControls();h.openSectionFor('#river-sound');return h;}
const SETTINGS_KEY='spriggan.fishing.settings.v1';
function assertPondRecording(value,filename){
  const url=new URL(value);
  assert.equal(url.origin,'https://spriggan.test');assert.equal(url.pathname,'/pond/'+filename);
  assert.match(url.search,/^\?v=perf-[a-f0-9]{16}$/);assert.equal(url.hash,'');
}

test('opening and foregrounding the dock create no players, audio contexts, or recording requests',async()=>{
  for(const settings of [undefined,{sound:true,rain:true}]){
    const h=setup({settings});h.window.fire('pageshow');h.document.fire('visibilitychange');await h.flush();
    assert.equal(h.value('riverAudio'),null);assert.equal(h.audio.players.length,0);
    assert.equal(h.audio.contexts.length,0);assert.equal(h.audio.fetches.length,0);
    assert.equal(h.$('#river-audio-resume').hidden,!settings?.sound);
  }
});

test('the first nature gesture uses the actual pond controller and its recording at the correct URL',async()=>{
  const h=setup();h.click('#river-sound');
  assert.equal(h.audio.players.length,1,'the native nature element is created inside the gesture');
  assert.equal(h.audio.players[0].calls.length,1,'play is requested synchronously with the gesture');
  await h.flush();
  assert.equal(h.value('riverAudio instanceof window.PondAudio'),true);
  assert.equal(h.value("riverAudio.players.get('rain') instanceof PondRainLoop"),true);
  assertPondRecording(h.audio.players[0].src,'mixkit-night-crickets-near-the-swamp-1782.wav');
  assert(h.audio.players[0].calls.every(url=>url===h.audio.players[0].src));
  assert.equal(h.audio.players[0].preload,'none');assert.equal(h.audio.players[0].loop,true);
  assert.equal(h.audio.contexts.length,0,'the nature recording needs no synthesized music context');
  assert.equal(h.audio.fetches.length,0,'rain is not fetched while the weather is dry');
  assert.equal(h.$('#river-sound').getAttribute('aria-pressed'),'true');
  assert.equal(h.$('#river-sound').textContent,'Nature sounds on');
  assert.equal(h.$('#river-audio-resume').hidden,true);
});

test('controller rain updates weather settings and adds the pond seamless loop only when sound is enabled',async()=>{
  const h=setup();h.click('#river-rain');await h.flush();
  assert.equal(h.value('settings.rain'),true);assert.equal(h.audio.players.length,0);
  assert.equal(h.$('#river-rain').getAttribute('aria-pressed'),'true');
  assert.equal(h.$('#river-rain').textContent,'Remove rain');
  h.click('#river-sound');await h.flush();
  assert.equal(h.audio.fetches.length,1);assertPondRecording(h.audio.fetches[0],'rain-seamless.wav');
  assert.equal(h.value("riverAudio.isPlaying('rain')"),true);
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);
  assert.equal(h.value("riverAudio.players.get('rain').source.loop"),true);
  assert.equal(h.value("riverAudio.players.get('rain').volume"),.2);
  h.click('#river-rain');await h.flush();
  assert.equal(h.value("riverAudio.isPlaying('rain')"),false);
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);
  assert.equal(h.$('#river-rain').getAttribute('aria-pressed'),'false');
  assert.equal(h.$('#river-rain').textContent,'Add rain');
});

test('master mute pauses nature and rain while the chosen rainy weather remains visible',async()=>{
  const h=setup({settings:{rain:true}});h.click('#river-sound');await h.flush();
  h.click('#river-sound');await h.flush();
  assert.equal(h.value('settings.sound'),false);assert.equal(h.value('settings.rain'),true);
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),false);
  assert.equal(h.value("riverAudio.isPlaying('rain')"),false);
  assert.equal(h.audio.players[0].paused,true);assert.equal(h.audio.contexts[0].state,'closed');
  assert.equal(h.$('#river-rain').getAttribute('aria-pressed'),'true');
  h.document.fire('visibilitychange');h.window.fire('pageshow');await h.flush();
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),false);
  assert.equal(h.$('#river-audio-resume').hidden,true);
});

test('backgrounding and page lifecycle pause both layers and reuse their authorized recordings on return',async()=>{
  const h=setup({settings:{rain:true}});h.click('#river-sound');await h.flush();
  const player=h.audio.players[0],buffer=h.value("riverAudio.players.get('rain').buffer");
  h.document.hidden=true;h.document.fire('visibilitychange');await h.flush();
  assert.equal(player.paused,true);assert.equal(h.value("riverAudio.players.get('rain').paused"),true);
  h.document.hidden=false;h.document.fire('visibilitychange');await h.flush();
  assert.equal(player.paused,false);assert.equal(h.value("riverAudio.isPlaying('rain')"),true);
  assert.equal(h.value("riverAudio.players.get('rain').buffer"),buffer);assert.equal(h.audio.fetches.length,1);
  h.window.fire('pagehide');await h.flush();assert.equal(player.paused,true);
  assert.equal(h.value("riverAudio.players.get('rain').paused"),true);
  h.window.fire('pageshow');await h.flush();assert.equal(player.paused,false);
  assert.equal(h.value("riverAudio.isPlaying('rain')"),true);assert.equal(h.audio.players.length,1);
  assert.equal(h.audio.fetches.length,1);assert.equal(h.audio.contexts.length,3);
});

test('a blocked start preserves the sound preference and recovers through the visible resume action',async()=>{
  const h=setup({audioPolicy:'block',settings:{rain:true}});h.click('#river-sound');await h.flush();
  assert.equal(h.value('settings.sound'),true);assert.equal(h.$('#river-audio-resume').hidden,false);
  assert.match(h.$('#river-audio-status').textContent,/Resume nature sounds/);
  assert.equal(JSON.parse(h.storage.get(SETTINGS_KEY)).sound,true);
  assert.equal(h.$('#river-sound').getAttribute('aria-pressed'),'true');
  h.audio.policy='allow';h.openControls();h.click('#river-audio-resume');await h.flush();
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);
  assert.equal(h.value("riverAudio.isPlaying('rain')"),true);
  assert.equal(h.$('#river-audio-resume').hidden,true);assert.equal(h.audio.players.length,1);
});

test('blocked automatic foreground playback exposes resume without changing the enabled layers',async()=>{
  const h=setup();h.click('#river-sound');await h.flush();
  h.document.hidden=true;h.document.fire('visibilitychange');await h.flush();h.audio.policy='block';
  h.document.hidden=false;h.document.fire('visibilitychange');await h.flush();
  assert.equal(h.$('#river-audio-resume').hidden,false);assert.equal(h.value('settings.sound'),true);
  assert.equal(h.value('riverAudio.enabled.ambient'),true);
  assert.equal(h.audio.timers.size,1,'the shared controller has one bounded return retry');
  h.audio.policy='allow';h.openControls();h.click('#river-audio-resume');await h.flush();
  assert.equal(h.$('#river-audio-resume').hidden,true);
});

test('recording load errors report a retry action while fishing remains playable',async()=>{
  const h=setup({audioPolicy:'error'});h.click('#river-sound');await h.flush();
  assert.match(h.$('#river-audio-status').textContent,/could not load/);
  assert.equal(h.$('#river-audio-resume').hidden,false);assert.equal(h.value('settings.sound'),true);
  assert.doesNotThrow(()=>h.reel());
  h.value('session.progress=.999;session.tension=.2;holding=true');assert.doesNotThrow(()=>h.tick());
  assert.equal(h.value('guide.total'),1);assert.equal(h.$('#catch-note').hidden,false);
  await h.flush();
  h.audio.policy='allow';h.openControls();h.click('#river-audio-resume');await h.flush();
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);
});

test('a failed rain request is retryable at the same pond URL while nature keeps playing',async()=>{
  const h=setup({settings:{rain:true},fetchFails:true});h.click('#river-sound');await h.flush();
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);
  assert.equal(h.value("riverAudio.isPlaying('rain')"),false);
  assert.match(h.$('#river-audio-status').textContent,/Rain sound could not load/);
  assert.equal(h.$('#river-audio-resume').hidden,false);
  h.audio.fetchFails=false;h.click('#river-audio-resume');await h.flush();
  assert.equal(h.value("riverAudio.isPlaying('rain')"),true);assert.equal(h.audio.fetches.length,2);
  assertPondRecording(h.audio.fetches[0],'rain-seamless.wav');assert(h.audio.fetches.every(url=>url===h.audio.fetches[0]));
});

test('casting is a valid gesture for a remembered sound preference without starting it on reload',async()=>{
  const h=setup({settings:{sound:true,rain:false}});assert.equal(h.audio.players.length,0);
  h.click('#fishing-action');assert.equal(h.audio.players[0].calls.length,1);await h.flush();
  assert.equal(h.value('session.phase'),'casting');assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);
  assert.equal(h.$('#river-audio-resume').hidden,true);
});

test('the controller resume action starts a saved or preview preference without changing it',async()=>{
 const h=setup({query:'?weather=rain&nature=1'});
 h.click('#river-audio-resume');await h.flush();
 assert.equal(h.value('settings.sound'),true);
 assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);
 assert.equal(h.value("riverAudio.isPlaying('rain')"),true);
 h.click('#river-sound');await h.flush();
 assert.equal(h.value('settings.sound'),false);
 assert.equal(h.value("riverAudio.isPlaying('ambient')"),false);
});

test('a missing audio API preserves the requested preference and never breaks game settings',async()=>{
  const h=setup({audioMissing:true});h.click('#river-sound');await h.flush();
  assert.equal(h.value('settings.sound'),true);assert.match(h.$('#river-audio-status').textContent,/could not start/);
  assert.equal(h.$('#river-audio-resume').hidden,false);assert.doesNotThrow(()=>h.reel());
  h.openControls();h.click('#river-sound');await h.flush();assert.equal(h.value('settings.sound'),false);
  assert.equal(h.$('#river-audio-resume').hidden,true);
});

test('a late native play completion cannot leak nature audio after mute',async()=>{
  const h=setup({audioPolicy:'wait'});h.click('#river-sound');const player=h.audio.players[0];
  h.click('#river-sound');player.finish();await h.flush();
  assert.equal(player.paused,true);assert.equal(h.value('settings.sound'),false);
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),false);
});

test('rain and nature preview links are immediate visual preferences with no autoplay or silent persistence',async()=>{
  const h=setup({query:'?weather=rain&nature=1'});
  assert.equal(h.value('settings.rain'),true);assert.equal(h.value('settings.sound'),true);
  assert.equal(h.$('#river-rain').getAttribute('aria-pressed'),'true');assert.equal(h.audio.players.length,0);
  assert.equal(h.$('#river-audio-resume').hidden,false);
  h.window.fire('pagehide');await h.flush();
  const saved=JSON.parse(h.storage.get(SETTINGS_KEY));assert.equal(saved.rain,false);assert.equal(saved.sound,false);
  h.window.fire('pageshow');h.click('#river-audio-resume');await h.flush();
  assert.equal(h.value("riverAudio.isPlaying('ambient')"),true);assert.equal(h.value("riverAudio.isPlaying('rain')"),true);
});
