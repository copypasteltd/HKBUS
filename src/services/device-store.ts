import type {Bookmark,Locale,Reminder,Route,Stop,ServiceSelection} from './types';

export const DEVICE_KEY='hkbus-device:v1';
export interface Preferences {locale:Locale;largeText:boolean;textSize:'small'|'medium'|'large';theme:'system'|'light'|'dark';arrivalLayout:'grid'|'list';etaCount:2|3;nearbyView:'map'|'list';bookmarkView:'expanded'|'collapsed';bookmarkSort:'manual'|'distance';etaDisplay:'minutes'|'clock';homeStopId:string|null;defaultReminderMinutes:5|10|15;rememberRecent:boolean;introDismissed:boolean}
export interface RecentItem {kind:'stop'|'route';entityId:string;entity:Stop|Route;viewedAt:number}
export interface DeviceReminder extends Reminder {stop_sequence:number}
export interface SavedTrip {id:string;alias:string;start:Stop;end:Stop}
export interface WatchItem {id:string;alias:string;stop:Stop;route:Route;sequence:number}
export interface DeviceData {schema:3;boundary:string;revision:number;resetVersion:number;preferences:Preferences;bookmarks:Bookmark[];recent:RecentItem[];recentStops:RecentItem[];reminders:DeviceReminder[];trips:SavedTrip[];watches:WatchItem[]}
export const preferenceDefaults=():Preferences=>({locale:'tc',largeText:false,textSize:'medium',theme:'system',arrivalLayout:'grid',etaCount:3,nearbyView:'map',bookmarkView:'expanded',bookmarkSort:'manual',etaDisplay:'minutes',homeStopId:null,defaultReminderMinutes:5,rememberRecent:true,introDismissed:false});
// A local reset marker, never an identity or network credential.
const resetBoundary=()=>Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
const empty=():DeviceData=>({schema:3,boundary:resetBoundary(),revision:0,resetVersion:0,preferences:preferenceDefaults(),bookmarks:[],recent:[],recentStops:[],reminders:[],trips:[],watches:[]});
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const rows=(value:unknown)=>Array.isArray(value)?value:[];
const stopId=(value:unknown)=>typeof value==='string'&&/^[A-F0-9]{16}$/.test(value);
const routeId=(value:unknown)=>typeof value==='string'&&/^KMB:[A-Z0-9]+:[OI]:\d+$/.test(value);
const validId=(kind:unknown,id:unknown)=>kind==='stop'?stopId(id):kind==='route'&&routeId(id);
const names=(value:unknown)=>{const item=record(value);return ['tc','sc','en'].every(key=>typeof item[key]==='string'&&(item[key] as string).length<=300);};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const label=(value:unknown)=>Array.from(typeof value==='string'?value.trim():'').slice(0,24).join('');
function selections(value:unknown):'all'|ServiceSelection[]{if(value==='all'||value===undefined)return'all';const seen=new Set<string>();return rows(value).flatMap(raw=>{const item=record(raw),key=item.routeId+':'+item.sequence;if(!routeId(item.routeId)||!Number.isInteger(item.sequence)||Number(item.sequence)<1||Number(item.sequence)>999||seen.has(key))return[];seen.add(key);return[{routeId:item.routeId as string,sequence:Number(item.sequence)}];}).slice(0,200);}

/** Persist official catalog metadata only, never an ETA or a generated replacement. */
export function catalogSnapshot(kind:'stop'|'route',value:unknown):Stop|Route|null {
  const item=record(value);
  if(item.source!=='live'||!validId(kind,item.id))return null;
  if(kind==='stop'){
    if(!names(item.name)||typeof item.latitude!=='number'||typeof item.longitude!=='number'||!Number.isFinite(item.latitude)||!Number.isFinite(item.longitude)||Math.abs(item.latitude)>90||Math.abs(item.longitude)>180)return null;
    return {id:item.id as string,name:clone(item.name) as Stop['name'],latitude:item.latitude,longitude:item.longitude,source:'live',...(item.active===false?{active:false}:{})};
  }
  if(!names(item.origin)||!names(item.destination)||!['O','I'].includes(String(item.bound))||typeof item.routeNo!=='string'||typeof item.serviceType!=='string'||item.id!==`KMB:${item.routeNo}:${item.bound}:${item.serviceType}`)return null;
  return {id:item.id as string,routeNo:item.routeNo,bound:item.bound as Route['bound'],serviceType:item.serviceType,operator:typeof item.operator==='string'?item.operator:'KMB',origin:clone(item.origin) as Route['origin'],destination:clone(item.destination) as Route['destination'],source:'live',...(item.active===false?{active:false}:{})};
}

