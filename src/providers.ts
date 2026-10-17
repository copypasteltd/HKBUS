import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError, now, names, type Arrival, type ArrivalResult, type RouteArrivalResult, type Freshness, type Route, type Stop } from './domain.js';
import type { Config } from './config.js';
import type { Store } from './database.js';

const text = z.string();
const numericText = z.union([z.string(),z.number()]).transform(String);
const numberValue = z.union([z.string(),z.number()]).transform(Number).refine(Number.isFinite);
const routeSchema = z.object({route:text,bound:z.enum(['O','I']),service_type:numericText,orig_tc:text,orig_sc:text,orig_en:text,dest_tc:text,dest_sc:text,dest_en:text});
const stopSchema = z.object({stop:text,name_tc:text,name_sc:text,name_en:text,lat:numberValue.refine(n=>n>=22&&n<=23),long:numberValue.refine(n=>n>=113&&n<=115)});
const relationSchema = z.object({route:text,bound:z.enum(['O','I']),service_type:numericText,seq:numberValue.refine(n=>Number.isInteger(n)&&n>0),stop:text});
const etaSchema = z.object({co:text.optional(),route:text,dir:z.enum(['O','I']),service_type:numericText,seq:numberValue,eta_seq:numberValue,eta:text.nullable(),dest_tc:text,dest_sc:text,dest_en:text,rmk_tc:text.optional().default(''),rmk_sc:text.optional().default(''),rmk_en:text.optional().default(''),data_timestamp:text});
const roadSchema=z.object({jSpeed:z.string(),distM:z.number().nonnegative(),eta:z.string(),route:z.array(z.unknown()),ar:z.array(z.object({name:z.string(),distU:z.string(),eta:z.string()})).optional()}).passthrough();
export const routeId = (route:string,bound:string,serviceType:string) => `KMB:${route}:${bound}:${serviceType}`;
export function normalizeRoute(raw: unknown): Route { const row=routeSchema.parse(raw);return {id:routeId(row.route,row.bound,row.service_type),routeNo:row.route,bound:row.bound,serviceType:row.service_type,operator:'KMB/LWB',origin:names(row.orig_tc,row.orig_en,row.orig_sc),destination:names(row.dest_tc,row.dest_en,row.dest_sc),source:'live'}; }
export function normalizeStop(raw: unknown): Stop { const row=stopSchema.parse(raw);return {id:row.stop,name:names(row.name_tc,row.name_en,row.name_sc),latitude:row.lat,longitude:row.long,source:'live'}; }
export function normalizeArrival(raw: unknown,stopId:string,clock=Date.now(),staleSeconds=180): Arrival {
  const row=etaSchema.parse(raw);
  const generated=Date.parse(row.data_timestamp);
  const eta=row.eta===null?null:Date.parse(row.eta);
  if(!Number.isFinite(generated)||(eta!==null&&!Number.isFinite(eta)))throw new AppError('UPSTREAM_SCHEMA','到站資料時間格式無法解析',502,true);
  const minutes=eta===null?null:Math.max(0,Math.ceil((eta-clock)/60000));
  return {id:[stopId,row.route,row.dir,row.service_type,row.seq,row.eta_seq].join(':'),routeId:routeId(row.route,row.dir,row.service_type),routeNo:row.route,bound:row.dir,serviceType:row.service_type,stopId,stopSequence:row.seq,destination:names(row.dest_tc,row.dest_en,row.dest_sc),eta:eta===null?null:new Date(eta).toISOString(),etaSequence:row.eta_seq,remark:names(row.rmk_tc,row.rmk_en,row.rmk_sc),generatedAt:new Date(generated).toISOString(),minutes,status:(clock-generated)/1000>staleSeconds?'stale':minutes===null?'no-estimate':minutes<=1?'approaching':'scheduled',source:'live'};
}
export function durationSeconds(value:string):number { if(!/^\d{1,3}:[0-5]\d$/.test(value))throw new AppError('UPSTREAM_SCHEMA','道路行駛時間格式無法解析',502,true);const [hours,minutes]=value.split(':').map(Number);return hours!*3600+minutes!*60; }
export const tdasInputSchema=z.object({start:z.object({lat:z.number().min(22).max(23),long:z.number().min(113).max(115),buffer:z.number().int().min(1).max(500).optional()}),end:z.object({lat:z.number().min(22).max(23),long:z.number().min(113).max(115),buffer:z.number().int().min(1).max(500).optional()}),departIn:z.union([z.literal(0),z.literal(15),z.literal(30),z.literal(45),z.literal(60),z.literal(75),z.literal(90)]).default(0),lang:z.enum(['tc','sc','en']).default('tc'),type:z.enum(['ST','SD']).default('ST'),tunnel:z.enum(['cht','eht','wht']).optional()}).refine(x=>x.start.lat!==x.end.lat||x.start.long!==x.end.long,{message:'起終點不能相同'});
export type TdasInput=z.infer<typeof tdasInputSchema>;
export type Fetcher=typeof fetch;
type CacheRow={data:string;fetched_at:string;expires_at:string;stale_until:string};

