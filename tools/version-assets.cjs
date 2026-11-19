#!/usr/bin/env node
'use strict';

// Run after editing dist: node tools/version-assets.cjs
// CI/read-only verification: node tools/version-assets.cjs --check
// Only literal, existing public asset paths are versioned; routes, HTML,
// interpolated/escaped strings and queries other than a sole v= stay untouched.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ASSET_EXTENSIONS = new Set(['.js','.mjs','.css','.woff','.woff2','.ttf','.otf','.eot','.png','.jpg','.jpeg','.gif','.webp','.avif','.svg','.ico','.wav','.mp3','.ogg','.m4a','.aac','.flac','.opus']);
const SOURCE_EXTENSIONS = new Set(['.html','.js','.mjs','.css']);
const privatePath = value => /^(?:api|auth|private)\//i.test(value);
const vendorPath = value => value.split('/').includes('vendor');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16);

function inventory(root) {
  const files = new Map();
  function visit(directory) {
    for (const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      // Symlinks and hidden paths cannot pull bytes outside this static tree.
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const absolute = path.join(directory,entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(root,absolute).split(path.sep).join('/');
        files.set(relative,{absolute,relative,extension:path.extname(entry.name).toLowerCase()});
      }
    }
  }
  visit(root);
  return files;
}

