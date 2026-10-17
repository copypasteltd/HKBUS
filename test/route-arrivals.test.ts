import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';
import {fixtureRoutes,fixtureStops} from './support.js';

const id='KMB:112:O:1';
function input(values:Record<string,unknown>={}){return{route:'112',dir:'O',service_type:1,seq:1,eta_seq:1,eta:new Date(Date.now()+180000).toISOString(),dest_tc:'終點',dest_sc:'终点',dest_en:'Destination',data_timestamp:new Date().toISOString(),...values};}
async function app(fetcher:typeof fetch){
  const ctx=await createApp({databasePath:':memory:',jwtSecret:'route-arrivals-test-secret-at-least-32-characters',workerEnabled:false},{logger:false,fetcher});
  ctx.store.saveCatalog(fixtureRoutes,fixtureStops,[{routeId:id,stopId:'stop-times',sequence:1},{routeId:id,stopId:'stop-central',sequence:2},{routeId:id,stopId:'stop-times',sequence:3}]);
  return ctx;
}
test('whole-route API maps exact direction/service/sequence, including repeated physical stops',async()=>{
  let calls=0;
  const ctx=await app(async url=>{calls++;assert.ok(String(url).endsWith('/route-eta/112/1'));return new Response(JSON.stringify({generated_timestamp:new Date().toISOString(),data:[input(),input({seq:2,eta_seq:2,rmk_tc:'原定班次'}),input({seq:3}),input({dir:'I'}),input({service_type:2}),input({route:'6X'}),input({seq:999}),input({seq:2,eta_seq:3,eta:null})]}));});
  try{
    const response=await ctx.app.inject({url:'/api/v1/routes/'+encodeURIComponent(id)+'/arrivals?force=true'});assert.equal(response.statusCode,200);
    const data=response.json().data;assert.equal(data.route.id,id);assert.equal(data.stops.length,3);assert.equal(data.arrivals.length,4);
    assert.deepEqual(data.arrivals.map((x:{stopId:string;stopSequence:number})=>[x.stopId,x.stopSequence]),[['stop-times',1],['stop-central',2],['stop-central',2],['stop-times',3]]);
    assert.equal(data.arrivals[1].remark.tc,'原定班次');assert.equal(data.arrivals[2].eta,null);assert.equal(data.freshness.source,'live');
    await ctx.providers.routeArrivals(id);assert.equal(calls,1);
    const invalid=await ctx.app.inject({url:'/api/v1/routes/MISSING/arrivals'});assert.equal(invalid.statusCode,404);
    assert.equal((await ctx.app.inject({url:'/api/v1/routes/'+encodeURIComponent(id)+'/arrivals?force=invalid'})).statusCode,422);
  }finally{await ctx.app.close();}
});
test('whole-route requests coalesce and failed refresh is explicitly stale, then expires',async()=>{
  let fail=false,calls=0;
  const ctx=await app(async()=>{calls++;if(fail)return new Response('down',{status:503});await new Promise(resolve=>setTimeout(resolve,10));return new Response(JSON.stringify({data:[input()]}));});
  try{
    const replies=await Promise.all([ctx.providers.routeArrivals(id),ctx.providers.routeArrivals(id)]);assert.equal(calls,1);assert.equal(replies[0].freshness.state,'fresh');
    fail=true;const stale=await ctx.providers.routeArrivals(id,true);assert.equal(stale.freshness.state,'stale');assert.equal(stale.arrivals[0]!.status,'stale');assert.ok(stale.warning);
    ctx.store.run("UPDATE cache SET expires_at=?,stale_until=?",new Date(0).toISOString(),new Date(0).toISOString());
    await assert.rejects(ctx.providers.routeArrivals(id),/資料|回應|服務/);
  }finally{await ctx.app.close();}
});
test('expired buses are omitted, null/empty ETA is preserved, malformed data is rejected',async()=>{
  let data:unknown[]=[input({eta:new Date(Date.now()-61000).toISOString()}),input({seq:2,eta:null})];
  const ctx=await app(async()=>new Response(JSON.stringify({generated_timestamp:new Date().toISOString(),data})));
  try{
    const first=await ctx.providers.routeArrivals(id);assert.equal(first.arrivals.length,1);assert.equal(first.arrivals[0]!.status,'no-estimate');
    data=[];const empty=await ctx.providers.routeArrivals(id,true);assert.equal(empty.arrivals.length,0);assert.equal(empty.freshness.state,'fresh');
    ctx.store.run('DELETE FROM cache');data=[input({eta:'bad-date'})];await assert.rejects(ctx.providers.routeArrivals(id,true),/格式/);
  }finally{await ctx.app.close();}
});
