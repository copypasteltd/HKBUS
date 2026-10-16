import { randomUUID } from 'node:crypto';
import { AppError, now, type Notice, type Route } from './domain.js';
import type { Store } from './database.js';
import type { Providers } from './providers.js';

export interface Reminder { id:string;profile_id:string;stop_id:string;route_id:string;threshold:number;status:'active'|'paused'|'sent'|'expired';channel:'in-app';expires_at:string;generation:string;sent_at:string|null;created_at:string }
export function publicNotices(store:Store,platform?:string):Notice[]{
  const at=now();return store.all<{document:string}>('SELECT document FROM notices WHERE status=? AND valid_from<=? AND valid_until>? ORDER BY valid_from DESC','published',at,at).map(x=>JSON.parse(x.document) as Notice).filter(x=>x.source==='operator'&&(!platform||!x.platforms.length||x.platforms.includes(platform)));
}
export function bookmarks(store:Store,profile:string){
  return store.all<{kind:'stop'|'route';entity_id:string;alias:string;position:number}>('SELECT kind,entity_id,alias,position FROM bookmarks WHERE profile_id=? ORDER BY position,created_at',profile).map(row=>{const entity=row.kind==='stop'?store.stop(row.entity_id):store.route(row.entity_id);return{...row,entityId:row.entity_id,entity:entity||null,available:!!entity?.active};});
}
export function reminders(store:Store,profile:string){
  expireReminders(store);
  return store.all<Reminder>('SELECT * FROM reminders WHERE profile_id=? ORDER BY created_at DESC',profile).map(row=>({...row,stop:store.stop(row.stop_id)||null,route:store.route(row.route_id)||null}));
}
export function expireReminders(store:Store){store.run('UPDATE reminders SET status=? WHERE status IN (?,?) AND expires_at<=?','expired','active','paused',now());}
export function upsertReminder(store:Store,profile:string,input:{stopId:string;routeId:string;threshold:number;channel:'in-app'}){
  if(!store.setting('features',{reminders:false}).reminders)throw new AppError('FEATURE_DISABLED','提醒功能暫未開放',503);
  const stop=store.stop(input.stopId),route=store.route(input.routeId);
  if(!stop?.active||!route?.active||!store.sequence(input.routeId).some(x=>x.id===input.stopId))throw new AppError('REMINDER_ENTITY_INVALID','車站與路線方向不匹配',422);
  const existing=store.get<Reminder>('SELECT * FROM reminders WHERE profile_id=? AND stop_id=? AND route_id=?',profile,input.stopId,input.routeId);
  const id=existing?.id||randomUUID();
  store.run('INSERT INTO reminders VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(profile_id,stop_id,route_id) DO UPDATE SET threshold=excluded.threshold,status=excluded.status,channel=excluded.channel,expires_at=excluded.expires_at,generation=excluded.generation,sent_at=NULL',id,profile,input.stopId,input.routeId,input.threshold,'active',input.channel,new Date(Date.now()+7200000).toISOString(),randomUUID(),null,now());
  return store.get<Reminder>('SELECT * FROM reminders WHERE id=?',id)!;
}
export async function evaluateReminders(store:Store,providers:Providers){
  if(!store.setting('features',{reminders:false}).reminders)return{evaluated:0,sent:0,skipped:'FEATURE_DISABLED'};
  expireReminders(store);
  const rows=store.all<Reminder>('SELECT * FROM reminders WHERE status=? LIMIT 500','active');
  const byStop=new Map<string,Reminder[]>();
  for(const row of rows)byStop.set(row.stop_id,[...(byStop.get(row.stop_id)||[]),row]);
  let sent=0;
  for(const [stopId,list] of byStop){
    try{
      const result=await providers.arrivals(stopId);
      if(result.freshness.state!=='fresh')continue;
      for(const reminder of list){
        const arrival=result.arrivals.find(x=>x.routeId===reminder.route_id&&x.minutes!==null&&x.status!=='stale');
        if(!arrival||arrival.minutes===null||arrival.minutes>reminder.threshold)continue;
        store.transaction(()=>{
          const current=store.get<Reminder>('SELECT * FROM reminders WHERE id=?',reminder.id);
          if(!current||current.status!=='active'||current.generation!==reminder.generation)return;
          const message=`${arrival.routeNo} · ${result.stop.name.tc} · 預計 ${arrival.minutes} 分鐘`;
          store.run('INSERT OR IGNORE INTO notifications VALUES(?,?,?,?,?,?,?)',randomUUID(),reminder.profile_id,reminder.id,reminder.generation,message,now(),null);
          store.run('UPDATE reminders SET status=?,sent_at=? WHERE id=? AND status=?','sent',now(),reminder.id,'active');sent++;
        });
      }
    }catch{/* A failed provider must not manufacture a reminder delivery. */}
  }
  return {evaluated:rows.length,sent};
}
export function planJourney(store:Store,startId:string,endId:string){
  if(startId===endId)throw new AppError('SAME_ENDPOINTS','起點與終點不能相同',422);
  const start=store.stop(startId),end=store.stop(endId);
  if(!start?.active||!end?.active)throw new AppError('STOP_NOT_FOUND','起點或終點車站不存在',404);
  const from=store.routesAt(startId),to=store.routesAt(endId);
  const leg=(route:Route,boardId:string,alightId:string)=>{
    const sequence=store.sequence(route.id),board=sequence.findIndex(x=>x.id===boardId),alight=sequence.findIndex(x=>x.id===alightId);
    return board>=0&&alight>board?{route,board:sequence[board]!,alight:sequence[alight]!,stops:alight-board}:null;
  };
  const journeys:{id:string;transfers:number;legs:NonNullable<ReturnType<typeof leg>>[];stopCount:number}[]=[];
  for(const route of from){const item=leg(route,startId,endId);if(item)journeys.push({id:route.id,transfers:0,legs:[item],stopCount:item.stops});}
  if(journeys.length<3){
    for(const first of from.slice(0,30))for(const second of to.slice(0,30)){
      if(first.id===second.id||first.routeNo===second.routeNo)continue;
      const firstSequence=store.sequence(first.id),startIndex=firstSequence.findIndex(x=>x.id===startId);
      for(const transfer of firstSequence.slice(startIndex+1)){
        if(transfer.id===endId)continue;
        const secondLeg=leg(second,transfer.id,endId),firstLeg=leg(first,startId,transfer.id);
        if(firstLeg&&secondLeg){journeys.push({id:first.id+'|'+transfer.id+'|'+second.id,transfers:1,legs:[firstLeg,secondLeg],stopCount:firstLeg.stops+secondLeg.stops});break;}
      }
    }
  }
  return {start,end,journeys:journeys.sort((a,b)=>a.transfers-b.transfers||a.stopCount-b.stopCount).slice(0,5),notice:'僅按官方站序查找直達或同站轉乘候選；不含步行尋路、車費或乘車時間預測'};
}
export function transitionNotice(current:Notice,action:'submit'|'approve'|'publish'|'withdraw',role:string):Notice['status']{
  if(action==='submit'&&['draft','withdrawn'].includes(current.status))return'review';
  if(action==='approve'&&['admin','operator'].includes(role)&&current.status==='review')return'approved';
  if(action==='publish'&&['admin','operator'].includes(role)&&current.status==='approved')return'published';
  if(action==='withdraw'&&['admin','operator'].includes(role)&&['published','approved','review'].includes(current.status))return'withdrawn';
  throw new AppError('INVALID_TRANSITION','目前狀態或權限無法執行此操作',409);
}
