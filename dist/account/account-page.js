/* Account controls stay on the same origin as the worlds. */
(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector),accounts=globalThis.SprigganAccounts;
  let mode='signin',resetting=false,busy=false,current=accounts?.state||{configured:false,loading:false,user:null,status:'setup',message:''},confirmation=null;
  const notice=$('#account-notice'),credentials=$('#credentials-form'),password=$('#account-password'),confirmPassword=$('#confirm-password');
  const statusNames={setup:'Taking shape',guest:'Guest',unverified:'Verify email',synced:'At home',saving:'Saving…',offline:'On this device',conflict:'Choose a save',changed:'Account changed',error:'A little pause',loading:'A moment…',local:'Save queued'};
  const syncCopy={local:'New changes are saved on this device and will upload automatically. Choose “Save to account” to upload them now.',synced:'Your worlds are saved to your account.',saving:'Saving your worlds to your account…',offline:'Your worlds are saved on this device. Reconnect to save them to your account.',conflict:'Your account and this device have different saves. Choose which set to keep below.',changed:'Your account changed in another tab. Reload before continuing.',unverified:'Your worlds stay on this device until your email is verified.'};
  function setMessage(message,error=false){notice.textContent=message||'';notice.dataset.kind=error?'error':current.status==='conflict'?'conflict':'';}
  function render(state=current){
    current=state;
    const loading=!!(busy||state.loading),disabled=loading||state.status==='changed',user=state.user,configured=!!state.configured;
    $('#account-card').setAttribute('aria-busy',String(loading));
    $('#account-card').setAttribute('aria-labelledby',!configured?'setup-title':user?'signedin-title':resetting?'reset-title':'card-title');
    $('#account-state').textContent=statusNames[state.status]||(user?'Your account':'Guest');
    $('#setup-panel').hidden=configured||!!state.loading;
    $('#auth-panel').hidden=!configured||!!user||!!state.loading;
    $('#signedin-panel').hidden=!configured||!user||!!state.loading;
    $('#guest-note').hidden=!configured||!!user;
    $('#credentials-fields').disabled=disabled;
    $('#reset-fields').disabled=disabled;
    $('#delete-fields').disabled=disabled;
    $('#credentials-panel').hidden=resetting;
    $('#reset-panel').hidden=!resetting;
    $('.auth-tabs').hidden=resetting;
    for(const button of document.querySelectorAll('#auth-panel>div.auth-tabs button,#signedin-panel button'))button.disabled=disabled;
    $('#credentials-submit').textContent=busy?(mode==='register'?'Creating your account…':'Signing in…'):mode==='register'?'Create account ↗':'Sign in ↗';
    $('#signin-tab').setAttribute('aria-selected',String(mode==='signin'));$('#signin-tab').tabIndex=mode==='signin'?0:-1;
    $('#register-tab').setAttribute('aria-selected',String(mode==='register'));$('#register-tab').tabIndex=mode==='register'?0:-1;
    $('#credentials-panel').setAttribute('aria-labelledby',mode==='register'?'register-tab':'signin-tab');
    $('#card-title').textContent=mode==='register'?'A little home of your own.':'Welcome back.';
    $('#form-copy').textContent=mode==='register'?'An email, a password, and a place to come back to.':'Your little worlds are right where you left them.';
    $('#confirm-password-field').hidden=mode!=='register';confirmPassword.required=mode==='register';confirmPassword.disabled=mode!=='register';
    $('#password-help').hidden=mode!=='register';password.minLength=mode==='register'?8:1;password.autocomplete=mode==='register'?'new-password':'current-password';
    $('#import-guest-field').hidden=mode!=='register';$('#forgot-password').hidden=mode==='register';
    if(user){
      $('#signedin-email').textContent=user.email||'Your Spriggan account';
      $('#verification-panel').hidden=!!user.emailVerified;
      $('#sync-summary').textContent=syncCopy[state.status]||(user.emailVerified?'Your progress is saved on this device and will sync with your account.':syncCopy.unverified);
      $('#sync-dot').dataset.state=state.status;
      $('#sync-now').disabled=disabled||!user.emailVerified||state.status==='conflict';
      $('#import-guest-button').disabled=disabled||!user.emailVerified||state.status==='conflict';
      $('#conflict-panel').hidden=state.status!=='conflict';
    }
    if(!busy)setMessage(state.message||(!configured?'':state.loading?'Finding your place…':''),state.status==='error');
  }
  async function perform(action,{dialogError}={}){
    if(busy)return false;
    let feedback='',failed=false;
    busy=true;render();if(dialogError){dialogError.hidden=true;dialogError.textContent='';}
    try{await action();return true;}
    catch(error){feedback=error?.message||'We couldn’t finish that just now. Please try again.';failed=true;if(dialogError){dialogError.textContent=feedback;dialogError.hidden=false;}return false;}
    finally{busy=false;render();if(feedback)setMessage(feedback,failed);}
  }
  function changeMode(next){mode=next;resetting=false;password.value='';confirmPassword.value='';confirmPassword.setCustomValidity('');render();$('#account-email').focus();}
  $('#signin-tab').onclick=()=>changeMode('signin');$('#register-tab').onclick=()=>changeMode('register');
  $('.auth-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();changeMode(event.key==='Home'?'signin':event.key==='End'?'register':mode==='signin'?'register':'signin');(mode==='signin'?$('#signin-tab'):$('#register-tab')).focus();});
  confirmPassword.addEventListener('input',()=>confirmPassword.setCustomValidity(''));
  password.addEventListener('input',()=>confirmPassword.setCustomValidity(''));
  credentials.addEventListener('submit',event=>{
    event.preventDefault();if(!accounts)return;
    if(mode==='register'&&password.value!==confirmPassword.value){confirmPassword.setCustomValidity('Your passwords need to match.');confirmPassword.reportValidity();return;}
    const email=$('#account-email').value.trim(),secret=password.value,importGuest=$('#import-guest').checked;
    void perform(async()=>{if(mode==='register')await accounts.register(email,secret,{importGuest});else await accounts.signIn(email,secret);password.value='';confirmPassword.value='';});
  });
  $('#forgot-password').onclick=()=>{resetting=true;$('#reset-email').value=$('#account-email').value;render();$('#reset-email').focus();};
  $('#back-to-signin').onclick=()=>{resetting=false;render();$('#account-email').focus();};
  $('#reset-form').addEventListener('submit',event=>{event.preventDefault();void perform(()=>accounts.resetPassword($('#reset-email').value.trim()));});
  $('#resend-verification').onclick=()=>void perform(()=>accounts.sendVerification());
  $('#check-verification').onclick=()=>void perform(()=>accounts.checkVerification());
  $('#sync-now').onclick=()=>void perform(()=>accounts.sync());
  $('#signout').onclick=()=>void perform(()=>accounts.signOut());
  function confirmAction(title,detail,label,action){confirmation=action;$('#confirm-title').textContent=title;$('#confirm-detail').textContent=detail;$('#confirm-action').textContent=label;$('#confirm-dialog').showModal();$('#cancel-confirm').focus();}
  $('#cancel-confirm').onclick=()=>$('#confirm-dialog').close();
  $('#confirm-dialog').addEventListener('close',()=>{confirmation=null;});
  $('#confirm-form').addEventListener('submit',event=>{event.preventDefault();const action=confirmation;$('#confirm-dialog').close();if(action)void perform(action);});
  $('#use-cloud').onclick=()=>confirmAction('Use your account worlds?','This replaces this device’s account progress with the complete save from your account. Your guest worlds stay unchanged.','Use account save',()=>accounts.resolveConflict('cloud'));
  $('#use-device').onclick=()=>confirmAction('Keep this device’s worlds?','This replaces the complete cloud save in your account with this device’s account progress. Other devices will need to load this save.','Keep device save',()=>accounts.resolveConflict('device'));
  $('#import-guest-button').onclick=()=>confirmAction('Bring your guest worlds home?','This replaces your account worlds with all guest worlds and earned seeds from this browser. The guest originals stay on this device.','Copy guest worlds',()=>accounts.importGuest());
  $('#download-save').onclick=()=>{
    try{const backup=accounts.exportSave(),blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='spriggan-worlds-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(error){setMessage(error?.message||'Your backup could not be created. Please try again.',true);}
  };
  $('#open-delete').onclick=()=>{$('#delete-form').reset();$('#delete-error').hidden=true;$('#delete-dialog').showModal();$('#cancel-delete').focus();};
  $('#cancel-delete').onclick=()=>$('#delete-dialog').close();
  $('#delete-form').addEventListener('submit',event=>{event.preventDefault();if($('#delete-confirmation').value!=='DELETE')return;const secret=$('#delete-password').value;$('#delete-fields').disabled=true;void perform(()=>accounts.deleteAccount(secret),{dialogError:$('#delete-error')}).then(ok=>{if(ok){$('#delete-password').value='';$('#delete-dialog').close();}$('#delete-fields').disabled=current.status==='changed';});});
  if(accounts?.subscribe)accounts.subscribe(render);else render();
  if(accounts?.ready)accounts.ready.catch(()=>{render({...current,loading:false,status:'error',message:'Accounts are taking a little longer to connect. You can keep playing as a guest.'});});
})();
