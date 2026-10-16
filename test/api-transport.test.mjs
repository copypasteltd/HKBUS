import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
const response=data=>({statusCode:200,data:{data,meta:{mode:'live'}}});
function client(request,entries=[]){
  const map=new Map(entries);
  const taro={getStorageSync:key=>map.get(key),setStorageSync:(key,value)=>map.set(key,value),removeStorageSync:key=>map.delete(key),getStorageInfoSync:()=>({keys:[...map.keys()]}),request};
  function load(relative){const module={exports:{}};const source=readFileSync(new URL(relative,import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name==='@tarojs/taro')return taro;if(name==='./data-policy')return load('../src/services/data-policy.ts');throw new Error(name);},__API_BASE__:'https://test-api.invalid/api',Date,Map,Promise,Error,encodeURIComponent},{filename:relative});return module.exports;}
  return{...load('../src/services/api.ts'),map};
}
function deferred(){let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};}
test('legacy storage is removed while reading preferences are retained',()=>{
  const app=client(async()=>response([]),[['hkbus-cache:public:/v1/home',{value:{mode:'fixture'}}],['hkbus-profile-token','legacy-token'],['hkbus-large',true]]);
  assert.equal(app.map.has('hkbus-profile-token'),false);assert.equal(app.map.has('hkbus-cache:public:/v1/home'),false);assert.equal(app.map.get('hkbus-large'),true);
});
test('transport rejects fixture envelopes and nested sample entities without caching them',async()=>{
  let envelope={data:[],meta:{mode:'fixture'}};
  const app=client(async()=>({statusCode:200,data:envelope}));
  await assert.rejects(app.api.get('/v1/routes'),error=>error.code==='NON_LIVE_DATA');
  envelope={data:{items:[{source:'fixture'}]},meta:{mode:'live'}};
  await assert.rejects(app.api.get('/v1/routes'),error=>error.code==='NON_LIVE_DATA');
  assert.equal(app.api.cached('/v1/routes'),null);
});
test('deleting local personal data invalidates in-flight bookmark responses and keeps a new identity separate',async()=>{
  const received=deferred(),release=deferred();let sessions=0,reads=0;
  const app=client(async options=>{
    if(options.url.endsWith('/sessions')){sessions++;return response({accessToken:'test-access-'+sessions,profileId:'test-profile-'+sessions,expiresIn:864000,refreshToken:'test-refresh-'+sessions});}
    if(options.url.endsWith('/bookmarks')){reads++;if(reads===1){received.resolve();await release.promise;return response([{alias:'Old private bookmark',entity:{source:'live'}}]);}return response([]);}
    throw new Error('Unexpected request');
  });
  const outstanding=app.api.get('/v1/profile/bookmarks',true);await received.promise;
  app.clearProfileStorage();release.resolve();
  await assert.rejects(outstanding,error=>error.code==='PROFILE_RESET');
  assert.equal(app.api.cached('/v1/profile/bookmarks',true),null);assert.equal(app.hasProfileSession(),false);
  assert.equal((await app.api.get('/v1/profile/bookmarks',true)).length,0);assert.equal(sessions,2);
  assert.equal(app.storage.get(app.profileKey('id'),''),'test-profile-2');
});
test('an in-flight device session cannot restore credentials after local data deletion',async()=>{
  const received=deferred(),release=deferred();
  const app=client(async()=>{received.resolve();await release.promise;return response({accessToken:'test-access',profileId:'test-profile',expiresIn:864000,refreshToken:'test-refresh'});});
  const outstanding=app.ensureProfile();await received.promise;app.clearProfileStorage();release.resolve();
  await assert.rejects(outstanding,error=>error.code==='PROFILE_RESET');assert.equal(app.hasProfileSession(),false);
});
