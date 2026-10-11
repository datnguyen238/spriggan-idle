/* Deadline-based Pomodoro: background throttling never slows the countdown. */
(()=>{
  'use strict';
  const KEY='spriggan.timer.v1';
  const MIN_MINUTES=1,MAX_MINUTES=180;
  const DURATIONS=Object.freeze({focus:50*60000,short:5*60000,long:15*60000});
  const validMode=mode=>Object.prototype.hasOwnProperty.call(DURATIONS,mode);
  const validDuration=n=>Number.isInteger(n)&&n>=MIN_MINUTES*60000&&n<=MAX_MINUTES*60000&&n%60000===0;
  function validDurations(value){
    return !!value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.keys(DURATIONS).every(mode=>validDuration(value[mode]));
  }
  function create(){
    return{version:3,mode:'focus',durations:{...DURATIONS},duration:DURATIONS.focus,
      remaining:DURATIONS.focus,endsAt:null,completed:0,collapsed:false,chime:true};
  }
  function remaining(state,now=Date.now()){
    return Math.max(0,state.endsAt===null?state.remaining:state.endsAt-now);
  }
  function advance(state,now=Date.now()){
    if(state.endsAt===null||remaining(state,now)>0)return null;
    const finished=state.mode;
    if(finished==='focus')state.completed++;
    state.mode=finished==='focus'?(state.completed%4===0?'long':'short'):'focus';
    state.duration=state.durations[state.mode];
    state.remaining=state.duration;
    state.endsAt=null;
    return finished;
  }
  function toggle(state,now=Date.now()){
    const finished=advance(state,now);
    if(finished)return finished;
    if(state.endsAt!==null){
      state.remaining=remaining(state,now);
      state.endsAt=null;
    }else state.endsAt=now+state.remaining;
  }
  function select(state,mode){
    if(!validMode(mode))return;
    state.mode=mode;
    state.duration=state.durations[mode];
    state.remaining=state.duration;
    state.endsAt=null;
  }
  function setDurations(state,durations){
    if(!validDurations(durations))return false;
    state.durations=Object.fromEntries(
      Object.keys(DURATIONS).map(mode=>[mode,durations[mode]])
    );
    return true;
  }
  function decode(raw){
    try{
      const state=JSON.parse(raw);
      if(!state||![1,2,3].includes(state.version)||!validMode(state.mode)||
        !Number.isFinite(state.remaining)||state.remaining<=0||
        !(state.endsAt===null||Number.isFinite(state.endsAt))||
        !Number.isInteger(state.completed)||state.completed<0||
        state.completed>1000000)return create();

      const modern=state.version===3;
      if(modern&&(!validDurations(state.durations)||!validDuration(state.duration)))return create();

      const duration=modern?state.duration:DURATIONS[state.mode];
      if(state.remaining>duration)return create();

      const left=state.version===1&&state.mode==='focus'&&
        state.endsAt===null&&state.remaining===25*60000
        ?DURATIONS.focus:state.remaining;

      return{version:3,mode:state.mode,
        durations:modern?Object.fromEntries(
          Object.keys(DURATIONS).map(mode=>[mode,state.durations[mode]])
        ):{...DURATIONS},
        duration,remaining:left,endsAt:state.endsAt,
        completed:state.completed,collapsed:state.collapsed===true,
        chime:state.chime!==false};
    }catch{return create()}
  }
  const api={KEY,DURATIONS,MIN_MINUTES,MAX_MINUTES,create,remaining,
    advance,toggle,select,setDurations,decode};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
  const root=document.querySelector('#pomodoro');if(!root)return;
  const storageKey=root.dataset.storageKey||KEY;
  let state=create();try{const saved=localStorage.getItem(storageKey);state=decode(saved);if(!saved&&root.dataset.startCollapsed==='true')state.collapsed=true}catch{}
  const time=root.querySelector('#timer-time'),action=root.querySelector('#timer-action'),reset=root.querySelector('#timer-reset'),collapse=root.querySelector('#timer-collapse');
  const status=root.querySelector('#timer-status'),ring=root.querySelector('#timer-progress'),summary=root.querySelector('#timer-summary'),label=root.querySelector('#timer-label');
  const dots=[...root.querySelectorAll('.timer-dot')],modes=[...root.querySelectorAll('[data-timer-mode]')],originalTitle=document.title;
  const chime=new PondTimerChime(),chimeButton=root.querySelector('#timer-chime');
  const labels={focus:'Focus softly',short:'A little breathing room',long:'A longer exhale'};
  const settingsPanel=document.createElement('details');
  settingsPanel.className='timer-settings';
  settingsPanel.innerHTML=`
    <summary>Timer settings</summary>
    <form class="timer-settings-form">
      <p id="timer-settings-help">Choose whole minutes from 1 to 180. Saved durations apply when you select a session or reset. Your current countdown stays unchanged.</p>
      <div class="timer-settings-fields">
        <label for="timer-focus-minutes">Focus
          <input id="timer-focus-minutes" name="focus" type="number" min="1" max="180" step="1" required aria-describedby="timer-settings-help">
        </label>
        <label for="timer-short-minutes">Short break
          <input id="timer-short-minutes" name="short" type="number" min="1" max="180" step="1" required aria-describedby="timer-settings-help">
        </label>
        <label for="timer-long-minutes">Long break
          <input id="timer-long-minutes" name="long" type="number" min="1" max="180" step="1" required aria-describedby="timer-settings-help">
        </label>
      </div>
      <span class="timer-settings-unit">All durations are in minutes.</span>
      <div class="timer-settings-actions">
        <button type="button" data-settings-cancel>Cancel</button>
        <button type="submit">Save durations</button>
      </div>
      <button class="timer-settings-defaults" type="button" data-settings-defaults>Restore defaults</button>
    </form>`;
  root.querySelector('#timer-body').insertBefore(settingsPanel,status);

  const settingsForm=settingsPanel.querySelector('form');
  const settingsSummary=settingsPanel.querySelector('summary');
  const durationInputs=Object.fromEntries(
    Object.keys(DURATIONS).map(mode=>[
      mode,settingsForm.querySelector(`[name="${mode}"]`)
    ])
  );

  function fillDurationInputs(){
    for(const mode of Object.keys(DURATIONS)){
      durationInputs[mode].value=String(state.durations[mode]/60000);
    }
  }

  function closeSettings(){
    settingsPanel.open=false;
    fillDurationInputs();
    settingsSummary.focus();
  }

  function applyDurationSettings(durations){
    const previous={...state.durations};
    if(!setDurations(state,durations)){
      status.textContent='Enter whole minutes from 1 to 180 for every session.';
      return;
    }
    try{
      localStorage.setItem(storageKey,JSON.stringify(state));
    }catch{
      state.durations=previous;
      draw();
      status.textContent='Could not save timer settings. Your previous durations are unchanged.';
      return;
    }
    draw();
    closeSettings();
    status.textContent='Durations saved. Select a session or reset to use them now. Your current countdown is unchanged.';
  }

  settingsPanel.addEventListener('toggle',()=>{
    if(settingsPanel.open)fillDurationInputs();
  });

  settingsPanel.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&settingsPanel.open){
      event.preventDefault();
      event.stopPropagation();
      closeSettings();
    }
  });

  settingsForm.addEventListener('submit',event=>{
    event.preventDefault();
    if(!settingsForm.reportValidity())return;
    const durations=Object.fromEntries(
      Object.keys(DURATIONS).map(mode=>[
        mode,durationInputs[mode].valueAsNumber*60000
      ])
    );
    applyDurationSettings(durations);
  });

  settingsForm.querySelector('[data-settings-cancel]').onclick=closeSettings;

  settingsForm.querySelector('[data-settings-defaults]').onclick=()=>{
    applyDurationSettings({...DURATIONS});
  };

  fillDurationInputs();

  function save(){try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{}}
  function completed(finished){
    status.textContent=finished==='focus'?'Focus complete. Take a breath.':'Break complete. Begin when you’re ready.';save();if(state.chime)chime.play();
  }
  function draw(){
    const finished=advance(state);
    if(finished)completed(finished);
    const ms=remaining(state),seconds=Math.ceil(ms/1000),formatted=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`,running=state.endsAt!==null;
    chimeButton.setAttribute('aria-pressed',String(state.chime));chimeButton.setAttribute('aria-label',state.chime?'Mute timer chime':'Enable timer chime');chimeButton.title=state.chime?'Timer chime on':'Timer chime off';
    time.textContent=formatted;time.setAttribute('aria-label',`${Math.floor(seconds/60)} minutes ${seconds%60} seconds remaining`);
    label.textContent=labels[state.mode];summary.textContent=`${state.mode==='focus'?'Focus':'Break'} · ${formatted}`;
    root.dataset.mode=state.mode;root.classList.toggle('is-running',running);root.classList.toggle('is-minimized',state.collapsed);
    collapse.setAttribute('aria-expanded',String(!state.collapsed));collapse.setAttribute('aria-label',state.collapsed?'Expand Pomodoro timer':'Minimize Pomodoro timer');
    root.querySelector('#timer-body').inert=state.collapsed;
    action.querySelector('span').textContent=running?'Pause':ms<state.duration?'Resume':state.mode==='focus'?'Begin':'Start break';
    action.setAttribute('aria-label',running?'Pause timer':`Start ${state.mode==='focus'?'focus':'break'} timer`);
    action.querySelector('svg').innerHTML=running?'<path d="M8 5v14M16 5v14"/>':'<path d="m9 5 10 7-10 7Z"/>';
    ring.style.strokeDashoffset=String(163.363*(1-ms/state.duration));
    const count=state.mode==='long'?4:state.completed%4;
    dots.forEach((dot,i)=>dot.classList.toggle('is-done',i<count));
    root.querySelector('#timer-sessions').setAttribute('aria-label',`${count} of 4 focus sessions complete`);
    modes.forEach(button=>{
      const mode=button.dataset.timerMode;
      button.setAttribute('aria-pressed',String(mode===state.mode));
      const name={focus:'Focus',short:'Rest',long:'Unwind'}[mode];
      button.textContent=`${name} \u00b7 ${state.durations[mode]/60000}m`;
    });
    document.title=running?`${formatted} · ${state.mode==='focus'?'Focus':'Break'} — Spriggan`:originalTitle;
  }
  function change(fn){fn();save();draw()}
  action.onclick=()=>{if(state.chime)chime.unlock();change(()=>{const finished=toggle(state);if(finished)completed(finished);else status.textContent=''})};
  chimeButton.onclick=()=>{if(!state.chime)chime.unlock();change(()=>{state.chime=!state.chime;if(!state.chime)chime.stop()})};
  document.addEventListener('pointerdown',()=>{if(state.chime&&state.endsAt!==null)chime.unlock()},{passive:true});
  document.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&state.chime&&state.endsAt!==null)chime.unlock()});
  reset.onclick=()=>change(()=>{chime.stop();select(state,state.mode);status.textContent='Timer reset. A fresh start.'});
  modes.forEach(button=>{button.onclick=()=>change(()=>{chime.stop();select(state,button.dataset.timerMode);status.textContent=''})});
  collapse.onclick=()=>change(()=>{state.collapsed=!state.collapsed});
  document.addEventListener('visibilitychange',()=>{chime.visibility(document.hidden&&SprigganRuntime.mobile);if(!document.hidden||!SprigganRuntime.mobile)draw()});
  window.addEventListener('pagehide',()=>chime.visibility(true));
  window.addEventListener('pageshow',()=>{chime.visibility(document.hidden&&SprigganRuntime.mobile);draw()});
  new ResizeObserver(()=>{(root.dataset.world?document.body:document.querySelector('main')).style.setProperty('--timer-space',`${root.offsetHeight+70}px`)}).observe(root);
  draw();setInterval(()=>{if(!document.hidden||!SprigganRuntime.mobile)draw()},250);
})();
