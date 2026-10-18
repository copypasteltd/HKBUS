import {createHash} from 'node:crypto';
import {Converter} from 'opencc-js';
import {AppError,haversine,now,type Route,type Stop,type Names} from './domain.js';
import type {Store} from './database.js';
import {stopCoordinates} from './fare-source.js';

export const OPERATOR_BASE='https://search.kmb.hk/KMBWebSite/Function/FunctionRequest.ashx';
export const HOLIDAY_URL='https://www.1823.gov.hk/common/ical/en.json';
const simplify=Converter({from:'hk',to:'cn'});
type Row=Record<string,unknown>;
const obj=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const arr=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const plain=(value:unknown)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').trim();
const names=(tc:string,en:string):Names=>({tc,sc:simplify(tc),en});
const DAY_CODES=['W','MF','MS','S','H','D','X'];
export function normalizeSearch(value:string){return simplify(value.normalize('NFKC')).toLowerCase().replace(/\b(rd|st|ave|hwy|ln|dr|stn|ctr)\.?\b/g,word=>({rd:'road',st:'street',ave:'avenue',hwy:'highway',ln:'lane',dr:'drive',stn:'station',ctr:'centre'}[word.replace('.','')]||word)).replace(/\bcenter\b/g,'centre').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');}
export function matchScore(query:string,fields:string[]){const q=normalizeSearch(query);if(!q)return null;const tokens=q.split(' '),values=fields.map(normalizeSearch);if(values.some(v=>v===q))return 0;if(values.some(v=>v.startsWith(q)))return 10;const joined=values.join(' ');return tokens.every(token=>joined.includes(token))?20:null;}
export interface Window {start:number;end:number}
export interface ScheduleBand {dayCode:string;raw:string;frequency:string;windows:Window[];departures:number[];parsed:boolean}
export interface OperatingHours {basis:'origin-departure';source:'live';routeId:string;origin:Names;bands:ScheduleBand[];fetchedAt:string;sourceUrl:string;state:'available'|'unavailable'|'stale';reason?:string}
export interface Road {id:string;name:Names;stopIds:string[];source:'live'}
export interface StopPlace {stopId:string;roadId:string;road:Names;address:Names;operatorStopCode:string;source:'live'}
export interface RouteReference {routeId:string;signature:string;source:'live';fetchedAt:string;sourceUrl:string;geometry:{type:'MultiLineString';coordinates:number[][][]}|null;operatingHours:OperatingHours;state:'available'|'unavailable'|'stale';reason?:string}
interface Calendar {dates:Record<string,string>;years:number[];sourceUrl:string;fetchedAt:string}
function clockMinute(value:string){const match=/^(\d{1,2}):(\d{2})$/.exec(value);if(!match||Number(match[1])>29||Number(match[2])>59)return null;return Number(match[1])*60+Number(match[2]);}
export function parseBand(raw:string,frequency:string,dayCode:string):ScheduleBand{
 const band:ScheduleBand={dayCode,raw,frequency,windows:[],departures:[],parsed:false};
 const range=/^(\d{1,2}:\d{2})\s*[-–－]\s*(\d{1,2}:\d{2})$/.exec(raw);
 if(range){const start=clockMinute(range[1]!),finish=clockMinute(range[2]!);if(start!==null&&finish!==null){band.windows=[{start,end:finish<start?finish+1440:finish}];band.parsed=true;}}
 else if(raw&&raw.split(/[,，、;；\s]+/).every(x=>clockMinute(x)!==null)){band.departures=raw.split(/[,，、;；\s]+/).map(x=>clockMinute(x)!);band.parsed=true;}
 return band;
}
export function parseSchedule(raw:unknown,route:Route,fetchedAt:string):OperatingHours{
 const response=obj(raw),data=obj(response.data),key=Object.keys(data).find(k=>Number(k)===Number(route.serviceType));
 const rows=response.result===true&&key?arr(data[key]).map(obj).filter(row=>String(row.Route).trim()===route.routeNo&&Number(row.ServiceType)===Number(route.serviceType)):[];
 const bound=route.bound==='O'?'1':'2',bands=rows.map(row=>parseBand(plain(row['BoundText'+bound]),plain(row['BoundTime'+bound]),plain(row.DayType))).filter(band=>band.raw);
 return{basis:'origin-departure',source:'live',routeId:route.id,origin:route.origin,bands,fetchedAt,sourceUrl:OPERATOR_BASE+'?action=getschedule&route='+encodeURIComponent(route.routeNo)+'&bound='+bound,state:bands.length?'available':'unavailable',...(!bands.length?{reason:'SERVICE_NOT_PUBLISHED'}:{})};
}
function hongKongDay(clock:number){const date=new Date(clock+8*3600000);return{date:date.toISOString().slice(0,10),weekday:date.getUTCDay(),minute:date.getUTCHours()*60+date.getUTCMinutes(),year:date.getUTCFullYear()};}
function bandsFor(hours:OperatingHours,date:ReturnType<typeof hongKongDay>,calendar:Calendar|null){
 const holiday=calendar?.dates[date.date],known=!!calendar?.years.includes(date.year);
 if(!known)return{known:false,holiday:null,bands:[] as ScheduleBand[]};
 const codes=holiday||date.weekday===0?['D','H']:date.weekday===6?['D','MS','S']:['D','W','MF','MS'];
 return{known,holiday:holiday||null,bands:hours.bands.filter(row=>codes.includes(row.dayCode))};
}
export function operatingToday(hours:OperatingHours,calendar:Calendar|null,clock=Date.now()){
 const day=hongKongDay(clock),selected=bandsFor(hours,day,calendar),previous=hongKongDay(clock-86400000),previousBands=bandsFor(hours,previous,calendar);
 const windows=selected.bands.flatMap(band=>band.windows.concat(band.departures.map(time=>({start:time,end:time})))).sort((a,b)=>a.start-b.start);
 const carryover=previousBands.bands.flatMap(band=>band.windows).filter(window=>window.end>=1440&&day.minute<=window.end-1440);
 const active=windows.some(window=>day.minute>=window.start&&day.minute<=window.end)||carryover.length>0;
 const unknown=!selected.known||!previousBands.known||hours.state!=='available'||hours.bands.some(band=>!DAY_CODES.includes(band.dayCode)||band.dayCode==='X')||selected.bands.some(band=>!band.parsed)||previousBands.bands.some(band=>!band.parsed);
 const state=unknown?'unverified':active?'within-origin-hours':!windows.length?'not-listed-today':day.minute<windows[0]!.start?'before-first':'outside-origin-hours';
 return{date:day.date,minute:day.minute,holiday:selected.holiday,calendarKnown:selected.known,state,windows,carryover,firstDeparture:windows[0]?.start??null,lastDeparture:windows.length?Math.max(...windows.map(w=>w.end)):null,sourceUrl:calendar?.sourceUrl||HOLIDAY_URL,basis:'origin-departure' as const};
}
function signature(stops:(Stop&{sequence:number})[]){return createHash('sha256').update(JSON.stringify(stops.map(s=>[s.id,s.sequence,s.latitude,s.longitude]))).digest('hex');}
function invalid(){return new AppError('REFERENCE_INVALID','官方路線補充資料未能與目前站序核對',502,true);}
export function parseOperatorRoute(raw:unknown,route:Route,stops:(Stop&{sequence:number})[],at:string,schedule:unknown):RouteReference{
 const response=obj(raw),data=obj(response.data),rows=arr(data.routeStops).map(obj);
 if(response.result!==true||!stops.length||rows.length!==stops.length)throw invalid();
 rows.forEach((row,index)=>{const stop=stops[index]!,point=stopCoordinates(String(row.X),String(row.Y));if(String(row.Route).trim()!==route.routeNo||Number(row.Bound)!==(route.bound==='O'?1:2)||Number(row.ServiceType)!==Number(route.serviceType)||(Number(row.Seq)!==index&&!(index===rows.length-1&&Number(row.Seq)===999))||haversine(stop.latitude,stop.longitude,point.latitude,point.longitude)>75)throw invalid();});
 let geometry:RouteReference['geometry']=null;
 const text=plain(obj(data.route).lineGeometry);
 if(text){
  const parsed=obj(JSON.parse(text.replace(/([{,]\s*)(paths|spatialReference|wkid|latestWkid)\s*:/g,'$1"$2":'))),paths=arr(parsed.paths);let total=0;
  if(paths.length>2000)throw invalid();
  const coordinates=paths.map(path=>{const points=arr(path);if(points.length<2||total+points.length>50000)throw invalid();total+=points.length;return points.map(rawPoint=>{const pair=arr(rawPoint);if(pair.length!==2)throw invalid();const value=stopCoordinates(String(pair[0]),String(pair[1]));return[value.longitude,value.latitude];});});
  if(coordinates.length)geometry={type:'MultiLineString',coordinates};
 }
 return{routeId:route.id,signature:signature(stops),source:'live',fetchedAt:at,sourceUrl:OPERATOR_BASE+'?action=getstops&route='+encodeURIComponent(route.routeNo)+'&bound='+(route.bound==='O'?1:2)+'&serviceType='+encodeURIComponent(route.serviceType),geometry,operatingHours:parseSchedule(schedule,route,at),state:'available'};
}
export function parseCalendar(raw:unknown,at:string):Calendar{
 const value=obj(arr(obj(raw).vcalendar)[0]),events=arr(value.vevent),dates:Record<string,string>={};
 if(!String(value.prodid).includes('HKSARG')||events.length<10)throw invalid();
 for(const event of events){const row=obj(event),date=String(arr(row.dtstart)[0]||'');if(!/^\d{8}$/.test(date))throw invalid();dates[date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)]=plain(row.summary);}
 return{dates,years:Array.from(new Set(Object.keys(dates).map(date=>Number(date.slice(0,4))))),sourceUrl:HOLIDAY_URL,fetchedAt:at};
}
export function buildPlaces(raw:unknown,stops:Stop[]){
 const rows=arr(obj(obj(raw).data).stops).map(obj);if(obj(raw).result!==true||!rows.length)throw invalid();
 const cells=new Map<string,Stop[]>(),cell=(lat:number,lng:number)=>Math.floor(lat*2000)+':'+Math.floor(lng*2000);
 for(const stop of stops){const key=cell(stop.latitude,stop.longitude);cells.set(key,[...(cells.get(key)||[]),stop]);}
 const places=new Map<string,StopPlace>(),roads=new Map<string,Road>();
 for(const row of rows){
  let point:{latitude:number;longitude:number};try{point=stopCoordinates(String(row.x),String(row.y));}catch{continue;}
  const x=Math.floor(point.latitude*2000),y=Math.floor(point.longitude*2000),candidates:Stop[]=[];
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)candidates.push(...cells.get((x+a)+':'+(y+b))||[]);
  const english=normalizeSearch(plain(row.EName)),chinese=normalizeSearch(plain(row.CName));
  const matching=candidates.map(stop=>({stop,distance:haversine(point.latitude,point.longitude,stop.latitude,stop.longitude),same:normalizeSearch(stop.name.en)===english||normalizeSearch(stop.name.tc)===chinese})).filter(c=>c.distance<=40&&c.same).sort((a,b)=>a.distance-b.distance);
  if(!matching.length||matching.length>1&&matching[1]!.distance-matching[0]!.distance<5)continue;
  const stop=matching[0]!.stop,enRoad=plain(row.ELocation1).replace(/\s+(?:HSE\.?\s*NO\.?|OUTSIDE|NEAR|OPP(?:OSITE)?|AFTER|BEFORE)\b.*$/i,'').replace(/\s+NO\.?\s*\d.*$/i,'').trim();
  if(!enRoad)continue;
  const addressTc=[row.CLocation1,row.CLocation2,row.CLocation3].map(plain).join(''),addressEn=[row.ELocation1,row.ELocation2,row.ELocation3].map(plain).filter(Boolean).join(' ');
  const roadTc=/^(.{1,32}?(?:大道|公路|海旁|海傍|隧道|道|街|路|徑|里|圍|坊|巷|橋))/.exec(addressTc)?.[1]||plain(row.CLocation1)||enRoad;
  const id='road:'+createHash('sha256').update(normalizeSearch(enRoad)).digest('hex').slice(0,20),road=roads.get(id)||{id,name:names(roadTc,enRoad),stopIds:[],source:'live' as const};
  if(!road.stopIds.includes(stop.id))road.stopIds.push(stop.id);roads.set(id,road);
  if(!places.has(stop.id))places.set(stop.id,{stopId:stop.id,roadId:id,road:road.name,address:names(addressTc,addressEn),operatorStopCode:plain(row.BSICode),source:'live'});
 }
 if(!places.size)throw invalid();return{places:Array.from(places.values()),roads:Array.from(roads.values())};
}

