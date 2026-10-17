import { z } from 'zod';
import { AppError, haversine, now, type Stop, type Route } from './domain.js';
import { add, payload, type Context } from './app.js';
import { tdasInputSchema } from './providers.js';
import { publicNotices, planJourney } from './usecases.js';
export const idSchema=z.object({id:z.string().min(1).max(120)});
export const pageSchema=z.object({q:z.string().max(100).default(''),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(30)});
function contains(value:unknown,q:string){return JSON.stringify(value).toLocaleLowerCase().includes(q.toLocaleLowerCase());}
export function paginate<T>(items:T[],page:number,pageSize:number){return{items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize};}
export function registerPublic(ctx:Context){
  const {store,providers,fares,config}=ctx;
  const features=()=>{const value=store.setting('features',{reminders:false,traffic:false,planner:false,map:true});return{...value,traffic:value.traffic&&config.tdasEnabled};};
  add(ctx,'GET','/api/health','服務健康與最近五分鐘資料來源結果',async request=>{const dataServices=providers.status(),active=dataServices.filter(service=>service.enabled);return payload(ctx,request,{status:store.routes().length?'ok':'initializing',version:'1.0.0',database:'ready',catalogRoutes:store.routes().length,catalogSyncedAt:store.setting('catalogSyncedAt',null),source:'live',dataStatus:active.some(service=>service.state==='unavailable')?'degraded':active.every(service=>service.state==='available')?'healthy':'unverified',dataServices,fareData:fares.health()});});
  add(ctx,'GET','/api/v1/config','產品能力、來源與內容設定',async request=>payload(ctx,request,{product:{name:'港巴通',version:'1.0.0',coverage:'KMB/LWB'},features:features(),content:store.setting('content',{}),mode:config.providerMode,dataPolicy:{liveOnly:true,cacheVersion:3,notices:'operator-managed',fares:'TD-official-undiscounted'},shareBaseUrl:config.publicAppUrl,tdasEnabled:config.tdasEnabled,catalogSyncedAt:store.setting('catalogSyncedAt',null),sources:[{name:'KMB ETA',url:'https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb'},{name:'TDAS',url:'https://tdas-api.hkemobility.gov.hk/tdas/specification/TD_TDAS_API_Specifications.pdf'},{name:'TD Routes and Fares',url:'https://data.gov.hk/tc-data/dataset/hk-td-tis_14-routes-fares-xml'}]}));
  add(ctx,'GET','/api/v1/routes','路線方向列表與搜尋',async request=>{const q=pageSchema.parse(request.query);return payload(ctx,request,paginate(store.routes().filter(route=>!q.q||contains([route.routeNo,route.origin,route.destination],q.q)),q.page,q.pageSize));});
  add(ctx,'GET','/api/v1/routes/:id','路線方向、完整站序與官方收費',async request=>{const {id}=idSchema.parse(request.params);const route=store.route(id);if(!route?.active)throw new AppError('ROUTE_NOT_FOUND','路線已停用或不存在',404);const stops=store.sequence(id);return payload(ctx,request,{route,stops,directions:store.routes().filter(x=>x.routeNo===route.routeNo&&x.serviceType===route.serviceType),fares:fares.route(id,stops)});});
  add(ctx,'GET','/api/v1/routes/:id/fare','按明確站序查詢官方普通成人單程車費',async request=>{const {id}=idSchema.parse(request.params),q=z.object({boardSequence:z.coerce.number().int().min(1).max(300),alightSequence:z.coerce.number().int().min(1).max(300),boardStopId:z.string().min(1).max(120).optional(),alightStopId:z.string().min(1).max(120).optional()}).refine(q=>(q.boardStopId===undefined)===(q.alightStopId===undefined),'需要完整的上下車站編號').parse(request.query);const quote=fares.quote(id,q.boardSequence,q.alightSequence);if(q.boardStopId!==undefined&&(q.boardStopId!==quote.boardStopId||q.alightStopId!==quote.alightStopId))throw new AppError('FARE_STOPS_CHANGED','所選車站的站序已更新，請重新整理路線後再查詢車費',409,true);return payload(ctx,request,quote);});
  add(ctx,'GET','/api/v1/fares/status','官方收費資料版本與覆蓋情況',async request=>payload(ctx,request,fares.status()));
  add(ctx,'GET','/api/v1/routes/:id/arrivals','整條路線沿途到站、方向、服務類型與站序',async request=>{const {id}=idSchema.parse(request.params);const q=z.object({force:z.enum(['true','false']).default('false')}).parse(request.query);return payload(ctx,request,await providers.routeArrivals(id,q.force==='true'));});
  add(ctx,'GET','/api/v1/stops','車站搜尋與附近排序',async request=>{
    const q=pageSchema.extend({latitude:z.coerce.number().min(22).max(23).optional(),longitude:z.coerce.number().min(113).max(115).optional(),radius:z.coerce.number().min(100).max(10000).default(1500),walking:z.coerce.number().min(1).max(120).optional()}).parse(request.query);
    if((q.latitude===undefined)!==(q.longitude===undefined))throw new AppError('COORDINATES_REQUIRED','需要完整的位置座標',422);
    let stops=store.stops().filter(stop=>!q.q||contains([stop.id,stop.name],q.q));
    if(q.latitude!==undefined&&q.longitude!==undefined)stops=stops.map(stop=>{const distanceMeters=haversine(q.latitude!,q.longitude!,stop.latitude,stop.longitude);return{...stop,distanceMeters,walkingMinutes:Math.ceil(distanceMeters/75)};}).filter(stop=>(stop.distanceMeters||0)<=q.radius&&(!q.walking||(stop.walkingMinutes||0)<=q.walking)).sort((a,b)=>(a.distanceMeters||0)-(b.distanceMeters||0));
    const result=paginate(stops,q.page,q.pageSize);return payload(ctx,request,{...result,items:result.items.map(stop=>({...stop,routes:store.routesAt(stop.id)})),distanceKind:'straight-line',walkingEstimate:'distance/75m-per-minute'});
  });
  add(ctx,'GET','/api/v1/stops/:id','車站與途經路線',async request=>{const {id}=idSchema.parse(request.params);const stop=store.stop(id);if(!stop?.active)throw new AppError('STOP_NOT_FOUND','車站已停用或不存在',404);return payload(ctx,request,{stop,routes:store.routesAt(id)});});
  add(ctx,'GET','/api/v1/stops/:id/arrivals','站點到站、方向、新鮮度與降級',async request=>{const {id}=idSchema.parse(request.params);const q=z.object({routeId:z.string().max(120).optional(),force:z.enum(['true','false']).default('false')}).parse(request.query);const result=await providers.arrivals(id,q.force==='true');return payload(ctx,request,{...result,arrivals:q.routeId?result.arrivals.filter(x=>x.routeId===q.routeId):result.arrivals});});
  add(ctx,'GET','/api/v1/search','三語路線與車站搜尋',async request=>{
    const q=z.object({q:z.string().max(100).default(''),type:z.enum(['all','route','stop','road']).default('all'),limit:z.coerce.number().int().min(1).max(100).default(30)}).parse(request.query);
    const needle=q.q.trim();let items:{kind:string;id:string;entity:Route|Stop}[]=[];
    if(needle&&['all','route'].includes(q.type))items.push(...store.routes().filter(x=>contains([x.routeNo,x.origin,x.destination],needle)).map(x=>({kind:'route',id:x.id,entity:x})));
    if(needle&&['all','stop'].includes(q.type))items.push(...store.stops().filter(x=>contains([x.id,x.name],needle)).map(x=>({kind:'stop',id:x.id,entity:x})));
    return payload(ctx,request,{items:items.slice(0,q.limit),total:items.length,...(q.type==='road'?{notice:'TDAS 不提供道路名稱搜尋；請在交通頁選擇起終點車站查看道路參考'}:{})});
  });
  add(ctx,'GET','/api/v1/home','首頁聚合，供應商故障不阻塞其他模組',async request=>{
    const q=z.object({stopId:z.string().max(120).optional(),latitude:z.coerce.number().min(22).max(23).optional(),longitude:z.coerce.number().min(113).max(115).optional(),platform:z.enum(['weapp','alipay','tt','h5','android']).default('h5')}).parse(request.query);
    if((q.latitude===undefined)!==(q.longitude===undefined))throw new AppError('COORDINATES_REQUIRED','需要完整的位置座標',422);
    const hasLocation=q.latitude!==undefined&&q.longitude!==undefined;
    let stops:Stop[]=hasLocation?store.stops().map(x=>{const distanceMeters=haversine(q.latitude!,q.longitude!,x.latitude,x.longitude);return{...x,distanceMeters,walkingMinutes:Math.ceil(distanceMeters/75)};}).filter(x=>(x.distanceMeters||0)<=3000).sort((a,b)=>(a.distanceMeters||0)-(b.distanceMeters||0)):[];
    const selected=q.stopId?store.stop(q.stopId):stops[0];let nextBus:unknown=null;const warnings:{code:string;message:string;retryable:boolean}[]=[];
    if(q.stopId&&!selected?.active)throw new AppError('STOP_NOT_FOUND','所選車站不存在，請重新搜尋',404);
    if(selected?.active)try{nextBus=await providers.arrivals(selected.id);}catch(error){warnings.push({code:error instanceof AppError?error.code:'UPSTREAM_UNAVAILABLE',message:'到站資料暫不可用，可重試或繼續搜尋',retryable:true});}
    if(!store.routes().length)warnings.push({code:'CATALOG_UNAVAILABLE',message:'官方主資料正在同步，請稍後重試',retryable:true});
    if(!hasLocation&&!q.stopId)warnings.push({code:'LOCATION_REQUIRED',message:'請開啟定位或選擇常用車站查看到站',retryable:false});
    if(hasLocation&&!stops.length&&store.routes().length)warnings.push({code:'NO_NEARBY_STOPS',message:'三公里內沒有找到九巴 / 龍運車站，可手動搜尋',retryable:false});
    if(!hasLocation&&selected?.active)stops=[selected];
    return payload(ctx,request,{product:{name:'港巴通',coverage:'KMB/LWB'},nextBus,nearbyStops:stops.slice(0,5).map(x=>({...x,routes:store.routesAt(x.id)})),selection:hasLocation?'location':q.stopId?'selected':'none',notices:publicNotices(store,q.platform).slice(0,3),features:features(),content:store.setting('content',{}),warnings,mode:config.providerMode,generatedAt:now()});
  });
  add(ctx,'GET','/api/v1/notices','目前有效的已發布服務通告',async request=>{const q=z.object({platform:z.string().max(20).optional(),routeId:z.string().max(120).optional(),stopId:z.string().max(120).optional()}).parse(request.query);return payload(ctx,request,publicNotices(store,q.platform).filter(x=>(!q.routeId||!x.routeIds.length||x.routeIds.includes(q.routeId))&&(!q.stopId||!x.stopIds.length||x.stopIds.includes(q.stopId))));});
  add(ctx,'GET','/api/v1/notices/:id','公開通告詳情',async request=>{const {id}=idSchema.parse(request.params),q=z.object({platform:z.enum(['weapp','alipay','tt','h5','android']).optional()}).parse(request.query),notice=publicNotices(store,q.platform).find(x=>x.id===id);if(!notice)throw new AppError('NOTICE_NOT_FOUND','通告尚未發佈、已過期或已撤回',404);return payload(ctx,request,{...notice,routes:notice.routeIds.map(x=>store.route(x)).filter(Boolean)});});
  add(ctx,'POST','/api/v1/journeys','官方站序候選、各程車費及未計優惠的合計',async request=>{if(!store.setting('features',{planner:false}).planner)throw new AppError('FEATURE_DISABLED','行程查詢尚未啟用',503);const input=z.object({startId:z.string().min(1).max(120),endId:z.string().min(1).max(120)}).parse(request.body),result=planJourney(store,input.startId,input.endId);return payload(ctx,request,{...result,journeys:result.journeys.map(journey=>fares.journey(journey))});});
  add(ctx,'POST','/api/v1/traffic/route','獨立 TDAS 道路行駛時間參考',async request=>{if(!store.setting('features',{traffic:false}).traffic)throw new AppError('FEATURE_DISABLED','道路參考尚未啟用',503);return payload(ctx,request,await providers.roadRoute(tdasInputSchema.parse(request.body)));});
}
