import Taro from '@tarojs/taro';
import {api,API_BASE,storage} from './api';
import {dataNamespace,isLiveData} from './data-policy';
import {createDeviceStore,DEVICE_KEY,normalizeDevice,preferenceDefaults,type DeviceData} from './device-store';
import {matchingReminder} from './local-reminders';
import {watchStop} from './journeys';
import {deliverNotification} from './platform';
import type {Route,RouteArrivals,Stop} from './types';

const namespace=dataNamespace(API_BASE);
function storageKeys(){try{return Taro.getStorageInfoSync().keys;}catch{return[] as string[];}}
function legacy():DeviceData|null {
  const preferences=preferenceDefaults(),locale=storage.get('hkbus-locale','tc'),large=storage.get('hkbus-large',false);
  if(['tc','sc','en'].includes(locale))preferences.locale=locale as typeof preferences.locale;
  if(typeof large==='boolean'){preferences.largeText=large;preferences.textSize=large?'large':'medium';}
  const id=storage.get<string>(namespace+':session:id',''),prefix=namespace+':cache:profile:'+id+':';
  const cached=(path:string)=>{const entry=storage.get<{mode?:string;value?:unknown}|null>(prefix+path,null);return entry?.mode==='live'&&isLiveData(entry.value)&&Array.isArray(entry.value)?entry.value:[];};
  const bookmarks=cached('/v1/profile/bookmarks'),recent=cached('/v1/profile/recent');
  const present=storageKeys().some(key=>key==='hkbus-locale'||key==='hkbus-large'||key.startsWith(namespace+':session:')||key.startsWith(namespace+':cache:profile:'));
  return present?normalizeDevice({schema:1,preferences,bookmarks,recent,reminders:[]}):null;
}
function clearLegacy(){for(const key of storageKeys())if(key==='hkbus-locale'||key==='hkbus-large'||key.startsWith(namespace+':session:')||key.startsWith(namespace+':cache:profile:'))storage.remove(key);}
export const localUser=createDeviceStore({read:()=>Taro.getStorageSync(DEVICE_KEY),write:value=>storage.set(DEVICE_KEY,value),legacy,clearLegacy});

export async function publicEntity(kind:'stop'|'route',id:string):Promise<Stop|Route>{
  const path='/v1/'+(kind==='stop'?'stops':'routes')+'/'+encodeURIComponent(id);
  const result=api.cached<{stop?:Stop;route?:Route}>(path)||api.cached<{stop?:Stop;route?:Route}>(path+'/arrivals')||await api.get<{stop?:Stop;route?:Route}>(path);
  const entity=kind==='stop'?result.stop:result.route;if(!entity)throw new Error('官方資料暫不可用，請稍後重試。');return entity;
}
export async function saveLocalReminder(stop:Stop,route:Route,threshold:number){
  const version=localUser.checkpoint();
  const path='/v1/routes/'+encodeURIComponent(route.id);
  const detail=api.cached<{route:Route;stops:Stop[]}>(path)||await api.get<{route:Route;stops:Stop[]}>(path);
  localUser.assertCurrent(version);
  const matching=detail.stops.filter(x=>x.id===stop.id&&(stop.sequence===undefined||x.sequence===stop.sequence));
  if(matching.length!==1||!matching[0].sequence)throw new Error('請在線路詳情選擇具體站序後設定提醒。');
  localUser.reminder(stop,route,matching[0].sequence,threshold);
}
export async function saveLocalWatch(stop:Stop,route:Route,sequence?:number){
  const version=localUser.checkpoint();
  const result=await api.get<RouteArrivals>('/v1/routes/'+encodeURIComponent(route.id)+'/arrivals');
  localUser.assertCurrent(version);
  const candidates=result.stops.filter(x=>x.id===stop.id&&(sequence===undefined||x.sequence===sequence));
  const current=candidates.length===1?watchStop({route,stop,sequence:candidates[0].sequence},result):null;
  if(!current)throw new Error('站序已變更或不唯一，請開啟線路詳情重新選擇上車站。');
  localUser.watch(current,result.route,current.sequence!);
}
let timer:ReturnType<typeof setInterval>|undefined,busy=false,enabled=false,unsubscribe:(()=>void)|undefined;
async function poll(){
  if(!enabled||busy||(process.env.TARO_ENV==='h5'&&document.visibilityState==='hidden'))return;
  busy=true;
  try{
    const active=localUser.snapshot().reminders.filter(x=>x.status==='active'&&Date.parse(x.expires_at)>Date.now());
    for(const routeId of Array.from(new Set(active.map(x=>x.route_id)))){
      if(!enabled)break;
      try{
        const result=await api.get<RouteArrivals>('/v1/routes/'+encodeURIComponent(routeId)+'/arrivals');
        for(const reminder of active.filter(x=>x.route_id===routeId)){
          if(!enabled||!matchingReminder(reminder,result)||!localUser.markSent(reminder.id,reminder.expires_at,reminder.threshold))continue;
          const locale=localUser.snapshot().preferences.locale,stop=reminder.stop?.name[locale]||reminder.stop?.name.tc||reminder.stop_id;
          const message=locale==='en'?`${reminder.route?.routeNo} is due at ${stop} within ${reminder.threshold} min`:locale==='sc'?`${reminder.route?.routeNo} 预计 ${reminder.threshold} 分钟内到达${stop}`:`${reminder.route?.routeNo} 預計 ${reminder.threshold} 分鐘內到達${stop}`;
          await deliverNotification(reminder.id,message).catch(()=>{Taro.showToast({title:message,icon:'none',duration:4000});});
        }
      }catch{/* No fresh operator result means no reminder. The next foreground poll retries. */}
    }
  }finally{busy=false;}
}
export function stopLocalReminders(){enabled=false;clearInterval(timer);timer=undefined;unsubscribe?.();unsubscribe=undefined;}
export function startLocalReminders(){
  if(enabled)return;enabled=true;let signature=JSON.stringify(localUser.snapshot().reminders);
  unsubscribe=localUser.subscribe(()=>{const next=JSON.stringify(localUser.snapshot().reminders);if(next!==signature){signature=next;void poll();}});
  timer=setInterval(()=>{localUser.refresh();void poll();},30000);void poll();
}
