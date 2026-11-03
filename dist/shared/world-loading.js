(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SprigganWorldLoading=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  function createView(document,actions){
    if(!document?.body)return {show(){},dispose(){}};
    const mains=Array.from(document.querySelectorAll('main'),main=>({main,inert:main.inert}));
    const overlay=document.createElement('section');overlay.className='world-loading';
    overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');
    const card=document.createElement('div');card.className='world-loading-card';
    const mark=document.createElement('span');mark.className='world-loading-mark';mark.textContent='✦';mark.setAttribute('aria-hidden','true');
    const heading=document.createElement('h1'),message=document.createElement('p');
    const controls=document.createElement('div');controls.className='world-loading-actions';
    const retry=document.createElement('button');retry.type='button';retry.textContent='Try again';retry.onclick=()=>actions.retry();
    const reload=document.createElement('button');reload.type='button';reload.textContent='Reload this world';reload.onclick=()=>actions.reload();
    const account=document.createElement('a');account.href='../account/';account.textContent='Open Account';
    controls.append(retry,reload,account);card.append(mark,heading,message,controls);overlay.append(card);document.body.append(overlay);
    let terminal=false;
    return {
      show(mode,detail){
        if(mode==='changed')terminal=true;
        const ready=mode==='ready'&&!terminal;
        overlay.hidden=ready;
        for(const item of mains)item.main.inert=ready?item.inert:true;
        if(ready)return;
        retry.hidden=mode!=='blocked';reload.hidden=mode!=='changed'&&mode!=='error';
        controls.hidden=mode==='loading';
        if(mode==='loading'){
          heading.textContent='Opening your saved world…';
          message.textContent='Your saved progress is on its way. This world will open when it’s ready.';
        }else if(mode==='changed'){
          heading.textContent='This tab needs a fresh start';
          message.textContent=detail||'Your account or saved worlds changed in another tab. Reload to continue.';
        }else if(mode==='error'){
          heading.textContent='This world couldn’t finish opening';
          message.textContent='Reload to try again, or open Account to check your saved worlds.';
        }else{
          heading.textContent='Your saved world couldn’t load';
          message.textContent=detail||'Your saved progress hasn’t loaded yet. Try again, or open Account to check the connection.';
        }
      },
      dispose(){overlay.remove();if(!terminal)for(const item of mains)item.main.inert=item.inert}
    };
  }

  function start(boot,options={}){
    const accounts=options.accounts===undefined?root.SprigganAccounts:options.accounts;
    const events=options.events||root;
    let booted=false,disposed=false,settled=!accounts,retrying=false,readyError=null,terminal=false,unsubscribe;
    let view=options.view;
    const reload=options.reload||(()=>root.location?.reload());
    function announce(){
      if(typeof events.dispatchEvent==='function'&&typeof root.Event==='function')events.dispatchEvent(new root.Event('spriggan:world-ready'));
    }
    function evaluate(){
      if(disposed)return;
      const state=accounts?.state||{};
      if(terminal||state.status==='changed'){terminal=true;view.show('changed',state.message);return}
      if(!settled||retrying||(state.loading&&!readyError)){if(!booted)view.show('loading');return}
      if(state.worldsReady===false||readyError){view.show('blocked',state.message);return}
      if(booted)return;
      booted=true;
      view.show('ready');
      try{boot();announce()}catch(error){view.show('error');options.onError?.(error)}
    }
    async function retry(){
      if(disposed||retrying||terminal||accounts?.state?.status==='changed')return;
      retrying=true;view.show('loading');
      try{
        if(typeof accounts?.sync!=='function')throw new Error('Account connection is unavailable.');
        await accounts.sync();readyError=null;
      }catch(error){readyError=error}
      finally{retrying=false;evaluate()}
    }
    if(!view)view=createView(options.document||root.document,{retry,reload});
    if(!accounts){evaluate();return {retry,dispose(){disposed=true;view.dispose?.()}}}
    view.show('loading');
    if(typeof accounts.subscribe==='function')unsubscribe=accounts.subscribe(evaluate);
    Promise.resolve(accounts.ready).then(()=>{settled=true;evaluate()},error=>{readyError=error;settled=true;evaluate()});
    return {retry,dispose(){disposed=true;unsubscribe?.();view.dispose?.()}};
  }
  return {start};
});
