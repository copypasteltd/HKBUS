import {randomBytes} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createApp} from '../src/app.js';
const report:{checkedAt:string;mode:string;checks:Record<string,unknown>[]}={checkedAt:new Date().toISOString(),mode:'live',checks:[]};
const ctx=await createApp({databasePath:':memory:',jwtSecret:randomBytes(48).toString('hex'),providerMode:'live',tdasEnabled:true,workerEnabled:false,providerTimeoutMs:15000},{logger:false});
try{
  try{const catalog=await ctx.providers.syncCatalog();report.checks.push({name:'KMB official catalogue',passed:true,...catalog});const route=ctx.store.routes().find(x=>x.routeNo==='112'&&x.bound==='O'&&x.serviceType==='1')||ctx.store.routes()[0]!;const stop=ctx.store.sequence(route.id)[5]||ctx.store.sequence(route.id)[0]!;const arrivals=await ctx.providers.arrivals(stop.id);report.checks.push({name:'KMB official ETA',passed:true,routeId:route.id,stopId:stop.id,arrivals:arrivals.arrivals.length,freshness:arrivals.freshness,containsFixture:arrivals.arrivals.some(x=>x.source==='fixture')});}catch(error){report.checks.push({name:'KMB official catalogue / ETA',passed:false,message:error instanceof Error?error.message:String(error)});}
  try{const result=await ctx.providers.roadRoute({start:{lat:22.2784,long:114.1828,buffer:200},end:{lat:22.2821,long:114.1581,buffer:200},departIn:0,lang:'tc',type:'ST'});report.checks.push({name:'TDAS official road route',passed:true,source:result.source,distanceMeters:result.distanceMeters,durationSeconds:result.durationSeconds});}catch(error){report.checks.push({name:'TDAS official road route',passed:false,message:error instanceof Error?error.message:String(error)});}
}finally{await ctx.app.close();}
const output=resolve(process.env.LIVE_SMOKE_REPORT||'./data/live-smoke.json');mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.checks.some(x=>x.passed===false))process.exitCode=1;
