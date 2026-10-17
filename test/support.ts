// Synthetic input is confined to automated tests. The application has no fixture provider.
import { createApp } from '../src/app.js';
import { names, type Route, type Stop } from '../src/domain.js';
import type { Config } from '../src/config.js';
export const fixtureStops: Stop[] = [
  ['stop-times','測試站甲','Test A',22.2784,114.1828],
  ['stop-central','測試站乙','Test B',22.2821,114.1581],
  ['stop-hennessy','測試站丙','Test C',22.2786,114.1802],
  ['stop-wan-chai','測試站丁','Test D',22.2833,114.1764],
  ['stop-kennedy','測試站戊','Test E',22.2844,114.1284],
  ['stop-paterson','測試站己','Test F',22.2807,114.1848]
].map(row=>({id:String(row[0]),name:names(String(row[1]),String(row[2])),latitude:Number(row[3]),longitude:Number(row[4]),source:'live'}));
export const fixtureRoutes: Route[] = ['112','2A','6X','102','116'].flatMap(routeNo=>(['O','I'] as const).map(bound=>({id:`KMB:${routeNo}:${bound}:1`,routeNo,bound,serviceType:'1',operator:'KMB/LWB',origin:names('測試起點','Test origin'),destination:names('測試終點','Test destination'),source:'live'})));
const sequences:Record<string,string[]>={'112':['stop-times','stop-paterson','stop-wan-chai','stop-central','stop-kennedy'],'2A':['stop-times','stop-hennessy','stop-wan-chai','stop-central'],'6X':['stop-central','stop-hennessy','stop-wan-chai'],'102':['stop-hennessy','stop-central','stop-kennedy'],'116':['stop-times','stop-paterson']};
export const fixtureRelations=fixtureRoutes.flatMap(route=>(route.bound==='O'?sequences[route.routeNo]!:sequences[route.routeNo]!.slice().reverse()).map((stopId,index)=>({routeId:route.id,stopId,sequence:index+1})));
export const testFetcher:typeof fetch=async(input)=>{
  const url=new URL(String(input)).origin+new URL(String(input)).pathname;
  let data:unknown;
  if(url.endsWith('/route/'))data=fixtureRoutes.map(x=>({route:x.routeNo,bound:x.bound,service_type:x.serviceType,orig_tc:x.origin.tc,orig_sc:x.origin.sc,orig_en:x.origin.en,dest_tc:x.destination.tc,dest_sc:x.destination.sc,dest_en:x.destination.en}));
  else if(url.endsWith('/stop'))data=fixtureStops.map(x=>({stop:x.id,name_tc:x.name.tc,name_sc:x.name.sc,name_en:x.name.en,lat:x.latitude,long:x.longitude}));
  else if(url.endsWith('/route-stop'))data=fixtureRelations.map(x=>{const route=fixtureRoutes.find(r=>r.id===x.routeId)!;return{route:route.routeNo,bound:route.bound,service_type:route.serviceType,seq:x.sequence,stop:x.stopId};});
  else if(url.includes('/stop-eta/')){const stopId=decodeURIComponent(url.split('/').pop()!);data=fixtureRelations.filter(x=>x.stopId===stopId).flatMap(x=>{const route=fixtureRoutes.find(r=>r.id===x.routeId)!;return[1,2,3].map(sequence=>({co:'KMB',route:route.routeNo,dir:route.bound,service_type:route.serviceType,seq:x.sequence,eta_seq:sequence,eta:new Date(Date.now()+(3+(sequence-1)*8)*60000).toISOString(),dest_tc:route.destination.tc,dest_sc:route.destination.sc,dest_en:route.destination.en,rmk_tc:'測試',rmk_sc:'测试',rmk_en:'Test',data_timestamp:new Date().toISOString()}));});}
  else throw new Error('Unexpected test upstream: '+url);
  return new Response(JSON.stringify({generated_timestamp:new Date().toISOString(),data}),{status:200,headers:{'Content-Type':'application/json'}});
};
export async function createTestApp(overrides:Partial<Config>={}){
  const ctx=await createApp({databasePath:':memory:',jwtSecret:'isolated-test-only-secret-at-least-32-characters',providerMode:'live',workerEnabled:false,...overrides},{logger:false,fetcher:testFetcher});
  await ctx.providers.syncCatalog();
  return ctx;
}
