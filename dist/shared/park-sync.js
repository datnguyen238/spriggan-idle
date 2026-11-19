/* Account-bound park snapshots. Gameplay starts only after start() permits it. */
(function (root) {
  'use strict';

  const META_KEY = 'spriggan.sync.v1';
  const RECOVERY_KEY = 'spriggan.cloud.recovery.v1';
  const PARK_KEYS = ['spriggan.pond.v1','spriggan.farm.v1','spriggan.hex.totals.v1','spriggan.dumplings.v1','spriggan.claw.v1','spriggan.slots.v1','spriggan.fishing.guide.v1'];
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9-]{1,128}$/.test(value);
  const revision = value => value === null || Number.isSafeInteger(value) && value > 0;
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const problem = (code,message) => Object.assign(new Error(message),{code});
  const accountKey = id => `spriggan.sync.park.${id}.v1`;
  const previousCloudKey = id => `spriggan.sync.remote.${id}.v1`;

  // A compact content checksum, not an authentication or authorization boundary.
  // Export timestamps are deliberately excluded; saved world timestamps are retained.
  function fingerprint(entries) {
    const text = JSON.stringify(Object.keys(entries).sort().map(key => [key,entries[key]]));
    let first = 2166136261, second = 3335557771;
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      first = Math.imul(first ^ code,16777619);
      second = Math.imul(second ^ code,2246822507);
    }
    return `${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
  }
  function validMeta(value) {
    return object(value) && value.version === 1 && validId(value.userId) && revision(value.revision) &&
      (value.baseFingerprint === null || typeof value.baseFingerprint === 'string' && value.baseFingerprint.length < 100) &&
      typeof value.binding === 'string' && value.binding.length > 0 && value.binding.length < 200;
  }
  function create(options = {}) {
    const {client,saves,storage} = options;
    if (!client || !['read','write'].every(method => typeof client[method] === 'function') ||
      !saves || !['exportBackup','inspectBackup','restorePark'].every(method => typeof saves[method] === 'function') ||
      !storage || !['getItem','setItem','removeItem'].every(method => typeof storage[method] === 'function')) throw new TypeError('Park sync needs cloud, save and storage adapters.');
    const later = options.setTimeout || root.setTimeout.bind(root), cancel = options.clearTimeout || root.clearTimeout.bind(root);
    const now = options.now || Date.now;
    const delay = Number.isFinite(options.delayMs) ? Math.max(1,options.delayMs) : 8000;
    let state = {status:'idle',canPlay:false,dirty:false,user:null,revision:null};
    let user = null, meta = null, sourceMeta = null, candidate = null, choice = null;
    let timer = null, flight = null, flightFingerprint = null, generation = 0, active = false;

    function publish(status,changes = {}) {
      state = Object.freeze({...state,status,error:null,reason:null,...changes});
      if (typeof options.onState === 'function') try {options.onState(state);} catch (_) {}
      return state;
    }
    function readMeta() {
      const raw = storage.getItem(META_KEY);
      if (!raw) return null;
      try {const value = JSON.parse(raw);return validMeta(value) ? value : null;} catch (_) {return null;}
    }
    function snapshot(backup = saves.exportBackup(storage)) {
      const summary = saves.inspectBackup(backup);
      return {backup,fingerprint:fingerprint(summary.entries),summary};
    }
    function empty() {
      return snapshot(JSON.stringify({format:'spriggan-park',version:1,exportedAt:new Date(now()).toISOString(),entries:{}}));
    }
    function dirty(value = snapshot()) {return meta?.baseFingerprint !== value.fingerprint;}
    function clearTimer() {if (timer !== null) cancel(timer);timer = null;}
    function stillCurrent(token) {if (!active || token !== generation) throw problem('SESSION_CHANGED','Your account changed. Open your park again.');}
    function bindingMatches(expected,actual) {
      return expected === null ? actual === null : actual !== null && expected.userId === actual.userId && expected.binding === actual.binding && expected.revision === actual.revision && expected.baseFingerprint === actual.baseFingerprint;
    }
    function assertSource(expected = meta || sourceMeta) {
      const current = readMeta();
      if (!bindingMatches(expected,current)) throw problem('SESSION_CHANGED','Your park is open in another account or tab. Reload to continue.');
    }
    function writeMeta(next) {
      storage.setItem(META_KEY,JSON.stringify(next));
      meta = next;sourceMeta = next;
    }
    function keepRaw(key,raw) {if (raw === null) storage.removeItem(key);else storage.setItem(key,raw);}
    function stashCurrent(before,currentMeta) {
      if (currentMeta && currentMeta.userId !== user.id) storage.setItem(accountKey(currentMeta.userId),JSON.stringify({version:1,...currentMeta,backup:before.backup}));
    }
    function replace(value,base) {
      assertSource();
      const before = snapshot(), beforeMeta = storage.getItem(META_KEY), beforeRecovery = storage.getItem(RECOVERY_KEY);
      const previousOwner = readMeta();
      const next = {version:1,userId:user.id,revision:base.revision,baseFingerprint:base.baseFingerprint,
        binding:`${now().toString(36)}-${Math.random().toString(36).slice(2)}`,pending:base.baseFingerprint !== value.fingerprint};
      stashCurrent(before,previousOwner);
      const changed = before.fingerprint !== value.fingerprint;
      try {
        if (changed) storage.setItem(RECOVERY_KEY,JSON.stringify({version:1,userId:previousOwner?.userId || null,backup:before.backup,at:now()}));
        if (changed) saves.restorePark(value.backup,storage);
        writeMeta(next);
      } catch (cause) {
        try {saves.restorePark(before.backup,storage);keepRaw(META_KEY,beforeMeta);keepRaw(RECOVERY_KEY,beforeRecovery);} catch (_) {throw problem('ROLLBACK_FAILED','Browser storage failed while opening your park. Your recovery copy is still on this browser.');}
        throw cause;
      }
      candidate = value;
      if (changed && typeof options.onRemoteChange === 'function') try {options.onRemoteChange();} catch (_) {}
    }
    function rememberPending(value) {
      assertSource();
      const pending = dirty(value);
      if (meta.pending !== pending) writeMeta({...meta,pending});
      return pending;
    }
    function schedule() {
      if (timer !== null || flight || !active || !state.canPlay || state.status === 'offline') return;
      // A fixed window from the first change prevents continuously saved timers from
      // postponing the upload forever (a trailing-only debounce would starve).
      timer = later(() => {timer = null;void flush();},delay);
    }
    function failure(cause,wasPlayable = false) {
      clearTimer();
      const offline = ['NETWORK','TIMEOUT'].includes(cause?.code);
      return publish(offline ? 'offline' : 'error',{canPlay:offline && wasPlayable,dirty:!!meta && meta.pending === true,error:cause,reason:cause?.code || 'SYNC_FAILED'});
    }
    function sameRemote(left,right) {
      return (left?.revision ?? null) === (right?.revision ?? null) && (left ? snapshot(left.backup).fingerprint : null) === (right ? snapshot(right.backup).fingerprint : null);
    }
    function decide(local,remote,reason,status = 'conflict') {
      clearTimer();candidate = local;
      choice = {local,remote,source:readMeta(),status};
      return publish(status,{canPlay:false,dirty:true,reason,revision:meta?.revision ?? null,hasCloud:!!remote,
        localWorlds:local.summary.worlds,cloudWorlds:remote ? snapshot(remote.backup).summary.worlds : [],cloudUpdatedAt:remote?.updatedAt || null});
    }
    function bindAndOpen(local,remoteBase,status = 'ready') {
      replace(local,{revision:remoteBase?.revision ?? null,baseFingerprint:remoteBase ? snapshot(remoteBase.backup).fingerprint : null});
      choice = null;
      const pending = rememberPending(local);
      publish(pending && status === 'ready' ? 'pending' : status,{canPlay:true,dirty:pending,revision:meta.revision,cloudUpdatedAt:remoteBase?.updatedAt || null,hasCloud:!!remoteBase});
      if (pending) schedule();
      return state;
    }
    function readStash(id) {
      try {
        const raw = storage.getItem(accountKey(id));
        if (!raw) return null;
        const value = JSON.parse(raw);
        if (!validMeta(value) || value.userId !== id || typeof value.backup !== 'string') return null;
        return {value:snapshot(value.backup),meta:value};
      } catch (_) {return null;}
    }
    async function start(nextUser) {
      clearTimer();const token = ++generation;active = true;
      if (!validId(nextUser?.id)) {active = false;return publish('error',{canPlay:false,error:problem('AUTH_REQUIRED','Sign in to open your park.'),reason:'AUTH_REQUIRED'});}
      user = {id:nextUser.id,email:nextUser.email || null,name:nextUser.name || null};meta = null;choice = null;
      publish('loading',{canPlay:false,dirty:false,user,revision:null});
      let local, localMeta = null, owned = false, unowned = false;
      try {
        sourceMeta = readMeta();
        const current = snapshot();
        owned = sourceMeta?.userId === user.id;
        if (owned) {local = current;localMeta = sourceMeta;meta = sourceMeta;}
        else {
          const stash = readStash(user.id);
          if (stash) {local = stash.value;localMeta = stash.meta;}
          else if (!sourceMeta) {local = current;unowned = true;}
          else local = empty();
        }
        candidate = local;
        let remote;
        try {remote = await client.read(user.id);}
        catch (cause) {
          stillCurrent(token);assertSource();
          if (owned && ['NETWORK','TIMEOUT'].includes(cause?.code)) {
            writeMeta({...localMeta,pending:local.fingerprint !== localMeta.baseFingerprint});
            return publish('offline',{canPlay:true,dirty:meta.pending,revision:meta.revision,error:cause,reason:cause.code});
          }
          throw cause;
        }
        stillCurrent(token);assertSource();
        const cloud = remote ? snapshot(remote.backup) : null;
        if (unowned && PARK_KEYS.some(key => Object.hasOwn(local.summary.entries,key)) && (!cloud || cloud.fingerprint !== local.fingerprint)) return decide(local,remote,'LEGACY_PARK','choice');
        if (localMeta) {
          const pending = local.fingerprint !== localMeta.baseFingerprint;
          if (pending) {
            if (cloud && cloud.fingerprint === local.fingerprint) return bindAndOpen(local,remote);
            if ((remote?.revision ?? null) !== localMeta.revision || cloud && cloud.fingerprint !== localMeta.baseFingerprint) return decide(local,remote,'REMOTE_CHANGED');
            return bindAndOpen(local,remote);
          }
        }
        return bindAndOpen(cloud || empty(),remote);
      } catch (cause) {
        if (token !== generation || !active) return state;
        return failure(cause,false);
      }
    }
    function changed() {
      if (!active || !state.canPlay || !meta) return state;
      try {
        const value = snapshot(), pending = rememberPending(value);
        if (!pending) {if (!flight) {clearTimer();publish('ready',{canPlay:true,dirty:false,revision:meta.revision});}return state;}
        if (!flight) publish(state.status === 'offline' ? 'offline' : 'pending',{canPlay:true,dirty:true,revision:meta.revision,error:state.status === 'offline' ? state.error : null});
        schedule();return state;
      } catch (cause) {return failure(cause,false);}
    }
    async function upload(token) {
      let value;
      try {
        stillCurrent(token);assertSource();value = snapshot();
        if (!rememberPending(value)) return publish('ready',{canPlay:true,dirty:false,revision:meta.revision});
        flightFingerprint = value.fingerprint;
        publish('saving',{canPlay:true,dirty:true,revision:meta.revision});
        const result = await client.write(value.backup,meta.revision,user.id);
        stillCurrent(token);assertSource();
        writeMeta({...meta,revision:result.revision,baseFingerprint:value.fingerprint,pending:snapshot().fingerprint !== value.fingerprint});
        return publish(meta.pending ? 'pending' : 'ready',{canPlay:true,dirty:meta.pending,revision:meta.revision,cloudUpdatedAt:result.updatedAt,hasCloud:true});
      } catch (cause) {
        if (token !== generation || !active) return state;
        if (cause?.code === 'SAVE_CONFLICT') {
          try {
            const remote = await client.read(user.id);stillCurrent(token);assertSource();
            const local = snapshot();
            // An earlier timed-out request may actually have reached the server.
            if (remote && snapshot(remote.backup).fingerprint === local.fingerprint) {
              writeMeta({...meta,revision:remote.revision,baseFingerprint:local.fingerprint,pending:false});
              return publish('ready',{canPlay:true,dirty:false,revision:meta.revision,cloudUpdatedAt:remote.updatedAt,hasCloud:true});
            }
            return decide(local,remote,'REMOTE_CHANGED');
          } catch (readError) {if (token !== generation || !active) return state;return failure(readError,true);}
        }
        return failure(cause,true);
      }
    }
    function flush() {
      clearTimer();
      if (flight) {
        let requested;
        try {assertSource();requested = snapshot().fingerprint;}
        catch (cause) {return Promise.resolve(failure(cause,false));}
        if (requested === flightFingerprint) return flight;
        const token = generation;
        // A navigation/sign-out flush must include changes made after the
        // in-flight snapshot. Drain one requested state, without retrying errors
        // or chasing continuously changing gameplay forever.
        return flight.then(() => {
          if (!active || token !== generation || !state.canPlay || ['offline','error'].includes(state.status) || meta.baseFingerprint === requested) return state;
          return flush();
        });
      }
      if (!active || !state.canPlay || !meta) return Promise.resolve(state);
      const token = generation;
      flight = upload(token).finally(() => {
        flight = null;flightFingerprint = null;
        if (token === generation && active && state.canPlay && state.dirty && state.status !== 'offline' && state.status !== 'error') schedule();
      });
      return flight;
    }
    async function check() {
      if (flight) return flight;
      if (!active || !state.canPlay || !meta) return state;
      const token = generation, expectedRevision = meta.revision;
      try {
        assertSource();
        const remote = await client.read(user.id);stillCurrent(token);assertSource();
        // An upload completing while the read was in flight makes this observation
        // stale. The next check can inspect the newly committed base instead.
        if (meta.revision !== expectedRevision) return state;
        const local = snapshot(), cloud = remote ? snapshot(remote.backup) : null;
        if (cloud && cloud.fingerprint === local.fingerprint) {
          writeMeta({...meta,revision:remote.revision,baseFingerprint:local.fingerprint,pending:false});
          clearTimer();return publish('ready',{canPlay:true,dirty:false,revision:meta.revision,cloudUpdatedAt:remote.updatedAt,hasCloud:true});
        }
        if ((remote?.revision ?? null) !== meta.revision || cloud && cloud.fingerprint !== meta.baseFingerprint) return decide(local,remote,'REMOTE_CHANGED');
        const pending = rememberPending(local);
        publish(pending ? 'pending' : 'ready',{canPlay:true,dirty:pending,revision:meta.revision});
        if (pending) schedule();return state;
      } catch (cause) {
        if (token !== generation || !active) return state;
        return failure(cause,true);
      }
    }
    async function resolveChoice(mode) {
      if (!active || !choice) return state;
      const decision = choice, token = generation;
      publish('loading',{canPlay:false,dirty:true});
      try {
        assertSource();
        const remote = await client.read(user.id);stillCurrent(token);assertSource();
        if (!sameRemote(decision.remote,remote)) return decide(decision.local,remote,'REMOTE_CHANGED_AGAIN',decision.status === 'choice' ? 'choice' : 'conflict');
        // A different tab must not change the browser park after it was shown as
        // the choice. Stashed parks are detached from the active owner's records.
        if (!sourceMeta || sourceMeta.userId === user.id) {
          const current = snapshot();
          if (current.fingerprint !== decision.local.fingerprint) return decide(current,remote,'LOCAL_CHANGED_AGAIN');
        }
        if (mode === 'cloud') return bindAndOpen(remote ? snapshot(remote.backup) : empty(),remote);
        if (remote) storage.setItem(previousCloudKey(user.id),JSON.stringify({version:1,userId:user.id,backup:remote.backup,revision:remote.revision,updatedAt:remote.updatedAt}));
        bindAndOpen(decision.local,remote);
        return await flush();
      } catch (cause) {
        if (token !== generation || !active) return state;
        // Retain the decision so the same action can be retried after reconnecting.
        return failure(cause,false);
      }
    }
    function stop() {active = false;generation++;clearTimer();return publish('stopped',{canPlay:false});}
    return Object.freeze({start,changed,flush,check,keepLocal:() => resolveChoice('local'),useCloud:() => resolveChoice('cloud'),stop,getState:() => state});
  }
  const api = Object.freeze({create,META_KEY,RECOVERY_KEY,accountKey,previousCloudKey});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SprigganSync = api;
})(globalThis);
