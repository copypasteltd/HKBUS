import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArrival,normalizeRoute,normalizeStop,durationSeconds,tdasInputSchema,Providers } from '../src/providers.js';
import { createApp } from '../src/app.js';
import { fixtureRoutes,fixtureStops } from './support.js';

test('KMB fields preserve service identity, numeric strings, Chinese names and null ETA',()=>{
  const route=normalizeRoute({route:'N48',bound:'I',service_type:'2',orig_tc:'起點',orig_sc:'起点',orig_en:'Origin',dest_tc:'終點',dest_sc:'终点',dest_en:'Destination'});assert.equal(route.id,'KMB:N48:I:2');
  assert.equal(normalizeStop({stop:'ABC',name_tc:'站',name_sc:'站',name_en:'Stop',lat:'22.3',long:'114.2'}).latitude,22.3);
  const clock=Date.parse('2026-10-16T00:00:00Z');
  const row={route:'112',dir:'O',service_type:1,seq:'4',eta_seq:1,eta:'2026-10-16T08:03:00+08:00',dest_tc:'北角',dest_sc:'北角',dest_en:'North Point',data_timestamp:'2026-10-16T08:00:00+08:00'};
  assert.equal(normalizeArrival(row,'ABC',clock).minutes,3);assert.equal(normalizeArrival({...row,eta:null},'ABC',clock).status,'no-estimate');assert.equal(normalizeArrival(row,'ABC',clock+300000).status,'stale');
  assert.throws(()=>normalizeArrival({...row,eta:'not-a-date'},'ABC',clock));
});
test('TDAS HH:MM is duration and input constrains time, coordinates and endpoints',()=>{
  assert.equal(durationSeconds('01:20'),4800);assert.throws(()=>durationSeconds('10:70'));
  const input={start:{lat:22.28,long:114.18},end:{lat:22.3,long:114.17},departIn:15};assert.equal(tdasInputSchema.parse(input).lang,'tc');assert.equal(tdasInputSchema.safeParse({...input,departIn:16}).success,false);assert.equal(tdasInputSchema.safeParse({...input,end:input.start}).success,false);
});
test('successful ETA cache survives an upstream failure as explicitly stale data',async()=>{
  let calls=0,fail=false;
  const fetcher:typeof fetch=async()=>{calls++;if(fail)throw new Error('network');return new Response(JSON.stringify({generated_timestamp:new Date().toISOString(),data:[{route:'112',dir:'O',service_type:1,seq:1,eta_seq:1,eta:new Date(Date.now()+180000).toISOString(),dest_tc:'北角',dest_sc:'北角',dest_en:'North Point',data_timestamp:new Date().toISOString()}]}),{status:200,headers:{'Content-Type':'application/json'}});};
  const ctx=await createApp({databasePath:':memory:',jwtSecret:'provider-cache-test-secret-at-least-32-characters',providerMode:'live',workerEnabled:false},{logger:false,fetcher});
  try{
    ctx.store.saveCatalog(fixtureRoutes,fixtureStops,[{routeId:'KMB:112:O:1',stopId:'stop-times',sequence:1}]);
    const first=await ctx.providers.arrivals('stop-times');assert.equal(first.freshness.source,'live');assert.equal(first.freshness.state,'fresh');
    await ctx.providers.arrivals('stop-times');assert.equal(calls,1);
    fail=true;const stale=await ctx.providers.arrivals('stop-times',true);assert.equal(stale.freshness.state,'stale');assert.ok(stale.warning);assert.equal(stale.arrivals[0]!.status,'stale');
  }finally{await ctx.app.close();}
});
test('catalog replacement is atomic when a provider returns inconsistent foreign keys',async()=>{
  const data=[{data:[{route:'1',bound:'O',service_type:1,orig_tc:'甲',orig_sc:'甲',orig_en:'A',dest_tc:'乙',dest_sc:'乙',dest_en:'B'}]},{data:[{stop:'REAL',name_tc:'站',name_sc:'站',name_en:'Stop',lat:22.3,long:114.2}]},{data:[{route:'1',bound:'O',service_type:1,seq:1,stop:'MISSING'}]}];let index=0;
  const fetcher:typeof fetch=async()=>new Response(JSON.stringify(data[index++]),{status:200});
  const ctx=await createApp({databasePath:':memory:',jwtSecret:'catalog-test-secret-at-least-32-characters',providerMode:'live',workerEnabled:false},{logger:false,fetcher});
  try{ctx.store.saveCatalog(fixtureRoutes,fixtureStops,[]);await assert.rejects(ctx.providers.syncCatalog(),/站序與主資料不一致/);assert.equal(ctx.store.routes().length,fixtureRoutes.length);assert.ok(ctx.store.stop('stop-times'));}finally{await ctx.app.close();}
});
