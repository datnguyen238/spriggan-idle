/* Optional accounts on the existing host. Guest worlds never leave their original keys. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return}
  root.SprigganAccountController=api;
  root.SprigganAccounts=api.createAccounts({
    saves:root.SprigganSaveStore,store:root.SprigganStorage,
    providerFactory:root.SprigganFirebaseProvider,config:root.SprigganAccountConfig?.firebase,
    events:root,document:root.document,accountPage:/\/account\/(?:index\.html)?$/.test(root.location.pathname),
    withLock:fn=>root.navigator.locks?.request?root.navigator.locks.request('spriggan-cloud-save',fn):fn(),
    onStore:store=>{root.SprigganStorage=store}
  });
  const accountURL=new URL('../account/',root.document.currentScript.src);
  let notice;
  root.SprigganAccounts.subscribe(state=>{
    if(!root.document.body)return;
    const labels={local:'Save queued',saving:'Saving…',synced:'Cloud saved',offline:'Device only',error:'Device only',unverified:'Verify email',changed:'Reload',conflict:'Choose save',loading:'Connecting'};
    for(const accountLink of root.document.querySelectorAll('.account-link')){
      let label=accountLink.querySelector('.account-cloud-status');
      if(!state.user&&!state.activeUid){label?.remove();accountLink.removeAttribute('aria-label');continue}
      if(!label){label=root.document.createElement('small');label.className='account-cloud-status';accountLink.append(label)}
      label.textContent=labels[state.status]||'Device only';label.dataset.state=state.status;
      accountLink.setAttribute('aria-label',`Account. ${label.textContent}. ${state.message}`);
    }
    const show=state.status==='changed'||state.status==='conflict'||
      (!!(state.user||state.activeUid)&&['unverified','offline','error'].includes(state.status));
    if(!show){if(notice)notice.remove();notice=null;return}
    if(!notice){
      notice=root.document.createElement('aside');notice.className='account-notice';notice.setAttribute('role','status');
      const text=root.document.createElement('span'),link=root.document.createElement('a');
      notice.append(text,link);root.document.body.append(notice);
    }
    const descriptions={
      changed:'Your account or saved worlds changed in another tab.',
      conflict:'Another device has different saved worlds. Your progress is safe on this device.',
      unverified:'Your progress is saved only on this device until you verify your email.',
      offline:'Your progress has not reached your account. It is saved only on this device.',
      error:'Your progress has not reached your account. Open Account for details.'
    };
    notice.firstChild.textContent=state.worldsReady===false&&['offline','error'].includes(state.status)?
      'Your saved worlds could not load. Open Account to try again.':descriptions[state.status];
    const link=notice.lastChild;
    link.textContent=state.status==='changed'?'Reload worlds':state.status==='conflict'?'Choose a save':state.status==='unverified'?'Verify email':'Open Account';
    link.href=state.status==='changed'?root.location.href:accountURL.href;
    if(state.status==='changed'){
      // Stop stale live simulations from accepting input while their writes are blocked.
      for(const main of root.document.querySelectorAll('main'))main.inert=true;
    }
  });
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const AUTOSAVE_MS=60000;
  function fail(code,message){const error=Error(message);error.code=code;return error}
  function errorMessage(error){
    const messages={
      'auth/invalid-credential':'The email or password could not be confirmed. Please try again.',
      'auth/invalid-login-credentials':'The email or password could not be confirmed. Please try again.',
      'auth/wrong-password':'The email or password could not be confirmed. Please try again.',
      'auth/user-not-found':'The email or password could not be confirmed. Please try again.',
      'auth/email-already-in-use':'This email already has an account. Sign in or reset your password.',
      'auth/invalid-email':'Enter a valid email address.',
      'auth/weak-password':'Choose a stronger password with at least eight characters.',
      'auth/password-does-not-meet-requirements':'Your password does not meet the account requirements. Choose a stronger password.',
      'auth/too-many-requests':'Too many attempts. Please wait a little before trying again.',
      'auth/user-disabled':'This account is unavailable. Please contact the site owner.',
      'auth/network-request-failed':'Could not connect. Your worlds are still saved on this device.',
      'auth/requires-recent-login':'Sign in again before changing this account.',
      'auth/operation-not-allowed':'Accounts are not available yet. You can keep playing as a guest.',
      'auth/unauthorized-domain':'Accounts are not available at this address yet. You can keep playing as a guest.',
      'permission-denied':'Could not access your cloud save. Your device save has not been changed.',
      'unavailable':'Could not connect to your cloud save. Your worlds are saved on this device.',
      'account/offline':'Could not connect. Your worlds are still saved on this device.',
      'account/not-configured':'Accounts are being set up. You can keep playing as a guest.',
      'account/changed':'Your account or saved worlds changed in another tab. Reload before continuing.',
      'account/conflict':'Another device has different saved worlds. Choose which save to keep.',
      'account/no-user':'Sign in to use your account.',
      'account/verification-required':'Verify your email to save your worlds across devices.',
      'account/invalid-save':'A saved world could not be read. It has not been changed.',
      'account/save-too-large':'Your worlds are too large to sync. You can download a backup.',
      'account/save-not-loaded':'Your account worlds have not loaded yet. Retry loading them before playing or saving.',
      'account/busy':'Please wait for the current account request to finish.'
    };
    return messages[error?.code]||'Something interrupted this request. Your saved worlds have been kept. Please try again.';
  }
  function createAccounts(options){
    const saves=options.saves,events=options.events;
    let store=options.store,raw=store.raw,provider=null,providerPromise=null,unsubscribe=null;
    let booted=false,actionBusy=false,suppressAuth=false,disposed=false,timer=null,inFlight=null;
    let cloudConflict=null,eventSaving=false,importReady=null;
    const eventSaves=[];
    const listeners=new Set(),schedule=options.schedule||setTimeout,cancel=options.cancel||clearTimeout;
    const state={configured:!!options.config,loading:true,worldsReady:false,user:null,activeUid:store.uid,status:'loading',message:'Opening your worlds…'};
    function publish(patch){
      if(state.status==='changed')patch={loading:false};
      Object.assign(state,patch);
      for(const listener of listeners){try{listener({...state,user:state.user?{...state.user}:null})}catch{}}
    }
    function stopTimer(){if(timer!==null){cancel(timer);timer=null}}
    function changed(){
      stopTimer();publish({loading:false,worldsReady:false,status:'changed',message:errorMessage({code:'account/changed'})});
    }
    function useStore(uid,rotate=false){
      if(saves.readActive(raw)!==uid||rotate)saves.setActive(raw,uid);
      store.dispose?.();store=saves.create(raw,{uid,events});options.onStore?.(store);
      publish({activeUid:uid});return store;
    }
    function backup(){
      if(store.uid!==null)raw.setItem('spriggan.account.backup.v1:'+encodeURIComponent(store.uid),JSON.stringify(store.state()));
    }
    function replaceWorlds(entries,revision,dirty=false){
      const uid=store.uid;
      // Rotating the marker invalidates every older live world, including same-account tabs.
      useStore(uid,true).replace(entries,revision,{dirty});
    }
    function hasCachedWorlds(){
      if(store.uid===null)return true;
      try{
        const cached=store.state();
        return raw.getItem(saves.accountKey(store.uid))!==null||Object.keys(cached.entries).length>0||cached.revision>0;
      }catch{return false}
    }
    function requireLoadedWorlds(){
      if(!state.worldsReady)throw fail('account/save-not-loaded',errorMessage({code:'account/save-not-loaded'}));
    }
    function queueSave(delay=AUTOSAVE_MS){
      if(disposed||importReady||timer!==null||!state.worldsReady||!state.user?.emailVerified||state.status==='conflict'||state.status==='changed')return;
      try{if(!store.state().dirty)return}catch{return}
      timer=schedule(()=>{timer=null;void sync().catch(()=>{})},delay);
    }
    function savedOnDevice(error){
      if(error?.code==='account/changed'){changed();return}
      const status=error?.code==='account/invalid-save'||error?.code==='permission-denied'?'error':'offline';
      const message=state.worldsReady?errorMessage(error):
        error?.code==='permission-denied'?'Could not access your saved worlds. Your account save has not been replaced. Open Account to check access and try again.':
        error?.code==='account/invalid-save'?'A saved world could not be read. Your account save has not been replaced. Open Account for details.':
        'Could not load your saved worlds. Your account save has not been replaced. Check your connection and try again.';
      publish({status,message});
    }
    async function timed(promise){
      let id;
      try{return await Promise.race([promise,new Promise((_,reject)=>{id=schedule(()=>reject(fail('account/offline')),10000)})])}
      finally{cancel(id)}
    }
    async function connect(){
      if(!state.configured)throw fail('account/not-configured');
      if(provider)return provider;
      if(!providerPromise)providerPromise=Promise.resolve().then(()=>options.providerFactory.connect(options.config));
      try{
        provider=await timed(providerPromise);
        return provider;
      }catch(error){providerPromise=null;throw error}
    }
    function requireUser(verified=false){
      if(state.status==='changed')throw fail('account/changed');
      try{store.assertCurrent()}catch(error){if(error?.code==='account/changed')changed();throw error}
      if(!state.user||state.user.uid!==store.uid)throw fail('account/no-user');
      if(verified&&!state.user.emailVerified)throw fail('account/verification-required');
      return state.user;
    }
    async function loadWorlds(){
      const user=requireUser(true),uid=user.uid,currentStore=store;
      const remote=await timed(provider.readSave(uid));
      requireUser(true);
      if(state.user?.uid!==uid||store!==currentStore)throw fail('account/changed');
      const local=store.state();
      if(remote){saves.validateEntries(remote.entries)}
      if(remote&&saves.equalEntries(local.entries,remote.entries)){
        if(remote.revision>=local.revision)store.acknowledge(remote.revision,local.entries);
        else store.replace(local.entries,remote.revision);
      }else if(!local.dirty){
        if(remote){replaceWorlds(remote.entries,remote.revision)}
        else if(local.revision>0){
          cloudConflict={entries:{},revision:0};publish({worldsReady:true,status:'conflict',message:errorMessage({code:'account/conflict'})});return;
        }
      }else if((remote?.revision||0)!==local.revision){
        cloudConflict=remote||{entries:{},revision:0};publish({worldsReady:true,status:'conflict',message:errorMessage({code:'account/conflict'})});return;
      }
      cloudConflict=null;
      if(store.state().dirty){publish({worldsReady:true,status:'local',message:'Your worlds are saved on this device. Cloud saving is queued.'});queueSave(0)}
      else publish({worldsReady:true,status:'synced',message:'Your account is ready. Your worlds will save across devices.'});
    }
    async function acceptUser(user){
      stopTimer();cloudConflict=null;publish({worldsReady:false});
      if(provider&&(provider.currentUser?.uid||null)!==(user?.uid||null))throw fail('account/changed');
      if(booted&&!options.accountPage&&store.uid!==(user?.uid||null)){changed();return}
      useStore(user?.uid||null);
      publish({user:user?{...user}:null,worldsReady:hasCachedWorlds()});
      if(!user){publish({worldsReady:true,status:'guest',message:'Your guest worlds are saved in this browser.'});return}
      if(!user.emailVerified){publish({worldsReady:true,status:'unverified',message:'Verify your email to save your worlds across devices.'});return}
      try{await loadWorlds()}catch(error){savedOnDevice(error)}
    }
    function watchAuth(){
      if(unsubscribe||!provider)return;
      unsubscribe=provider.subscribe((user,error)=>{
        if(disposed||suppressAuth)return;
        if(error){savedOnDevice(error);return}
        if(user?.uid===state.user?.uid){
          publish({user:user?{...user}:null});return;
        }
        if(booted&&!options.accountPage){changed();return}
        void acceptUser(user).catch(savedOnDevice);
      });
    }
    async function initialize(){
      try{
        if(!state.configured){
          if(store.uid!==null)useStore(null);
          publish({worldsReady:true,status:'setup',message:errorMessage({code:'account/not-configured'})});return;
        }
        await connect();
        const user=await timed(provider.authReady());
        await acceptUser(user);watchAuth();
      }catch(error){publish({worldsReady:hasCachedWorlds()});savedOnDevice(error)}
      finally{booted=true;publish({loading:false})}
    }
    async function action(fn){
      if(actionBusy)throw fail('account/busy',errorMessage({code:'account/busy'}));
      if(state.status==='changed')throw fail('account/changed',errorMessage({code:'account/changed'}));
      actionBusy=true;publish({loading:true});
      try{return await fn()}
      catch(error){
        // Only expose mapped product messages; SDK errors may contain internal details.
        if(error?.code==='account/changed')changed();
        const mapped=fail(error?.code||'account/error',errorMessage(error));
        publish({message:mapped.message});throw mapped;
      }finally{actionBusy=false;publish({loading:false})}
    }
    async function sync(){
      if(importReady)await importReady;
      if(inFlight)return inFlight;
      if(state.status==='conflict')throw fail('account/conflict',errorMessage({code:'account/conflict'}));
      const user=requireUser(true);stopTimer();
      const work=async()=>{
        requireUser(true);
        if(store.uid!==user.uid)throw fail('account/changed');
        if(!state.worldsReady){
          publish({loading:true,status:'loading',message:'Loading your saved worlds…'});
          try{await loadWorlds()}
          catch(error){savedOnDevice(error);throw fail(error?.code||'account/offline',errorMessage(error))}
          finally{publish({loading:false})}
          return;
        }
        const currentStore=store,uid=user.uid,local=currentStore.state();
        publish({status:'saving',message:'Saving your worlds…'});
        try{
          if(!local.dirty){
            const remote=await timed(provider.readSave(uid));
            requireUser(true);
            if(store!==currentStore||state.user?.uid!==uid)throw fail('account/changed');
            if(remote&&!saves.equalEntries(currentStore.snapshot(),remote.entries)){
              if(options.accountPage){await loadWorlds();return}
              cloudConflict=remote;publish({status:'conflict',message:errorMessage({code:'account/conflict'})});return;
            }
            if(remote)currentStore.acknowledge(remote.revision,remote.entries);
            else if(local.revision>0){
              cloudConflict={entries:{},revision:0};publish({status:'conflict',message:errorMessage({code:'account/conflict'})});return;
            }
            publish({status:'synced',message:'Your worlds are saved to your account.'});return;
          }
          const revision=await timed(provider.writeSave(uid,local.entries,local.revision));
          requireUser(true);
          if(store!==currentStore||state.user?.uid!==uid)throw fail('account/changed');
          currentStore.acknowledge(revision,local.entries);
          const dirty=currentStore.state().dirty;
          publish({status:dirty?'local':'synced',message:dirty?'Your last save reached your account. New changes are saved only on this device until the next sync.':'Your worlds are saved to your account.'});
        }catch(error){
          if(error?.code==='account/conflict'){
            let remote;
            try{
              remote=await timed(provider.readSave(uid));
              requireUser(true);
              if(store!==currentStore||state.user?.uid!==uid)throw fail('account/changed');
            }catch(readError){savedOnDevice(readError);throw fail(readError?.code||'account/offline',errorMessage(readError))}
            if(remote&&saves.equalEntries(currentStore.snapshot(),remote.entries)){
              currentStore.acknowledge(remote.revision,remote.entries);publish({status:'synced',message:'Your worlds are saved to your account.'});return;
            }
            cloudConflict=remote||{entries:{},revision:0};
            publish({status:'conflict',message:errorMessage(error)});
          }else if(error?.code==='account/changed'){changed()}
          else savedOnDevice(error);
          throw fail(error?.code||'account/offline',errorMessage(error));
        }finally{queueSave()}
      };
      inFlight=Promise.resolve().then(()=>options.withLock?options.withLock(work):work());
      try{return await inFlight}finally{inFlight=null}
    }
    async function checkpoint(){
      const user=requireUser(true),currentStore=store,previous=inFlight;
      requireLoadedWorlds();
      stopTimer();
      // An earlier upload may contain the win but not the newly claimed animal.
      // Wait for it, then capture a fresh complete bundle. Do not wait for unrelated
      // future farm ticks to stop: they can continue while this checkpoint uploads.
      if(previous)await previous;else await Promise.resolve();
      requireUser(true);
      if(store!==currentStore||state.user?.uid!==user.uid)throw fail('account/changed');
      if(state.status==='conflict')throw fail('account/conflict',errorMessage({code:'account/conflict'}));
      if(currentStore.state().dirty)await sync();
      requireUser(true);
      if(store!==currentStore||state.user?.uid!==user.uid)throw fail('account/changed');
      if(state.status==='conflict')throw fail('account/conflict',errorMessage({code:'account/conflict'}));
    }
    function saveProgress(){
      // Games persist locally first. Batch events from the same turn and keep a
      // trailing batch for events that arrive after an upload captured its save.
      // Ordinary animation/autosave writes never extend an event's completion.
      if(!state.user?.emailVerified)return Promise.resolve();
      return new Promise((resolve,reject)=>{
        try{
          if(disposed)throw fail('account/changed',errorMessage({code:'account/changed'}));
          const user=requireUser(true);requireLoadedWorlds();
          eventSaves.push({resolve,reject,uid:user.uid,store});
          if(!eventSaving){eventSaving=true;void Promise.resolve().then(drainEventSaves)}
        }catch(error){reject(error)}
      });
    }
    async function drainEventSaves(){
      while(eventSaves.length){
        const batch=eventSaves.splice(0);
        try{
          const user=requireUser(true);
          if(disposed||batch.some(request=>request.uid!==user.uid||request.store!==store))throw fail('account/changed',errorMessage({code:'account/changed'}));
          await checkpoint();
          for(const request of batch)request.resolve();
        }catch(error){
          for(const request of batch.concat(eventSaves.splice(0)))request.reject(error);
        }
      }
      eventSaving=false;
    }
    function onSave(event){
      if(event.detail?.uid!==store.uid)return;
      if(state.status==='synced'&&event.detail.dirty)publish({status:'local',message:'Saved on this device. Cloud saving is queued.'});
      queueSave();
    }
    function onChanged(){if(booted)changed()}
    function onOnline(){
      if(!state.user?.emailVerified||['changed','conflict'].includes(state.status))return;
      void sync().catch(()=>{});
    }
    function onLeave(){
      if(!state.worldsReady||!state.user?.emailVerified||['changed','conflict'].includes(state.status))return;
      const Constructor=events?.Event||(typeof Event==='function'?Event:null);
      if(Constructor)events?.dispatchEvent?.(new Constructor('spriggan:flush'));
      // Best effort for ordinary progress. Prize claims await their own checkpoint
      // before navigation; closing a browser cannot guarantee network completion.
      void checkpoint().catch(()=>{});
    }
    function onVisibility(){if(options.document?.hidden)onLeave()}
    events?.addEventListener?.('spriggan:save',onSave);
    events?.addEventListener?.('spriggan:account-changed',onChanged);
    events?.addEventListener?.('online',onOnline);
    events?.addEventListener?.('pagehide',onLeave);
    options.document?.addEventListener?.('visibilitychange',onVisibility);
    const api={
      get state(){return{...state,user:state.user?{...state.user}:null}},
      get canPlay(){return state.worldsReady&&!state.loading&&state.status!=='changed'},
      get storage(){return store},
      subscribe(listener){listeners.add(listener);listener(api.state);return()=>listeners.delete(listener)},
      register(email,password,{importGuest=false}={}){return action(async()=>{
        if(typeof password!=='string'||password.length<8)throw fail('auth/weak-password');
        const currentStore=store;
        const guest=importGuest?saves.create(raw,{uid:null,events:null}).snapshot():null;
        await connect();suppressAuth=true;
        try{
          const user=await timed(provider.register(email,password));
          currentStore.assertCurrent();if(store!==currentStore)throw fail('account/changed');
          await acceptUser(user);watchAuth();
          if(guest)store.replace(guest,0,{dirty:true});
          try{await timed(provider.sendVerification());publish({message:'Account created. Check your email, then choose “I verified my email”.'})}
          catch{publish({message:'Your account was created, but the verification email could not be sent. Choose “Resend verification email” to try again.'})}
        }finally{suppressAuth=false}
      })},
      signIn(email,password){return action(async()=>{
        const currentStore=store;
        await connect();suppressAuth=true;
        try{
          const user=await timed(provider.signIn(email,password));
          currentStore.assertCurrent();if(store!==currentStore)throw fail('account/changed');
          await acceptUser(user);watchAuth();
        }
        finally{suppressAuth=false}
      })},
      signOut(){return action(async()=>{
        const currentStore=store,user=requireUser();
        stopTimer();let pending=false;
        if(state.user?.emailVerified&&state.status!=='conflict'&&state.status!=='changed'){
          try{await sync()}catch{pending=true}
        }
        stopTimer();if(inFlight)await inFlight.catch(()=>{});
        await connect();suppressAuth=true;
        try{
          requireUser();if(store!==currentStore||provider.currentUser?.uid!==user.uid)throw fail('account/changed');
          await timed(provider.signOut(user.uid));await acceptUser(null);
          if(pending)publish({message:'Signed out. Some account progress is saved only on this device; sign in here again to sync it.'});
        }finally{suppressAuth=false}
      })},
      sendVerification(){return action(async()=>{requireUser();await timed(provider.sendVerification());publish({message:'Verification email sent. Check your inbox and spam folder.'})})},
      checkVerification(){return action(async()=>{
        const currentStore=store;requireUser();const user=await timed(provider.refreshUser());
        requireUser();if(store!==currentStore||user?.uid!==state.user?.uid)throw fail('account/changed');
        publish({user});
        if(user?.emailVerified)await loadWorlds();
        else publish({status:'unverified',message:'Your email is not verified yet. Open the link in your verification email, then try again.'});
      })},
      resetPassword(email){return action(async()=>{
        await connect();
        try{await timed(provider.resetPassword(email))}
        catch(error){if(!['auth/user-not-found','auth/invalid-credential'].includes(error?.code))throw error}
        publish({message:'If this email has an account, a password reset email is on its way.'});
      })},
      sync,
      checkpoint,
      saveProgress,
      resolveConflict(choice){return action(async()=>{
        const user=requireUser(true),currentStore=store;
        if(!['cloud','device'].includes(choice)||!cloudConflict)throw fail('account/conflict');
        const remote=await timed(provider.readSave(user.uid))||{entries:{},revision:0};
        requireUser(true);if(store!==currentStore)throw fail('account/changed');
        if(choice==='cloud'){
          backup();replaceWorlds(remote.entries,remote.revision);cloudConflict=null;
          publish({status:'synced',message:'Your cloud worlds are ready. Reopen any other world tabs to use them.'});
        }else{
          store.replace(store.snapshot(),remote.revision,{dirty:true});cloudConflict=null;
          publish({status:'local'});await sync();
        }
      })},
      importGuest(){return action(async()=>{
        const user=requireUser(),currentStore=store,guest=saves.create(raw,{uid:null,events:null}).snapshot();
        let release;
        // Drain the old store's upload and hold new syncs until its replacement is ready.
        importReady=new Promise(resolve=>{release=resolve});stopTimer();
        try{
          if(inFlight)await inFlight.catch(()=>{});
          requireUser();if(disposed||store!==currentStore||provider.currentUser?.uid!==user.uid)throw fail('account/changed');
          const remote=user.emailVerified?await timed(provider.readSave(user.uid)):null;
          requireUser();if(disposed||store!==currentStore||provider.currentUser?.uid!==user.uid)throw fail('account/changed');
          backup();replaceWorlds(guest,remote?.revision||0,true);cloudConflict=null;
          publish({worldsReady:true,status:user.emailVerified?'local':'unverified',message:'Your guest worlds have been copied. The original guest saves are still here.'});
        }finally{importReady=null;release();queueSave()}
        if(user.emailVerified)await sync();
      })},
      deleteAccount(password){return action(async()=>{
        const user=requireUser(),currentStore=store;stopTimer();if(inFlight)await inFlight.catch(()=>{});
        requireUser();if(store!==currentStore)throw fail('account/changed');
        suppressAuth=true;
        try{
          await timed(provider.reauthenticate(password));
          requireUser();if(store!==currentStore||provider.currentUser?.uid!==user.uid)throw fail('account/changed');
          await timed(provider.deleteSave(user.uid));
          requireUser();if(store!==currentStore||provider.currentUser?.uid!==user.uid)throw fail('account/changed');
          await timed(provider.deleteUser(user.uid));
          currentStore.assertCurrent();if(store!==currentStore||provider.currentUser)throw fail('account/changed');
          saves.removeAccount(raw,user.uid);raw.removeItem('spriggan.account.backup.v1:'+encodeURIComponent(user.uid));
          await acceptUser(null);publish({message:'Your account was deleted. Your original guest worlds are still here.'});
        }finally{suppressAuth=false}
      })},
      exportSave(){return{format:1,exportedAt:new Date().toISOString(),entries:store.snapshot()}},
      dispose(){
        disposed=true;stopTimer();unsubscribe?.();store.dispose?.();listeners.clear();
        events?.removeEventListener?.('spriggan:save',onSave);events?.removeEventListener?.('spriggan:account-changed',onChanged);events?.removeEventListener?.('online',onOnline);
        events?.removeEventListener?.('pagehide',onLeave);options.document?.removeEventListener?.('visibilitychange',onVisibility);
      }
    };
    api.ready=initialize();
    return api;
  }
  return{createAccounts,errorMessage,AUTOSAVE_MS};
});
