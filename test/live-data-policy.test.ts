import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../src/database.js';
import {createApp} from '../src/app.js';
import {loadConfig} from '../src/config.js';
import {names,now,type Notice} from '../src/domain.js';
import {createTestApp,fixtureRoutes,fixtureStops,testFetcher} from './support.js';

const settings={databasePath:':memory:',jwtSecret:'live-data-policy-isolated-test-secret-123456789',workerEnabled:false};
test('native app origin may preflight actual bookmark, reminder and deletion methods',async()=>{
  const ctx=await createApp(settings,{logger:false});
  try{for(const method of ['PUT','PATCH','DELETE']){const response=await ctx.app.inject({method:'OPTIONS',url:'/api/v1/profile/bookmarks',headers:{origin:'https://localhost','access-control-request-method':method,'access-control-request-headers':'authorization,content-type'}});assert.equal(response.statusCode,204);assert.equal(response.headers['access-control-allow-origin'],'https://localhost');assert.ok(String(response.headers['access-control-allow-methods']).split(',').map(x=>x.trim()).includes(method));}}
  finally{await ctx.app.close();}
});
test('runtime refuses fixture mode instead of silently accepting it',()=>{
  const previous=process.env.PROVIDER_MODE;
  try{process.env.PROVIDER_MODE='fixture';assert.throws(()=>loadConfig(settings),/Only PROVIDER_MODE=live/);}
  finally{if(previous===undefined)delete process.env.PROVIDER_MODE;else process.env.PROVIDER_MODE=previous;}
});
test('empty live database seeds configuration only and reports its initialisation state',async()=>{
  const ctx=await createApp(settings,{logger:false,fetcher:async()=>{throw new Error('No upstream expected');}});
  try{
    assert.equal(ctx.store.routes().length,0);assert.equal(ctx.store.stops().length,0);
    assert.equal((await ctx.app.inject('/api/v1/notices')).json().data.length,0);
    assert.equal((await ctx.app.inject('/api/health')).json().data.status,'initializing');
    assert.throws(()=>ctx.store.saveCatalog(fixtureRoutes.map(x=>({...x,source:'fixture'})),fixtureStops,[]),/Only live/);
  }finally{await ctx.app.close();}
});
test('legacy sample database is refused and its records remain available for recovery',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'hkbus-live-policy-')),databasePath=join(directory,'legacy.db');
  const store=new Store(databasePath),route={...fixtureRoutes[0]!,source:'fixture'};
  store.run('INSERT INTO routes VALUES(?,?,?,?,?,1)',route.id,route.routeNo,route.bound,route.serviceType,JSON.stringify(route));store.close();
  try{
    await assert.rejects(createApp({...settings,databasePath},{logger:false}),/SAMPLE_DATABASE_FORBIDDEN/);
    const preserved=new Store(databasePath);try{assert.equal(preserved.routes()[0]!.source,'fixture');}finally{preserved.close();}
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('home requires location or a chosen stop and does not imply arbitrary stops are nearby',async()=>{
  const ctx=await createTestApp();
  try{
    const none=(await ctx.app.inject('/api/v1/home')).json().data;
    assert.equal(none.nextBus,null);assert.deepEqual(none.nearbyStops,[]);assert.equal(none.selection,'none');
    assert.ok(none.warnings.some((x:{code:string})=>x.code==='LOCATION_REQUIRED'));
    const chosen=(await ctx.app.inject('/api/v1/home?stopId=stop-times')).json().data;
    assert.equal(chosen.selection,'selected');assert.equal(chosen.nextBus.stop.id,'stop-times');assert.equal(chosen.nearbyStops[0].distanceMeters,undefined);
    const far=(await ctx.app.inject('/api/v1/home?latitude=22.9&longitude=114.8')).json().data;
    assert.equal(far.nextBus,null);assert.deepEqual(far.nearbyStops,[]);assert.ok(far.warnings.some((x:{code:string})=>x.code==='NO_NEARBY_STOPS'));
  }finally{await ctx.app.close();}
});
test('legacy unverified notices stay private even if marked published',async()=>{
  const ctx=await createTestApp();
  try{
    const document:Notice={id:'legacy-notice',title:names('測試舊通告'),body:names('測試'),severity:'info',status:'published',validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+60000).toISOString(),routeIds:[],stopIds:[],platforms:['weapp'],sourceUrl:'',version:1,updatedAt:now(),updatedBy:'test'};
    ctx.store.saveNotice(document,'test');
    assert.deepEqual((await ctx.app.inject('/api/v1/notices?platform=weapp')).json().data,[]);
    assert.equal((await ctx.app.inject('/api/v1/notices/legacy-notice?platform=weapp')).statusCode,404);
    ctx.store.saveNotice({...document,source:'operator',version:2},'test');
    assert.equal((await ctx.app.inject('/api/v1/notices?platform=weapp')).json().data.length,1);
    assert.equal((await ctx.app.inject('/api/v1/notices?platform=tt')).json().data.length,0);
  }finally{await ctx.app.close();}
});
test('legacy or poisoned ETA cache cannot replace an official-provider request',async()=>{
  let calls=0;
  const ctx=await createApp(settings,{logger:false,fetcher:async(...args)=>{calls++;return testFetcher(...args);}});
  try{
    await ctx.providers.syncCatalog();calls=0;
    ctx.store.run('INSERT INTO cache VALUES(?,?,?,?,?)','eta:stop-times',JSON.stringify({arrivals:[{source:'fixture'}],generatedAt:now()}),now(),new Date(Date.now()+60000).toISOString(),new Date(Date.now()+180000).toISOString());
    const initial=await ctx.providers.arrivals('stop-times');assert.equal(calls,1);assert.ok(initial.arrivals.every(x=>x.source==='live'));
    const entry=ctx.store.get<{key:string}>('SELECT key FROM cache WHERE key LIKE ?', 'live:v2:%:eta:stop-times')!;
    ctx.store.run('UPDATE cache SET data=? WHERE key=?',JSON.stringify({arrivals:[{source:'fixture',stopId:'stop-times'}],generatedAt:now()}),entry.key);
    await ctx.providers.arrivals('stop-times');assert.equal(calls,2);
  }finally{await ctx.app.close();}
});
test('over-age upstream ETA stays unavailable and never triggers a reminder',async()=>{
  const ctx=await createApp(settings,{logger:false,fetcher:async(...args)=>{
    const response=await testFetcher(...args);
    if(!String(args[0]).includes('/stop-eta/'))return response;
    const body=await response.json() as {data:Record<string,unknown>[]};
    return new Response(JSON.stringify({...body,data:body.data.map(row=>({...row,data_timestamp:new Date(Date.now()-600000).toISOString()}))}),{status:200});
  }});
  try{
    await ctx.providers.syncCatalog();const result=await ctx.providers.arrivals('stop-times');
    assert.equal(result.freshness.state,'unavailable');assert.ok(result.arrivals.every(x=>x.status==='stale'));
    const session=(await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions'})).json().data;
    await ctx.app.inject({method:'PUT',url:'/api/v1/profile/reminders',headers:{authorization:'Bearer '+session.accessToken},payload:{stopId:'stop-times',routeId:'KMB:112:O:1',threshold:15}});
    await ctx.tick();assert.equal(ctx.store.get<{n:number}>('SELECT count(*) n FROM notifications')!.n,0);
    assert.equal(ctx.store.get<{status:string}>('SELECT status FROM reminders')!.status,'active');
  }finally{await ctx.app.close();}
});
