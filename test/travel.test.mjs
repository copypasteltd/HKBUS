import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceStore,normalizeDevice} from '../src/services/device-store.ts';
import {selectJourneys,verifiedTotal,toggleComparison,watchStop} from '../src/services/journeys.ts';
const clone=x=>JSON.parse(JSON.stringify(x));
const stop=n=>({id:n.toString(16).toUpperCase().padStart(16,'0'),name:{tc:'站'+n,sc:'站'+n,en:'STOP '+n},latitude:22.3,longitude:114.1,source:'live'});
const route={id:'KMB:112:O:1',routeNo:'112',bound:'O',serviceType:'1',operator:'KMB',origin:{tc:'蘇屋',sc:'苏屋',en:'SO UK'},destination:{tc:'北角',sc:'北角',en:'NORTH POINT'},source:'live'};
function disk(){let data=null,fail=false;return {read:()=>clone(data),write:value=>{if(fail)return false;data=clone(value);return true;},fail:next=>{fail=next;}};}
test('existing schema 1 upgrades without losing preferences or personal collections',()=>{
  const value=normalizeDevice({schema:1,revision:8,resetVersion:4,preferences:{locale:'en',rememberRecent:false},bookmarks:[{kind:'stop',entityId:stop(1).id,entity:stop(1)}]});
  assert.equal(value.schema,2);assert.ok(value.boundary);assert.equal(value.preferences.locale,'en');assert.equal(value.bookmarks.length,1);assert.equal(value.revision,8);assert.equal(value.resetVersion,4);assert.deepEqual(value.trips,[]);assert.deepEqual(value.watches,[]);
});
test('saved pairs deduplicate direction, retain independent reverse trips and persist order',()=>{
  const adapter=disk(),a=createDeviceStore(adapter);const id=a.trip(stop(1),stop(2),'Work');a.trip(stop(1),stop(2),'Updated');const reverse=a.trip(stop(2),stop(1),'Home');
  assert.equal(a.snapshot().trips.length,2);a.moveTrip(reverse,-1);a.renameTrip(id,'😀'.repeat(30));
  const b=createDeviceStore(adapter);assert.equal(b.snapshot().trips[0].id,reverse);assert.equal(Array.from(b.snapshot().trips[1].alias).length,24);b.removeTrip(reverse);assert.equal(b.snapshot().trips.length,1);
});
test('pair capacity and invalid/fixture stops fail without removing existing journeys',()=>{
  const a=createDeviceStore(disk());for(let n=2;n<=13;n++)a.trip(stop(1),stop(n));assert.equal(a.snapshot().trips.length,12);
  assert.throws(()=>a.trip(stop(1),stop(14)));assert.throws(()=>a.trip(stop(1),stop(1)));assert.throws(()=>a.trip({...stop(1),source:'fixture'},stop(2)));assert.throws(()=>a.trip({...stop(1),active:false},stop(2)));
  a.trip(stop(1),stop(2),'Still editable');assert.equal(a.snapshot().trips.length,12);assert.equal(a.snapshot().trips[0].alias,'Still editable');
});
test('watches distinguish repeated physical stops and full route service identities',()=>{
  const a=createDeviceStore(disk());a.watch(stop(1),route,1);a.watch(stop(1),route,8);a.watch(stop(1),route,1);
  a.watch(stop(1),{...route,id:'KMB:112:I:1',bound:'I'},1);a.watch(stop(1),{...route,id:'KMB:112:O:2',serviceType:'2'},1);
  assert.equal(a.snapshot().watches.length,4);a.renameWatch(a.snapshot().watches[0].id,'Work bus');assert.equal(a.snapshot().watches[0].alias,'Work bus');
  a.watch(stop(2),route,2);a.watch(stop(3),route,3);assert.throws(()=>a.watch(stop(4),route,4));assert.throws(()=>a.watch(stop(1),route,0));assert.throws(()=>a.watch(stop(1),route,1.5));
});
test('new collections persist catalog metadata only, stripping ETA, fare, identity and location payloads',()=>{
  const d=disk(),a=createDeviceStore(d),rich={...stop(1),eta:'private',minutes:3,distanceMeters:20,token:'secret',userLocation:{latitude:3,longitude:4},fare:{amountCents:300}};
  a.trip(rich,stop(2));a.watch(rich,{...route,arrival:{eta:'old'}},1);
  const data=d.read();assert.doesNotMatch(JSON.stringify({trips:data.trips,watches:data.watches}),/"(?:eta|minutes|distanceMeters|userLocation|token|fare|arrival)"|secret/);assert.equal(a.snapshot().trips[0].start.latitude,22.3);
});
test('normalization rejects malformed watches and duplicate/fixture trip metadata',()=>{
  const a=createDeviceStore(disk());a.trip(stop(1),stop(2));a.watch(stop(1),route,1);const value=a.snapshot();
  value.trips.push(value.trips[0],{start:{...stop(3),source:'fixture'},end:stop(4)});value.watches.push({...value.watches[0],sequence:0},value.watches[0],{...value.watches[0],route:{...route,bound:'I'}});
  const next=normalizeDevice(value);assert.equal(next.trips.length,1);assert.equal(next.watches.length,1);
});
test('storage failure preserves new collections; resetting preferences keeps them, clear removes them',()=>{
  const d=disk(),a=createDeviceStore(d);const trip=a.trip(stop(1),stop(2));a.watch(stop(1),route,1);d.fail(true);
  assert.throws(()=>a.removeTrip(trip));assert.throws(()=>a.renameWatch(a.snapshot().watches[0].id,'Changed'));assert.equal(a.snapshot().trips.length,1);assert.equal(a.snapshot().watches[0].alias,'');
  d.fail(false);a.preferences({locale:'en'});a.resetPreferences();assert.equal(a.snapshot().trips.length,1);assert.equal(a.snapshot().watches.length,1);const version=a.checkpoint();a.clear();assert.equal(a.snapshot().trips.length,0);assert.equal(a.snapshot().watches.length,0);assert.throws(()=>a.assertCurrent(version));
});
test('separate store instances preserve independent edits and detect cleared data generations',()=>{
  const d=disk(),a=createDeviceStore(d),b=createDeviceStore(d);a.trip(stop(1),stop(2));b.watch(stop(1),route,1);a.refresh();assert.equal(a.snapshot().watches.length,1);assert.equal(a.snapshot().trips.length,1);
  const generation=b.checkpoint();a.clear();assert.throws(()=>b.assertCurrent(generation));b.refresh();assert.equal(b.snapshot().trips.length,0);assert.equal(b.snapshot().watches.length,0);
});
function journey(id,transfers,stopCount,total){const legs=Array.from({length:transfers+1},()=>({route,board:stop(1),alight:stop(2),stops:2}));return {id,transfers,stopCount,legs,pricing:{state:total===null?'partial':'complete',totalCents:total,knownSubtotalCents:0,pricedLegs:total===null?0:legs.length,totalLegs:legs.length,currency:'HKD',discountsApplied:false}};}
test('filters retain direct or one transfer candidates and stable sorting never makes partial fares zero',()=>{
  const values=[journey('unknown',0,2,null),journey('higher',0,5,1200),journey('lower',1,8,900),journey('tie',1,8,900)];
  assert.deepEqual(selectJourneys(values,'all','fare').map(x=>x.id),['lower','tie','higher','unknown']);assert.deepEqual(selectJourneys(values,'direct','stops').map(x=>x.id),['unknown','higher']);
  assert.deepEqual(selectJourneys(values,'transfer','transfers',true).map(x=>x.id),['lower','tie']);assert.equal(values[0].id,'unknown');assert.equal(selectJourneys(values,'all','stops',true).length,3);
});
test('only complete nonnegative integer totals for every leg qualify as verified',()=>{
  assert.equal(verifiedTotal(journey('free',0,1,0)),0);const invalid=journey('bad',1,3,100);invalid.pricing.pricedLegs=1;assert.equal(verifiedTotal(invalid),null);
  for(const amount of [-1,Infinity,2.5,null])assert.equal(verifiedTotal(journey('invalid',0,2,amount)),null);
});
test('comparison has a strict three-result limit and allows removing any selected option',()=>{
  let selected=[];for(const id of ['a','b','c'])selected=toggleComparison(selected,id);assert.throws(()=>toggleComparison(selected,'d'));assert.deepEqual(toggleComparison(selected,'b'),['a','c']);assert.deepEqual(selected,['a','b','c']);
});
test('watch validity requires exact official direction, service, stop identity and occurrence',()=>{
  const item={route,stop:stop(1),sequence:8},result={route,stops:[{...stop(1),sequence:1},{...stop(1),sequence:8}],arrivals:[]};
  assert.equal(watchStop(item,result).sequence,8);assert.equal(watchStop({...item,sequence:2},result),null);assert.equal(watchStop(item,{...result,stops:[{...stop(2),sequence:8}]}),null);
  assert.equal(watchStop(item,{...result,route:{...route,serviceType:'2'}}),null);assert.equal(watchStop(item,{...result,route:{...route,active:false}}),null);
});