export function normalizeDevice(value:unknown,clock=Date.now()):DeviceData {
  if(value===null||value===undefined||value==='')return empty();
  const input=record(value);if(![1,2,3].includes(input.schema as number))throw new Error('本機資料版本無法讀取，請先檢查或在設定中清除本機資料。');
  const p=record(input.preferences),preferences=preferenceDefaults();
  if(['tc','sc','en'].includes(String(p.locale)))preferences.locale=p.locale as Locale;
  for(const key of ['largeText','rememberRecent','introDismissed'] as const)if(typeof p[key]==='boolean')preferences[key]=p[key];
  preferences.textSize=preferences.largeText?'large':'medium';
  if(['small','medium','large'].includes(String(p.textSize)))preferences.textSize=p.textSize as Preferences['textSize'];
  preferences.largeText=preferences.textSize==='large';
  for(const[key,values]of Object.entries({theme:['system','light','dark'],arrivalLayout:['grid','list'],nearbyView:['map','list'],bookmarkView:['expanded','collapsed'],bookmarkSort:['manual','distance']}))if(values.includes(String(p[key])))(preferences as unknown as Record<string,unknown>)[key]=p[key];
  if(p.etaCount===2)preferences.etaCount=2;
  if(p.etaDisplay==='clock')preferences.etaDisplay='clock';
  if([5,10,15].includes(Number(p.defaultReminderMinutes)))preferences.defaultReminderMinutes=Number(p.defaultReminderMinutes) as 5|10|15;
  const seen=new Set<string>(),bookmarks:Bookmark[]=[];
  for(const raw of rows(input.bookmarks)){
    const b=record(raw),kind=b.kind as 'stop'|'route',id=b.entityId as string,key=kind+':'+id;
    if(!validId(kind,id)||seen.has(key)||bookmarks.length>=50)continue;seen.add(key);
    const snapshot=catalogSnapshot(kind,b.entity),entity=snapshot?.id===id?snapshot:null;
    bookmarks.push({kind,entityId:id,alias:label(b.alias),position:bookmarks.length,available:!!entity&&entity.active!==false,entity,pinned:b.pinned===true,selectedServices:kind==='stop'?selections(b.selectedServices):'all'});
  }
  if(stopId(p.homeStopId)&&bookmarks.some(x=>x.kind==='stop'&&x.entityId===p.homeStopId))preferences.homeStopId=p.homeStopId as string;
  const recent:RecentItem[]=[];seen.clear();
  if(preferences.rememberRecent)for(const raw of rows(input.recent)){
    const r=record(raw),kind=r.kind as 'stop'|'route',entity=catalogSnapshot(kind,r.entity),key=kind+':'+r.entityId;
    if(!entity||entity.id!==r.entityId||seen.has(key)||recent.length>=20)continue;seen.add(key);
    recent.push({kind,entityId:entity.id,entity,viewedAt:typeof r.viewedAt==='number'&&Number.isFinite(r.viewedAt)?Math.min(clock,r.viewedAt):clock});
  }
  const reminders:DeviceReminder[]=[];seen.clear();
  const recentStops:RecentItem[]=[];
  if(preferences.rememberRecent)for(const raw of rows(input.recentStops??recent.filter(item=>item.kind==='stop'))){const r=record(raw),entity=catalogSnapshot('stop',r.entity);if(r.kind!=='stop'||!entity||entity.id!==r.entityId||seen.has(entity.id)||recentStops.length>=10)continue;seen.add(entity.id);recentStops.push({kind:'stop',entityId:entity.id,entity,viewedAt:typeof r.viewedAt==='number'&&Number.isFinite(r.viewedAt)?Math.min(clock,r.viewedAt):clock});}seen.clear();
  for(const raw of rows(input.reminders)){
    const r=record(raw),stop=catalogSnapshot('stop',r.stop) as Stop|null,route=catalogSnapshot('route',r.route) as Route|null,expires=Date.parse(String(r.expires_at));
    if(!stop||!route||r.stop_id!==stop.id||r.route_id!==route.id||!Number.isInteger(r.stop_sequence)||Number(r.stop_sequence)<1||![5,10,15].includes(Number(r.threshold))||typeof r.id!=='string'||r.id.length>120||!Number.isFinite(expires)||!['active','paused','sent','expired'].includes(String(r.status))||seen.has(r.id)||reminders.length>=10)continue;
    seen.add(r.id);reminders.push({id:r.id,stop_id:stop.id,route_id:route.id,threshold:Number(r.threshold),status:expires<=clock&&r.status!=='sent'?'expired':r.status as Reminder['status'],channel:'local',expires_at:new Date(expires).toISOString(),stop,route,stop_sequence:Number(r.stop_sequence)});
  }
  const trips:SavedTrip[]=[];seen.clear();
  for(const raw of rows(input.trips)){
    const r=record(raw),start=catalogSnapshot('stop',r.start) as Stop|null,end=catalogSnapshot('stop',r.end) as Stop|null;
    if(!start||!end||start.id===end.id||trips.length>=12)continue;
    const id='trip:'+start.id+':'+end.id;if(seen.has(id))continue;seen.add(id);
    trips.push({id,alias:label(r.alias),start,end});
  }
  const watches:WatchItem[]=[];seen.clear();
  for(const raw of rows(input.watches)){
    const r=record(raw),stop=catalogSnapshot('stop',r.stop) as Stop|null,route=catalogSnapshot('route',r.route) as Route|null;
    if(!stop||!route||!Number.isInteger(r.sequence)||Number(r.sequence)<1||Number(r.sequence)>999||watches.length>=6)continue;
    const id='watch:'+route.id+':'+stop.id+':'+r.sequence;if(seen.has(id))continue;seen.add(id);
    watches.push({id,alias:label(r.alias),stop,route,sequence:Number(r.sequence)});
  }
  return {schema:3,boundary:typeof input.boundary==='string'&&/^[a-z0-9-]{8,120}$/.test(input.boundary)?input.boundary:resetBoundary(),revision:Number.isSafeInteger(input.revision)&&Number(input.revision)>=0?Number(input.revision):0,resetVersion:Number.isSafeInteger(input.resetVersion)&&Number(input.resetVersion)>=0?Number(input.resetVersion):0,preferences,bookmarks,recent,recentStops,reminders,trips,watches};
}

