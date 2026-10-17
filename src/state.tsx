import {createContext,useContext,useState,useEffect,useCallback,useRef,type PropsWithChildren} from 'react';
import Taro,{useDidShow} from '@tarojs/taro';
import {api,ApiError} from './services/api';
import {localUser,publicEntity,startLocalReminders,stopLocalReminders} from './services/local-user';
import {DEVICE_KEY,type Preferences,type RecentItem,type DeviceReminder} from './services/device-store';
import type {Locale,Names,Bookmark,ProductConfig,Stop,Route} from './services/types';
const defaults:ProductConfig={mode:'live',features:{reminders:false,traffic:false,planner:false,map:true},tdasEnabled:false,catalogSyncedAt:null,sources:[],content:{coverage:{tc:'KMB / LWB 到站資訊',sc:'KMB / LWB 到站信息',en:'KMB / LWB arrivals'},privacy:{tc:'',sc:'',en:''},help:{tc:'',sc:'',en:''},sourceUrl:'',privacyUrl:'',supportEmail:'',maintenance:false}};
interface AppState{
  locale:Locale;setLocale:(locale:Locale)=>void;large:boolean;setLarge:(large:boolean)=>void;
  preferences:Preferences;setPreferences:(patch:Partial<Preferences>)=>void;storageError:string;
  config:ProductConfig;configError:string;reloadConfig:()=>Promise<void>;bookmarks:Bookmark[];recent:RecentItem[];reminders:DeviceReminder[];
  refreshBookmarks:()=>Promise<void>;favorite:(kind:'stop'|'route',id:string,alias?:string)=>Promise<void>;isFavorite:(kind:'stop'|'route',id:string)=>boolean;
  visit:(kind:'stop'|'route',entity:Stop|Route)=>void;
  tr:(tc:string,sc:string,en:string)=>string;name:(value:Names|undefined)=>string;
  coordinates:{latitude:number;longitude:number}|null;setCoordinates:(value:{latitude:number;longitude:number}|null)=>void;clearPersonalData:()=>Promise<void>;
}
const State=createContext<AppState|null>(null);
export const startNotificationPolling=startLocalReminders,stopNotificationPolling=stopLocalReminders;
export function AppProvider({children}:PropsWithChildren){
  const[device,setDevice]=useState(()=>localUser.snapshot()),[storageError,setStorageError]=useState(localUser.error());
  const[config,setConfig]=useState<ProductConfig>(api.cached('/v1/config')||defaults),[configError,setConfigError]=useState('');
  const[coordinates,setCoordinates]=useState<{latitude:number;longitude:number}|null>(null);
  useEffect(()=>{
    const refresh=()=>{setDevice(localUser.snapshot());setStorageError(localUser.error());};
    const remove=localUser.subscribe(refresh);localUser.refresh();
    const changed=(event:StorageEvent)=>{if(event.key===DEVICE_KEY||event.key===null)localUser.refresh();};
    if(process.env.TARO_ENV==='h5')window.addEventListener('storage',changed);
    return()=>{remove();if(process.env.TARO_ENV==='h5')window.removeEventListener('storage',changed);};
  },[]);
  const reloadConfig=useCallback(async()=>{try{setConfig(await api.get<ProductConfig>('/v1/config'));setConfigError('');}catch(error){setConfigError(error instanceof Error?error.message:'設定無法載入');}},[]);
  const refreshBookmarks=useCallback(async()=>{localUser.refresh();},[]);
  useEffect(()=>{void reloadConfig();},[reloadConfig]);
  const setPreferences=(patch:Partial<Preferences>)=>{try{localUser.preferences(patch);}catch(error){Taro.showToast({title:error instanceof Error?error.message:'無法儲存到本裝置',icon:'none',duration:3500});}};
  const favorite=async(kind:'stop'|'route',id:string,alias?:string)=>{
    const existing=localUser.snapshot().bookmarks.find(x=>x.kind===kind&&x.entityId===id);
    if(existing&&alias===undefined)localUser.removeBookmark(kind,id);
    else if(existing)localUser.rename(kind,id,alias||'');
    else {const version=localUser.snapshot().resetVersion,entity=await publicEntity(kind,id);localUser.assertCurrent(version);localUser.bookmark(kind,entity,alias||'');}
  };
  const locale=device.preferences.locale;
  const value:AppState={locale,setLocale:next=>setPreferences({locale:next}),large:device.preferences.largeText,setLarge:largeText=>setPreferences({largeText}),preferences:device.preferences,setPreferences,storageError,
    config,configError,reloadConfig,bookmarks:device.bookmarks,recent:device.recent,reminders:device.reminders,refreshBookmarks,favorite,isFavorite:(kind,id)=>device.bookmarks.some(x=>x.kind===kind&&x.entityId===id),
    visit:(kind,entity)=>{try{localUser.visit(kind,entity);}catch{/* The visible storage banner reports a failed local write. */}},
    tr:(tc,sc,en)=>locale==='en'?en:locale==='sc'?sc:tc,name:value=>value?.[locale]||value?.tc||value?.en||'',coordinates,setCoordinates,
    clearPersonalData:async()=>{localUser.clear();api.clearCache();setCoordinates(null);}};
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
