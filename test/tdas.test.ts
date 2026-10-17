import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AppError } from '../src/domain.js';
import { tdasInputSchema } from '../src/providers.js';

const key='isolated-test-egress-secret-with-at-least-32-characters';
const egress='https://owned-egress.example/api/route';
const input=tdasInputSchema.parse({start:{lat:22.2784,long:114.1828,buffer:200},end:{lat:22.2821,long:114.1581,buffer:200}});
// Contract examples for isolated tests only; the running provider always uses the official API.
const road={jSpeed:'41公里/小時',distM:3953,eta:'01:06',cht:false,eht:false,wht:false,route:[{start:{rid:2728},end:{rid:2722},segment:[{dir:3,rid:[2728]}]}],ar:[{name:'Alternative',distU:'4.5 km',eta:'00:08'}]};
const config={databasePath:':memory:',jwtSecret:'isolated-tdas-test-jwt-secret-at-least-32-characters',workerEnabled:false,tdasEgressUrl:egress,tdasEgressSecret:key,tdasMinIntervalMs:0};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
const problem=(code:string,status:number,retryable:boolean)=>(error:unknown)=>error instanceof AppError&&error.code===code&&error.status===status&&error.retryable===retryable;

test('TDAS egress authenticates privately, preserves official data, coalesces queries and caches for clients',async()=>{
  let calls=0;
  const fetcher:typeof fetch=async(url,options)=>{
    calls++;assert.equal(String(url),egress);assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer '+key);
    assert.deepEqual(JSON.parse(String(options?.body)),input);await new Promise(resolve=>setImmediate(resolve));return json(road);
  };
  const ctx=await createApp(config,{logger:false,fetcher});
  try{
    const [a,b]=await Promise.all([ctx.providers.roadRoute(input),ctx.providers.roadRoute(input)]);
    assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.provider,'TDAS');assert.equal(a.source,'live');
    assert.equal(a.durationSeconds,3960);assert.equal(a.distanceMeters,3953);assert.equal(a.averageSpeedKmh,41);assert.deepEqual(a.segments,road.route);assert.deepEqual(a.alternatives,road.ar);
    const response=await ctx.app.inject({method:'POST',url:'/api/v1/traffic/route',payload:input});assert.equal(response.statusCode,200);
    assert.equal(response.json().data.cached,true);assert.equal(response.json().meta.mode,'live');assert.ok(!response.body.includes(key));assert.ok(!response.body.includes(egress));assert.equal(calls,1);
    const event=ctx.store.get<{success:number;operation:string;code:string|null}>('SELECT success,operation,code FROM provider_events');assert.equal(event?.success,1);assert.equal(event?.operation,'road-route-egress');assert.equal(event?.code,null);
    const health=(await ctx.app.inject('/api/health')).json().data;
    assert.equal(health.dataServices.find((service:{provider:string})=>service.provider==='TDAS').state,'available');
    assert.equal(health.dataStatus,'unverified'); // KMB has not been queried; process health alone cannot prove it.
    assert.ok(!JSON.stringify(health).includes(key));assert.ok(!JSON.stringify(health).includes(egress));
  }finally{await ctx.app.close();}
});

test('direct TDAS stays available on hosts with official access and never receives the private egress key',async()=>{
  const ctx=await createApp({...config,tdasEgressUrl:'',tdasEgressSecret:''},{logger:false,fetcher:async(url,options)=>{
    assert.equal(String(url),'https://tdas-api.hkemobility.gov.hk/tdas/api/route');assert.equal(new Headers(options?.headers).get('Authorization'),null);return json(road);
  }});
  try{assert.equal((await ctx.providers.roadRoute(input)).source,'live');}finally{await ctx.app.close();}
});

test('road matching failures do not trip a provider outage and authentication or official denial is not retried',async()=>{
  let calls=0,status=400,upstreamStatus:number|undefined;
  const ctx=await createApp(config,{logger:false,fetcher:async()=>{calls++;return json({error:{code:'TDAS_UPSTREAM_HTTP',upstreamStatus}},status);}});
  try{
    for(let i=0;i<6;i++)await assert.rejects(ctx.providers.roadRoute(input),problem('ROAD_MATCH_FAILED',422,false));assert.equal(calls,6);
    assert.equal(ctx.providers.status().find(service=>service.provider==='TDAS')!.state,'available');
    status=401;await assert.rejects(ctx.providers.roadRoute(input),problem('TDAS_EGRESS_AUTH',503,false));assert.equal(calls,7);
    assert.equal(ctx.providers.status().find(service=>service.provider==='TDAS')!.state,'unavailable');
    status=502;upstreamStatus=403;await assert.rejects(ctx.providers.roadRoute(input),problem('UPSTREAM_FORBIDDEN',502,false));assert.equal(calls,8);
    const codes=ctx.store.all<{code:string}>('SELECT code FROM provider_events');assert.equal(codes.filter(x=>x.code==='ROAD_MATCH_FAILED').length,6);
  }finally{await ctx.app.close();}
});

