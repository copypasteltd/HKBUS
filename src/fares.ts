import {randomUUID} from 'node:crypto';
import {AppError,now,type Route} from './domain.js';
import type {Store} from './database.js';
import {FARE_BASE,FARE_SOURCE_URL,FARE_SPEC_URL,readOfficialXml,integer,moneyCents,stopCoordinates,mapRoute,routeSignature,type FareDirection,type FareMapping,type XmlRow,type SourceFile,type OrderedStop} from './fare-source.js';

export interface FareSource {provider:'TD';source:'live';url:string;specificationUrl:string;dataDate:string;syncedAt:string;files:SourceFile[];fareRows:number;directions:number}
export interface FareOption {dayCode:number|null;amountCents:number}
export interface FareQuote {state:'available'|'conditional'|'unavailable'|'stale';currency:'HKD';amountCents:number|null;options:FareOption[];reason:string|null;basis:'adult-single-undiscounted';routeId:string;boardSequence:number;alightSequence:number;source:FareSource|null;checkedAt:string|null;officialUrl:string}
const allowedDays=new Set([31,63,266,271,272,287,288,319,320,415,416,447,448,480,511]);
const unsupported=(message='官方收費資料校驗失敗；保留上一版完整資料')=>new AppError('FARE_SOURCE_INVALID',message,502,true);
export class Fares {
 private running:Promise<unknown>|null=null;private jobId:string|null=null;
 private directions=new Map<string,FareDirection>();private cacheVersion='';
 constructor(readonly store:Store,private fetcher:typeof fetch=fetch){}
 private source(){return this.store.setting<FareSource|null>('fareSource',null);}
 private direction(key:string){const source=this.source(),version=source?.syncedAt||'';if(version!==this.cacheVersion){this.directions.clear();this.cacheVersion=version;}let value=this.directions.get(key);if(!value){const row=this.store.get<{document:string}>('SELECT document FROM fare_directions WHERE id=?',key);if(row){value=JSON.parse(row.document) as FareDirection;this.directions.set(key,value);}}return value;}
 private mapping(route:Route,stops:OrderedStop[]){const row=this.store.get<{document:string}>('SELECT document FROM fare_mappings WHERE route_id=?',route.id);if(!row)return null;const mapped=JSON.parse(row.document) as FareMapping;return mapped.signature===routeSignature(route,stops)?mapped:null;}
 health(){const source=this.source(),checkedAt=this.store.setting<string|null>('fareCheckedAt',null),lastFailure=this.store.setting<{at:string;code:string}|null>('fareLastFailure',null);const stale=!!source&&(!checkedAt||Date.now()-Date.parse(checkedAt)>48*3600000||Date.now()-Date.parse(source.dataDate+'T00:00:00Z')>45*86400000||!!lastFailure&&(!checkedAt||lastFailure.at>checkedAt));return{state:!source?'unavailable':stale?'stale':'available',dataDate:source?.dataDate||null,checkedAt,lastFailure};}
 status(){
  const source=this.source(),checkedAt=this.store.setting<string|null>('fareCheckedAt',null),lastFailure=this.store.setting<{at:string;code:string}|null>('fareLastFailure',null);
  const stale=!!source&&(!checkedAt||Date.now()-Date.parse(checkedAt)>48*3600000||Date.now()-Date.parse(source.dataDate+'T00:00:00Z')>45*86400000||!!lastFailure&&(!checkedAt||lastFailure.at>checkedAt));
  const rows=this.store.all<{document:string}>('SELECT document FROM fare_mappings').map(x=>JSON.parse(x.document) as FareMapping),routes=this.store.routes();
  const coverage={total:routes.length,matched:0,partial:0,unmatched:0,ambiguous:0,changed:0};const byId=new Map(rows.map(x=>[x.routeId,x]));
  for(const route of routes){const m=byId.get(route.id);if(!m)coverage.unmatched++;else if(m.signature!==routeSignature(route,this.store.sequence(route.id)))coverage.changed++;else coverage[m.status]++;}
  return{state:!source?'unavailable':stale?'stale':'available',currency:'HKD',basis:'adult-single-undiscounted',source,checkedAt,lastFailure,runningJobId:this.jobId,coverage,limitations:'普通成人單程車費；未計轉乘、付款、兒童、長者或其他優惠。適用日未標示時不推定每天適用。',sourceUrl:FARE_SOURCE_URL};
 }
 quote(routeId:string,boardSequence:number,alightSequence:number,stops?:OrderedStop[]):FareQuote{
  const route=this.store.route(routeId);if(!route?.active)throw new AppError('ROUTE_NOT_FOUND','路線已停用或不存在',404);
  const sequence=stops||this.store.sequence(routeId),board=sequence.find(s=>s.sequence===boardSequence),alight=sequence.find(s=>s.sequence===alightSequence);
  if(!board||!alight||alightSequence<=boardSequence)throw new AppError('FARE_INVALID_STOPS','需要同一服務方向中依次排列的上車及下車站序',422);
  const source=this.source(),checkedAt=this.store.setting<string|null>('fareCheckedAt',null),fallbackUrl='https://search.kmb.hk/KMBWebSite/?action=routesearch&route='+encodeURIComponent(route.routeNo)+'&lang=zh-hk';
  const result:FareQuote={state:'unavailable',currency:'HKD',amountCents:null,options:[],reason:null,basis:'adult-single-undiscounted',routeId,boardSequence,alightSequence,source,checkedAt,officialUrl:fallbackUrl};
  const fail=(reason:string)=>({...result,reason});
  if(!source)return fail('NOT_SYNCED');
  const mapping=this.mapping(route,sequence);if(!mapping)return fail('CATALOG_CHANGED');if(!mapping.key)return fail(mapping.status==='ambiguous'?'ROUTE_AMBIGUOUS':'ROUTE_UNMATCHED');
  const direction=this.direction(mapping.key);if(!direction)return fail('NO_FARE');result.officialUrl=direction.officialUrl;
  const on=mapping.stopMap[sequence.indexOf(board)],off=mapping.stopMap[sequence.indexOf(alight)];if(on==null||off==null)return fail('STOP_UNMAPPED');
  const tdOn=direction.stops.find(s=>s.sequence===on),tdOff=direction.stops.find(s=>s.sequence===off);
  if(tdOn?.pickup===1)return fail('PICKUP_NOT_ALLOWED');if(tdOff?.pickup===2)return fail('DROPOFF_NOT_ALLOWED');
  result.options=direction.cells.filter(c=>c[0]===on&&c[1]===off).map(c=>({dayCode:c[2],amountCents:c[3]}));
  if(!result.options.length)return fail('NO_FARE');
  const failure=this.store.setting<{at:string}|null>('fareLastFailure',null),stale=!checkedAt||Date.now()-Date.parse(checkedAt)>48*3600000||Date.now()-Date.parse(source.dataDate+'T00:00:00Z')>45*86400000||!!failure&&failure.at>checkedAt;
  const unconditional=result.options.length===1&&[null,511].includes(result.options[0]!.dayCode);
  result.state=stale?'stale':unconditional?'available':'conditional';result.reason=stale?'STALE_SOURCE':unconditional?null:'CONDITIONAL';result.amountCents=unconditional?result.options[0]!.amountCents:null;
  return result;
 }
 route(routeId:string,stops?:OrderedStop[]){const sequence=stops||this.store.sequence(routeId);return sequence.length>1?{fullFare:this.quote(routeId,sequence[0]!.sequence,sequence.at(-1)!.sequence,sequence),boardingFares:sequence.map((s,i)=>i<sequence.length-1?this.quote(routeId,s.sequence,sequence.at(-1)!.sequence,sequence):null)}:{fullFare:null,boardingFares:[]};}
 journey<T extends {legs:{route:Route;board:OrderedStop;alight:OrderedStop}[]}>(journey:T){const legs=journey.legs.map(leg=>({...leg,fare:this.quote(leg.route.id,leg.board.sequence,leg.alight.sequence)}));const known=legs.filter(leg=>leg.fare.state==='available'&&leg.fare.amountCents!==null),knownSubtotalCents=known.reduce((total,leg)=>total+leg.fare.amountCents!,0);return{...journey,legs,pricing:{state:known.length===legs.length?'complete':known.length?'partial':'unavailable',currency:'HKD',totalCents:known.length===legs.length?knownSubtotalCents:null,knownSubtotalCents,pricedLegs:known.length,totalLegs:legs.length,basis:'adult-single-undiscounted',discountsApplied:false}};}
 async sync(){
  const versionResponse=await this.fetcher(FARE_BASE+'DATA_LAST_UPDATED_DATE.csv',{signal:AbortSignal.timeout(20000),redirect:'error'});if(!versionResponse.ok)throw new AppError('FARE_UPSTREAM_UNAVAILABLE','官方收費版本暫不可用',502,true);
  const version=await versionResponse.text();if(version.length>10000)throw unsupported();const match=version.match(/\b(\d{4}-\d{2}-\d{2})\b/);if(!match||!Number.isFinite(Date.parse(match[1]!)))throw unsupported();const dataDate=match[1]!;
  const current=this.source();let directions:FareDirection[]=[],files:SourceFile[]=[],fareRows=0;
  if(current?.dataDate===dataDate){directions=this.store.all<{document:string}>('SELECT document FROM fare_directions').map(x=>JSON.parse(x.document) as FareDirection);files=current.files;fareRows=current.fareRows;}
  else{
   const routeRows=new Map<string,XmlRow>(),coordinates=new Map<string,{latitude:number;longitude:number}>(),byKey=new Map<string,FareDirection>();
   files.push(await readOfficialXml(this.fetcher,'ROUTE_BUS.xml','ROUTE',r=>{if(r.COMPANY_CODE?.split('+').some(x=>x==='KMB'||x==='LWB')){integer(r.ROUTE_ID);if(routeRows.has(r.ROUTE_ID!))throw unsupported();moneyCents(r.FULL_FARE!);routeRows.set(r.ROUTE_ID!,r);}},5_000_000));
   files.push(await readOfficialXml(this.fetcher,'STOP_BUS.xml','STOP',r=>{integer(r.STOP_ID);if(coordinates.has(r.STOP_ID!))throw unsupported();coordinates.set(r.STOP_ID!,stopCoordinates(r.X!,r.Y!));},5_000_000));
   files.push(await readOfficialXml(this.fetcher,'RSTOP_BUS.xml','RSTOP',r=>{
    const route=routeRows.get(r.ROUTE_ID!);if(!route)return;integer(r.ROUTE_SEQ,1,2);const key=r.ROUTE_ID+':'+r.ROUTE_SEQ;
    let d=byKey.get(key);if(!d){const link=route.HYPERLINK_C||'';let officialUrl='';try{const u=new URL(link);if(u.protocol==='https:'&&['search.kmb.hk','www.kmb.hk','www.lwb.hk'].includes(u.hostname))officialUrl=u.href;}catch{}d={key,routeNo:route.ROUTE_NAMEE!,operator:route.COMPANY_CODE!,specialType:integer(route.SPECIAL_TYPE,0,3),fullFareCents:moneyCents(route.FULL_FARE!),officialUrl:officialUrl||'https://search.kmb.hk/KMBWebSite/?action=routesearch&route='+encodeURIComponent(route.ROUTE_NAMEE!)+'&lang=zh-hk',updatedAt:route.LAST_UPDATE_DATE!,stops:[],cells:[]};byKey.set(key,d);}
    const coordinate=coordinates.get(r.STOP_ID!);if(!coordinate)throw unsupported();d.stops.push({sequence:integer(r.STOP_SEQ,1,300),id:r.STOP_ID!,pickup:integer(r.STOP_PICK_DROP,1,3),name:{tc:r.STOP_NAMEC!,sc:r.STOP_NAMES!,en:r.STOP_NAMEE!},...coordinate});
   },35_000_000));
   for(const d of byKey.values()){d.stops.sort((a,b)=>a.sequence-b.sequence);if(d.stops.length<2||d.stops.some((s,i)=>s.sequence!==i+1))throw unsupported();}
   const duplicate=new Map<string,Set<number>>();
   files.push(await readOfficialXml(this.fetcher,'FARE_BUS.xml','FARE',r=>{
    const d=byKey.get(r.ROUTE_ID+':'+r.ROUTE_SEQ);if(!d)return;const on=integer(r.ON_SEQ,1,d.stops.length),off=integer(r.OFF_SEQ,1,d.stops.length);if(off<=on)throw unsupported();const day=r.DAY_CODE?integer(r.DAY_CODE):null;if(day!==null&&!allowedDays.has(day))throw unsupported();
    const key=(on*301+off)*512+(day||0),seen=duplicate.get(d.key)||new Set<number>();if(seen.has(key))throw unsupported();seen.add(key);duplicate.set(d.key,seen);d.cells.push([on,off,day,moneyCents(r.PRICE!)]);fareRows++;
   }));
   directions=[...byKey.values()].filter(d=>d.cells.length);if(!routeRows.size||!directions.length||!fareRows||files.some(file=>file.generatedDate!==dataDate))throw unsupported();
  }
  const mappings=this.store.routes().map(route=>mapRoute(route,this.store.sequence(route.id),directions));
  if(!mappings.length||!directions.length)throw unsupported('官方主資料尚未準備完成，請先同步路線與車站');
  const source:FareSource={provider:'TD',source:'live',url:FARE_SOURCE_URL,specificationUrl:FARE_SPEC_URL,dataDate,syncedAt:current?.dataDate===dataDate?current.syncedAt:now(),files,fareRows,directions:directions.length};
  this.store.transaction(()=>{
   this.store.db.exec('DELETE FROM fare_directions; DELETE FROM fare_mappings;');
   const insert=this.store.db.prepare('INSERT INTO fare_directions VALUES(?,?)'),mapInsert=this.store.db.prepare('INSERT INTO fare_mappings VALUES(?,?)');for(const d of directions)insert.run(d.key,JSON.stringify(d));for(const m of mappings)mapInsert.run(m.routeId,JSON.stringify(m));
   this.store.setSetting('fareSource',source);this.store.setSetting('fareCheckedAt',now());this.store.setSetting('fareCatalogAt',this.store.setting('catalogSyncedAt',null));this.store.setSetting('fareLastFailure',null);
  });this.directions.clear();return{dataDate,directions:directions.length,fareRows,matched:mappings.filter(m=>m.status==='matched').length,partial:mappings.filter(m=>m.status==='partial').length,unmatched:mappings.filter(m=>m.status==='unmatched').length,ambiguous:mappings.filter(m=>m.status==='ambiguous').length,unchanged:current?.dataDate===dataDate};
 }
 startSync(actor='system'){
  if(this.jobId)return this.jobId;const id=randomUUID();this.jobId=id;
  this.store.run('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)',id,'td-fares-sync','running',actor,now(),null,'{}');this.store.audit(actor,'fares.sync.start',id);
  const start=Date.now();this.running=this.sync().then(details=>{this.store.run('UPDATE jobs SET status=?,finished_at=?,details=? WHERE id=?','succeeded',now(),JSON.stringify(details),id);this.store.audit(actor,'fares.sync.complete',id,details);this.store.run('INSERT INTO provider_events VALUES(?,?,?,?,?,?,?)',randomUUID(),'TD_FARES','sync',1,Date.now()-start,null,now());}).catch(error=>{
   const code=error instanceof AppError?error.code:'FARE_SYNC_FAILED',details={code,message:'收費同步失敗；保留上一版完整資料'};this.store.setSetting('fareLastFailure',{at:now(),code});this.store.run('UPDATE jobs SET status=?,finished_at=?,details=? WHERE id=?','failed',now(),JSON.stringify(details),id);this.store.audit(actor,'fares.sync.failed',id,details);this.store.run('INSERT INTO provider_events VALUES(?,?,?,?,?,?,?)',randomUUID(),'TD_FARES','sync',0,Date.now()-start,code,now());
  }).finally(()=>{this.jobId=null;this.running=null;});return id;
 }
 due(){const checked=this.store.setting<string|null>('fareCheckedAt',null),catalog=this.store.setting('catalogSyncedAt',null),mapped=this.store.setting('fareCatalogAt',null),failed=this.store.setting<{at:string}|null>('fareLastFailure',null);if(failed&&Date.now()-Date.parse(failed.at)<3600000)return false;return!!this.store.routes().length&&(!checked||Date.now()-Date.parse(checked)>24*3600000||catalog!==mapped);}
 async settle(){await this.running;}
 adminItems(q:string,state:string){return this.store.routes().filter(route=>!q||JSON.stringify([route.routeNo,route.origin,route.destination]).toLowerCase().includes(q.toLowerCase())).map(route=>{const stops=this.store.sequence(route.id),mapping=this.mapping(route,stops);return{route,mapping:mapping||{status:'changed',matchedStops:0,totalStops:stops.length},fullFare:stops.length>1?this.quote(route.id,stops[0]!.sequence,stops.at(-1)!.sequence,stops):null};}).filter(row=>state==='all'||row.mapping.status===state);}
}