export interface DeviceAdapter {read:()=>unknown;write:(value:DeviceData)=>boolean;legacy?:()=>DeviceData|null;clearLegacy?:()=>void}
export function createDeviceStore(adapter:DeviceAdapter){
  let current=empty(),error='',serial=0;
  const listeners=new Set<()=>void>(),emit=()=>listeners.forEach(fn=>fn());
  const fail=(problem:unknown)=>{error=problem instanceof Error?problem.message:'本機儲存不可用';emit();};
  const write=(next:DeviceData)=>{if(!adapter.write(clone(next)))throw new Error('無法儲存到本裝置，請檢查儲存空間或瀏覽器設定後重試。');current=next;error='';emit();};
  const read=()=>{const value=adapter.read();return normalizeDevice(value===null||value===undefined||value===''?adapter.legacy?.()||value:value);};
  const mutate=(change:(data:DeviceData)=>void)=>{
    try{const data=read();change(data);data.revision++;write(normalizeDevice(data));}catch(problem){fail(problem);throw problem;}
  };
  const refresh=()=>{try{current=read();error='';emit();}catch(problem){fail(problem);}};
  try{
    const raw=adapter.read();
    if(raw===null||raw===undefined||raw===''){
      const migrated=adapter.legacy?.();write(normalizeDevice(migrated||empty()));
    }else {current=normalizeDevice(raw);if(record(raw).schema!==3||record(raw).boundary!==current.boundary)write(current);}
    // Cleanup happens only after a successful read/migration; failure preserves the old cache.
    adapter.clearLegacy?.();
  }catch(problem){fail(problem);}
  return {
    snapshot:()=>clone(current),error:()=>error,refresh,
    checkpoint(){const data=read();return {resetVersion:data.resetVersion,boundary:data.boundary};},
    assertCurrent(version:{resetVersion:number;boundary:string}){const data=read();if(data.resetVersion!==version.resetVersion||data.boundary!==version.boundary)throw new Error('本機資料已清除，請重新操作。');},
    subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
    preferences(patch:Partial<Preferences>){mutate(data=>{data.preferences={...data.preferences,...patch,...(patch.largeText!==undefined&&!patch.textSize?{textSize:patch.largeText?'large' as const:'medium' as const}:{})};if(patch.rememberRecent===false){data.recent=[];data.recentStops=[];}});},
    resetPreferences(){mutate(data=>{data.preferences={...preferenceDefaults(),introDismissed:true};});},
    clear(){try{let previous=current;try{previous=read();}catch{/* Explicit clearing can replace unreadable local data. */}const next=empty();next.revision=previous.revision+1;next.resetVersion=previous.resetVersion+1;write(next);adapter.clearLegacy?.();}catch(problem){fail(problem);throw problem;}},
    bookmark(kind:'stop'|'route',entity:Stop|Route,alias=''){
      const snapshot=catalogSnapshot(kind,entity);if(!snapshot)throw new Error('尚未取得有效的官方車站或路線資料。');
      mutate(data=>{const old=data.bookmarks.find(x=>x.kind===kind&&x.entityId===snapshot.id);if(old){old.alias=label(alias);old.entity=snapshot;old.available=snapshot.active!==false;}else{if(data.bookmarks.length>=50)throw new Error('本機最多儲存 50 個收藏。');data.bookmarks.push({kind,entityId:snapshot.id,alias:label(alias),entity:snapshot,available:snapshot.active!==false,position:data.bookmarks.length,pinned:false,selectedServices:'all'});}});
    },
    rename(kind:'stop'|'route',id:string,alias:string){mutate(data=>{const item=data.bookmarks.find(x=>x.kind===kind&&x.entityId===id);if(item)item.alias=label(alias);});},
    pin(kind:'stop'|'route',id:string,pinned:boolean){mutate(data=>{const item=data.bookmarks.find(x=>x.kind===kind&&x.entityId===id);if(item)item.pinned=pinned;});},
    selectServices(id:string,value:'all'|ServiceSelection[]){const chosen=selections(value);if(chosen!=='all'&&!chosen.length)throw new Error('請至少選擇一項服務，或選擇全部服務。');mutate(data=>{const item=data.bookmarks.find(x=>x.kind==='stop'&&x.entityId===id);if(!item)throw new Error('收藏已移除，請重新操作。');item.selectedServices=chosen;});},
    removeBookmark(kind:'stop'|'route',id:string){mutate(data=>{data.bookmarks=data.bookmarks.filter(x=>x.kind!==kind||x.entityId!==id);if(kind==='stop'&&data.preferences.homeStopId===id)data.preferences.homeStopId=null;});},
    order(items:{kind:'stop'|'route';entityId:string}[]){mutate(data=>{
      const ordered=items.map(x=>data.bookmarks.find(b=>b.kind===x.kind&&b.entityId===x.entityId));
      if(ordered.length!==data.bookmarks.length||ordered.some(x=>!x)||new Set(ordered).size!==ordered.length)throw new Error('收藏順序已變更，請重新操作。');
      data.bookmarks=ordered as Bookmark[];
    });},
    visit(kind:'stop'|'route',entity:Stop|Route){
      const snapshot=catalogSnapshot(kind,entity);if(!snapshot||!current.preferences.rememberRecent)return;
      mutate(data=>{if(!data.preferences.rememberRecent)return;const item={kind,entityId:snapshot.id,entity:snapshot,viewedAt:Date.now()};data.recent=[item,...data.recent.filter(x=>x.kind!==kind||x.entityId!==snapshot.id)].slice(0,20);if(kind==='stop')data.recentStops=[item,...data.recentStops.filter(x=>x.entityId!==snapshot.id)].slice(0,10);});
    },
    clearRecent(){mutate(data=>{data.recent=[];data.recentStops=[];});},
    trip(start:Stop,end:Stop,alias=''){
      const a=catalogSnapshot('stop',start) as Stop|null,b=catalogSnapshot('stop',end) as Stop|null;
      if(!a||!b||a.id===b.id||a.active===false||b.active===false)throw new Error('請選擇兩個不同且有效的官方車站。');
      const id='trip:'+a.id+':'+b.id;
      mutate(data=>{const old=data.trips.find(x=>x.id===id);if(old){old.alias=label(alias);old.start=a;old.end=b;}else{if(data.trips.length>=12)throw new Error('本機最多儲存 12 條常用行程。');data.trips.push({id,alias:label(alias),start:a,end:b});}});
      return id;
    },
    renameTrip(id:string,alias:string){mutate(data=>{const item=data.trips.find(x=>x.id===id);if(!item)throw new Error('行程已變更，請重新操作。');item.alias=label(alias);});},
    moveTrip(id:string,delta:-1|1){mutate(data=>{const index=data.trips.findIndex(x=>x.id===id);if(index<0)throw new Error('行程已變更，請重新操作。');const target=index+delta;if(target<0||target>=data.trips.length)return;[data.trips[index],data.trips[target]]=[data.trips[target],data.trips[index]];});},
    removeTrip(id:string){mutate(data=>{data.trips=data.trips.filter(x=>x.id!==id);});},
    watch(stop:Stop,route:Route,sequence:number){
      const a=catalogSnapshot('stop',stop) as Stop|null,b=catalogSnapshot('route',route) as Route|null;
      if(!a||!b||a.active===false||b.active===false||!Number.isInteger(sequence)||sequence<1||sequence>999)throw new Error('候車資料無效，請重新選擇具體官方站序。');
      const id='watch:'+b.id+':'+a.id+':'+sequence;
      mutate(data=>{const old=data.watches.find(x=>x.id===id);if(old){old.stop=a;old.route=b;}else{if(data.watches.length>=6)throw new Error('候車看板最多加入 6 項。');data.watches.push({id,alias:'',stop:a,route:b,sequence});}});
      return id;
    },
    renameWatch(id:string,alias:string){mutate(data=>{const item=data.watches.find(x=>x.id===id);if(!item)throw new Error('候車項目已變更，請重新操作。');item.alias=label(alias);});},
    removeWatch(id:string){mutate(data=>{data.watches=data.watches.filter(x=>x.id!==id);});},
    reminder(stop:Stop,route:Route,sequence:number,threshold:number){
      if(!catalogSnapshot('stop',stop)||!catalogSnapshot('route',route)||!Number.isInteger(sequence)||sequence<1||![5,10,15].includes(threshold))throw new Error('提醒資料無效，請重新選擇路線和站序。');
      mutate(data=>{const old=data.reminders.find(x=>x.stop_id===stop.id&&x.route_id===route.id&&x.stop_sequence===sequence);if(!old&&data.reminders.length>=10)throw new Error('本機最多儲存 10 個提醒。');
        const item:DeviceReminder={id:old?.id||'local-'+Date.now().toString(36)+'-'+(++serial),stop_id:stop.id,route_id:route.id,threshold,status:'active',channel:'local',expires_at:new Date(Date.now()+7200000).toISOString(),stop:catalogSnapshot('stop',stop) as Stop,route:catalogSnapshot('route',route) as Route,stop_sequence:sequence};
        data.reminders=old?data.reminders.map(x=>x.id===old.id?item:x):[...data.reminders,item];
      });
    },
    reminderStatus(id:string,status:'active'|'paused'){mutate(data=>{const item=data.reminders.find(x=>x.id===id);if(item){item.status=status;if(status==='active')item.expires_at=new Date(Date.now()+7200000).toISOString();}});},
    removeReminder(id:string){mutate(data=>{data.reminders=data.reminders.filter(x=>x.id!==id);});},
    markSent(id:string,expires:string,threshold:number){let sent=false;mutate(data=>{const item=data.reminders.find(x=>x.id===id&&x.status==='active'&&x.expires_at===expires&&x.threshold===threshold);if(item&&Date.parse(item.expires_at)>Date.now()){item.status='sent';sent=true;}});return sent;}
  };
}
