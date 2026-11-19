/* Authenticate and hydrate before starting any world. The database enforces ownership. */
(() => {
  'use strict';
  const bootScript = document.currentScript;
  const home = new URL('../', bootScript.src);
  const login = new URL('login/', home);
  const isLogin = location.pathname === login.pathname || location.pathname === login.pathname + 'index.html';
  const NEXT_KEY = 'spriggan.login.next.v1';
  const LOCK_NAME = 'spriggan.park-session.v1';
  const $ = id => document.getElementById(id);
  let client, sync, user, state, storage, initialized = false, starting = false, gameStarted = false;
  let writesAllowed = true, leaving = false, releaseLock, retryAction;
  const initialURL = new URL(location.href);
  const authHash = new URLSearchParams(initialURL.hash.slice(1));
  const authDenied = ['error','error_code','error_description'].some(key => initialURL.searchParams.has(key) || authHash.has(key));
  function route(value) {
    try {
      const url = new URL(value,home);
      const path = url.pathname.slice(home.pathname.length);
      return url.origin === home.origin && url.pathname.startsWith(home.pathname) && /^(?:index\.html|(?:pond|pixel|hex|dumplings|slots|claw|fishing)\/(?:index\.html)?)?$/.test(path) ? url.pathname : home.pathname;
    } catch {return home.pathname;}
  }
  function nextRoute() {try {return route(sessionStorage.getItem(NEXT_KEY) || home.pathname);} catch {return home.pathname;}}
  function rememberRoute() {if (!isLogin) try {sessionStorage.setItem(NEXT_KEY,route(location.href));} catch {}}
  function toLogin() {rememberRoute();location.replace(login.href);}
  function cleanCallback() {
    const url = new URL(location.href);
    for (const key of ['code','error','error_code','error_description']) url.searchParams.delete(key);
    if (authDenied) url.hash = '';
    if (url.href !== location.href) history.replaceState(null,'',url.href);
  }
  function gate(title, message, retry, stage = 'error') {
    if (isLogin) {
      $('login-account').dataset.stage = stage;
      $('login-account').setAttribute('aria-labelledby','login-title');
      $('login-title').textContent = stage === 'ready' || stage === 'checking' ? 'Your park is waiting.' : title;
      $('login-google').hidden = stage === 'opening' || stage === 'error';
      $('login-status').textContent = message;
      $('login-account').setAttribute('aria-busy',String(stage === 'opening' || stage === 'checking'));
      $('login-retry').hidden = !retry;
      $('login-retry').disabled = false;
    } else {
      document.documentElement.dataset.parkAuth = 'loading';
      $('park-gate').hidden = false;
      $('park-gate-title').textContent = title;
      $('park-gate-copy').textContent = message;
      $('park-gate-retry').hidden = !retry;
    }
    retryAction = retry;
  }
  function messageFor(value) {
    const code = value?.code;
    if (code === 'STORAGE_UNAVAILABLE' || code === 'STORAGE_WRITE' || code === 'ROLLBACK_FAILED') return 'Your browser cannot save progress right now. Allow site storage or free some space, then try again.';
    if (code === 'CLOUD_SETUP') return 'Your account’s park is not ready yet. Please try again shortly.';
    if (code === 'CLOUD_DATA_INVALID' || code === 'INVALID_BACKUP') return 'We could not open this park safely. Your progress has been kept. Please try again.';
    if (code === 'AUTH_REQUIRED' || code === 'SESSION_CHANGED') return 'Your sign-in has changed. Sign in again to open your park.';
    return 'We could not connect to your park. Check your connection, then try again.';
  }
  function statusCopy(current = state) {
    if (!current) return 'Opening your park…';
    switch (current.status) {
      case 'pending': case 'saving': return 'Saving your progress…';
      case 'offline': return 'Saved on this device. We’ll reconnect when you’re online.';
      case 'conflict': return 'Another saved park needs your attention.';
      case 'error': return messageFor(current.error);
      default: return 'Your progress is saved to your account.';
    }
  }
  function notify() {document.dispatchEvent(new CustomEvent('spriggan:account-state',{detail:{user,state,message:statusCopy()}}));}
  function blockGame() {if (gameStarted) {writesAllowed = false;document.body.inert = true;} sync?.stop();}
  function received(current) {
    state = current;
    notify();
    if (!gameStarted) return;
    if (['conflict','choice'].includes(current.status)) {blockGame();toLogin();}
    else if (current.status === 'error' && !current.canPlay) {blockGame();gate('Your park is paused',messageFor(current.error),() => location.reload());document.body.inert = false;}
  }
  async function providerReady() {
    const config = window.SprigganCloud.validateConfig(window.SPRIGGAN_CLOUD_CONFIG);
    if (!config) throw Error('Missing config');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(),10000);
    try {
      const result = await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.publishableKey},cache:'no-store',signal:controller.signal});
      if (!result.ok) throw Error('Settings unavailable');
      return (await result.json())?.external?.google === true;
    } finally {clearTimeout(timer);}
  }
  async function showSignIn() {
    if (!isLogin) {toLogin();return;}
    $('login-choice').hidden = true;
    $('login-google').hidden = false;
    $('login-google').disabled = true;
    gate('Welcome to Spriggan',authDenied ? 'Sign-in was cancelled. You can try again when you’re ready.' : 'Checking Google sign-in…',undefined,'checking');
    try {
      if (!await providerReady()) {gate('Sign-in is being prepared','Google sign-in is being prepared. Please try again shortly.',showSignIn);return;}
      $('login-google').disabled = false;
      gate('Welcome to Spriggan',authDenied ? 'Sign-in was cancelled. You can try again when you’re ready.' : 'Progress saves automatically to your Google account.',undefined,'ready');
    } catch {gate('Unable to connect','Google sign-in could not connect. Check your connection, then try again.',showSignIn);}
    cleanCallback();
  }
  function showChoice(current) {
    if (!isLogin) {toLogin();return;}
    $('login-account').dataset.stage = 'choice';
    $('login-account').setAttribute('aria-labelledby','login-choice-title');
    $('login-account').setAttribute('aria-busy','false');
    $('login-google').hidden = true;
    $('login-retry').hidden = true;
    $('login-choice').hidden = false;
    $('login-use-cloud').disabled = false;
    $('login-use-local').disabled = false;
    $('login-use-cloud').textContent = current.hasCloud ? 'Open my account’s park' : 'Start a new park';
    const conflict = current.status === 'conflict';
    $('login-choice-title').textContent = conflict ? 'Which park should we continue?' : 'Bring your park along';
    $('login-choice-copy').textContent = conflict
      ? 'Your account and this device have different progress. Choose the park to continue.'
      : current.hasCloud
        ? 'Keep the progress on this device, or continue with the park saved to your account.'
        : 'Keep this device’s progress with your account, or start a new park.';
    if (['REMOTE_CHANGED_AGAIN','LOCAL_CHANGED_AGAIN'].includes(current.reason)) $('login-choice-copy').textContent = 'The saved progress changed while you were choosing. Please review your choice again. '+$('login-choice-copy').textContent;
    if (current.hasCloud && Number.isFinite(Date.parse(current.cloudUpdatedAt))) $('login-choice-copy').textContent += ' Your account’s park was saved '+new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(current.cloudUpdatedAt))+'.';
    $('login-status').textContent = user?.email ? 'Signed in as '+user.email : 'You’re signed in.';
    $('login-choice-title').focus({preventScroll:true});
  }
  function instrumentStorage() {
    const supported = new Set(window.SprigganSaves.SUPPORTED_KEYS);
    for (const method of ['setItem','removeItem','clear']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        const gameWrite = this === storage && (method === 'clear' || supported.has(String(args[0])));
        if (gameWrite && gameStarted && !writesAllowed) throw Error('This park is paused while its account changes.');
        const result = original.apply(this,args);
        if (gameWrite && gameStarted && writesAllowed) sync.changed(method === 'clear' ? undefined : String(args[0]));
        return result;
      };
    }
  }
  function preloadWorld() {
    // Warm public script bytes while Auth and hydration run. These links never
    // execute a world; activateWorld still owns the ordered, authenticated start.
    for (const source of document.querySelectorAll('script[type="application/x-spriggan"][src]')) {
      const link = document.createElement('link');
      const module = source.getAttribute('data-park-type') === 'module';
      link.setAttribute('rel',module ? 'modulepreload' : 'preload');
      if (!module) link.setAttribute('as','script');
      link.setAttribute('href',source.getAttribute('src'));
      for (const name of ['crossorigin','integrity','referrerpolicy','fetchpriority','nonce']) {
        if (source.hasAttribute(name)) link.setAttribute(name,source.getAttribute(name));
      }
      document.head.append(link);
    }
  }
  async function activateWorld() {
    const assertActive = () => {
      if (!writesAllowed || client.getUser && client.getUser()?.id !== user.id) throw Object.assign(Error('Your signed-in account changed.'),{code:'SESSION_CHANGED'});
    };
    for (const source of document.querySelectorAll('script[type="application/x-spriggan"]')) {
      assertActive();
      const script = document.createElement('script');
      for (const attribute of source.attributes) if (attribute.name !== 'type' && attribute.name !== 'data-park-type') script.setAttribute(attribute.name,attribute.value);
      script.async = false;
      const originalType = source.getAttribute('data-park-type');
      if (originalType) script.type = originalType;
      script.textContent = source.textContent;
      await new Promise((resolve,reject) => {
        if (source.hasAttribute('src') || originalType === 'module') {script.onload = resolve;script.onerror = () => reject(Error('World could not load'));}
        source.replaceWith(script);
        if (!source.hasAttribute('src') && originalType !== 'module') resolve();
      });
      assertActive();
    }
  }
  function capture() {if (!gameStarted || !writesAllowed) return;document.dispatchEvent(new CustomEvent('spriggan:park-save-request'));sync.changed();}
  async function flush() {capture();return sync?.flush();}
  async function reconnect() {
    capture();
    const checked = await sync.check();
    return checked.canPlay && checked.dirty ? sync.flush() : checked;
  }
  async function signOut() {
    if (leaving) return;
    leaving = true;
    try {
      capture();writesAllowed = false;document.body.inert = true;
      await sync.flush();
      await client.signOut();
      blockGame();location.replace(login.href);
    } catch (error) {leaving = false;writesAllowed = true;document.body.inert = false;notify();throw error;}
  }
  function runtimeEvents() {
    document.addEventListener('click',event => {
      const anchor = event.target.closest?.('a[href]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return;
      const target = new URL(anchor.href,location.href);
      if (target.origin !== home.origin || route(target.href) !== target.pathname || target.pathname === location.pathname) return;
      event.preventDefault();
      if (leaving) return;
      leaving = true;
      let timer;
      // Navigation stays responsive on a slow connection; pending local data is
      // reconciled against the saved revision before the next world starts.
      void Promise.race([flush(),new Promise(resolve => {timer = setTimeout(resolve,1500);})])
        .catch(() => {}).finally(() => {clearTimeout(timer);location.assign(target.href);});
    });
    window.addEventListener('online',() => {void reconnect();});
    document.addEventListener('visibilitychange',() => {if (document.hidden) void flush();});
    window.addEventListener('pagehide',() => {
      capture();
      queueMicrotask(() => {
        capture();writesAllowed = false;sync?.stop();releaseLock?.();
      });
    });
    window.addEventListener('pageshow',event => {if (event.persisted) location.reload();});
    // A different device pauses this tab before any newer park can replace live data.
    setInterval(() => {if (!document.hidden && !leaving && writesAllowed) void sync.check();},30000);
  }
  async function continuePark(current) {
    if (['choice','conflict'].includes(current.status)) {showChoice(current);return;}
    if (!current.canPlay) {gate('Your park is waiting',messageFor(current.error),() => location.reload());return;}
    if (isLogin) {
      const next = nextRoute();
      try {sessionStorage.removeItem(NEXT_KEY);sessionStorage.setItem('spriggan.map-entry',JSON.stringify({path:next,at:Date.now()}));} catch {}
      location.replace(new URL(next,home).href);return;
    }
    cleanCallback();
    instrumentStorage();
    window.SprigganAccount = Object.freeze({getUser:() => user,getState:() => state,getMessage:statusCopy,signOut,retry:reconnect});
    gameStarted = true;
    runtimeEvents();
    await activateWorld();
    if (!writesAllowed) return;
    $('park-gate').hidden = true;
    delete document.documentElement.dataset.parkAuth;
    capture();notify();
  }
  async function initialize() {
    if (starting || initialized) return;
    starting = true;
    try {
      storage = window.localStorage;
      const probe = 'spriggan.session.probe';storage.setItem(probe,'1');storage.removeItem(probe);
      client = window.SprigganCloud.create(window.SPRIGGAN_CLOUD_CONFIG,{saves:window.SprigganSaves,storage,redirectTo:home.href});
      user = await client.initialize();
      client.onAuthChange(next => {
        if ((next?.id || null) !== (user?.id || null)) {blockGame();toLogin();}
      });
      initialized = true;
      if (!user) {await showSignIn();return;}
      if (isLogin) {
        if ($('login-switch')) $('login-switch').hidden = false;
        gate('Opening your park…','Opening your park and getting your progress ready.',undefined,'opening');
      }
      sync = window.SprigganSync.create({client,saves:window.SprigganSaves,storage,onState:received,onRemoteChange:() => {if (gameStarted) {blockGame();location.reload();}}});
      await continuePark(await sync.start(user));
    } catch (error) {blockGame();gate('Your park is waiting',messageFor(error),() => location.reload());document.body.inert = false;}
    finally {starting = false;}
  }
  async function choose(method) {
    $('login-use-cloud').disabled = true;$('login-use-local').disabled = true;
    gate('Opening your park…','Opening your park and getting your progress ready.',undefined,'opening');
    try {await continuePark(await sync[method]());}
    catch (error) {gate('Your park is waiting',messageFor(error),() => location.reload());}
  }
  function mount() {
    preloadWorld();
    $('login-retry')?.addEventListener('click',() => {void retryAction?.();});
    $('park-gate-retry')?.addEventListener('click',() => {void retryAction?.();});
    $('login-use-cloud')?.addEventListener('click',() => {void choose('useCloud');});
    $('login-use-local')?.addEventListener('click',() => {void choose('keepLocal');});
    $('login-switch')?.addEventListener('click',async () => {
      $('login-switch').disabled = true;
      $('login-use-cloud').disabled = true;$('login-use-local').disabled = true;
      gate('Changing account','Signing out of this account…',undefined,'opening');
      try {sync?.stop();await client.signOut();location.replace(login.href);}
      catch {
        $('login-switch').disabled = false;
        gate('Unable to change account','Sign-out could not finish. Check your connection, then try again.',() => location.reload());
      }
    });
    $('login-google')?.addEventListener('click',async () => {
      $('login-google').disabled = true;gate('Signing in…','Opening Google sign-in…',undefined,'opening');
      try {await client.signIn();}
      catch {gate('Unable to sign in','Google sign-in could not start. Please try again.',showSignIn);$('login-google').disabled = false;}
    });
    if (!navigator.locks?.request) {gate('A newer browser is needed','Please open Spriggan in an up-to-date browser to keep your account’s progress safe.');return;}
    void navigator.locks.request(LOCK_NAME,{ifAvailable:true},async lock => {
      if (!lock) {gate('Your park is already open','Your park is open in another tab. Close that tab, then try again here.',() => location.reload());return;}
      const released = new Promise(resolve => {releaseLock = resolve;});
      await initialize();
      await released;
    }).catch(() => gate('Your park is waiting','We could not open a safe browser session. Close other Spriggan tabs, then try again.',() => location.reload()));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
