/* Optional Google accounts and deliberate cloud copies. Signing in never replaces a park. */
(() => {
  'use strict';
  const scriptURL = document.currentScript?.src;
  function mount() {
    const section = document.querySelector('#park-account');
    const Cloud = window.SprigganCloud, saves = window.SprigganSaves;
    if (!section || !Cloud || !saves) return;
    const $ = id => document.getElementById(id);
    const google = $('park-account-google'), guest = $('park-account-guest'), member = $('park-account-member');
    const saveButton = $('park-account-save'), loadButton = $('park-account-load'), signOut = $('park-account-signout');
    const retry = $('park-account-retry'), status = $('park-account-status'), copy = $('park-account-copy');
    const confirmation = $('park-account-confirmation'), yes = $('park-account-confirm'), cancel = $('park-account-cancel');
    const recoveryButton = $('park-account-recovery');
    const RECOVERY_KEY = 'spriggan.cloud.recovery.v1';
    const names = {pond:'Stillwater Pond',pixel:'Sunny Side Farm',hex:'Clover Keep',dumplings:'Little Folds',claw:'Little Arcade',slots:'Golden Seed',fishing:'The Fishing Dock'};
    const callback = new URL(window.location.href);
    const callbackHash = new URLSearchParams(callback.hash.slice(1));
    const errorKeys = ['error','error_code','error_description'];
    const hashAuthError = errorKeys.some(key => callbackHash.has(key));
    const authError = hashAuthError || errorKeys.some(key => callback.searchParams.has(key));
    const returning = callback.searchParams.has('code') || authError;
    let client, storage, user = null, cloud, busy = false, generation = 0, pending = null, sdkPromise, googleReady = null;
    try {storage = window.localStorage;} catch {}
    const config = Cloud.validateConfig(window.SPRIGGAN_CLOUD_CONFIG);
    const say = message => {status.textContent = message;};
    const emit = name => document.dispatchEvent(new CustomEvent(name));
    function readableDate(value) {
      return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
    }
    function recovery() {
      try {
        const value = JSON.parse(storage.getItem(RECOVERY_KEY));
        if (value?.version !== 1 || typeof value.backup !== 'string') return null;
        saves.inspectBackup(value.backup); return value;
      } catch {return null;}
    }
    function snapshot() {
      emit('spriggan:park-save-request');
      const backup = saves.exportBackup(storage);
      const info = saves.inspectBackup(backup);
      return {backup,fingerprint:JSON.stringify(info.entries)};
    }
    function focusAccount() {if (!$('park-memory')?.hidden) $('park-account-title').focus({preventScroll:true});}
    function cancelPending() {
      const heldFocus = confirmation.contains(document.activeElement);
      pending = null;confirmation.hidden = true;
      if (heldFocus) focusAccount();
    }
    function render() {
      guest.hidden = !!user; member.hidden = !user;
      google.disabled = busy || !config || !storage || googleReady !== true;
      saveButton.disabled = busy || !user || cloud === undefined;
      loadButton.disabled = busy || !user || !cloud;
      signOut.disabled = busy;
      retry.disabled = busy;
      yes.disabled = busy; cancel.disabled = busy;
      recoveryButton.hidden = !recovery(); recoveryButton.disabled = busy;
      section.setAttribute('aria-busy',String(busy));
      if (user) {
        $('park-account-name').textContent = user.email || user.name || 'Your Google account';
        $('park-account-cloud-date').textContent = cloud === undefined ? 'Checking your cloud copy…' : cloud ? `Cloud copy saved ${readableDate(cloud.updatedAt)}.` : 'No cloud copy yet. Save this park when you’re ready.';
        copy.textContent = 'Choose when to save a cloud copy or bring one to this browser.';
      } else {
        copy.textContent = !storage ? 'This browser is blocking site storage. Allow site storage, then reload to sign in and keep your progress.' : !config ? 'Cloud saves aren’t available right now. Your park keeps saving in this browser.' : googleReady === false ? 'Google sign-in is being prepared. Your park keeps saving in this browser.' : 'Sign in to keep a cloud copy of your park and pick up on another device.';
      }
    }
    function openAccount() {
      const panel = $('park-memory');
      if (panel?.hidden) $('park-memory-toggle')?.click();
      $('park-account-title').focus({preventScroll:true});
      section.scrollIntoView({block:'nearest'});
    }
    function friendly(error) {
      if (error?.code === 'CLOUD_SETUP') return 'Cloud saves are still being prepared. Your park is saved in this browser; try again later.';
      if (error?.code === 'INVALID_CONFIG') return 'Cloud saves aren’t available right now. You can keep playing here.';
      return error?.message || 'Cloud saves couldn’t be reached. Your browser park is safe. Try again.';
    }
    function fail(error) {say(friendly(error));retry.hidden = !config;}
    async function readCloud(expected = generation) {
      busy = true; retry.hidden = true; say('Checking your cloud copy…'); render();
      try {
        const result = await client.read();
        if (expected !== generation) return;
        cloud = result; say('');
      } catch (error) {if (expected === generation) {cloud = undefined;fail(error);}}
      finally {if (expected === generation) {busy = false;render();}}
    }
    async function accountChanged(next) {
      if ((user?.id || null) === (next?.id || null) && user !== null) return;
      const expected = ++generation;
      const memberFocused = member.contains(document.activeElement);
      cancelPending(); user = next; cloud = undefined; busy = false;
      say(''); render();
      if (!user && memberFocused) focusAccount();
      if (user) await readCloud(expected);
    }
    function loadSDK() {
      if (window.supabase?.createClient) return Promise.resolve(window.supabase.createClient);
      if (sdkPromise) return sdkPromise;
      sdkPromise = new Promise((resolve,reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => {script.remove();sdkPromise = null;reject(new Error('Google sign-in couldn’t load. Check your connection and try again.'));},15000);
        script.src = new URL('./vendor/supabase.js',scriptURL || document.baseURI).href;
        script.onload = () => {clearTimeout(timer);if (window.supabase?.createClient) resolve(window.supabase.createClient);else {sdkPromise = null;reject(new Error('Google sign-in couldn’t load. Refresh and try again.'));}};
        script.onerror = () => {clearTimeout(timer);script.remove();sdkPromise = null;reject(new Error('Google sign-in couldn’t load. Refresh and try again.'));};
        document.head.append(script);
      });
      return sdkPromise;
    }
    async function checkGoogle() {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(),10000);
      try {
        const response = await window.fetch(`${config.url}/auth/v1/settings`,{headers:{apikey:config.publishableKey},signal:controller.signal,cache:'no-store'});
        if (!response.ok) throw new Error();
        const settings = await response.json();
        googleReady = settings?.external?.google === true;
      } catch {googleReady = null;throw new Error('Google sign-in couldn’t be reached. Keep playing here, check your connection, then try again.');}
      finally {clearTimeout(timer);}
    }
    async function connect() {
      if (!config || !storage) {render();return;}
      busy = true;retry.hidden = true;say('Checking your account…');render();
      const expected = generation;
      try {
        if (!client) {
          const [createClient] = await Promise.all([loadSDK(),checkGoogle()]);
          const redirectTo = new URL('../',scriptURL || document.baseURI).href;
          client = Cloud.create(config,{createClient,saves,storage,redirectTo});
          client.onAuthChange(next => {if ((next?.id || null) !== (user?.id || null)) accountChanged(next);});
        } else await checkGoogle();
        const next = await client.initialize();
        if (expected !== generation) return;
        busy = false;
        if (next && user?.id === next.id) await readCloud();
        else if (next) await accountChanged(next);
        else {say('');retry.hidden = googleReady !== false;render();}
      } catch (error) {busy = false;fail(error);render();}
    }
    function preview(kind, value) {
      const current = snapshot();
      const info = kind === 'save' ? saves.inspectBackup(current.backup) : saves.inspectBackup(value.backup);
      pending = {kind, value, fingerprint:current.fingerprint, generation, userId:user?.id || null};
      $('park-account-confirm-title').textContent = kind === 'save' ? 'Replace your cloud copy?' : kind === 'recovery' ? 'Bring back your previous browser park?' : 'Load your cloud park?';
      const worlds = info.worlds.map(id => names[id]).filter(Boolean).join(', ');
      $('park-account-confirm-summary').textContent = kind === 'save'
        ? `This browser’s park will replace the cloud copy saved ${readableDate(cloud.updatedAt)}. Your browser progress stays here.`
        : `Saved ${readableDate(info.exportedAt)}.${worlds ? ` Includes ${worlds}.` : ''} This replaces this browser’s whole park, including progress absent from the copy. A recovery copy of your current park will stay on this device.`;
      $('park-account-close-tabs').hidden = kind === 'save';
      yes.textContent = kind === 'save' ? 'Replace cloud copy' : kind === 'recovery' ? 'Restore previous park' : 'Load this park';
      confirmation.hidden = false;
      yes.focus({preventScroll:true});confirmation.scrollIntoView({block:'nearest'});
    }
    async function saveToCloud(expectedRevision) {
      const expected = generation;
      busy = true;retry.hidden = true;say('Saving your park to your account…');render();
      try {
        const current = snapshot();
        const result = await client.write(current.backup,expectedRevision);
        if (expected !== generation) return;
        cloud = {backup:current.backup,revision:result.revision,updatedAt:result.updatedAt};
        cancelPending();say('Saved to your account. Keep playing; save again when you’re ready.');
      } catch (error) {
        if (expected !== generation) return;
        if (error?.code === 'SAVE_CONFLICT') {
          cancelPending();
          await readCloud(expected);
          say('Your cloud park changed on another device. Both copies are safe. Review the cloud copy before choosing which park to keep.');
        } else fail(error);
      } finally {if (expected === generation) {busy = false;render();}}
    }
    async function restorePark(choice) {
      const expected = generation;
      busy = true;retry.hidden = true;say('Preparing your park…');render();
      try {
        let target = choice.value;
        if (choice.kind === 'load') {
          const latest = await client.read();
          if (expected !== generation || choice.userId !== user?.id) return;
          if (!latest || latest.revision !== target.revision) {
            cloud = latest;cancelPending();say('Your cloud copy changed. Review its latest saved time, then choose Load cloud save again.');return;
          }
          target = latest;
        }
        const current = snapshot();
        if (current.fingerprint !== choice.fingerprint) {cancelPending();say('Your browser park changed while you were reviewing. Close other Spriggan tabs, then review the copy again.');return;}
        // A recovery copy is required before replacing any local progress.
        let previousRecovery;
        try {previousRecovery = storage.getItem(RECOVERY_KEY);storage.setItem(RECOVERY_KEY,JSON.stringify({version:1,backup:current.backup}));}
        catch {throw new Error('This browser couldn’t keep a recovery copy. Allow site storage or free some space, then try again. Your current park hasn’t changed.');}
        try {saves.restorePark(target.backup,storage);}
        catch (error) {
          try {if (previousRecovery === null) storage.removeItem(RECOVERY_KEY);else storage.setItem(RECOVERY_KEY,previousRecovery);}
          catch {throw new Error('The park couldn’t be loaded, and its previous recovery copy couldn’t be restored. Keep this tab open, allow or free browser storage, then try loading your cloud park again.');}
          throw error;
        }
        cancelPending();emit('spriggan:park-restored');
        say(choice.kind === 'recovery' ? 'Your previous browser park is back. Your cloud copy is unchanged.' : 'Your cloud park is here. Your previous browser park is available below.');
        $('park-account-title').focus({preventScroll:true});
      } catch (error) {if (expected === generation) fail(error);}
      finally {if (expected === generation) {busy = false;render();}}
    }

    google.addEventListener('click',async () => {
      if (busy || !config || googleReady !== true) return;
      busy = true;cancelPending();say('Opening Google…');render();
      try {if (!client) throw new Error('Google sign-in is still loading. Try again in a moment.');await client.signIn();}
      catch (error) {fail(error);}
      finally {busy = false;render();}
    });
    signOut.addEventListener('click',async () => {
      if (busy || !client) return;
      busy = true;cancelPending();render();
      try {await client.signOut();await accountChanged(null);say('Signed out. Your park stays on this browser.');}
      catch (error) {fail(error);}
      finally {busy = false;render();}
    });
    retry.addEventListener('click',async () => {if (!busy) {cancelPending();try {await connect();}catch(error){fail(error);render();}}});
    saveButton.addEventListener('click',async () => {
      if (busy || !user || cloud === undefined) return;
      try {if (cloud) preview('save',cloud);else await saveToCloud(null);}catch(error){fail(error);}
    });
    loadButton.addEventListener('click',() => {if (!busy && user && cloud) try {preview('load',cloud);}catch(error){fail(error);}});
    recoveryButton.addEventListener('click',() => {const value = recovery();if (!busy && value) try {preview('recovery',value);}catch(error){fail(error);}});
    cancel.addEventListener('click',() => {
      if (busy) return;
      cancelPending();say('Your parks are unchanged.');
      const target = user ? saveButton : !recoveryButton.hidden ? recoveryButton : google;
      if (!target.disabled && !target.hidden) target.focus({preventScroll:true});else focusAccount();
    });
    yes.addEventListener('click',async () => {
      const choice = pending;
      if (busy || !choice || choice.generation !== generation || choice.userId !== (user?.id || null)) return;
      try {
        if (choice.kind === 'save') {
          if (snapshot().fingerprint !== choice.fingerprint) {cancelPending();say('Your browser park changed. Review it again before replacing the cloud copy.');return;}
          await saveToCloud(choice.value.revision);
        } else await restorePark(choice);
      } catch (error) {fail(error);}
    });
    document.addEventListener('spriggan:park-restored',() => {cancelPending();render();});
    document.addEventListener('spriggan:park-panel-closed',() => {if (!busy) cancelPending();});
    window.addEventListener('storage',event => {
      if (event.key === RECOVERY_KEY) render();
      if (pending && saves.SUPPORTED_KEYS.includes(event.key)) {cancelPending();say('Your browser park changed in another tab. Review the copy again before replacing progress.');}
    });
    window.addEventListener('offline',() => {say('You’re offline. Keep playing here; cloud saves will be available when you reconnect.');});
    if (authError) {
      for (const key of errorKeys) {callback.searchParams.delete(key);callbackHash.delete(key);}
      if (hashAuthError) callback.hash = callbackHash.toString();
      window.history.replaceState(null,'',callback.href);
    }
    render();
    if (returning) openAccount();
    connect().then(() => {if (returning && !user) say('Google sign-in wasn’t completed. Your browser park is safe. Try again when you’re ready.');});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
