/* Optional cloud copies. Gameplay stays local; importing a cloud park is always the caller's choice. */
(function (root) {
  'use strict';

  const DEFAULT_TIMEOUT = 15000;
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const integer = value => Number.isSafeInteger(value) && value > 0;
  const cleanText = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
  function error(code, message) {const failure = new Error(message); failure.code = code; return failure;}
  const messages = {
    INVALID_CONFIG:'Cloud saving is not configured yet. Check the project URL and publishable key.',
    SDK_UNAVAILABLE:'Cloud sign-in could not load. Refresh the page and try again.',
    AUTH_REQUIRED:'Sign in with Google to use cloud saves.',
    AUTH_FAILED:'Google sign-in could not start. Try again, or keep playing on this browser.',
    SIGN_OUT_FAILED:'Sign-out could not be confirmed. Check your connection and try again. Your park stays on this browser.',
    SESSION_CHANGED:'Your signed-in account changed. Check the account, then try again.',
    STORAGE_UNAVAILABLE:'Cloud sign-in needs browser storage. Allow site storage, then try again.',
    SAVE_CONFLICT:'A newer cloud save is available. Review it before saving again.',
    INVALID_BACKUP:'This park backup is not valid. Save a fresh backup and try again.',
    CLOUD_DATA_INVALID:'This cloud save could not be read safely. Your browser park has not changed. Try again later.',
    CLOUD_SETUP:'Cloud saving is not ready. Check the database setup and try again.',
    NETWORK:'Cloud saves could not be reached. Check your connection and try again.',
    TIMEOUT:'Cloud saving took too long. Your local park is safe. Check your connection and try again.',
    CLOSED:'This cloud connection has closed. Refresh the page and try again.'
  };
  const fail = code => error(code,messages[code]);
  function publicOrigin(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value.trim());
      const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
      if (url.username || url.password || url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
      return url;
    } catch (_) {return null;}
  }
  function jwtPayload(value) {
    try {
      const parts = value.split('.');
      if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
      const decode = part => root.atob(part.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-part.length%4)%4));
      const header = JSON.parse(decode(parts[0])), payload = JSON.parse(decode(parts[1]));
      return object(header) && header.alg !== 'none' && object(payload) ? payload : null;
    } catch (_) {return null;}
  }
  function validateConfig(config) {
    if (!object(config)) return null;
    const url = publicOrigin(config.url), key = typeof config.publishableKey === 'string' ? config.publishableKey.trim() : '';
    if (!url || url.pathname !== '/' || url.search || url.hash || key.length > 4096) return null;
    const publishable = /^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key);
    const legacy = !publishable && jwtPayload(key);
    if (!publishable && legacy?.role !== 'anon') return null;
    return {url:url.origin,publishableKey:key};
  }
  function userView(value) {
    if (!object(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9-]{1,128}$/.test(value.id)) return null;
    const metadata = object(value.user_metadata) ? value.user_metadata : {};
    return Object.freeze({id:value.id,email:cleanText(value.email,254) || null,name:cleanText(metadata.full_name || metadata.name || value.name,80) || null});
  }
  function updatedAt(value) {return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));}
  function create(config, options = {}) {
    const settings = validateConfig(config);
    if (!settings) throw fail('INVALID_CONFIG');
    const factory = options.createClient || root.supabase?.createClient;
    const saves = options.saves || root.SprigganSaves;
    if (typeof factory !== 'function' || !saves || typeof saves.inspectBackup !== 'function') throw fail('SDK_UNAVAILABLE');
    const redirect = publicOrigin(options.redirectTo || (root.location ? root.location.origin + root.location.pathname : ''));
    if (!redirect || redirect.hash || redirect.search || root.location?.origin && redirect.origin !== root.location.origin) throw fail('INVALID_CONFIG');
    const timeout = Number.isFinite(options.timeoutMs) && options.timeoutMs >= 1 && options.timeoutMs <= 60000 ? options.timeoutMs : DEFAULT_TIMEOUT;
    const storageKey = `spriggan.cloud.${new URL(settings.url).host}.auth.v1`;
    function storageTarget() {
      try {
        const target = options.storage === undefined ? root.localStorage : options.storage;
        if (!target || !['getItem','setItem','removeItem'].every(method => typeof target[method] === 'function')) throw Error();
        return target;
      } catch (_) {throw fail('STORAGE_UNAVAILABLE');}
    }
    const authStorage = {};
    for (const method of ['getItem','setItem','removeItem']) authStorage[method] = (key,...args) => {
      // The SDK may save a code verifier or cached user beside its own session, never game records.
      if (typeof key !== 'string' || key !== storageKey && !key.startsWith(storageKey+'-')) throw fail('STORAGE_UNAVAILABLE');
      try {return storageTarget()[method](key,...args);} catch (_) {throw fail('STORAGE_UNAVAILABLE');}
    };
    let sdk;
    try {
      sdk = factory(settings.url,settings.publishableKey,{auth:{
        flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey,storage:authStorage
      }});
    } catch (_) {throw fail('SDK_UNAVAILABLE');}
    if (!sdk?.auth || !['getSession','getUser','signInWithOAuth','signOut','onAuthStateChange'].every(method => typeof sdk.auth[method] === 'function')) throw fail('SDK_UNAVAILABLE');
    let user = null, userKnown = false, generation = 0, disposed = false;
    const listeners = new Set(), notifications = new Set(), controllers = new Set();
    function assertOpen() {if (disposed) throw fail('CLOSED');}
    function notify(event) {
      const snapshot = user;
      const timer = setTimeout(() => {
        notifications.delete(timer);
        if (disposed) return;
        for (const listener of listeners) try {listener(snapshot,event);} catch (_) { /* A view must not break auth callbacks. */ }
      },0);
      notifications.add(timer);
    }
    function setUser(value,event) {
      const next = userView(value);
      if ((next?.id || null) !== (user?.id || null) || event === 'SIGNED_OUT') generation++;
      user = next; userKnown = true; notify(event);
    }
    // Never call back into Auth while Supabase holds its auth-state callback lock.
    let authSubscription;
    try {authSubscription = sdk.auth.onAuthStateChange((event,session) => {if (!disposed) setUser(session?.user || null,event);})?.data?.subscription;}
    catch (_) {throw fail('SDK_UNAVAILABLE');}
    async function limited(operation,controller) {
      assertOpen();
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => {assertOpen();return operation();}),
          new Promise((_,reject) => {timer = setTimeout(() => {controller?.abort();reject(fail('TIMEOUT'));},timeout);})
        ]);
        assertOpen();return value;
      } finally {clearTimeout(timer);}
    }
    function remoteError(cause, fallback = 'NETWORK') {
      if (cause?.code && Object.hasOwn(messages,cause.code)) return fail(cause.code);
      if (cause?.code === 'SAVE_CONFLICT' || typeof cause?.message === 'string' && /\bSAVE_CONFLICT\b/.test(cause.message)) return fail('SAVE_CONFLICT');
      if (cause?.status === 401 || cause?.name === 'AuthSessionMissingError' || ['session_not_found','refresh_token_not_found','refresh_token_already_used','bad_jwt'].includes(cause?.code)) return fail('AUTH_REQUIRED');
      if (['42P01','42883','42501','PGRST202','PGRST205'].includes(cause?.code)) return fail('CLOUD_SETUP');
      return fail(fallback);
    }
    function assertAccount(expected) {
      assertOpen();
      if (!user || user.id !== expected.id || generation !== expected.generation) throw fail('SESSION_CHANGED');
    }
    async function verify(expectedId, expectedGeneration) {
      const sessionResult = await limited(() => sdk.auth.getSession());
      if (sessionResult?.error) throw remoteError(sessionResult.error);
      const session = sessionResult?.data?.session;
      if (!session) throw fail('AUTH_REQUIRED');
      if (session.user?.id !== expectedId || typeof session.access_token !== 'string' || !session.access_token) throw fail('SESSION_CHANGED');
      const response = await limited(() => sdk.auth.getUser(session.access_token));
      if (response?.error) throw remoteError(response.error);
      const verified = userView(response?.data?.user);
      if (!verified) throw fail('AUTH_REQUIRED');
      if (verified.id !== expectedId || generation !== expectedGeneration && userKnown) throw fail('SESSION_CHANGED');
      return {view:verified,token:session.access_token,id:verified.id,generation:expectedGeneration};
    }
    async function initialize() {
      assertOpen();
      let attemptedId = null;
      try {
        const before = generation;
        const response = await limited(() => sdk.auth.getSession());
        if (response?.error) throw remoteError(response.error);
        if (generation !== before && userKnown) {
          if (!user) return null;
          attemptedId = user.id;
          const verified = await verify(user.id,generation); setUser(verified.view,'INITIALIZED'); return user;
        }
        const session = response?.data?.session;
        if (!session) {setUser(null,'INITIALIZED');return null;}
        const id = userView(session.user)?.id;
        if (!id) throw fail('AUTH_REQUIRED');
        attemptedId = id;
        setUser(session.user,'INITIALIZING');
        const verified = await verify(id,generation);
        setUser(verified.view,'INITIALIZED'); return user;
      } catch (cause) {
        const failure = remoteError(cause);
        if (failure.code === 'AUTH_REQUIRED' && user?.id === attemptedId) setUser(null,'SIGNED_OUT');
        throw failure;
      }
    }
    async function currentSession(expectedUserId) {
      assertOpen();
      // The view receives auth notifications asynchronously. Bind each operation
      // to the account whose park the caller actually has open, even if Auth has
      // already switched internally and its UI notification has not run yet.
      if (expectedUserId !== undefined && user?.id !== expectedUserId) throw fail('SESSION_CHANGED');
      if (!user) throw fail('AUTH_REQUIRED');
      const expected = {id:user.id,generation};
      try {
        const verified = await verify(expected.id,expected.generation);
        assertAccount(expected);
        return verified;
      } catch (cause) {
        const failure = remoteError(cause);
        if (failure.code === 'AUTH_REQUIRED' && user?.id === expected.id && generation === expected.generation) setUser(null,'SIGNED_OUT');
        throw failure;
      }
    }
    function request(builder, identity, controller) {
      assertAccount(identity);
      // Pin the verified session: a simultaneous Google account switch must not upload A's park to B.
      if (!builder || typeof builder.setHeader !== 'function') throw fail('SDK_UNAVAILABLE');
      builder = builder.setHeader('Authorization',`Bearer ${identity.token}`);
      if (typeof builder.abortSignal === 'function') builder = builder.abortSignal(controller.signal);
      return builder;
    }
    async function signIn() {
      assertOpen();
      try {
        const probe = storageKey+'-probe';
        authStorage.setItem(probe,'ready');
        const available = authStorage.getItem(probe) === 'ready';authStorage.removeItem(probe);
        if (!available) throw fail('STORAGE_UNAVAILABLE');
        const response = await limited(() => sdk.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.href,queryParams:{prompt:'select_account'}}}));
        if (response?.error) throw remoteError(response.error,'AUTH_FAILED');
      } catch (cause) {throw remoteError(cause,'AUTH_FAILED');}
    }
    async function signOut() {
      assertOpen();
      // Stop in-flight account work immediately, but keep the displayed identity until
      // the SDK confirms sign-out or emits a genuine session change of its own.
      const expected = ++generation;
      try {
        const response = await limited(() => sdk.auth.signOut({scope:'local'}));
        if (response?.error) throw fail('SIGN_OUT_FAILED');
        if (generation !== expected) {
          if (user) throw fail('SESSION_CHANGED');
          return;
        }
        setUser(null,'SIGNED_OUT');
      } catch (cause) {
        if (cause?.code === 'CLOSED' || cause?.code === 'SESSION_CHANGED') throw remoteError(cause);
        throw fail('SIGN_OUT_FAILED');
      }
    }
    async function read(expectedUserId) {
      const controller = new AbortController();controllers.add(controller);
      try {
        const identity = await currentSession(expectedUserId);
        const query = sdk.from('park_saves').select('payload,revision,updated_at').eq('user_id',identity.id).maybeSingle();
        const response = await limited(() => request(query,identity,controller),controller);
        assertAccount(identity);
        if (response?.error) throw remoteError(response.error);
        const row = response?.data;
        if (row === null) return null;
        if (!object(row) || !object(row.payload) || !integer(row.revision) || !updatedAt(row.updated_at)) throw fail('CLOUD_DATA_INVALID');
        const backup = JSON.stringify(row.payload);
        try {saves.inspectBackup(backup);} catch (_) {throw fail('CLOUD_DATA_INVALID');}
        return {backup,revision:row.revision,updatedAt:row.updated_at};
      } catch (cause) {throw remoteError(cause);}
      finally {controllers.delete(controller);}
    }
    async function write(backupText,expectedRevision,expectedUserId) {
      try {saves.inspectBackup(backupText);} catch (_) {throw fail('INVALID_BACKUP');}
      if (expectedRevision !== undefined && expectedRevision !== null && !integer(expectedRevision)) throw fail('SAVE_CONFLICT');
      const controller = new AbortController();controllers.add(controller);
      try {
        const identity = await currentSession(expectedUserId);
        const query = sdk.rpc('save_park',{p_payload:JSON.parse(backupText),p_expected_revision:expectedRevision ?? null});
        const response = await limited(() => request(query,identity,controller),controller);
        assertAccount(identity);
        if (response?.error) throw remoteError(response.error);
        const row = Array.isArray(response?.data) && response.data.length === 1 ? response.data[0] : response?.data;
        if (!object(row) || !integer(row.revision) || !updatedAt(row.updated_at)) throw fail('CLOUD_DATA_INVALID');
        return {revision:row.revision,updatedAt:row.updated_at};
      } catch (cause) {throw remoteError(cause);}
      finally {controllers.delete(controller);}
    }
    function onAuthChange(listener) {
      assertOpen();
      if (typeof listener !== 'function') throw new TypeError('An auth listener must be a function.');
      listeners.add(listener);
      if (userKnown) notify('CURRENT_USER');
      return () => listeners.delete(listener);
    }
    function dispose() {
      disposed = true;generation++;
      authSubscription?.unsubscribe();listeners.clear();
      for (const timer of notifications) clearTimeout(timer);
      notifications.clear();for (const controller of controllers) controller.abort();controllers.clear();
    }
    return Object.freeze({initialize,signIn,signOut,read,write,onAuthChange,getUser:() => user,dispose});
  }
  const api = Object.freeze({validateConfig,create});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SprigganCloud = api;
})(globalThis);
