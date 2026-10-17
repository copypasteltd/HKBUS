import {createContext,useContext,useState,useEffect,useCallback,useRef,type PropsWithChildren} from 'react';
import Taro,{useDidShow} from '@tarojs/taro';
import {api,ApiError,storage,clearProfileStorage,hasProfileSession} from './services/api';
import {deliverNotification} from './services/platform';
import type {Locale,Names,Bookmark,ProductConfig} from './services/types';
const defaults:ProductConfig={mode:'live',features:{reminders:false,traffic:false,planner:false,map:true},tdasEnabled:false,catalogSyncedAt:null,sources:[],content:{coverage:{tc:'KMB / LWB 到站資訊',sc:'KMB / LWB 到站信息',en:'KMB / LWB arrivals'},privacy:{tc:'',sc:'',en:''},help:{tc:'',sc:'',en:''},sourceUrl:'',privacyUrl:'',supportEmail:'',maintenance:false}};
interface AppState{locale:Locale;setLocale:(locale:Locale)=>void;large:boolean;setLarge:(large:boolean)=>void;config:ProductConfig;configError:string;reloadConfig:()=>Promise<void>;bookmarks:Bookmark[];refreshBookmarks:()=>Promise<void>;favorite:(kind:'stop'|'route',id:string,alias?:string)=>Promise<void>;isFavorite:(kind:'stop'|'route',id:string)=>boolean;tr:(tc:string,sc:string,en:string)=>string;name:(value:Names|undefined)=>string;coordinates:{latitude:number;longitude:number}|null;setCoordinates:(value:{latitude:number;longitude:number}|null)=>void;clearPersonalData:()=>Promise<void>}
const State=createContext<AppState|null>(null);
let notificationTimer:ReturnType<typeof setInterval>|undefined;
let notificationBusy=false;
export function stopNotificationPolling(){clearInterval(notificationTimer);notificationTimer=undefined;}
export function startNotificationPolling(){
  if(notificationTimer)return;
  const poll=async()=>{if(notificationBusy||!hasProfileSession())return;notificationBusy=true;try{const items=await api.get<{id:string;message:string;read_at:string|null}[]>('/v1/profile/notifications',true);for(const item of items.filter(x=>!x.read_at).reverse()){await deliverNotification(item.id,item.message);await api.patch('/v1/profile/notifications/'+item.id,{},true);}}catch{/* Query screens remain usable when notification polling fails. */}finally{notificationBusy=false;}};
  notificationTimer=setInterval(()=>void poll(),15000);void poll();
}
export function AppProvider({children}:PropsWithChildren){
  const[locale,changeLocale]=useState<Locale>(storage.get('hkbus-locale','tc'));
  const[large,changeLarge]=useState(storage.get('hkbus-large',false));
  const[config,setConfig]=useState<ProductConfig>(api.cached('/v1/config')||defaults);
  const[configError,setConfigError]=useState('');const[bookmarks,setBookmarks]=useState<Bookmark[]>(api.cached('/v1/profile/bookmarks',true)||[]);
  const[coordinates,setCoordinates]=useState<{latitude:number;longitude:number}|null>(null);
  const reloadConfig=useCallback(async()=>{try{setConfig(await api.get<ProductConfig>('/v1/config'));setConfigError('');}catch(error){setConfigError(error instanceof Error?error.message:'設定無法載入');}},[]);
  const refreshBookmarks=useCallback(async()=>{setBookmarks(await api.get<Bookmark[]>('/v1/profile/bookmarks',true));},[]);
  useEffect(()=>{void reloadConfig();if(hasProfileSession())void refreshBookmarks().catch(()=>{});},[reloadConfig,refreshBookmarks]);
  const favorite=async(kind:'stop'|'route',id:string,alias?:string)=>{const existing=bookmarks.find(x=>x.kind===kind&&x.entityId===id);if(existing&&alias===undefined)await api.delete('/v1/profile/bookmarks/'+kind+'/'+encodeURIComponent(id),true);else await api.put('/v1/profile/bookmarks',{kind,entityId:id,alias:alias??existing?.alias??''},true);await refreshBookmarks();};
  const value:AppState={locale,setLocale:next=>{changeLocale(next);storage.set('hkbus-locale',next);},large,setLarge:next=>{changeLarge(next);storage.set('hkbus-large',next);},config,configError,reloadConfig,bookmarks,refreshBookmarks,favorite,isFavorite:(kind,id)=>bookmarks.some(x=>x.kind===kind&&x.entityId===id),tr:(tc,sc,en)=>locale==='en'?en:locale==='sc'?sc:tc,name:value=>value?.[locale]||value?.tc||value?.en||'',coordinates,setCoordinates,clearPersonalData:async()=>{try{if(hasProfileSession())await api.delete('/v1/profile',true);}catch(error){if(!(error instanceof ApiError)||error.status!==401)throw error;}clearProfileStorage();setBookmarks([]);}};
  return <State.Provider value={value}>{children}</State.Provider>;
}
export function useApp(){const value=useContext(State);if(!value)throw new Error('AppProvider missing');return value;}
export function useResource<T>(path:string|null,profile=false){
  const[data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<ApiError|null>(null),[offline,setOffline]=useState(false);
  const generation=useRef(0),loadRef=useRef<()=>Promise<T|null>>(async()=>null);
  const reload=useCallback(async(force=false)=>{if(!path){setLoading(false);return null;}const ticket=++generation.current;setLoading(true);setError(null);try{const value=await api.get<T>(path,profile,force);if(ticket===generation.current){setData(value);setOffline(false);}return value;}catch(problem){if(ticket===generation.current){const cached=api.cached<T>(path,profile);setData(cached);setOffline(!!cached);setError(problem instanceof ApiError?problem:new ApiError('UNKNOWN',problem instanceof Error?problem.message:'載入失敗'));}return null;}finally{if(ticket===generation.current)setLoading(false);}},[path,profile]);
  loadRef.current=reload;
  useEffect(()=>{const cached=path?api.cached<T>(path,profile):null;setData(cached);setOffline(!!cached);void reload();return()=>{generation.current++;};},[reload,path,profile]);
  useDidShow(()=>{void loadRef.current();});
  return{data,loading,error,offline,reload};
}
export function useAction(){const[busy,setBusy]=useState(false);const run=async(fn:()=>Promise<unknown>,message?:string)=>{if(busy)return false;setBusy(true);try{await fn();if(message)Taro.showToast({title:message,icon:'none'});return true;}catch(error){Taro.showToast({title:error instanceof Error?error.message:'操作失敗，請重試',icon:'none',duration:3500});return false;}finally{setBusy(false);}};return{busy,run};}
