const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const HTML = fs.readFileSync(require.resolve('../dist/index.html'),'utf8');
const SOURCE = fs.readFileSync(require.resolve('../dist/shared/park-account.js'),'utf8');
const deferred = () => {let resolve,reject;const promise = new Promise((yes,no) => {resolve = yes;reject = no;});return {promise,resolve,reject};};

function setup(options = {}) {
  const ids = new Map(), events = new Map();
  const state = {user:options.user || {id:'user-a',email:'lin@example.test',name:'Lin'},sync:{status:options.status || 'ready'},message:options.message || 'Your progress is saved to your account.',signOut:null,retry:null};
  const calls = {signOut:0,retry:0,opened:0};
  for (const match of HTML.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
    const handlers = new Map();
    const node = {id:match[3],textContent:'',hidden:/\bhidden\b/.test(match[2]),disabled:/\bdisabled\b/.test(match[2]),
      addEventListener(type,listener) {handlers.set(type,listener);},
      async fire(type) {await handlers.get(type)?.({target:this});},
      async click() {if (!this.disabled && !this.hidden) await this.fire('click');}};
    Object.defineProperty(node,'innerHTML',{set() {throw Error('Account identity and status must be plain text.');}});
    ids.set(node.id,node);
  }
  ids.get('park-memory-toggle').click = () => {calls.opened++;};
  const account = {
    getUser:() => state.user,getState:() => state.sync,getMessage:() => state.message,
    async signOut() {calls.signOut++;return state.signOut?.();},
    async retry() {calls.retry++;return state.retry?.();}
  };
  const document = {getElementById:id => ids.get(id) || null,addEventListener:(type,listener) => events.set(type,listener)};
  const context = vm.createContext({window:{SprigganAccount:options.noAccount ? null : account},document,URL,location:{href:options.href || 'https://spriggan.test/'}});
  vm.runInContext(SOURCE,context);
  return {state,calls,account,ids,get:name => ids.get('park-account-'+name),emit() {events.get('spriggan:account-state')?.();}};
}

test('account controls display the signed-in identity and automatic save status without doing cloud work',() => {
  const h = setup();assert.equal(h.get('name').textContent,'lin@example.test');
  assert.equal(h.get('status').textContent,'Your progress is saved to your account.');
  assert.equal(h.get('retry').hidden,true);assert.equal(h.get('signout').disabled,false);
  assert.equal(h.calls.retry,0);assert.equal(h.calls.signOut,0);
});

test('account names and save messages are rendered as literal text',() => {
  const email = '<img src=x onerror=steal()>', message = '<script>secret()</script>';
  const h = setup({user:{id:'user-a',email},message});
  assert.equal(h.get('name').textContent,email);assert.equal(h.get('status').textContent,message);
});

test('identity falls back from email to name and then to an account label',() => {
  const h = setup({user:{id:'user-a',name:'Lin'}});assert.equal(h.get('name').textContent,'Lin');
  h.state.user = {id:'user-a'};h.emit();assert.equal(h.get('name').textContent,'Your Google account');
});

test('session events refresh identity and the latest saving status',() => {
  const h = setup();h.state.user = {id:'user-b',email:'robin@example.test'};
  h.state.sync = {status:'saving'};h.state.message = 'Saving your progress…';h.emit();
  assert.equal(h.get('name').textContent,'robin@example.test');assert.equal(h.get('status').textContent,'Saving your progress…');
  assert.equal(h.get('retry').hidden,true);
});

test('reconnect appears only for offline or failed save states',() => {
  const h = setup();
  for (const status of ['offline','error']) {h.state.sync = {status};h.emit();assert.equal(h.get('retry').hidden,false);}
  for (const status of ['ready','pending','saving']) {h.state.sync = {status};h.emit();assert.equal(h.get('retry').hidden,true);}
});

test('sign-out disables both actions and ignores duplicate events until it completes',async () => {
  const h = setup({status:'offline'}), wait = deferred();h.state.signOut = () => wait.promise;
  const request = h.get('signout').click();assert.equal(h.calls.signOut,1);
  assert.equal(h.get('signout').disabled,true);assert.equal(h.get('retry').disabled,true);
  assert.equal(h.get('status').textContent,'Saving your progress and signing out…');
  await h.get('signout').fire('click');await h.get('retry').fire('click');
  assert.equal(h.calls.signOut,1);assert.equal(h.calls.retry,0);
  h.state.message = 'Intermediate save state';h.emit();assert.equal(h.get('status').textContent,'Saving your progress and signing out…');
  wait.resolve();await request;
});

test('failed sign-out restores usable controls and hides provider error details',async () => {
  const h = setup({status:'offline'});h.state.signOut = () => {throw Error('private auth token');};
  await h.get('signout').click();assert.equal(h.get('signout').disabled,false);assert.equal(h.get('retry').disabled,false);
  assert.match(h.get('status').textContent,/Sign-out could not finish/);assert(!h.get('status').textContent.includes('private auth token'));
  h.state.signOut = null;await h.get('signout').click();assert.equal(h.calls.signOut,2);
});

test('reconnect disables actions while active and preserves its busy message through save events',async () => {
  const h = setup({status:'offline'}), wait = deferred();h.state.retry = () => wait.promise;
  const request = h.get('retry').click();assert.equal(h.calls.retry,1);assert.equal(h.get('status').textContent,'Reconnecting…');
  assert.equal(h.get('retry').disabled,true);assert.equal(h.get('signout').disabled,true);
  await h.get('retry').fire('click');await h.get('signout').fire('click');assert.equal(h.calls.retry,1);assert.equal(h.calls.signOut,0);
  h.state.sync = {status:'saving'};h.state.message = 'Saving your progress…';h.emit();assert.equal(h.get('status').textContent,'Reconnecting…');
  h.state.sync = {status:'ready'};h.state.message = 'Your progress is saved to your account.';wait.resolve();await request;
  assert.equal(h.get('retry').hidden,true);assert.equal(h.get('signout').disabled,false);assert.equal(h.get('status').textContent,h.state.message);
});

test('a rejected reconnect keeps the recovery action usable and explains that local progress remains',async () => {
  const h = setup({status:'offline'});h.state.retry = () => {throw Error('private network details');};
  await h.get('retry').click();assert.equal(h.get('retry').disabled,false);assert.equal(h.get('signout').disabled,false);
  assert.equal(h.get('retry').hidden,false);assert.match(h.get('status').textContent,/Could not reconnect/);
  assert.match(h.get('status').textContent,/progress is kept/);assert(!h.get('status').textContent.includes('private network details'));
});

test('an account deep link opens the existing park notebook exactly once',() => {
  assert.equal(setup({href:'https://spriggan.test/?account=1'}).calls.opened,1);
  assert.equal(setup({href:'https://spriggan.test/?account=0'}).calls.opened,0);
  assert.equal(setup().calls.opened,0);
});

test('the controller stays quiet until the session bootstrap provides an account',() => {
  const h = setup({noAccount:true});assert.equal(h.calls.signOut,0);assert.equal(h.calls.retry,0);assert.equal(h.get('name').textContent,'');
});

test('automatic save status remains a polite live region and manual cloud controls are absent',() => {
  assert.match(HTML,/<p[^>]*id="park-account-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert(!HTML.includes('id="park-account-save"'));assert(!HTML.includes('id="park-account-load"'));
});
