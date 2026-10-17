import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceStore,normalizeDevice,catalogSnapshot} from '../src/services/device-store.ts';
const stop={id:'D12FB3A70DDAED02',name:{tc:'怡和街',sc:'怡和街',en:'YEE WO STREET'},latitude:22.28,longitude:114.18,source:'live'};
const route={id:'KMB:112:O:1',routeNo:'112',bound:'O',serviceType:'1',operator:'KMB',origin:{tc:'蘇屋',sc:'苏屋',en:'SO UK'},destination:{tc:'北角',sc:'北角',en:'NORTH POINT'},source:'live'};
const clone=value=>JSON.parse(JSON.stringify(value));
function disk(){let data=null,fail=false;return {read:()=>data===null?null:clone(data),write:value=>{if(fail)return false;data=clone(value);return true;},fail:value=>{fail=value;}};}

test('preferences and favourites persist across client instances without identity fields',()=>{
  const storage=disk(),first=createDeviceStore(storage);first.bookmark('stop',stop,'Home');first.preferences({locale:'en',largeText:true,etaDisplay:'clock',homeStopId:stop.id,defaultReminderMinutes:10,introDismissed:true});
  const reopened=createDeviceStore(storage).snapshot();assert.equal(reopened.preferences.locale,'en');assert.equal(reopened.preferences.homeStopId,stop.id);assert.equal(reopened.preferences.largeText,true);assert.equal(reopened.bookmarks[0].alias,'Home');
  assert.doesNotMatch(JSON.stringify(storage.read()),/profileId|accessToken|refreshToken|Authorization/);
});
test('failed writes do not change persisted or visible preferences and can recover',()=>{
  const storage=disk(),store=createDeviceStore(storage);store.bookmark('stop',stop);storage.fail(true);
  assert.throws(()=>store.preferences({locale:'en'}));assert.equal(store.snapshot().preferences.locale,'tc');assert.equal(createDeviceStore(storage).snapshot().bookmarks.length,1);assert.ok(store.error());
  storage.fail(false);store.preferences({locale:'en'});assert.equal(store.snapshot().preferences.locale,'en');assert.equal(store.error(),'');
});
test('catalog snapshots exclude ETA and reject fixture/mismatched identities',()=>{
  assert.equal(catalogSnapshot('stop',{...stop,source:'fixture'}),null);assert.equal(catalogSnapshot('route',{...route,bound:'I'}),null);
  assert.equal('eta' in catalogSnapshot('stop',{...stop,eta:'old-prediction',minutes:4}),false);
  const value=normalizeDevice({schema:1,preferences:{locale:'wrong',etaDisplay:'bad',defaultReminderMinutes:3},bookmarks:[{kind:'stop',entityId:stop.id,entity:{...stop,source:'fixture'}}]});
  assert.equal(value.preferences.locale,'tc');assert.equal(value.preferences.defaultReminderMinutes,5);assert.equal(value.bookmarks[0].entity,null);
});
test('favourites support exact reordering, bounded aliases and default-stop cleanup',()=>{
  const store=createDeviceStore(disk());store.bookmark('stop',stop);store.bookmark('route',route);store.rename('stop',stop.id,'a'.repeat(40));assert.equal(store.snapshot().bookmarks[0].alias.length,24);
  assert.throws(()=>store.order([{kind:'stop',entityId:stop.id},{kind:'stop',entityId:stop.id}]));
  store.order([{kind:'route',entityId:route.id},{kind:'stop',entityId:stop.id}]);assert.equal(store.snapshot().bookmarks[0].kind,'route');
  store.preferences({homeStopId:stop.id});store.removeBookmark('stop',stop.id);assert.equal(store.snapshot().preferences.homeStopId,null);
});
test('recent history deduplicates, caps at 20, and privacy toggle clears and stops it',()=>{
  const store=createDeviceStore(disk());for(let n=1;n<=24;n++)store.visit('stop',{...stop,id:n.toString(16).toUpperCase().padStart(16,'0')});
  assert.equal(store.snapshot().recent.length,20);store.visit('stop',stop);store.visit('stop',stop);assert.equal(store.snapshot().recent.filter(x=>x.entityId===stop.id).length,1);
  store.preferences({rememberRecent:false});store.visit('route',route);assert.equal(store.snapshot().recent.length,0);
  store.preferences({rememberRecent:true});store.visit('route',route);assert.equal(store.snapshot().recent.length,1);
});
test('reminders isolate repeated stop sequence and reject late delivery after pause or deletion',()=>{
  const store=createDeviceStore(disk());store.reminder(stop,route,8,5);store.reminder(stop,route,20,10);let first=store.snapshot().reminders[0];assert.equal(store.snapshot().reminders.length,2);
  store.reminderStatus(first.id,'paused');assert.equal(store.markSent(first.id,first.expires_at,first.threshold),false);
  store.reminderStatus(first.id,'active');first=store.snapshot().reminders[0];assert.equal(store.markSent(first.id,first.expires_at,first.threshold),true);assert.equal(store.markSent(first.id,first.expires_at,first.threshold),false);
  const second=store.snapshot().reminders[1];store.clear();assert.equal(store.markSent(second.id,second.expires_at,second.threshold),false);assert.equal(store.snapshot().reminders.length,0);
});
test('reset preferences preserves saved items, full clear resets all, and unknown schema fails closed',()=>{
  const storage=disk(),store=createDeviceStore(storage);store.bookmark('stop',stop);store.visit('route',route);store.preferences({locale:'en'});store.resetPreferences();assert.equal(store.snapshot().bookmarks.length,1);assert.equal(store.snapshot().recent.length,1);assert.equal(store.snapshot().preferences.locale,'tc');
  store.clear();assert.equal(store.snapshot().bookmarks.length,0);assert.equal(store.snapshot().preferences.introDismissed,false);
  storage.write({schema:99});const future=createDeviceStore(storage);assert.ok(future.error());assert.throws(()=>future.preferences({locale:'en'}));assert.equal(storage.read().schema,99);future.clear();assert.equal(storage.read().schema,1);
});
test('legacy migration cleans credentials only after a durable write and never reads an API',()=>{
  const storage=disk();let cleared=0;const previous=normalizeDevice({schema:1,preferences:{locale:'en'},bookmarks:[{kind:'stop',entityId:stop.id,entity:stop,alias:'Legacy'}]});
  storage.fail(true);const failed=createDeviceStore({...storage,legacy:()=>previous,clearLegacy:()=>{cleared++;}});assert.equal(cleared,0);assert.ok(failed.error());
  storage.fail(false);const recovered=createDeviceStore({...storage,legacy:()=>previous,clearLegacy:()=>{cleared++;}});assert.equal(recovered.snapshot().preferences.locale,'en');assert.equal(recovered.snapshot().bookmarks[0].alias,'Legacy');assert.equal(cleared,1);
});
test('an operation begun before local clearing cannot restore a favourite in either tab',()=>{
  const storage=disk(),first=createDeviceStore(storage),other=createDeviceStore(storage),version=first.snapshot().resetVersion;
  other.clear();assert.throws(()=>first.assertCurrent(version));assert.equal(first.snapshot().bookmarks.length,0);
  first.refresh();assert.equal(first.snapshot().resetVersion,1);
});
