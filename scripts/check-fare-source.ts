// Replay unmodified, downloaded official files against an isolated local database. Not runtime fixtures.
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createApp} from '../src/app.js';
import {normalizeRoute,normalizeStop} from '../src/providers.js';
import {FARE_BASE} from '../src/fare-source.js';
const dir=resolve(process.argv[2]||'../../output/fare-integration-2026-10-18/source');
const ctx=await createApp({databasePath:':memory:',jwtSecret:'local-official-source-validation-only-32chars',workerEnabled:false},{logger:false,fetcher:async(input)=>{const url=String(input);if(!url.startsWith(FARE_BASE))throw new Error('Unexpected request');return new Response(readFileSync(resolve(dir,url.slice(FARE_BASE.length))),{headers:{'Content-Type':'application/xml'}});}});
try{
const read=(name:string)=>JSON.parse(readFileSync(resolve(dir,name),'utf8')).data;
ctx.store.saveCatalog(read('kmb-route.json').map(normalizeRoute),read('kmb-stop.json').map(normalizeStop),read('kmb-route-stop.json').map((x:Record<string,string>)=>({routeId:['KMB',x.route,x.bound,x.service_type].join(':'),stopId:x.stop!,sequence:Number(x.seq)})));
const started=Date.now(),result=await ctx.fares.sync(),status=ctx.fares.status();
const examples=['KMB:112:O:1','KMB:112:I:1','KMB:48X:O:1','KMB:A43:O:1','KMB:1:O:1'].map(id=>({id,fares:ctx.fares.route(id)}));
const output={result,status,examples,elapsedMs:Date.now()-started,rssBytes:process.memoryUsage().rss};
const out=resolve(dir,'../../../docs/assets/fares/2026-10-18');mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'official-replay.json'),JSON.stringify(output,null,2));
console.log(JSON.stringify({result,coverage:status.coverage,elapsedMs:output.elapsedMs,rssBytes:output.rssBytes,examples:examples.map(x=>({id:x.id,fullFare:x.fares.fullFare?.amountCents,state:x.fares.fullFare?.state}))},null,2));
}finally{await ctx.app.close();}
