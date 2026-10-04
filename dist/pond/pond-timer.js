/* Deadline-based Pomodoro: background throttling never slows the countdown. */
(()=>{
  'use strict';
  const KEY='spriggan.timer.v1',DURATIONS={focus:50*60000,short:5*60000,long:15*60000};
  function create(){return{version:2,mode:'focus',remaining:DURATIONS.focus,endsAt:null,completed:0,collapsed:false,chime:true}}
  function remaining(state,now=Date.now()){return Math.max(0,state.endsAt===null?state.remaining:state.endsAt-now)}
  function advance(state,now=Date.now()){
    if(state.endsAt===null||remaining(state,now)>0)return null;
    const finished=state.mode;
    if(finished==='focus')state.completed++;
    state.mode=finished==='focus'?(state.completed%4===0?'long':'short'):'focus';
    state.remaining=DURATIONS[state.mode];state.endsAt=null;return finished;
  }
  function toggle(state,now=Date.now()){
    const finished=advance(state,now);if(finished)return finished;
    if(state.endsAt!==null){state.remaining=remaining(state,now);state.endsAt=null}
    else state.endsAt=now+state.remaining;
  }
  function select(state,mode){if(!Object.prototype.hasOwnProperty.call(DURATIONS,mode))return;state.mode=mode;state.remaining=DURATIONS[mode];state.endsAt=null}
  function decode(raw){
    try{
      const state=JSON.parse(raw);
      if(!state||![1,2].includes(state.version)||!Object.prototype.hasOwnProperty.call(DURATIONS,state.mode)||!Number.isFinite(state.remaining)||state.remaining<=0||state.remaining>DURATIONS[state.mode]||!(state.endsAt===null||Number.isFinite(state.endsAt))||!Number.isInteger(state.completed)||state.completed<0||state.completed>1000000)return create();
      return{version:2,mode:state.mode,remaining:state.version===1&&state.mode==='focus'&&state.endsAt===null&&state.remaining===25*60000?DURATIONS.focus:state.remaining,endsAt:state.endsAt,completed:state.completed,collapsed:state.collapsed===true,chime:state.chime!==false};
    }catch{return create()}
  }
  const api={KEY,DURATIONS,create,remaining,advance,toggle,select,decode};
  if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
  const root=document.querySelector('#pomodoro');if(!root)return;
  let state=create();try{state=decode(localStorage.getItem(KEY))}catch{}
  const time=root.querySelector('#timer-time'),action=root.querySelector('#timer-action'),reset=root.querySelector('#timer-reset'),collapse=root.querySelector('#timer-collapse');
  const status=root.querySelector('#timer-status'),ring=root.querySelector('#timer-progress'),summary=root.querySelector('#timer-summary'),label=root.querySelector('#timer-label');
  const dots=[...root.querySelectorAll('.timer-dot')],modes=[...root.querySelectorAll('[data-timer-mode]')],originalTitle=document.title;
  const chime=new PondTimerChime(),chimeButton=root.querySelector('#timer-chime');
  const labels={focus:'Focus softly',short:'A little breathing room',long:'A longer exhale'};
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
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
    action.querySelector('span').textContent=running?'Pause':ms<DURATIONS[state.mode]?'Resume':state.mode==='focus'?'Begin':'Start break';
    action.setAttribute('aria-label',running?'Pause timer':`Start ${state.mode==='focus'?'focus':'break'} timer`);
    action.querySelector('svg').innerHTML=running?'<path d="M8 5v14M16 5v14"/>':'<path d="m9 5 10 7-10 7Z"/>';
    ring.style.strokeDashoffset=String(163.363*(1-ms/DURATIONS[state.mode]));
    const count=state.mode==='long'?4:state.completed%4;
    dots.forEach((dot,i)=>dot.classList.toggle('is-done',i<count));
    root.querySelector('#timer-sessions').setAttribute('aria-label',`${count} of 4 focus sessions complete`);
    modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.timerMode===state.mode)));
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
  new ResizeObserver(()=>{document.querySelector('main').style.setProperty('--timer-space',`${root.offsetHeight+70}px`)}).observe(root);
  draw();setInterval(()=>{if(!document.hidden||!SprigganRuntime.mobile)draw()},250);
})();
