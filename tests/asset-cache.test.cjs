const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {ASSET_EXTENSIONS,digest,planVersions,applyPlan} = require('../tools/version-assets.cjs');

function fixture(t,files) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'spriggan-assets-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for (const [name,value] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
    fs.writeFileSync(path.join(root,name),value);
  }
  return {root,read:name=>fs.readFileSync(path.join(root,name),'utf8'),write:(name,value)=>fs.writeFileSync(path.join(root,name),value)};
}

test('asset hashes propagate through JS imports and CSS font dependencies before hashing parents',t=>{
  const h=fixture(t,{
    'index.html':'<script src="./app.js?v=manual"></script><link href="./app.css">',
    'app.js':"import './child.mjs?v=old'; const art='./image.svg#leaf';",
    'child.mjs':'export const value=1;',
    'app.css':"@import './fonts.css'; body{background:url(./image.svg#leaf)}",
    'fonts.css':'@font-face{src:url(./font.woff2)}',
    'font.woff2':Buffer.from([0,1,2,3]),'image.svg':'<svg/>'
  });
  const plan=planVersions(h.root);assert.equal(h.read('index.html').includes('perf-'),false,'planning is read-only');
  applyPlan(plan);
  for (const [owner,target] of [['app.js','child.mjs'],['app.js','image.svg'],['fonts.css','font.woff2'],['app.css','fonts.css'],['app.css','image.svg'],['index.html','app.js'],['index.html','app.css']]) {
    const hash=digest(fs.readFileSync(path.join(h.root,target)));
    assert(h.read(owner).includes(target+'?v=perf-'+hash),owner+' must contain the final child hash for '+target);
  }
  assert(h.read('app.js').includes('#leaf'));assert.equal(planVersions(h.root).changes.length,0,'a second pass is stable');
  const oldHTML=h.read('index.html'),oldCSS=h.read('app.css');
  h.write('child.mjs','export const value=2;');applyPlan(planVersions(h.root));
  assert.notEqual(h.read('index.html'),oldHTML);assert.equal(h.read('app.css'),oldCSS,'unrelated assets keep their cache key');
  const oldFontCSS=h.read('fonts.css');h.write('font.woff2',Buffer.from([0,1,2,4]));applyPlan(planVersions(h.root));
  assert.notEqual(h.read('fonts.css'),oldFontCSS);assert.notEqual(h.read('app.css'),oldCSS);assert.equal(planVersions(h.root).changes.length,0);
});

test('HTML routes, external/private URLs, templates, escaped strings and comments remain untouched',t=>{
  const untouched=[
    "const route='./preview.html?v=manual';", "const external='https://cdn.test/a.js';", "const protocol='//cdn.test/a.js';",
    "const data='data:image/png;base64,AAAA';", "const dynamic=`./${name}.js`;", "const escaped='./a\\x2ejs';",
    "const privateURL='./a.js?access_token=secret';", "const duplicate='./a.js?v=one&v=two';", "const api='/api/token.js';",
    "const auth='/auth/session.js';", "const privateAsset='/private/a.js';", "const escape='../outside.js';",
    "// './a.js'", "/* './a.js' */"
  ].join('\n');
  const h=fixture(t,{
    'index.html':'A reader\'s page <script src=./entry.js></script><!-- <script src="./a.js"></script> --><iframe src="./preview.html?v=manual"></iframe>',
    'entry.js':untouched+"\nconst local='./a.js?v=manual#fragment';",'a.js':'window.a=1;','preview.html':'<p>Preview</p>',
    'api/token.js':'private','auth/session.js':'private','private/a.js':'private'
  });
  applyPlan(planVersions(h.root));
  assert(h.read('entry.js').startsWith(untouched));assert(h.read('entry.js').includes('./a.js?v=perf-'+digest(Buffer.from('window.a=1;'))+'#fragment'));
  assert(h.read('index.html').includes('src=./entry.js?v=perf-'));assert(h.read('index.html').includes('src="./preview.html?v=manual"'));
  assert(h.read('index.html').includes('<!-- <script src="./a.js"></script> -->'));
  assert.equal(h.read('api/token.js'),'private');assert.equal(h.read('auth/session.js'),'private');
});

test('inline scripts/styles and root-relative assets are versioned without changing HTML navigation',t=>{
  const h=fixture(t,{
    'index.html':'<a href="./other.html">Next</a><style>body{background:url(/image.png)}</style><script>const url="./a.js";</script>',
    'other.html':'<p>Other</p>','a.js':'a();','image.png':Buffer.from([1,2,3])
  });
  applyPlan(planVersions(h.root));
  assert(h.read('index.html').includes('href="./other.html"'));
  assert(h.read('index.html').includes('/image.png?v=perf-'));assert(h.read('index.html').includes('./a.js?v=perf-'));
});

