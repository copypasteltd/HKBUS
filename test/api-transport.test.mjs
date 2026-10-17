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
test('personal endpoints are rejected before transport and public calls never send stored credentials',async()=>{
  const requests=[];const app=client(async options=>{requests.push(options);return response([]);},[['hkbus-live-v2:'+encodeURIComponent('https://test-api.invalid/api')+':session:token','legacy-private-token']]);
  for(const request of [()=>app.api.get('/v1/profile/bookmarks',true),()=>app.api.post('/v1/profile/sessions'),()=>app.api.put('/v1/profile/reminders',{}),()=>app.api.delete('/v1/profile')])await assert.rejects(request(),error=>error.code==='LOCAL_ONLY');
  assert.equal(requests.length,0);await app.api.get('/v1/routes');assert.equal(requests.length,1);assert.equal(requests[0].header.Authorization,undefined);assert.equal(app.api.cached('/v1/profile/bookmarks',true),null);
});
test('clearing local data invalidates pending responses and clears only app query caches',async()=>{
  const received=deferred(),release=deferred();let count=0;
  const app=client(async()=>{count++;if(count===1){received.resolve();await release.promise;}return response({source:'live',name:'official metadata'});},[['unrelated-site-value',true]]);
  const pending=app.api.get('/v1/routes/one');await received.promise;app.api.clearCache();release.resolve();await assert.rejects(pending,error=>error.code==='LOCAL_RESET');
  assert.equal(app.api.cached('/v1/routes/one'),null);assert.equal(app.map.get('unrelated-site-value'),true);
  await app.api.get('/v1/routes/one');assert.equal(app.api.cached('/v1/routes/one').source,'live');
});