test('an upgrade writes schema 2 atomically, preserving schema 1 data and rejecting unknown future versions',()=>{
 const d=disk();d.write({schema:1,revision:6,preferences:{locale:'en'},bookmarks:[{kind:'stop',entityId:stop(1).id,entity:stop(1)}]});
 const upgraded=createDeviceStore(d);assert.equal(d.read().schema,2);assert.equal(upgraded.snapshot().bookmarks.length,1);assert.equal(upgraded.snapshot().preferences.locale,'en');
 const boundary=upgraded.snapshot().boundary;assert.equal(createDeviceStore(d).snapshot().boundary,boundary);d.write({schema:99});assert.ok(createDeviceStore(d).error());assert.equal(d.read().schema,99);
});
test('complete external storage removal or an old tab clear cannot reuse the same reset counter to resurrect pending work',()=>{
 const d=disk(),a=createDeviceStore(d);a.trip(stop(1),stop(2));const before=a.checkpoint();d.write(null);createDeviceStore(d);assert.throws(()=>a.assertCurrent(before));
 const b=createDeviceStore(d),checkpoint=b.checkpoint();d.write({schema:1,resetVersion:checkpoint.resetVersion,preferences:{},bookmarks:[],recent:[],reminders:[]});assert.throws(()=>b.assertCurrent(checkpoint));
});
test('a failed schema upgrade preserves the old raw data and exposes storage failure',()=>{
 const d=disk(),legacy={schema:1,preferences:{locale:'en'},bookmarks:[]};d.write(legacy);d.fail(true);const store=createDeviceStore(d);assert.ok(store.error());assert.deepEqual(d.read(),legacy);
});