export class Providers {
  private inFlight=new Map<string,Promise<unknown>>();
  private jobs=new Set<Promise<unknown>>();
  private syncing:string|null=null;
  private nextTdasRequestAt=0;
  constructor(readonly store:Store,readonly config:Config,private fetcher:Fetcher=fetch){}
  status(){
    return (['KMB','TDAS'] as const).map(provider=>{
      const enabled=provider==='KMB'||this.config.tdasEnabled;
      const operation=provider==='TDAS'?(this.config.tdasEgressUrl?'road-route-egress':'road-route'):null;
      const event=this.store.get<{success:number;code:string|null;created_at:string}>('SELECT success,code,created_at FROM provider_events WHERE provider=?'+(operation?' AND operation=?':'')+' ORDER BY created_at DESC,rowid DESC LIMIT 1',...(operation?[provider,operation]:[provider]));
      const recent=!!event&&Date.now()-Date.parse(event.created_at)<=300000;
      const state=!enabled?'disabled':!recent?'unverified':event!.success||event!.code==='ROAD_MATCH_FAILED'?'available':'unavailable';
      return{provider,enabled,transport:provider==='TDAS'&&this.config.tdasEgressUrl?'authenticated-egress':'direct',state,checkedAt:event?.created_at||null,lastCode:event?.code||null};
    });
  }
  private async tdasSlot(deadline:number){
    const at=Date.now(),scheduled=Math.max(at,this.nextTdasRequestAt),wait=scheduled-at;
    if(wait>20000)throw new AppError('TDAS_BUSY','道路查詢繁忙，請稍後重試',429,true);
    if(scheduled>=deadline)throw new AppError('UPSTREAM_TIMEOUT','道路查詢逾時，請稍後重試',504,true);
    this.nextTdasRequestAt=scheduled+this.config.tdasMinIntervalMs;
    if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  }
  private async request<T=unknown>(provider:'KMB'|'TDAS',operation:string,url:string,body?:unknown,options:{headers?:Record<string,string>;validate?:(data:unknown)=>T}={}):Promise<T>{
    const recent=this.store.all<{success:number;created_at:string}>("SELECT success,created_at FROM provider_events WHERE provider=? AND operation=? AND (code IS NULL OR code<>'ROAD_MATCH_FAILED') ORDER BY created_at DESC,rowid DESC LIMIT 5",provider,operation);
    if(recent.length===5&&recent.every(x=>!x.success)&&Date.now()-Date.parse(recent[0]!.created_at)<30000)throw new AppError('UPSTREAM_CIRCUIT_OPEN','資料服務暫時不可用，請稍後重試',503,true);
    const deadline=Date.now()+30000;
    for(let attempt=0;attempt<2;attempt++){
      if(provider==='TDAS')await this.tdasSlot(deadline);
      const start=Date.now();let failure:unknown;
      try{
        const timeout=provider==='TDAS'?Math.min(this.config.providerTimeoutMs,deadline-Date.now()):this.config.providerTimeoutMs;
        if(timeout<=0)throw new AppError('UPSTREAM_TIMEOUT','道路查詢逾時，請稍後重試',504,true);
        const response=await this.fetcher(url,{method:body?'POST':'GET',headers:{Accept:'application/json','User-Agent':'HKBusGo/1.0',...(body?{'Content-Type':'application/json'}:{}),...options.headers},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
        if(!response.ok){
          if(provider==='TDAS'&&response.status===400)throw new AppError('ROAD_MATCH_FAILED','沒有合適道路，請調整起終點位置',422,false);
          if(operation==='road-route-egress'&&(response.status===401||response.status===403))throw new AppError('TDAS_EGRESS_AUTH','道路資料出口認證失敗，請聯絡管理員',503,false);
          let upstreamStatus=response.status;
          if(operation==='road-route-egress'){
            const detail=await response.json().catch(()=>null) as {error?:{code?:string;upstreamStatus?:number}}|null;
            if(detail?.error?.code==='TDAS_UPSTREAM_SCHEMA')throw new AppError('UPSTREAM_SCHEMA','道路資料格式無法解析',502,true);
            if(detail?.error?.code==='TDAS_UPSTREAM_TIMEOUT')throw new AppError('UPSTREAM_TIMEOUT','道路資料連線逾時，請稍後重試',504,true);
            if(detail?.error?.code==='TDAS_UPSTREAM_CONNECTION')throw new AppError('UPSTREAM_CONNECTION','道路資料連線失敗，請稍後重試',502,true);
            if(Number.isInteger(detail?.error?.upstreamStatus))upstreamStatus=detail!.error!.upstreamStatus!;
          }
          if(upstreamStatus===401||upstreamStatus===403)throw new AppError('UPSTREAM_FORBIDDEN','資料供應商拒絕請求，請聯絡管理員',502,false);
          if(upstreamStatus===429)throw new AppError('UPSTREAM_RATE_LIMIT','資料供應商繁忙，請稍後重試',503,true);
          throw new AppError('UPSTREAM_HTTP','資料供應商暫時不可用',502,upstreamStatus>=500||upstreamStatus===408);
        }
        let data:unknown;
        try{data=await response.json();}catch{throw new AppError('UPSTREAM_SCHEMA','資料供應商回應不是有效 JSON',502,true);}
        const result=options.validate?options.validate(data):data as T;
        this.store.run('INSERT INTO provider_events VALUES(?,?,?,?,?,?,?)',randomUUID(),provider,operation,1,Date.now()-start,null,now());return result;
      }catch(error){
        const timeout=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');
        const problem=error instanceof AppError?error:error instanceof z.ZodError?new AppError('UPSTREAM_SCHEMA','資料供應商回應格式無法解析',502,true):new AppError(timeout?'UPSTREAM_TIMEOUT':'UPSTREAM_CONNECTION',timeout?'資料服務連線逾時，請稍後重試':'資料服務連線失敗，請稍後重試',timeout?504:502,true);
        failure=problem;
        const code=problem.code;
        this.store.run('INSERT INTO provider_events VALUES(?,?,?,?,?,?,?)',randomUUID(),provider,operation,0,Date.now()-start,code,now());
        if(!problem.retryable||attempt===1)throw problem;
      }
      if(failure)await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw new AppError('UPSTREAM_UNAVAILABLE','資料供應商暫時不可用',502,true);
  }
  private async deduplicate<T>(key:string,fn:()=>Promise<T>):Promise<T>{
    const current=this.inFlight.get(key);if(current)return current as Promise<T>;
    const task=fn();this.inFlight.set(key,task);try{return await task;}finally{this.inFlight.delete(key);}
  }
  private cache(key:string){return this.store.get<CacheRow>('SELECT * FROM cache WHERE key=?',key);}
  private writeCache(key:string,data:unknown,ttl:number,stale:number){const at=Date.now();this.store.run('INSERT INTO cache VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at,stale_until=excluded.stale_until',key,JSON.stringify(data),new Date(at).toISOString(),new Date(at+ttl*1000).toISOString(),new Date(at+stale*1000).toISOString());}
  startSync(actor='system'):string{
    if(this.syncing)return this.syncing;
    const id=randomUUID();this.syncing=id;this.store.run('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)',id,'catalog-sync','running',actor,now(),null,'{}');
    const task=this.syncCatalog().then(result=>{this.store.run('UPDATE jobs SET status=?,finished_at=?,details=? WHERE id=?','succeeded',now(),JSON.stringify(result),id);this.store.audit(actor,'catalog.sync',id,result);}).catch(error=>{this.store.run('UPDATE jobs SET status=?,finished_at=?,details=? WHERE id=?','failed',now(),JSON.stringify({code:error instanceof AppError?error.code:'SCHEMA_INVALID',message:'同步失敗；已保留上一版完整主資料'}),id);}).finally(()=>{this.syncing=null;this.jobs.delete(task);});
    this.jobs.add(task);return id;
  }
  async settle(){await Promise.allSettled([...this.jobs,...this.inFlight.values()]);}
  async syncCatalog(){
    const base=this.config.kmbBaseUrl.replace(/\/$/,'');
    const replies=await Promise.allSettled([this.request('KMB','catalog-routes',base+'/route/'),this.request('KMB','catalog-stops',base+'/stop'),this.request('KMB','catalog-sequences',base+'/route-stop')]);
    if(replies.some(r=>r.status==='rejected'))throw new AppError('CATALOG_SYNC_FAILED','主資料同步失敗，保留上一個版本',502,true);
    const values=replies.map(reply=>reply.status==='fulfilled'?reply.value:undefined);
    const envelope=z.object({data:z.array(z.unknown()).min(1)});
    const routes=envelope.parse(values[0]).data.map(normalizeRoute),stops=envelope.parse(values[1]).data.map(normalizeStop);
    const routeIds=new Set(routes.map(x=>x.id)),stopIds=new Set(stops.map(x=>x.id));
    const sequence=envelope.parse(values[2]).data.map(x=>{const row=relationSchema.parse(x);return{routeId:routeId(row.route,row.bound,row.service_type),sequence:row.seq,stopId:row.stop};});
    if(sequence.some(x=>!routeIds.has(x.routeId)||!stopIds.has(x.stopId)))throw new AppError('CATALOG_REFERENCE_INVALID','站序與主資料不一致，未發佈本次同步',502,true);
    this.store.saveCatalog(routes,stops,sequence);
    return {routes:routes.length,stops:stops.length,relations:sequence.length,mode:'live'};
  }
  async arrivals(stopId:string,force=false):Promise<ArrivalResult>{
    const stop=this.store.stop(stopId);if(!stop||!stop.active)throw new AppError('STOP_NOT_FOUND','車站已停用或不存在',404);
    const routes=this.store.routesAt(stopId);
    const policy=this.store.setting('freshness',{etaFreshSeconds:60,etaStaleSeconds:180,cacheSeconds:15});
    if(stop.source!=='live'||routes.some(x=>x.source!=='live'))throw new AppError('NON_LIVE_DATA','車站主資料來源尚未核實，請重新同步官方資料',503,true);
    const key='live:v2:'+createHash('sha256').update(this.config.kmbBaseUrl).digest('hex').slice(0,16)+':eta:'+stopId;
    const stored=this.cache(key);
    const isLiveCache=(row:CacheRow)=>{try{const data=JSON.parse(row.data) as {arrivals:Arrival[];generatedAt:string};return Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.arrivals)&&data.arrivals.every(x=>x.source==='live'&&x.stopId===stopId);}catch{return false;}};
    const cache=stored&&isLiveCache(stored)?stored:undefined;
    const result=(row:CacheRow,cached:boolean,warning?:string):ArrivalResult=>{
      const payload=JSON.parse(row.data) as {arrivals:Arrival[];generatedAt:string};
      const age=(Date.now()-Date.parse(payload.generatedAt))/1000;
      const state:Freshness['state']=age>policy.etaStaleSeconds?'unavailable':warning||age>policy.etaFreshSeconds?'stale':'fresh';
      const arrivals=payload.arrivals.filter(x=>x.eta===null||Date.parse(x.eta)>=Date.now()-60000).map(x=>({...x,minutes:x.eta===null?null:Math.max(0,Math.ceil((Date.parse(x.eta)-Date.now())/60000)),...(state!=='fresh'||(Date.now()-Date.parse(x.generatedAt))/1000>policy.etaFreshSeconds?{status:'stale' as const}:{})}));
      return{stop,arrivals,routes,freshness:{state,generatedAt:payload.generatedAt,fetchedAt:row.fetched_at,cached,source:'live',provider:'KMB'},...(warning?{warning}:{})};
    };
    if(!force&&cache&&Date.parse(cache.expires_at)>Date.now())return result(cache,true);
    return this.deduplicate(key,async()=>{
      try{
        const raw=z.object({generated_timestamp:z.string().optional(),data:z.array(z.unknown())}).parse(await this.request('KMB','stop-eta',this.config.kmbBaseUrl.replace(/\/$/,'')+'/stop-eta/'+encodeURIComponent(stopId)));
        const identities=new Map(routes.map(route=>[route.id,new Set(this.store.sequence(route.id).filter(stop=>stop.id===stopId).map(stop=>stop.sequence))]));
        const arrivals=raw.data.map(row=>normalizeArrival(row,stopId,Date.now(),policy.etaFreshSeconds)).filter(row=>identities.get(row.routeId)?.has(row.stopSequence)).sort((a,b)=>a.routeNo.localeCompare(b.routeNo,undefined,{numeric:true})||a.bound.localeCompare(b.bound)||a.serviceType.localeCompare(b.serviceType)||a.stopSequence-b.stopSequence||a.etaSequence-b.etaSequence);
        const generatedAt=arrivals.map(x=>x.generatedAt).sort().at(-1)||raw.generated_timestamp||'';
        if(!Number.isFinite(Date.parse(generatedAt)))throw new AppError('UPSTREAM_SCHEMA','到站資料時間無法解析',502,true);
        this.writeCache(key,{arrivals,generatedAt},policy.cacheSeconds,policy.etaStaleSeconds);
        return result(this.cache(key)!,false);
      }catch(error){
        if(cache&&Date.parse(cache.stale_until)>Date.now())return result(cache,true,'最新資料暫時無法更新，顯示上次結果');
        if(error instanceof z.ZodError)throw new AppError('UPSTREAM_SCHEMA','到站資料格式改變，請稍後重試',502,true);
        throw error;
      }
    });
  }
  async routeArrivals(id:string,force=false):Promise<RouteArrivalResult>{
    const route=this.store.route(id);if(!route?.active)throw new AppError('ROUTE_NOT_FOUND','路線已停用或不存在',404);
    const stops=this.store.sequence(id);
    if(route.source!=='live'||stops.some(stop=>stop.source!=='live'))throw new AppError('NON_LIVE_DATA','路線主資料來源尚未核實，請重新同步官方資料',503,true);
    if(!stops.length)throw new AppError('ROUTE_STOPS_UNAVAILABLE','路線站序尚未就緒，請稍後重試',503,true);
    const bySequence=new Map(stops.map(stop=>[stop.sequence,stop]));
    const policy=this.store.setting('freshness',{etaFreshSeconds:60,etaStaleSeconds:180,cacheSeconds:15});
    const key='live:v1:'+createHash('sha256').update(this.config.kmbBaseUrl).digest('hex').slice(0,16)+':route-eta:'+id;
    const stored=this.cache(key);
    const isLiveCache=(row:CacheRow)=>{try{const data=JSON.parse(row.data) as {arrivals:Arrival[];generatedAt:string};return Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.arrivals)&&data.arrivals.every(x=>x.source==='live'&&x.routeId===id&&bySequence.get(x.stopSequence)?.id===x.stopId);}catch{return false;}};
    const cache=stored&&isLiveCache(stored)?stored:undefined;
    const result=(row:CacheRow,cached:boolean,warning?:string):RouteArrivalResult=>{
      const payload=JSON.parse(row.data) as {arrivals:Arrival[];generatedAt:string};
      const clock=Date.now(),age=(clock-Date.parse(payload.generatedAt))/1000;
      const state:Freshness['state']=age>policy.etaStaleSeconds?'unavailable':warning||age>policy.etaFreshSeconds?'stale':'fresh';
      const arrivals=payload.arrivals.filter(x=>x.eta===null||Date.parse(x.eta)>=clock-60000).map(x=>({...x,minutes:x.eta===null?null:Math.max(0,Math.ceil((Date.parse(x.eta)-clock)/60000)),...(state!=='fresh'||(clock-Date.parse(x.generatedAt))/1000>policy.etaFreshSeconds?{status:'stale' as const}:{})}));
      return{route,stops,arrivals,freshness:{state,generatedAt:payload.generatedAt,fetchedAt:row.fetched_at,cached,source:'live',provider:'KMB'},...(warning?{warning}:{})};
    };
    if(!force&&cache&&Date.parse(cache.expires_at)>Date.now())return result(cache,true);
    return this.deduplicate(key,async()=>{
      try{
        const raw=await this.request('KMB','route-eta',this.config.kmbBaseUrl.replace(/\/$/,'')+'/route-eta/'+encodeURIComponent(route.routeNo)+'/'+encodeURIComponent(route.serviceType),undefined,{validate:value=>z.object({generated_timestamp:z.string().optional(),data:z.array(etaSchema)}).parse(value)});
        // The official response includes both directions and has no stop ID. Only the
        // requested identity and its exact sequence may supply the station mapping.
        const arrivals=raw.data.filter(row=>routeId(row.route,row.dir,row.service_type)===id&&bySequence.has(row.seq)).map(row=>normalizeArrival(row,bySequence.get(row.seq)!.id,Date.now(),policy.etaFreshSeconds)).sort((a,b)=>a.stopSequence-b.stopSequence||a.etaSequence-b.etaSequence);
        const generatedAt=arrivals.map(x=>x.generatedAt).sort().at(-1)||raw.generated_timestamp||'';
        if(!Number.isFinite(Date.parse(generatedAt)))throw new AppError('UPSTREAM_SCHEMA','到站資料時間無法解析',502,true);
        this.writeCache(key,{arrivals,generatedAt},policy.cacheSeconds,policy.etaStaleSeconds);
        return result(this.cache(key)!,false);
      }catch(error){
        if(cache&&Date.parse(cache.stale_until)>Date.now())return result(cache,true,'最新資料暫時無法更新，顯示上次結果');
        if(error instanceof z.ZodError)throw new AppError('UPSTREAM_SCHEMA','到站資料格式改變，請稍後重試',502,true);
        throw error;
      }
    });
  }
  async roadRoute(input:TdasInput){
    if(!this.config.tdasEnabled)throw new AppError('TDAS_DISABLED','道路交通參考尚未啟用',503,false);
    const egress=!!this.config.tdasEgressUrl,url=egress?this.config.tdasEgressUrl:this.config.tdasBaseUrl;
    const key='live:v3:tdas:'+createHash('sha256').update(url+JSON.stringify(input)).digest('hex');const cache=this.cache(key);
    if(cache&&Date.parse(cache.expires_at)>Date.now()){
      try{const data=JSON.parse(cache.data);if(data.source==='live'&&data.provider==='TDAS'&&Number.isFinite(data.distanceMeters)&&Number.isFinite(data.durationSeconds)&&Number.isFinite(Date.parse(data.generatedAt))&&Array.isArray(data.segments))return {...data,cached:true};}catch{/* An invalid cache entry must not block a fresh official query. */}
    }
    return this.deduplicate(key,async()=>{
      const reply=await this.request('TDAS',egress?'road-route-egress':'road-route',url,input,{...(egress?{headers:{Authorization:'Bearer '+this.config.tdasEgressSecret}}:{}),validate:raw=>{const parsed=roadSchema.parse(raw);durationSeconds(parsed.eta);return parsed;}});
      const speed=Number.parseFloat(reply.jSpeed);
      const result={provider:'TDAS',source:'live' as const,distanceMeters:reply.distM,durationSeconds:durationSeconds(reply.eta),averageSpeedKmh:Number.isFinite(speed)?speed:null,generatedAt:now(),cached:false,departIn:input.departIn,routeType:input.type,tunnels:{cht:reply.cht===true,eht:reply.eht===true,wht:reply.wht===true},segments:reply.route,alternatives:reply.ar||[],notice:'道路交通參考，不代表巴士到站、候車或乘車時間'};
      this.writeCache(key,result,60,60);return result;
    });
  }
}
