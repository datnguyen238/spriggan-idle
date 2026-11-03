/* Guest saves stay in place; independent local world records form one cloud bundle. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return}
  root.SprigganSaveStore=api;
  let raw;
  try{raw=root.localStorage}catch{}
  if(!raw){
    const unavailable=()=>{throw Error('Browser storage is unavailable.')};
    raw={getItem:unavailable,setItem:unavailable,removeItem:unavailable};
  }
  try{root.SprigganStorage=api.create(raw,{events:root})}
  catch{root.SprigganStorage=api.create(raw,{uid:null,events:root})}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEYS=Object.freeze([
    'spriggan.pond.v1','spriggan.farm.v1','spriggan.slots.v1',
    'spriggan.dumplings.v1','spriggan.hex.totals.v1'
  ]);
  const ACTIVE_KEY='spriggan.account.active.v1',MAX_BYTES=450000;
  let generation=0;
  const gameplay=new Set(KEYS),own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  function fail(code,message){const error=Error(message);error.code=code;return error}
  function uidValue(uid){
    if(typeof uid!=='string'||!uid.length||uid.length>128)throw fail('account/invalid-user','This account identifier is invalid.');
    return uid;
  }
  function accountKey(uid){return 'spriggan.account.save.v1:'+encodeURIComponent(uidValue(uid))}
  function nonce(){return typeof globalThis.crypto?.randomUUID==='function'?globalThis.crypto.randomUUID():`${Date.now()}-${++generation}-${Math.random().toString(36).slice(2)}`}
  function worldKey(key,epoch,logical){return `${key}:world:${epoch}:${logical}`}
  function acknowledgementKey(key,epoch){return `${key}:ack:${epoch||''}`}
  function readActive(raw){
    const value=raw.getItem(ACTIVE_KEY);
    if(value===null)return null;
    try{
      const marker=JSON.parse(value);
      return marker&&typeof marker==='object'&&typeof marker.uid==='string'?uidValue(marker.uid):null;
    }catch{return null}
  }
  function setActive(raw,uid){
    if(uid===null){raw.removeItem(ACTIVE_KEY);return}
    raw.setItem(ACTIVE_KEY,JSON.stringify({uid:uidValue(uid),generation:nonce()}));
  }
  function byteLength(value){
    if(typeof TextEncoder!=='undefined')return new TextEncoder().encode(value).length;
    // TextEncoder's UTF-8 replacement behavior also permits lone surrogate code units.
    let bytes=0;
    for(let i=0;i<value.length;i++){
      const code=value.charCodeAt(i);
      if(code<0x80)bytes++;
      else if(code<0x800)bytes+=2;
      else if(code>=0xd800&&code<=0xdbff&&i+1<value.length&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){bytes+=4;i++}
      else bytes+=3;
    }
    return bytes;
  }
  function validateEntries(entries){
    if(!entries||typeof entries!=='object'||Array.isArray(entries))throw fail('account/invalid-save','Your saved worlds could not be read.');
    const copy={};
    for(const key of Object.keys(entries)){
      if(!gameplay.has(key)||typeof entries[key]!=='string')throw fail('account/invalid-save','Your saved worlds contain an unsupported entry.');
      try{JSON.parse(entries[key])}catch{throw fail('account/invalid-save','One of your saved worlds could not be read.')}
      copy[key]=entries[key];
    }
    if(byteLength(JSON.stringify(copy))>MAX_BYTES)throw fail('account/save-too-large','Your saved worlds are too large to synchronize.');
    return copy;
  }
  function equalEntries(first,second){
    if(!first||!second||typeof first!=='object'||typeof second!=='object')return false;
    const a=Object.keys(first),b=Object.keys(second);
    return a.length===b.length&&a.every(key=>own(second,key)&&first[key]===second[key]);
  }
  function revisionValue(value){
    if(!Number.isSafeInteger(value)||value<0)throw fail('account/invalid-save','The save revision is invalid.');
    return value;
  }
  function empty(){return{format:1,entries:{},revision:0,dirty:false}}
  function decodeEnvelope(serialized){
    if(serialized===null)return empty();
    let value;
    try{value=JSON.parse(serialized)}catch{throw fail('account/invalid-save','Your account save could not be read. It has not been changed.')}
    if(!value||typeof value!=='object'||Array.isArray(value)||value.format!==1||typeof value.dirty!=='boolean'||
      Object.keys(value).some(key=>!['format','entries','revision','dirty','epoch'].includes(key))||
      (own(value,'epoch')&&(typeof value.epoch!=='string'||!value.epoch.length||value.epoch.length>100))){
      throw fail('account/invalid-save','Your account save could not be read. It has not been changed.');
    }
    return{format:1,entries:validateEntries(value.entries),revision:revisionValue(value.revision),dirty:value.dirty,...(value.epoch?{epoch:value.epoch}:{})};
  }
  function worldValue(serialized){
    let record;
    try{record=JSON.parse(serialized)}catch{}
    if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).length!==1||
      !own(record,'value')||(record.value!==null&&typeof record.value!=='string')){
      throw fail('account/invalid-save','A saved world could not be read. It has not been changed.');
    }
    return record.value;
  }
  function removeWorlds(raw,key,epoch){
    for(const logical of KEYS)raw.removeItem(worldKey(key,epoch||'',logical));
    raw.removeItem(acknowledgementKey(key,epoch));
  }
  function removeAccount(raw,uid){
    const key=accountKey(uid);
    let current=empty();
    try{current=decodeEnvelope(raw.getItem(key))}catch{}
    // Native storage enumeration also removes records left by an interrupted restore.
    if(typeof raw.key==='function'){
      for(let i=raw.length-1;i>=0;i--){const candidate=raw.key(i);if(candidate?.startsWith(key+':world:')||candidate?.startsWith(key+':ack:'))raw.removeItem(candidate)}
    }else{removeWorlds(raw,key,current.epoch);removeWorlds(raw,key,'')}
    raw.removeItem(key);
  }
  function eventFor(target,type,properties){
    const Constructor=target?.Event||(typeof Event==='function'?Event:null);
    const event=Constructor?new Constructor(type):{type};
    for(const [key,value] of Object.entries(properties))Object.defineProperty(event,key,{value,enumerable:true,configurable:true});
    return event;
  }
  function create(raw,options={}){
    if(!raw||typeof raw.getItem!=='function'||typeof raw.setItem!=='function'||typeof raw.removeItem!=='function')throw TypeError('A browser-compatible storage object is required.');
    const uid=own(options,'uid')?options.uid:readActive(raw);
    if(uid!==null)uidValue(uid);
    const events=own(options,'events')?options.events:(typeof window!=='undefined'?window:null);
    const key=uid===null?null:accountKey(uid);
    let marker;
    try{marker=raw.getItem(ACTIVE_KEY)}catch{marker=null}
    let disposed=false;
    function assertCurrent(){
      if(readActive(raw)!==uid||raw.getItem(ACTIVE_KEY)!==marker)throw fail('account/changed','The account or saved worlds changed in another tab. Reload before saving.');
    }
    function acknowledged(current,serialized=raw.getItem(acknowledgementKey(key,current.epoch))){
      if(serialized===null)return current;
      const receipt=decodeEnvelope(serialized);
      if(receipt.epoch!==current.epoch)throw fail('account/invalid-save','The cloud save receipt could not be read.');
      return receipt.revision>=current.revision?receipt:current;
    }
    function localState(current){
      const entries={...current.entries};
      for(const logical of KEYS){
        const serialized=raw.getItem(worldKey(key,current.epoch||'',logical));
        if(serialized===null)continue;
        const value=worldValue(serialized);
        if(value===null)delete entries[logical];else entries[logical]=value;
      }
      return{format:1,entries:validateEntries(entries),revision:current.revision,dirty:current.dirty||!equalEntries(entries,current.entries)};
    }
    function state(){
      if(uid!==null)return localState(acknowledged(decodeEnvelope(raw.getItem(key))));
      const entries={};
      for(const logical of KEYS){const value=raw.getItem(logical);if(value!==null)entries[logical]=value}
      return{format:1,entries:validateEntries(entries),revision:0,dirty:false};
    }
    function emit(type,detail){
      if(disposed||!events?.dispatchEvent)return;
      try{events.dispatchEvent(eventFor(events,type,{detail}))}catch{}
    }
    function notify(next,changed,external=false){
      const detail={uid,keys:[...changed],revision:next.revision,dirty:next.dirty,external};
      try{options.onChange?.(detail)}catch{}
      emit('spriggan:save',detail);
    }
    function persist(next,changed){
      raw.setItem(key,JSON.stringify(next));
      notify(next,changed);
    }
    function snapshot(){return state().entries}
    function getItem(logical){
      logical=String(logical);
      if(uid===null||!gameplay.has(logical))return raw.getItem(logical);
      const entries=state().entries;
      return own(entries,logical)?entries[logical]:null;
    }
    function setItem(logical,value){
      logical=String(logical);value=String(value);assertCurrent();
      if(!gameplay.has(logical)){raw.setItem(logical,value);return}
      if(uid===null){
        validateEntries({[logical]:value});
        const previous=raw.getItem(logical);
        raw.setItem(logical,value);
        if(previous!==value)notify(empty(),[logical]);
        return;
      }
      const current=decodeEnvelope(raw.getItem(key));assertCurrent();
      const local=localState(acknowledged(current));
      if(local.entries[logical]===value)return;
      validateEntries({...local.entries,[logical]:value});
      // Each world has its own key: synchronous writers in other tabs cannot
      // replace this world's data by persisting an older complete bundle.
      raw.setItem(worldKey(key,current.epoch||'',logical),JSON.stringify({value}));
      notify(state(),[logical]);
    }
    function removeItem(logical){
      logical=String(logical);assertCurrent();
      if(!gameplay.has(logical)){raw.removeItem(logical);return}
      if(uid===null){
        const previous=raw.getItem(logical);raw.removeItem(logical);
        if(previous!==null)notify(empty(),[logical]);
        return;
      }
      const current=decodeEnvelope(raw.getItem(key));
      assertCurrent();
      if(!own(localState(acknowledged(current)).entries,logical))return;
      raw.setItem(worldKey(key,current.epoch||'',logical),JSON.stringify({value:null}));
      notify(state(),[logical]);
    }
    function replace(entries,revision,{dirty=false}={}){
      assertCurrent();
      if(uid===null)throw fail('account/guest-save','Choose an account before restoring a cloud save.');
      if(typeof dirty!=='boolean')throw TypeError('dirty must be a boolean.');
      const next={format:1,entries:validateEntries(entries),revision:revisionValue(revision),dirty,epoch:nonce()};
      const previous=decodeEnvelope(raw.getItem(key)),current=localState(acknowledged(previous)),changed=KEYS.filter(logical=>current.entries[logical]!==next.entries[logical]);
      assertCurrent();
      persist(next,changed);
      // A late writer to the old epoch cannot change a replacement's records.
      try{removeWorlds(raw,key,previous.epoch)}catch{}
    }
    function acknowledge(revision,sentEntries){
      assertCurrent();
      if(uid===null)throw fail('account/guest-save','Guest worlds do not have a cloud revision.');
      revisionValue(revision);const entries=validateEntries(sentEntries);
      const current=decodeEnvelope(raw.getItem(key));
      assertCurrent();
      if(revision<acknowledged(current).revision)throw fail('account/stale-acknowledgement','A newer cloud save has already been recorded.');
      // A receipt belongs to the uploaded epoch. Even an overlapping restore
      // cannot have its active baseline replaced by this upload's late reply.
      const next={...current,entries,revision,dirty:false};
      raw.setItem(acknowledgementKey(key,current.epoch),JSON.stringify(next));
      notify(state(),[]);
    }
    function onStorage(event){
      if(disposed||event.sprigganAccountEvent||(event.storageArea&&event.storageArea!==raw))return;
      if(event.key===ACTIVE_KEY){
        let activeUid;
        try{activeUid=readActive(raw)}catch{return}
        if(activeUid!==uid||raw.getItem(ACTIVE_KEY)!==marker)emit('spriggan:account-changed',{uid,activeUid});
        return;
      }
      if(uid===null){
        if(gameplay.has(event.key))notify(empty(),[event.key],true);
        return;
      }
      if(event.key!==key&&!event.key?.startsWith(key+':world:')&&!event.key?.startsWith(key+':ack:'))return;
      let previous,next;
      let changed;
      try{
        assertCurrent();
        if(event.key===key){
          previous=localState(acknowledged(decodeEnvelope(event.oldValue)));next=state();
          changed=KEYS.filter(logical=>previous.entries[logical]!==next.entries[logical]);
        }else{
          const current=acknowledged(decodeEnvelope(raw.getItem(key)));
          if(event.key===acknowledgementKey(key,current.epoch)){notify(state(),[],true);return}
          const logical=KEYS.find(logical=>event.key===worldKey(key,current.epoch||'',logical));
          if(!logical)return;
          next=state();previous={entries:{...next.entries}};
          const value=event.oldValue===null?(current.entries[logical]??null):worldValue(event.oldValue);
          if(value===null)delete previous.entries[logical];else previous.entries[logical]=value;
          changed=[logical];
        }
      }
      catch(error){emit('spriggan:save-error',{uid,code:error.code||'account/invalid-save'});return}
      for(const logical of changed){
        if(!events?.dispatchEvent)break;
        const translated=eventFor(events,'storage',{
          key:logical,oldValue:previous.entries[logical]??null,newValue:next.entries[logical]??null,
          storageArea:raw,url:event.url||'',sprigganAccountEvent:true
        });
        try{events.dispatchEvent(translated)}catch{}
      }
      notify(next,changed,true);
    }
    events?.addEventListener?.('storage',onStorage);
    function dispose(){disposed=true;events?.removeEventListener?.('storage',onStorage)}
    return{uid,raw,getItem,setItem,removeItem,snapshot,state,replace,acknowledge,assertCurrent,dispose};
  }
  return{KEYS,ACTIVE_KEY,MAX_BYTES,readActive,setActive,accountKey,removeAccount,validateEntries,equalEntries,create};
});
