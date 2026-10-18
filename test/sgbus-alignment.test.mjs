import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceStore,normalizeDevice,DEVICE_KEY,preferenceDefaults} from '../src/services/device-store.ts';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {chosenServices,distanceTo,sortedBookmarks} from '../src/services/favorites.ts';
import {arrivalView,hasArrivalEstimate} from '../src/services/arrivals.ts';
import {mapCoordinate} from '../src/services/map-model.ts';
const stop={id:'D12FB3A70DDAED02',name:{tc:'站點',sc:'站点',en:'Stop'},latitude:22.28,longitude:114.18,source:'live'};
const route={id:'KMB:112:O:1',routeNo:'112',bound:'O',serviceType:'1',operator:'KMB',origin:stop.name,destination:stop.name,source:'live'};
const disk=(initial=null)=>{let data=initial,fail=false;return{read:()=>structuredClone(data),write:value=>{if(fail)return false;data=structuredClone(value);return true;},fail:value=>fail=value};};
test('pre-account legacy large-text preference becomes the large size before legacy keys are removed',()=>{
 const ts=createRequire(import.meta.url)('typescript'),values=new Map([['hkbus-large',true],['hkbus-locale','en']]);
 const module={exports:{}},code=ts.transpileModule(readFileSync(new URL('../src/services/local-user.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const deps={'@tarojs/taro':{getStorageSync:key=>values.get(key),getStorageInfoSync:()=>({keys:[...values.keys()]})},'./api':{API_BASE:'https://test.invalid/api',storage:{get:(key,fallback)=>values.get(key)??fallback,set:(key,value)=>{values.set(key,value);return true;},remove:key=>values.delete(key)}},'./data-policy':{dataNamespace:()=> 'legacy-test',isLiveData:()=>false},'./device-store':{createDeviceStore,normalizeDevice,DEVICE_KEY,preferenceDefaults},'./local-reminders':{},'./journeys':{},'./platform':{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{assert.ok(name in deps,name);return deps[name];}},{filename:'local-user.ts'});
 const result=module.exports.localUser.snapshot();assert.equal(result.preferences.textSize,'large');assert.equal(result.preferences.largeText,true);assert.equal(result.preferences.locale,'en');assert.equal(values.has('hkbus-large'),false);assert.equal(values.get(DEVICE_KEY).preferences.textSize,'large');
});
test('schema 2 migration preserves collections and large text, upgrades once and adds safe defaults',()=>{
 const d=disk({schema:2,boundary:'previous-boundary',revision:8,preferences:{largeText:true,locale:'en'},bookmarks:[{kind:'stop',entityId:stop.id,entity:stop,alias:'Home'}],recent:[{kind:'stop',entityId:stop.id,entity:stop,viewedAt:1}],reminders:[],trips:[],watches:[]});
 const first=createDeviceStore(d).snapshot();assert.equal(first.schema,3);assert.equal(first.preferences.textSize,'large');assert.equal(first.preferences.theme,'system');assert.equal(first.bookmarks[0].selectedServices,'all');assert.equal(first.bookmarks[0].pinned,false);assert.equal(first.recentStops[0].entityId,stop.id);assert.equal(first.boundary,'previous-boundary');assert.deepEqual(createDeviceStore(d).snapshot(),first);
});
test('exact favourite services persist through rename, pin, ordering and restart; writes are atomic',()=>{
 const d=disk(),store=createDeviceStore(d);store.bookmark('stop',stop);const selected=[{routeId:route.id,sequence:3},{routeId:route.id,sequence:9},{routeId:'KMB:112:I:2',sequence:1}];store.selectServices(stop.id,selected);store.pin('stop',stop.id,true);store.rename('stop',stop.id,'Commute');
 assert.deepEqual(createDeviceStore(d).snapshot().bookmarks[0].selectedServices,selected);assert.equal(store.snapshot().bookmarks[0].pinned,true);assert.throws(()=>store.selectServices(stop.id,[]));
 d.fail(true);assert.throws(()=>store.selectServices(stop.id,'all'));assert.deepEqual(store.snapshot().bookmarks[0].selectedServices,selected);d.fail(false);store.selectServices(stop.id,'all');assert.equal(store.snapshot().bookmarks[0].selectedServices,'all');
});
test('favourite filtering never substitutes a reverse, special or repeated occurrence',()=>{
 const data={stop,routes:[route],arrivals:[],services:[{route,sequence:3},{route,sequence:9},{route:{...route,id:'KMB:112:I:1',bound:'I'},sequence:3}]};
 assert.deepEqual(chosenServices(data,[{routeId:route.id,sequence:9}]).map(x=>[x.route.id,x.sequence]),[[route.id,9]]);assert.equal(chosenServices(data,[{routeId:route.id,sequence:6}]).length,0);assert.equal(chosenServices(data,'all').length,3);
});
test('pin priority and distance sorting leave stored manual positions untouched and never persist user coordinates',()=>{
 const d=disk(),store=createDeviceStore(d),far={...stop,id:'0000000000000001',latitude:22.5};store.bookmark('stop',stop);store.bookmark('stop',far);store.bookmark('route',route);store.pin('stop',far.id,true);const before=store.snapshot().bookmarks,sorted=sortedBookmarks(before,'distance',{latitude:22.28,longitude:114.18});assert.equal(sorted[0].entityId,far.id);assert.equal(sorted[1].entityId,stop.id);assert.equal(sorted[2].kind,'route');assert.deepEqual(store.snapshot().bookmarks,before);assert.equal(distanceTo(stop,null),null);assert.equal(distanceTo(stop,stop),0);assert.doesNotMatch(JSON.stringify(d.read()),/coordinates|userLocation|profileId|accessToken/);
});
test('last ten stops remain independent of route history and disabling history clears both lists',()=>{
 const store=createDeviceStore(disk());for(let i=0;i<12;i++)store.visit('stop',{...stop,id:i.toString(16).toUpperCase().padStart(16,'0')});for(let i=0;i<25;i++)store.visit('route',{...route,id:'KMB:'+i+':O:1',routeNo:String(i)});assert.equal(store.snapshot().recentStops.length,10);assert.equal(store.snapshot().recent.filter(x=>x.kind==='stop').length,0);store.preferences({rememberRecent:false});assert.equal(store.snapshot().recentStops.length,0);assert.equal(store.snapshot().recent.length,0);
});
test('reset only preferences preserves selections and recent stops while a full clear changes the transaction boundary',()=>{
 const store=createDeviceStore(disk());store.bookmark('stop',stop);store.selectServices(stop.id,[{routeId:route.id,sequence:3}]);store.visit('stop',stop);store.preferences({theme:'dark',textSize:'small',etaCount:2,arrivalLayout:'list',nearbyView:'list',bookmarkView:'collapsed',bookmarkSort:'distance'});assert.equal(store.snapshot().preferences.largeText,false);store.preferences({textSize:'large'});assert.equal(store.snapshot().preferences.largeText,true);store.resetPreferences();assert.equal(store.snapshot().bookmarks[0].selectedServices[0].sequence,3);assert.equal(store.snapshot().recentStops.length,1);assert.equal(store.snapshot().preferences.etaCount,3);const checkpoint=store.checkpoint();store.clear();assert.throws(()=>store.assertCurrent(checkpoint));assert.equal(store.snapshot().recentStops.length,0);
});
test('arrival under one minute is due, exact minute remains one, stale predictions never become live',()=>{
 const clock=Date.now(),row={eta:new Date(clock+59000).toISOString(),generatedAt:new Date(clock).toISOString(),status:'scheduled'};assert.equal(arrivalView(row,clock).state,'due');assert.equal(arrivalView({...row,eta:new Date(clock+60000).toISOString()},clock).state,'minutes');assert.equal(arrivalView({...row,status:'stale'},clock).state,'stale');
});
test('a null first prediction cannot put a service with a later fresh estimate in the no-estimate section',()=>{
 const clock=Date.now(),first={eta:null,generatedAt:new Date(clock).toISOString(),status:'scheduled'},next={...first,eta:new Date(clock+180000).toISOString()};
 assert.equal(hasArrivalEstimate([first,next],clock),true);assert.equal(hasArrivalEstimate([first,next],clock,true),false);assert.equal(hasArrivalEstimate([first],clock),false);assert.equal(hasArrivalEstimate([{...next,status:'stale'}],clock),false);
});
test('render-only native map transform has a bounded nonzero shift, preserves input and excludes outside coverage',()=>{
 const copy={latitude:stop.latitude,longitude:stop.longitude},result=mapCoordinate(copy.latitude,copy.longitude);assert.notEqual(result.longitude,copy.longitude);assert.ok(Math.abs(result.longitude-copy.longitude)<.01);assert.deepEqual(copy,{latitude:22.28,longitude:114.18});assert.deepEqual(mapCoordinate(1.3,103.8),{latitude:1.3,longitude:103.8});
});