test('vendor files stay byte-identical and their internal unversioned dependencies are not rewritten',t=>{
  const vendor="import './core.js'; export const vendor=true;";
  const h=fixture(t,{'index.html':'<script src="./app.js"></script>','app.js':"import './vendor/lib.js';",'vendor/lib.js':vendor,'vendor/core.js':'export const core=true;'});
  applyPlan(planVersions(h.root));assert.equal(h.read('vendor/lib.js'),vendor);assert.equal(h.read('vendor/core.js'),'export const core=true;');
  assert(h.read('app.js').includes('./vendor/lib.js?v=perf-'+digest(Buffer.from(vendor))));assert.equal(planVersions(h.root).changes.length,0);
});

test('dependency cycles fail before any files are written',t=>{
  const h=fixture(t,{'index.html':'<script src="./a.js"></script>','a.js':"import './b.js';",'b.js':"import './a.js';"});
  assert.throws(()=>applyPlan(planVersions(h.root)),/Asset dependency cycle: .*a\.js.*b\.js.*a\.js/);
  assert.equal(h.read('index.html'),'<script src="./a.js"></script>');assert.equal(h.read('a.js'),"import './b.js';");
});

test('symlinks cannot become asset inputs and concurrent edits abort a planned write',t=>{
  const h=fixture(t,{'index.html':'<script src="./a.js"></script><script src="./linked.js"></script>','a.js':'a();'});
  fs.symlinkSync(path.join(h.root,'a.js'),path.join(h.root,'linked.js'));
  const plan=planVersions(h.root);assert(!plan.files.has('linked.js'));
  h.write('a.js','changed();');assert.throws(()=>applyPlan(plan),/Asset changed during versioning/);
  assert.equal(h.read('index.html'),'<script src="./a.js"></script><script src="./linked.js"></script>');
});

test('--check reports stale references without writing and succeeds after an idempotent rewrite',t=>{
  const h=fixture(t,{'index.html':'<script src="./app.js?v=manual"></script>','app.js':'ready();'});
  const cli=path.resolve(__dirname,'../tools/version-assets.cjs');
  const run=(...args)=>spawnSync(process.execPath,[cli,'--root',h.root,...args],{encoding:'utf8'});
  const stale=run('--check');assert.equal(stale.status,1);assert.match(stale.stdout,/1 stale source files/);
  assert(h.read('index.html').includes('?v=manual'));assert.equal(run().status,0);
  const current=run('--check');assert.equal(current.status,0,current.stderr);assert.match(current.stdout,/0 stale source files/);
});

test('deployed source references match their current asset contents',()=>{
  const plan=planVersions(path.resolve(__dirname,'../dist'));
  assert.equal(plan.changes.length,0,'Refresh asset versions: node tools/version-assets.cjs');
});

test('Vercel immutable caching requires both an asset extension and the exact generated version',()=>{
  const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../vercel.json'),'utf8'));
  function headersFor(value) {
    const url=new URL(value,'https://spriggan.test');
    return (config.headers||[]).filter(rule=>new RegExp('^'+rule.source+'$').test(url.pathname) && (rule.has||[]).every(condition=>condition.type==='query' && url.searchParams.getAll(condition.key).length===1 && new RegExp(condition.value).test(url.searchParams.get(condition.key)||''))).flatMap(rule=>rule.headers);
  }
  const version='perf-0123456789abcdef';
  for (const extension of ASSET_EXTENSIONS) {
    const headers=headersFor('/shared/asset'+extension+'?v='+version);
    assert(headers.some(header=>header.key==='Cache-Control' && header.value==='public, max-age=31536000, immutable'),extension);
  }
  for (const value of [
    '/', '/login/', '/index.html', '/index.html?v='+version, '/fishing/preview.html?v='+version,
    '/shared/asset.js','/shared/asset.js?v=manual','/shared/asset.js?v=perf-0123456789abcde',
    '/shared/asset.js?v=perf-0123456789abcdef0','/shared/asset.js?v=prefix-'+version,'/shared/asset.js?v='+version+'-suffix',
    '/auth/v1/settings?v='+version,'/auth/session.js?v='+version,'/api/user.js?v='+version,'/private/token.js?v='+version,
    '/shared/data.json?v='+version,'/index.html/asset.js.html?v='+version
  ]) assert.equal(headersFor(value).length,0,value);
  assert.equal(config.outputDirectory,'dist');assert.equal(config.buildCommand,'node tools/version-assets.cjs');
});