/** Public operator metadata only. Personal favourites and coordinates never enter this repository. */
export class TransitReference {
 private pending=new Map<string,Promise<unknown>>();private active=0;private waiters:(()=>void)[]=[];private lastFailure=new Map<string,number>();
 constructor(private store:Store,private fetcher:typeof fetch=fetch){}
 async settle(){while(this.pending.size)await Promise.allSettled([...this.pending.values()]);}
 private async single<T>(key:string,fn:()=>Promise<T>):Promise<T>{if(this.pending.has(key))return this.pending.get(key) as Promise<T>;const task=fn().finally(()=>this.pending.delete(key));this.pending.set(key,task);return task;}
 private async request(url:string,maxBytes=6_000_000){
  if(this.waiters.length>=24)throw new AppError('REFERENCE_BUSY','官方補充資料查詢繁忙，請稍後重試',503,true);
  if(this.active>=4)await new Promise<void>(resolve=>this.waiters.push(resolve));else this.active++;
  try{const response=await this.fetcher(url,{headers:{Accept:'application/json','User-Agent':'HKBusGo/1.0 public transit reference',Referer:'https://search.kmb.hk/KMBWebSite/'},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok||!response.body)throw invalid();const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;try{for(;;){const value=await reader.read();if(value.done)break;bytes+=value.value.byteLength;if(bytes>maxBytes)throw invalid();chunks.push(value.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,'')) as unknown;}
  finally{const next=this.waiters.shift();if(next)next();else this.active--;}
 }
 async calendar(force=false){return this.single('calendar',async()=>{const saved=this.store.setting<Calendar|null>('referenceCalendar',null);if(!force&&saved&&Date.now()-Date.parse(saved.fetchedAt)<7*86400000)return saved;if(!force&&Date.now()-(this.lastFailure.get('calendar')||0)<60000)return saved&&Date.now()-Date.parse(saved.fetchedAt)<30*86400000?saved:null;try{const value=parseCalendar(await this.request(HOLIDAY_URL),now());this.store.setSetting('referenceCalendar',value);this.lastFailure.delete('calendar');return value;}catch{this.lastFailure.set('calendar',Date.now());return saved&&Date.now()-Date.parse(saved.fetchedAt)<30*86400000?saved:null;}});}
 async syncPlaces(force=false){return this.single('places',async()=>{const saved=this.store.setting<{fetchedAt:string;catalogSyncedAt:string}|null>('referencePlaces',null),catalog=this.store.setting('catalogSyncedAt','');if(!force&&saved&&saved.catalogSyncedAt===catalog&&Date.now()-Date.parse(saved.fetchedAt)<86400000)return;
   if(!force&&Date.now()-(this.lastFailure.get('places')||0)<60000)throw invalid();let result:ReturnType<typeof buildPlaces>;try{result=buildPlaces(await this.request(OPERATOR_BASE+'?action=getallstops'),this.store.stops());this.lastFailure.delete('places');}catch(error){this.lastFailure.set('places',Date.now());throw error;}
   this.store.transaction(()=>{this.store.db.exec('DELETE FROM stop_places;DELETE FROM roads;');for(const row of result.places)this.store.run('INSERT INTO stop_places VALUES(?,?)',row.stopId,JSON.stringify(row));for(const row of result.roads)this.store.run('INSERT INTO roads VALUES(?,?)',row.id,JSON.stringify(row));this.store.setSetting('referencePlaces',{fetchedAt:now(),catalogSyncedAt:catalog,sourceUrl:OPERATOR_BASE+'?action=getallstops',matchedStops:result.places.length,totalStops:this.store.stops().length,roads:result.roads.length});});
  });}
 place(stopId:string){const row=this.store.get<{document:string}>('SELECT document FROM stop_places WHERE stop_id=?',stopId);return row?JSON.parse(row.document) as StopPlace:null;}
 roads(){return this.store.all<{document:string}>('SELECT document FROM roads ORDER BY id').map(row=>JSON.parse(row.document) as Road).map(road=>({...road,stopIds:road.stopIds.filter(id=>this.store.stop(id)?.active)})).filter(road=>road.stopIds.length);}
 decorate<T extends Stop>(stop:T):T&{road?:Names;address?:Names;roadId?:string}{const place=this.place(stop.id);return place?{...stop,road:place.road,address:place.address,roadId:place.roadId}:stop;}
 async route(id:string,force=false):Promise<RouteReference&{today:ReturnType<typeof operatingToday>}>{
  const route=this.store.route(id),stops=this.store.sequence(id);if(!route?.active)throw new AppError('ROUTE_NOT_FOUND','路線已停用或不存在',404);
  const reference=await this.single('route:'+id,async()=>{
   const cached=this.store.get<{document:string}>('SELECT document FROM route_references WHERE route_id=?',id),saved=cached?JSON.parse(cached.document) as RouteReference:null;
   if(!force&&saved?.signature===signature(stops)&&Date.now()-Date.parse(saved.fetchedAt)<86400000)return saved;
   try{const bound=route.bound==='O'?'1':'2',url=OPERATOR_BASE+'?action=getstops&route='+encodeURIComponent(route.routeNo)+'&bound='+bound+'&serviceType='+encodeURIComponent(route.serviceType);
    const schedule=()=>this.single('schedule:'+route.routeNo,async()=>{const key='referenceSchedule:'+route.routeNo,cached=this.store.setting<{data:unknown;at:string}|null>(key,null);if(!force&&cached&&Date.now()-Date.parse(cached.at)<86400000)return cached.data;const data=await this.request(OPERATOR_BASE+'?action=getschedule&route='+encodeURIComponent(route.routeNo)+'&bound=1');this.store.setSetting(key,{data,at:now()});return data;});
    const [raw,times]=await Promise.all([this.request(url),schedule()]);const result=parseOperatorRoute(raw,route,stops,now(),times);this.store.run('INSERT INTO route_references VALUES(?,?) ON CONFLICT(route_id) DO UPDATE SET document=excluded.document',id,JSON.stringify(result));return result;
   }catch{if(saved?.signature===signature(stops)&&Date.now()-Date.parse(saved.fetchedAt)<7*86400000)return{...saved,state:'stale' as const,operatingHours:{...saved.operatingHours,state:'stale' as const},reason:'UPSTREAM_UNAVAILABLE'};return{routeId:id,signature:signature(stops),source:'live' as const,fetchedAt:now(),sourceUrl:OPERATOR_BASE,geometry:null,operatingHours:{basis:'origin-departure' as const,source:'live' as const,routeId:id,origin:route.origin,bands:[],fetchedAt:now(),sourceUrl:OPERATOR_BASE,state:'unavailable' as const,reason:'UNVERIFIED_REFERENCE'},state:'unavailable' as const,reason:'UNVERIFIED_REFERENCE'};}
  });
  return{...reference,today:operatingToday(reference.operatingHours,await this.calendar())};
 }
 status(){const calendar=this.store.setting<Calendar|null>('referenceCalendar',null);return{source:'live',places:this.store.setting('referencePlaces',null),calendar:calendar?{years:calendar.years,fetchedAt:calendar.fetchedAt,sourceUrl:calendar.sourceUrl}:null,cachedRoutes:this.store.get<{n:number}>('SELECT count(*) n FROM route_references')!.n,vehiclePositions:false};}
}