function literals(text,extension) {
  const values = [], ignored = [];
  function strings(part,offset,kind) {
    const tokens = kind === '.html'
      ? /(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1/g
      : kind === '.css'
        ? /\/\*[\s\S]*?\*\/|(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1/g
        : /\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|(["'`])((?:\\[\s\S]|(?!\1)[^\\])*?)\1/g;
    for (const match of part.matchAll(tokens)) {
      const start = offset+match.index;
      if (!match[1]) {ignored.push([start,start+match[0].length]);continue;}
      values.push({start:start+1,end:start+match[0].length-1,value:match[2]});
    }
  }
  if (extension === '.html') {
    const tags = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<[^>]+>/gi;
    for (const match of text.matchAll(tags)) {
      if (match[0].startsWith('<!--')) {ignored.push([match.index,match.index+match[0].length]);continue;}
      const tagEnd = match[0].indexOf('>')+1;
      strings(match[0].slice(0,tagEnd),match.index,'.html');
      const bodyKind = /^<script\b/i.test(match[0]) ? '.js' : /^<style\b/i.test(match[0]) ? '.css' : null;
      if (bodyKind) strings(match[0].slice(tagEnd,match[0].lastIndexOf('</')),match.index+tagEnd,bodyKind);
      for (const attribute of match[0].slice(0,tagEnd).matchAll(/\b(?:src|href|poster)\s*=\s*([^\s"'`=<>]+)/gi)) {
        const start=match.index+attribute.index+attribute[0].lastIndexOf(attribute[1]);
        values.push({start,end:start+attribute[1].length,value:attribute[1]});
      }
    }
  } else strings(text,0,extension);
  // Fonts and other CSS assets commonly use unquoted url(...), including inline styles.
  for (const match of text.matchAll(/\burl\(\s*([^\s"'`()]+)\s*\)/gi)) {
    const start=match.index+match[0].indexOf(match[1]);
    if (!ignored.some(([a,b])=>start>=a && start<b)) values.push({start,end:start+match[1].length,value:match[1]});
  }
  return values.sort((a,b)=>a.start-b.start).filter((value,index,all)=>!index || value.start>=all[index-1].end);
}

function reference(value,owner,files) {
  if (!value || /[\s\\${}<>\u0000-\u001f]/.test(value) || value.startsWith('//') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) return null;
  const hashAt=value.indexOf('#'), fragment=hashAt<0?'':value.slice(hashAt);
  const beforeHash=hashAt<0?value:value.slice(0,hashAt);
  const queryAt=beforeHash.indexOf('?'), pathname=queryAt<0?beforeHash:beforeHash.slice(0,queryAt);
  if (!ASSET_EXTENSIONS.has(path.posix.extname(pathname).toLowerCase())) return null;
  if (queryAt>=0) {
    const query=new URLSearchParams(beforeHash.slice(queryAt+1));
    if ([...query.keys()].length!==1 || !query.has('v')) return null;
  }
  let decoded;
  try {decoded=decodeURIComponent(pathname);} catch {return null;}
  if (/[\\\u0000-\u001f]/.test(decoded)) return null;
  const relative=path.posix.normalize(pathname.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(owner),decoded));
  if (relative==='..' || relative.startsWith('../') || privatePath(relative)) return null;
  const target=files.get(relative);
  if (!target || !ASSET_EXTENSIONS.has(target.extension)) return null;
  return {target,pathname,fragment};
}

function planVersions(rootDirectory) {
  const root=fs.realpathSync(rootDirectory), files=inventory(root), completed=new Map(), active=[];
  let references=0;
  function transform(file) {
    if (completed.has(file.relative)) return completed.get(file.relative);
    if (active.includes(file.relative)) throw Error('Asset dependency cycle: '+[...active,file.relative].join(' -> '));
    active.push(file.relative);
    const original=fs.readFileSync(file.absolute);
    let output=original;
    if (SOURCE_EXTENSIONS.has(file.extension) && !vendorPath(file.relative) && !privatePath(file.relative)) {
      const text=original.toString('utf8'), replacements=[];
      for (const literal of literals(text,file.extension)) {
        const found=reference(literal.value,file.relative,files);
        if (!found) continue;
        const child=transform(found.target);
        const value=found.pathname+'?v=perf-'+child.hash+found.fragment;
        references++;
        if (value!==literal.value) replacements.push({...literal,value});
      }
      if (replacements.length) {
        let rewritten=text;
        for (const replacement of replacements.reverse()) rewritten=rewritten.slice(0,replacement.start)+replacement.value+rewritten.slice(replacement.end);
        output=Buffer.from(rewritten);
      }
    }
    active.pop();
    const result={...file,original,output,hash:digest(output),changed:!original.equals(output)};
    completed.set(file.relative,result);
    return result;
  }
  for (const file of files.values()) if (SOURCE_EXTENSIONS.has(file.extension) && !vendorPath(file.relative) && !privatePath(file.relative)) transform(file);
  const changes=[...completed.values()].filter(file=>file.changed).sort((a,b)=>a.relative.localeCompare(b.relative,'en'));
  return {root,changes,references,files:completed};
}

function applyPlan(plan) {
  // Graph errors and concurrent source edits must be caught before the first write.
  for (const file of plan.files.values()) if (!fs.readFileSync(file.absolute).equals(file.original)) throw Error('Asset changed during versioning: '+file.relative);
  for (const file of plan.changes) fs.writeFileSync(file.absolute,file.output);
}

function main(args) {
  let check=false, root=path.resolve(__dirname,'../dist');
  for (let index=0;index<args.length;index++) {
    if (args[index]==='--check') check=true;
    else if (args[index]==='--root' && args[index+1] && !args[index+1].startsWith('--')) root=path.resolve(args[++index]);
    else throw Error('Usage: node tools/version-assets.cjs [--check] [--root directory]');
  }
  const plan=planVersions(root);
  if (!check) applyPlan(plan);
  console.log(`${check?'Checked':'Versioned'} ${plan.references} asset references; ${plan.changes.length} ${check?'stale':'updated'} source files.`);
  if (check && plan.changes.length) {
    for (const file of plan.changes) console.log('  '+file.relative);
    return 1;
  }
  return 0;
}

if (require.main===module) {
  try {process.exitCode=main(process.argv.slice(2));}
  catch (error) {console.error(error.message);process.exitCode=1;}
}
module.exports={ASSET_EXTENSIONS,digest,planVersions,applyPlan,main};