test('transient TDAS failures retry and malformed results remain failed, uncached provider events',async()=>{
  let calls=0,invalid=false;
  const ctx=await createApp(config,{logger:false,fetcher:async()=>{calls++;return invalid?json({...road,eta:'00:99'}):calls===1?json({},503):json(road);}});
  try{
    assert.equal((await ctx.providers.roadRoute(input)).source,'live');assert.equal(calls,2);
    const variant={...input,lang:'en' as const};invalid=true;
    await assert.rejects(ctx.providers.roadRoute(variant),problem('UPSTREAM_SCHEMA',502,true));assert.equal(calls,4);
    assert.equal(ctx.store.get<{n:number}>('SELECT count(*) n FROM cache')!.n,1);
    assert.equal(ctx.store.get<{n:number}>('SELECT count(*) n FROM provider_events WHERE success=1')!.n,1);
    assert.equal(ctx.store.get<{n:number}>("SELECT count(*) n FROM provider_events WHERE code='UPSTREAM_SCHEMA'")!.n,2);
  }finally{await ctx.app.close();}
});

test('TDAS outage circuit is scoped to the failed transport and timeout errors stay explicit',async()=>{
  let calls=0;
  const ctx=await createApp(config,{logger:false,fetcher:async()=>{calls++;throw new DOMException('deadline','TimeoutError');}});
  try{
    const stamp=new Date().toISOString();
    for(let i=0;i<5;i++)ctx.store.run('INSERT INTO provider_events VALUES(?,?,?,?,?,?,?)','direct-'+i,'TDAS','road-route',0,1,'UPSTREAM_FORBIDDEN',stamp);
    for(let i=0;i<3;i++)await assert.rejects(ctx.providers.roadRoute(input),problem('UPSTREAM_TIMEOUT',504,true));
    assert.equal(calls,6);await assert.rejects(ctx.providers.roadRoute(input),problem('UPSTREAM_CIRCUIT_OPEN',503,true));assert.equal(calls,6);
  }finally{await ctx.app.close();}
});

test('partial or unsafe egress configuration fails startup without echoing credentials',()=>{
  const base={jwtSecret:config.jwtSecret,tdasEgressUrl:'',tdasEgressSecret:''};
  for(const bad of [{tdasEgressUrl:egress},{tdasEgressSecret:key},{tdasEgressUrl:'http://owned-egress.example/api/route',tdasEgressSecret:key},{tdasEgressUrl:egress+'?key=secret',tdasEgressSecret:key},{tdasEgressUrl:egress,tdasEgressSecret:'short'}]){
    assert.throws(()=>loadConfig({...base,...bad}),error=>error instanceof Error&&error.message.startsWith('TDAS_EGRESS_')&&!error.message.includes(key));
  }
  assert.equal(loadConfig({...base,tdasEgressUrl:egress,tdasEgressSecret:key}).tdasEgressUrl,egress);
});

test('different TDAS queries respect the configured upstream interval',async()=>{
  const starts:number[]=[];
  const ctx=await createApp({...config,tdasMinIntervalMs:50},{logger:false,fetcher:async()=>{starts.push(Date.now());return json(road);}});
  try{
    await Promise.all([ctx.providers.roadRoute(input),ctx.providers.roadRoute({...input,lang:'en'})]);
    assert.equal(starts.length,2);assert.ok(starts[1]!-starts[0]!>=40);
  }finally{await ctx.app.close();}
});

test('local TDAS backpressure is bounded, explicit and does not fabricate a provider failure',async()=>{
  let calls=0;
  const ctx=await createApp({...config,tdasMinIntervalMs:60000},{logger:false,fetcher:async()=>{calls++;return json(road);}});
  try{
    await ctx.providers.roadRoute(input);
    await assert.rejects(ctx.providers.roadRoute({...input,lang:'en'}),problem('TDAS_BUSY',429,true));assert.equal(calls,1);
    assert.equal(ctx.providers.status().find(service=>service.provider==='TDAS')!.state,'available');
    assert.equal(ctx.store.get<{n:number}>('SELECT count(*) n FROM provider_events')!.n,1);
    assert.equal((await ctx.providers.roadRoute(input)).cached,true);
  }finally{await ctx.app.close();}
});

test('a retry never waits beyond the overall TDAS deadline',async()=>{
  const actualNow=Date.now;let clock=actualNow(),calls=0;
  const ctx=await createApp({...config,tdasMinIntervalMs:20000},{logger:false,fetcher:async()=>{calls++;clock+=31000;throw new DOMException('deadline','TimeoutError');}});
  try{
    Date.now=()=>clock;
    await assert.rejects(ctx.providers.roadRoute(input),problem('UPSTREAM_TIMEOUT',504,true));assert.equal(calls,1);
  }finally{Date.now=actualNow;await ctx.app.close();}
});
