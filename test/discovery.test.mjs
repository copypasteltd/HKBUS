import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(name){const module={exports:{}};const source=readFileSync(new URL('../src/services/'+name+'.ts',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:relative=>load(relative.slice(2)),Date,Set,Number,Math});return module.exports;}
const {findRouteStops,routeStationStats,routeSuggestions,hongKongTime}=load('discovery');
const names=(tc,en)=>({tc,sc:tc,en});
const stops=[{id:'AAAA000000000003',sequence:1,name:names('甲站','ALPHA')},{id:'BBBB000000000003',sequence:3,name:names('乙站','Beta')},{id:'AAAA000000000003',sequence:13,name:names('甲站','ALPHA')}];

test('stop filtering preserves physical-stop repetitions and exact sequence rather than matching hex digits',()=>{
  assert.deepEqual(findRouteStops(stops,'3').map(x=>x.sequence),[3]);
  assert.deepEqual(findRouteStops([...stops,{id:'1234567890123456',sequence:12,name:names('YT138 站','YT138 STATION')}],'3').map(x=>x.sequence),[3]);
  assert.deepEqual(findRouteStops([{id:'1234567890123456',sequence:1,name:names('車站','STOP')}],'1234567890123456').map(x=>x.sequence),[1]);
  assert.deepEqual(findRouteStops(stops,'  ALpHa ').map(x=>x.sequence),[1,13]);
  assert.deepEqual(findRouteStops(stops,'BBBB').map(x=>x.sequence),[3]);
  assert.deepEqual(findRouteStops(stops,'乙').map(x=>x.sequence),[3]);
  assert.equal(findRouteStops(stops,'absent').length,0);assert.equal(findRouteStops(stops,'').length,3);
});
test('fresh station count isolates route, direction, repeated sequence and stale first predictions',()=>{
  const clock=Date.parse('2026-10-17T14:00:00Z'),routeId='KMB:112:O:1';
  const make=(id,seq,etaSequence=1)=>({id,routeId,stopId:stops[0].id,stopSequence:seq,etaSequence,eta:new Date(clock+120000).toISOString(),generatedAt:new Date(clock-1000).toISOString(),status:'scheduled'});
  const rows=[make('s1',1),{...make('other-direction',3),routeId:'KMB:112:I:1'},make('s13',13),{...make('old-first',3),stopId:stops[1].id,status:'stale'},{...make('fresh-later',3,2),stopId:stops[1].id}];
  const result={route:{id:routeId},stops,arrivals:rows,freshness:{state:'fresh',generatedAt:new Date(clock).toISOString()}};
  assert.equal(routeStationStats(result,false,clock).total,3);assert.equal(routeStationStats(result,false,clock).predicted,2);
  assert.equal(routeStationStats(result,true,clock).predicted,0);
  assert.equal(routeStationStats(result,false,clock+61000).stale,true);
});
test('route suggestions use returned catalogue order, deduplicate route numbers and do not invent popular routes',()=>{
  const routes=[{routeNo:'112',bound:'O'},{routeNo:'112',bound:'I'},{routeNo:'N8'},{routeNo:'A43'}];
  assert.deepEqual(Array.from(routeSuggestions(routes,2)),['112','N8']);assert.equal(routeSuggestions([]).length,0);
});
test('content timestamps use Hong Kong dates across midnight and reject absent/invalid timestamps',()=>{
  assert.equal(hongKongTime('2026-10-17T23:59:00Z',true),'10/18 07:59 HKT');
  assert.equal(hongKongTime('2026-10-17T12:30:00Z'),'20:30 HKT');
  assert.equal(hongKongTime(null),null);assert.equal(hongKongTime('invalid'),null);
});
