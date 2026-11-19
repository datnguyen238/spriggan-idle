const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source=fs.readFileSync(require.resolve('../dist/shared/map-entry.js'),'utf8');

function guardedVisit(homePath,referrer) {
  const home=new URL(homePath,'https://spriggan.test'),redirects=[],style={};
  const context={URL,
    document:{
      currentScript:{src:new URL('shared/map-entry.js',home).href,hasAttribute:name=>name==='data-map-guard'},
      referrer,documentElement:{style}
    },
    sessionStorage:{getItem:()=>null,removeItem(){}},
    location:{pathname:new URL('pond/',home).pathname,replace:target=>redirects.push(target)}
  };
  vm.runInNewContext(source,context);
  return {home,redirects,style};
}

test('journal links can enter a world without a session marker, including nested deployments',()=>{
  for(const homePath of ['/','/garden/','/spaces/garden/']) {
    const home=new URL(homePath,'https://spriggan.test');
    for(const journalPath of ['journal/','journal/index.html','journal/?entry=recent#memory']) {
      const referrer=new URL(journalPath,home).href,h=guardedVisit(homePath,referrer);
      assert.deepEqual(h.redirects,[],referrer);
      assert.equal(h.style.visibility,undefined);
    }
  }
});

test('the journal referrer exception rejects external origins, unknown paths and other app roots',()=>{
  for(const homePath of ['/garden/','/spaces/garden/']) {
    const home=new URL(homePath,'https://spriggan.test');
    const impostorRoot=homePath.replace(/[a-z]/g,'x');
    for(const referrer of [
      new URL('journal/','https://other.test'+homePath).href,
      new URL('journal/private/',home).href,
      new URL('journal',home).href,
      new URL('journal/index.html/extra',home).href,
      new URL('journal/%2fother/',home).href,
      new URL('journal/',new URL(impostorRoot,home)).href,
      '', 'not a URL'
    ]) {
      const h=guardedVisit(homePath,referrer);
      assert.deepEqual(h.redirects,[home.href],referrer);
      assert.equal(h.style.visibility,'hidden',referrer);
    }
  }
});
