const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Cloud = require('../dist/shared/park-cloud.js');
const Saves = require('../dist/shared/park-saves.js');

const CONFIG = {url:'https://garden.supabase.co',publishableKey:'sb_publishable_1234567890abcdefghijklmnop'};
const USER_A = {id:'user-a',email:'a@example.test',user_metadata:{full_name:'  Lin\nGarden  ',provider_token:'never-expose'}};
const USER_B = {id:'user-b',email:'b@example.test',user_metadata:{name:'Robin'}};
const SESSION_A = {user:USER_A,access_token:'verified-token-a'};
const SESSION_B = {user:USER_B,access_token:'verified-token-b'};
const WHEN = '2026-11-19T12:00:00.000Z';
const backup = () => JSON.stringify({format:'spriggan-park',version:1,exportedAt:WHEN,entries:{'spriggan.hex.moonlight':'true'}});
const row = () => ({payload:JSON.parse(backup()),revision:3,updated_at:WHEN});
const deferred = () => {let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
const turn = () => new Promise(resolve => setTimeout(resolve,5));
function setup(options={}) {
  const data = new Map([['spriggan.pond.v1','keep this local park'],['unrelated.token','keep this too']]);
  const writes = [], calls = {sessions:0,users:[],reads:[],rpcs:[],oauth:[],signout:[],requests:[]};
  const storage = {getItem:key=>data.get(key)??null,setItem(key,value){writes.push([key,value]);data.set(key,value);},removeItem(key){writes.push([key,null]);data.delete(key);}};
  const state = {session:options.guest?null:SESSION_A,readResponse:{data:row(),error:null},writeResponse:{data:[{revision:4,updated_at:WHEN}],error:null},userError:null,signOut:null};
  let authCallback, sdkOptions, unsubscribed=false;
  function emit(event,session) {state.session=session;authCallback(event,session);}
  function query(kind, details) {
    const request={kind,...details,headers:{}};
    const builder={
      select(columns){request.columns=columns;return this;},eq(key,value){request.filter=[key,value];return this;},maybeSingle(){request.maybeSingle=true;return this;},
      setHeader(key,value){request.headers[key]=value;return this;},abortSignal(signal){request.signal=signal;return this;},
      then(ok,no){calls.requests.push(request);const response=kind==='read'?state.readResponse:state.writeResponse;return Promise.resolve().then(()=>typeof response==='function'?response(request):response).then(ok,no);}
    };
    return builder;
  }
  const sdk={auth:{
    async getSession(){calls.sessions++;if(options.getSession)return options.getSession(state,calls);return {data:{session:state.session},error:null};},
    async getUser(token){calls.users.push(token);if(options.getUser)return options.getUser(state,calls,emit);return {data:{user:state.session?.user||null},error:state.userError};},
    async signInWithOAuth(params){calls.oauth.push(params);return options.oauthResponse||{data:{url:'https://accounts.google.com/'},error:null};},
    async signOut(params){calls.signout.push(params);if(state.signOut)return state.signOut(params,emit);emit('SIGNED_OUT',null);return options.signOutResponse||{error:null};},
    onAuthStateChange(callback){authCallback=callback;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}
  },from(table){calls.reads.push(table);return query('read',{table});},rpc(name,params){calls.rpcs.push({name,params});return query('write',{name,params});}};
  const createClient=(url,key,settings)=>{sdkOptions={url,key,...settings};return sdk;};
  const client=Cloud.create(CONFIG,{createClient,saves:Saves,storage,redirectTo:'https://spriggan.test/',timeoutMs:options.timeoutMs||100});
  return {client,state,calls,storage,writes,data,emit,sdkOptions:()=>sdkOptions,unsubscribed:()=>unsubscribed};
}

test('configuration accepts browser keys and rejects elevated or malformed credentials',()=>{
  assert.deepEqual(Cloud.validateConfig({...CONFIG,url:' https://garden.supabase.co/ '}),CONFIG);
  const jwt=(role,alg='HS256')=>[Buffer.from(JSON.stringify({alg})).toString('base64url'),Buffer.from(JSON.stringify({role})).toString('base64url'),'signature'].join('.');
  assert.equal(Cloud.validateConfig({...CONFIG,publishableKey:jwt('anon')}).publishableKey,jwt('anon'));
  for(const key of ['sb_secret_1234567890abcdefghijklmnop',jwt('service_role'),jwt('authenticated'),jwt('anon','none'),'a-private-key','',null])assert.equal(Cloud.validateConfig({...CONFIG,publishableKey:key}),null);
  for(const url of ['http://garden.supabase.co','https://user:password@garden.supabase.co','https://garden.supabase.co/path','https://garden.supabase.co/?key=secret','javascript:alert(1)','https://garden.supabase.co/#hash'])assert.equal(Cloud.validateConfig({...CONFIG,url}),null);
  assert.equal(Cloud.validateConfig({...CONFIG,url:'http://127.0.0.1:54321/'}).url,'http://127.0.0.1:54321');
});

test('an expected park owner blocks new operations immediately when Auth switches before the view callback',async()=>{
  const h=setup();await h.client.initialize();let visibleUser=USER_A.id;
  h.client.onAuthChange(user=>{visibleUser=user?.id||null;});
  h.emit('SIGNED_IN',SESSION_B);
  assert.equal(visibleUser,USER_A.id);assert.equal(h.client.getUser().id,USER_B.id);
  await assert.rejects(h.client.read(USER_A.id),{code:'SESSION_CHANGED'});
  await assert.rejects(h.client.write(backup(),null,USER_A.id),{code:'SESSION_CHANGED'});
  assert.equal(h.calls.requests.length,0);assert.equal(h.calls.rpcs.length,0);
  await h.client.read(USER_B.id);assert.deepEqual(h.calls.requests[0].filter,['user_id',USER_B.id]);
  assert.equal(h.calls.requests[0].headers.Authorization,'Bearer verified-token-b');h.client.dispose();
});

test('initialization verifies the session and exposes only sanitized display identity',async()=>{
  const h=setup(),user=await h.client.initialize();
  assert.deepEqual(user,{id:'user-a',email:'a@example.test',name:'Lin Garden'});
  assert(Object.isFrozen(user));assert(!JSON.stringify(user).includes('never-expose'));
  assert(h.calls.users.includes('verified-token-a'));
  const options=h.sdkOptions();assert.equal(options.auth.flowType,'pkce');assert.equal(options.auth.detectSessionInUrl,true);
  assert.equal(options.auth.persistSession,true);assert.equal(options.auth.autoRefreshToken,true);
  assert.equal(h.writes.length,0);h.client.dispose();
});

test('a normal initial auth event during verification does not make initialization look like an account switch',async()=>{
  const h=setup({getUser(state,calls,emit){if(calls.users.length===1)emit('INITIAL_SESSION',SESSION_A);return {data:{user:state.session.user},error:null};}});
  assert.equal((await h.client.initialize()).id,'user-a');h.client.dispose();
});

test('guest initialization is quiet and remote operations require sign-in',async()=>{
  const h=setup({guest:true});assert.equal(await h.client.initialize(),null);assert.equal(h.calls.users.length,0);
  await assert.rejects(h.client.read(),{code:'AUTH_REQUIRED'});await assert.rejects(h.client.write(backup(),null),{code:'AUTH_REQUIRED'});
  assert.equal(h.calls.requests.length,0);h.client.dispose();
});

test('Google sign-in opens the account picker using the approved redirect and isolated auth storage',async()=>{
  const h=setup();await h.client.signIn();
  assert.deepEqual(h.calls.oauth,[{provider:'google',options:{redirectTo:'https://spriggan.test/',queryParams:{prompt:'select_account'}}}]);
  assert.equal(h.data.get('spriggan.pond.v1'),'keep this local park');assert.equal(h.data.get('unrelated.token'),'keep this too');
  assert(h.writes.every(([key])=>key.startsWith('spriggan.cloud.garden.supabase.co.auth.v1-')));
  assert.throws(()=>h.sdkOptions().auth.storage.setItem('spriggan.pond.v1','overwrite'),{code:'STORAGE_UNAVAILABLE'});
  h.client.dispose();
});

test('sign-out affects only this session and does not remove gameplay storage',async()=>{
  const h=setup();await h.client.initialize();await h.client.signOut();
  assert.deepEqual(h.calls.signout,[{scope:'local'}]);assert.equal(h.client.getUser(),null);
  assert.equal(h.data.get('spriggan.pond.v1'),'keep this local park');assert.equal(h.writes.length,0);
  await assert.rejects(h.client.read(),{code:'AUTH_REQUIRED'});h.client.dispose();
});

test('a failed sign-out keeps the account visible, emits no false sign-out, and can be retried',async()=>{
  const h=setup();await h.client.initialize();await turn();const events=[];
  h.client.onAuthChange((user,event)=>events.push({user,event}));await turn();events.length=0;
  h.state.signOut=()=>({error:{status:503,message:'private provider details'}});
  await assert.rejects(h.client.signOut(),failure=>failure.code==='SIGN_OUT_FAILED'&&/try again/.test(failure.message)&&!failure.message.includes('private provider'));
  assert.equal(h.client.getUser().id,'user-a');assert.equal(h.state.session.user.id,'user-a');await turn();
  assert.equal(events.filter(event=>event.event==='SIGNED_OUT'||event.user===null).length,0);
  assert.equal(h.data.get('spriggan.pond.v1'),'keep this local park');assert.equal(h.writes.length,0);
  h.state.signOut=null;await h.client.signOut();await turn();
  assert.equal(h.client.getUser(),null);assert(events.some(event=>event.event==='SIGNED_OUT'&&event.user===null));
  assert.equal(h.writes.length,0);h.client.dispose();
});

test('a failed sign-out still invalidates reads and writes that started before the attempt',async()=>{
  const h=setup();await h.client.initialize();const read=deferred(),write=deferred();
  h.state.readResponse=()=>read.promise;h.state.writeResponse=()=>write.promise;
  const reading=h.client.read(),writing=h.client.write(backup(),3);
  while(h.calls.requests.length<2)await Promise.resolve();
  h.state.signOut=()=>({error:{status:503}});await assert.rejects(h.client.signOut(),{code:'SIGN_OUT_FAILED'});
  read.resolve({data:row(),error:null});write.resolve({data:[{revision:4,updated_at:WHEN}],error:null});
  await assert.rejects(reading,{code:'SESSION_CHANGED'});await assert.rejects(writing,{code:'SESSION_CHANGED'});
  assert.equal(h.client.getUser().id,'user-a');assert.equal(h.writes.length,0);
  h.state.readResponse={data:row(),error:null};assert.equal((await h.client.read()).revision,3);h.client.dispose();
});

test('a genuine SDK sign-out event is retained even if server logout confirmation fails',async()=>{
  const h=setup();await h.client.initialize();
  h.state.signOut=(params,emit)=>{emit('SIGNED_OUT',null);return {error:{status:503}};};
  await assert.rejects(h.client.signOut(),{code:'SIGN_OUT_FAILED'});assert.equal(h.client.getUser(),null);
  assert.equal(h.data.get('spriggan.pond.v1'),'keep this local park');h.client.dispose();
});

test('sign-out stays pending until SDK success and does not clear a newly switched account',async()=>{
  const h=setup();await h.client.initialize();const wait=deferred();h.state.signOut=()=>wait.promise;
  const leaving=h.client.signOut();await Promise.resolve();assert.equal(h.client.getUser().id,'user-a');
  h.emit('SIGNED_IN',SESSION_B);wait.resolve({error:null});await assert.rejects(leaving,{code:'SESSION_CHANGED'});
  assert.equal(h.client.getUser().id,'user-b');assert.equal(h.writes.length,0);
  h.state.signOut=()=>({error:null});await h.client.signOut();assert.equal(h.client.getUser(),null);h.client.dispose();
});

test('auth listeners run after the SDK callback lock and can unsubscribe',async()=>{
  const h=setup();let locked=false;const values=[];
  const unsubscribe=h.client.onAuthChange(user=>{assert.equal(locked,false);values.push(user?.id||null);});
  locked=true;h.emit('SIGNED_IN',SESSION_A);assert.equal(values.length,0);locked=false;await turn();
  assert.deepEqual(values,['user-a']);unsubscribe();h.emit('SIGNED_OUT',null);await turn();assert.deepEqual(values,['user-a']);
  h.client.dispose();assert.equal(h.unsubscribed(),true);
});

test('cloud reads are scoped to the verified account and return a validated backup without restoring it',async()=>{
  const h=setup();await h.client.initialize();const result=await h.client.read();
  assert.deepEqual(result,{backup:backup(),revision:3,updatedAt:WHEN});
  const request=h.calls.requests[0];assert.deepEqual(request.filter,['user_id','user-a']);assert.equal(request.columns,'payload,revision,updated_at');
  assert.equal(request.headers.Authorization,'Bearer verified-token-a');assert.equal(request.maybeSingle,true);
  assert.equal(h.writes.length,0);h.state.readResponse={data:null,error:null};assert.equal(await h.client.read(),null);h.client.dispose();
});

test('malformed cloud data cannot become a restorable local park',async()=>{
  const h=setup();await h.client.initialize();
  for(const invalid of [{...row(),revision:0},{...row(),updated_at:'invalid'},{...row(),payload:{format:'wrong'}},{...row(),payload:backup()},{...row(),payload:{...JSON.parse(backup()),entries:{'unrelated.token':'malicious'}}}]){
    h.state.readResponse={data:invalid,error:null};await assert.rejects(h.client.read(),{code:'CLOUD_DATA_INVALID'});
  }
  assert.equal(h.writes.length,0);h.client.dispose();
});

test('writes use revision-checked RPC with the validated whole-park payload and pinned identity',async()=>{
  const h=setup();await h.client.initialize();assert.deepEqual(await h.client.write(backup(),3),{revision:4,updatedAt:WHEN});
  assert.deepEqual(h.calls.rpcs,[{name:'save_park',params:{p_payload:JSON.parse(backup()),p_expected_revision:3}}]);
  assert.equal(h.calls.requests[0].headers.Authorization,'Bearer verified-token-a');assert.equal(h.writes.length,0);
  await h.client.write(backup());assert.equal(h.calls.rpcs[1].params.p_expected_revision,null);h.client.dispose();
});

test('invalid local payloads and revisions are rejected before any remote access',async()=>{
  const h=setup();await h.client.initialize();const calls=h.calls.sessions;
  for(const invalid of ['not json',JSON.stringify({...JSON.parse(backup()),entries:{'spriggan.pond.v1':'broken'}})])await assert.rejects(h.client.write(invalid,3),{code:'INVALID_BACKUP'});
  await assert.rejects(h.client.write(backup(),0),{code:'SAVE_CONFLICT'});
  assert.equal(h.calls.rpcs.length,0);assert.equal(h.calls.sessions,calls);h.client.dispose();
});

test('a concurrent-device revision conflict is actionable and never echoes provider details',async()=>{
  const h=setup();await h.client.initialize();h.state.writeResponse={data:null,error:{code:'P0001',message:'SAVE_CONFLICT private-secret-token'}};
  await assert.rejects(h.client.write(backup(),3),failure=>failure.code==='SAVE_CONFLICT'&&!failure.message.includes('private-secret-token'));
  assert.equal(h.writes.length,0);h.client.dispose();
});

test('stale account state is rejected before the database is contacted',async()=>{
  const h=setup();await h.client.initialize();h.state.session=SESSION_B;
  await assert.rejects(h.client.read(),{code:'SESSION_CHANGED'});await assert.rejects(h.client.write(backup(),3),{code:'SESSION_CHANGED'});
  assert.equal(h.calls.requests.length,0);h.client.dispose();
});

test('an account change during a request cannot leak A’s data into B’s request or apply its late response',async()=>{
  const h=setup();await h.client.initialize();const pending=deferred();
  h.state.writeResponse=request=>{assert.equal(request.headers.Authorization,'Bearer verified-token-a');h.emit('SIGNED_IN',SESSION_B);return pending.promise;};
  const result=h.client.write(backup(),3);
  while(!h.calls.requests.length)await Promise.resolve();
  pending.resolve({data:[{revision:4,updated_at:WHEN}],error:null});await assert.rejects(result,{code:'SESSION_CHANGED'});
  assert.equal(h.client.getUser().id,'user-b');assert.equal(h.writes.length,0);h.client.dispose();
});

test('expired verification clears only the stale cached account and never accesses the database',async()=>{
  const h=setup();await h.client.initialize();h.state.userError={name:'AuthSessionMissingError',message:'private details'};
  await assert.rejects(h.client.read(),{code:'AUTH_REQUIRED'});assert.equal(h.client.getUser(),null);assert.equal(h.calls.requests.length,0);
  assert.equal(h.data.get('spriggan.pond.v1'),'keep this local park');h.client.dispose();
});

test('network and setup errors use safe actionable messages rather than raw provider errors',async()=>{
  const h=setup();await h.client.initialize();
  h.state.readResponse={data:null,error:{message:'SECRET https://private.invalid',status:503}};
  await assert.rejects(h.client.read(),failure=>failure.code==='NETWORK'&&!failure.message.includes('SECRET')&&/connection/.test(failure.message));
  h.state.writeResponse={data:null,error:{code:'PGRST202',message:'private schema contents'}};
  await assert.rejects(h.client.write(backup(),3),{code:'CLOUD_SETUP'});h.client.dispose();
  const oauth=setup({oauthResponse:{error:{message:'provider-secret'},data:null}});
  await assert.rejects(oauth.client.signIn(),failure=>failure.code==='AUTH_FAILED'&&!failure.message.includes('provider-secret'));oauth.client.dispose();
});

test('hung auth and database operations time out and REST requests receive an abort signal',async()=>{
  const hung=setup({timeoutMs:5,getSession:()=>new Promise(()=>{})});await assert.rejects(hung.client.initialize(),{code:'TIMEOUT'});hung.client.dispose();
  const h=setup({timeoutMs:5});await h.client.initialize();h.state.readResponse=()=>new Promise(()=>{});
  await assert.rejects(h.client.read(),{code:'TIMEOUT'});assert.equal(h.calls.requests[0].signal.aborted,true);h.client.dispose();
});

test('same-origin redirects are enforced in a browser and the module exports without dependencies',()=>{
  const context=vm.createContext({URL,atob,location:{origin:'https://spriggan.test',pathname:'/'}});
  vm.runInContext(fs.readFileSync(require.resolve('../dist/shared/park-cloud.js'),'utf8'),context);
  assert.equal(typeof context.SprigganCloud.create,'function');
  assert.throws(()=>context.SprigganCloud.create(CONFIG,{createClient(){},saves:Saves,redirectTo:'https://another.test/'}),{code:'INVALID_CONFIG'});
  assert.throws(()=>Cloud.create({...CONFIG,publishableKey:'sb_secret_private'}),{code:'INVALID_CONFIG'});
});

test('blocked auth storage prevents OAuth and closing a connection suppresses late initialization',async()=>{
  const h=setup();h.storage.setItem=()=>{throw Error('blocked private details');};
  await assert.rejects(h.client.signIn(),{code:'STORAGE_UNAVAILABLE'});assert.equal(h.calls.oauth.length,0);h.client.dispose();
  const pending=deferred(),closed=setup({getSession:()=>pending.promise});
  const initialization=closed.client.initialize();closed.client.dispose();
  pending.resolve({data:{session:SESSION_A},error:null});await assert.rejects(initialization,{code:'CLOSED'});
  assert.equal(closed.client.getUser(),null);
});
