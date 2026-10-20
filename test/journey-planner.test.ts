import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/database.js';
import {names,type Stop,type Route} from '../src/domain.js';
import {planJourneys,journeyInputSchema,mapStops,validateJourney,journeyCheckSchema} from '../src/journey-planner.js';
import {createTestApp} from './support.js';
function network(paths:string[][],positions:Record<string,[number,number]>={}){
 const store=new Store(':memory:'),ids=[...new Set(paths.flat())];
 const stops:Stop[]=ids.map((id,index)=>({id,name:names(id),latitude:positions[id]?.[0]??22.3+index*.01,longitude:positions[id]?.[1]??114.15,source:'live'}));
 const routes:Route[]=paths.map((path,index)=>({id:'KMB:R'+index+':O:1',routeNo:'R'+index,bound:'O',serviceType:'1',operator:'KMB',origin:names(path[0]!),destination:names(path.at(-1)!),source:'live'}));
 const relations=paths.flatMap((path,index)=>path.map((stopId,seq)=>({routeId:routes[index]!.id,stopId,sequence:seq+1})));
 store.saveCatalog(routes,stops,relations);return{store,stops,routes,relations};
}
const query=(startId:string,endId:string,other:Record<string,unknown>={})=>journeyInputSchema.parse({startId,endId,...other});
test('loop routes use later boarding and later alighting occurrences rather than findIndex',()=>{
 const{store}=network([['A','B','A','C'],['D','E','F','E','G']]);try{
  const first=planJourneys(store,query('A','C',{maxTransfers:0})).journeys[0]!;assert.equal(first.stopCount,1);assert.equal(first.legs[0]!.board.sequence,3);assert.equal(first.legs[0]!.alight.sequence,4);
  const second=planJourneys(store,query('F','E',{maxTransfers:0})).journeys[0]!;assert.equal(second.legs[0]!.alight.sequence,4);assert.deepEqual(second.legs[0]!.path.map(x=>x.id),['F','E']);
 }finally{store.close();}
});
test('three direct routes do not suppress valid transfer alternatives',()=>{
 const{store}=network([['S','A','E'],['S','B','E'],['S','C','E'],['S','X'],['X','E']]);try{const result=planJourneys(store,query('S','E',{limit:12}));assert.equal(result.journeys.filter(x=>x.transfers===0).length,3);assert.ok(result.journeys.some(x=>x.transfers===1));}finally{store.close();}
});
test('all route directions participate even when a useful boarding service follows the first thirty',()=>{
 const paths=Array.from({length:35},(_,index)=>['S','dead-'+index]);paths.push(['S','X'],['X','E']);const{store}=network(paths);try{assert.ok(planJourneys(store,query('S','E')).journeys.some(x=>x.legs[0]!.route.routeNo==='R35'));}finally{store.close();}
});
test('two transfers produce three exact forward rides; one-transfer queries do not',()=>{
 const{store}=network([['S','A'],['A','B'],['B','E'],['E','S']]);try{assert.equal(planJourneys(store,query('S','E')).journeys.length,0);const value=planJourneys(store,query('S','E',{maxTransfers:2})).journeys[0]!;assert.equal(value.transfers,2);assert.equal(value.legs.length,3);assert.equal(value.stopCount,3);assert.equal(new Set(value.legs.map(x=>x.route.id)).size,3);assert.equal(planJourneys(store,query('A','S',{maxTransfers:0})).journeys.length,0);}finally{store.close();}
});
test('nearby transfers require explicit radius and honor the full walking budget',()=>{
 const{store}=network([['S','X'],['Y','E']],{S:[22.31,114.15],X:[22.3,114.15],Y:[22.301,114.15],E:[22.29,114.15]});try{
  assert.equal(planJourneys(store,query('S','E')).journeys.length,0);assert.equal(planJourneys(store,query('S','E',{transferRadius:200,maxWalkingMeters:100})).journeys.length,0);
  const value=planJourneys(store,query('S','E',{transferRadius:200})).journeys[0]!;assert.equal(value.walking.length,1);assert.equal(value.walking[0]!.kind,'transfer');assert.equal(value.walkingVerified,false);assert.equal(value.walking[0]!.pathVerified,false);assert.equal(value.walking[0]!.basis,'straight-line');assert.ok(value.walkingMeters>100&&value.walkingMeters<120);
 }finally{store.close();}
});
test('map-point access and egress resolve current stops and never create passenger records',()=>{
 const{store}=network([['S','E']],{S:[22.3,114.15],E:[22.31,114.15]});try{
  const input=journeyInputSchema.parse({start:{latitude:22.3001,longitude:114.15},end:{latitude:22.3101,longitude:114.15},accessRadius:100,maxTransfers:0});
  const value=planJourneys(store,input);assert.equal(value.endpoints.start.kind,'point');assert.equal(value.journeys[0]!.walking.length,2);assert.deepEqual(value.journeys[0]!.walking.map(x=>x.kind),['access','egress']);assert.equal(store.get<{n:number}>('SELECT count(*) n FROM profiles')!.n,0);
  const none=planJourneys(store,{...input,start:{latitude:22.9,longitude:114.9}});assert.equal(none.endpoints.start.candidateStops,0);assert.equal(none.start,null);assert.equal(none.journeys.length,0);
 }finally{store.close();}
});
test('catalog updates invalidate public graphs without being tied to personal or metrics writes',()=>{
 const value=network([['S','E']]);try{assert.equal(planJourneys(value.store,query('S','E')).journeys.length,1);value.store.saveCatalog(value.routes,value.stops,[]);assert.equal(planJourneys(value.store,query('S','E')).journeys.length,0);}finally{value.store.close();}
});
test('viewport returns its true count, stable current stops and explicit truncation',()=>{
 const{store}=network([['A','B','C']]);try{const value=mapStops(store,{west:114.1,east:114.2,south:22.29,north:22.4},1);assert.equal(value.total,3);assert.equal(value.items.length,1);assert.equal(value.truncated,true);assert.equal(value.items[0]!.source,'live');assert.equal(mapStops(store,{west:114.8,east:114.9,south:22.8,north:22.9}).total,0);}finally{store.close();}
});
test('departure validation rejects forged sequences, backward rides and broken transfers',()=>{
 const{store}=network([['S','X'],['Y','E']]);try{
  const a={routeId:'KMB:R0:O:1',boardStopId:'S',boardSequence:1,alightStopId:'X',alightSequence:2},b={routeId:'KMB:R1:O:1',boardStopId:'Y',boardSequence:1,alightStopId:'E',alightSequence:2};
  assert.equal(validateJourney(store,journeyCheckSchema.parse({legs:[a]})).state,'valid');
  assert.equal(validateJourney(store,journeyCheckSchema.parse({legs:[{...a,boardSequence:2}]})).state,'changed');
  assert.equal(validateJourney(store,journeyCheckSchema.parse({legs:[{...a,boardStopId:'X',boardSequence:2,alightStopId:'S',alightSequence:1}]})).state,'changed');
  assert.equal(validateJourney(store,journeyCheckSchema.parse({legs:[a,b],transferRadius:100})).connections[0]!.state,'invalid');
 }finally{store.close();}
});
test('validation preserves same-coordinate distinct stop identities as unverified walking candidates',()=>{
 const{store}=network([['S','X'],['Y','E']],{X:[22.3,114.15],Y:[22.3,114.15]});try{const value=validateJourney(store,journeyCheckSchema.parse({legs:[{routeId:'KMB:R0:O:1',boardStopId:'S',boardSequence:1,alightStopId:'X',alightSequence:2},{routeId:'KMB:R1:O:1',boardStopId:'Y',boardSequence:1,alightStopId:'E',alightSequence:2}],transferRadius:100}));assert.equal(value.state,'valid');assert.equal(value.connections[0]!.state,'walking-candidate');assert.equal(value.connections[0]!.pathVerified,false);}finally{store.close();}
});
test('query schemas reject incomplete, ambiguous, out-of-bounds and oversized requests',()=>{
 for(const input of [{startId:'S'},{startId:'S',start:{latitude:22.3,longitude:114.1},endId:'E'},{start:{latitude:99,longitude:114},endId:'E'},{startId:'S',endId:'E',maxTransfers:3},{startId:'S',endId:'E',transferRadius:501},{startId:'S',endId:'E',limit:13}])assert.equal(journeyInputSchema.safeParse(input).success,false);
 assert.equal(journeyCheckSchema.safeParse({legs:[]}).success,false);
});
test('actual API route registration validates viewport, exposes planning options, and isolates metadata failure',async()=>{
 const ctx=await createTestApp();try{
  assert.equal((await ctx.app.inject('/api/v1/map/stops?west=114.2&east=114.1&south=22.2&north=22.4')).statusCode,422);
  const view=(await ctx.app.inject('/api/v1/map/stops?west=114&east=114.3&south=22.2&north=22.4&limit=2')).json().data;assert.equal(view.items.length,2);assert.equal(view.total,6);assert.equal(view.truncated,true);
  const plan=(await ctx.app.inject({method:'POST',url:'/api/v1/journeys',payload:{startId:'stop-times',endId:'stop-kennedy',maxTransfers:2}})).json().data;
  assert.ok(plan.journeys.length);assert.equal(plan.request.maxTransfers,2);assert.equal(plan.search.exhaustive,false);
  const leg=plan.journeys[0].legs[0];const check=await ctx.app.inject({method:'POST',url:'/api/v1/journeys/check',payload:{legs:[{routeId:leg.route.id,boardStopId:leg.board.id,boardSequence:leg.board.sequence,alightStopId:leg.alight.id,alightSequence:leg.alight.sequence}]}});
  assert.equal(check.statusCode,200);assert.equal(check.json().data.state,'valid');assert.equal(check.json().data.legs[0].reference.state,'unavailable');assert.equal(check.json().data.legs[0].reference.operatingHours.state,'unavailable');assert.equal(check.json().data.legs[0].geometry,null);assert.equal(check.json().data.legs[0].arrivals.items.length,3);
  ctx.store.setSetting('features',{planner:false});assert.equal((await ctx.app.inject({method:'POST',url:'/api/v1/journeys/check',payload:{legs:[]}})).statusCode,503);
 }finally{await ctx.app.close();}
});
