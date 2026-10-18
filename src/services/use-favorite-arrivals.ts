import {useEffect,useRef,useState,useCallback} from 'react';
import {useDidHide,useDidShow} from '@tarojs/taro';
import {api} from './api';
import type {Arrivals} from './types';
/** A bounded foreground-only batch, one public ETA request per expanded physical stop. */
export function useFavoriteArrivals(ids:string[]){
 const key=[...new Set(ids)].sort().join('|'),[results,setResults]=useState<Record<string,Arrivals>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[loading,setLoading]=useState(false),[clock,setClock]=useState(Date.now());
 const generation=useRef(0),busy=useRef(false),visible=useRef(true),nativeVisible=useRef(true),lastPoll=useRef(0),alive=useRef(true);
 const isVisible=()=>visible.current&&nativeVisible.current&&(process.env.TARO_ENV!=='h5'||document.visibilityState!=='hidden');
 const refresh=useCallback(async(force=true)=>{if(busy.current||!key||!isVisible())return;busy.current=true;setLoading(true);const ticket=generation.current;lastPoll.current=Date.now();const queue=key.split('|'),next:Record<string,Arrivals>={},failures:Record<string,string>={};
  await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{while(queue.length&&ticket===generation.current&&isVisible()){const id=queue.shift()!,path='/v1/stops/'+encodeURIComponent(id)+'/arrivals';try{const result=await api.get<Arrivals>(path,false,force);if(result.stop.id!==id)throw new Error('官方車站資料不一致');next[id]=result;}catch(problem){failures[id]=problem instanceof Error?problem.message:'到站資料暫不可用';const cached=api.cached<Arrivals>(path);if(cached?.stop.id===id)next[id]=cached;}}}));
  if(ticket===generation.current&&alive.current){setResults(next);setErrors(failures);setLoading(false);setClock(Date.now());busy.current=false;}
 },[key]);
 const latest=useRef(refresh);latest.current=refresh;
 const resume=()=>{if(isVisible()&&Date.now()-lastPoll.current>1000)void latest.current(false);};
 useDidShow(()=>{visible.current=true;resume();});useDidHide(()=>{visible.current=false;});
 useEffect(()=>{generation.current++;busy.current=false;lastPoll.current=0;setResults({});setErrors({});setLoading(false);void refresh(false);return()=>{generation.current++;busy.current=false;};},[refresh]);
 useEffect(()=>{alive.current=true;let disposed=false,removeNative:(()=>void)|undefined;const timer=setInterval(()=>{if(isVisible()){setClock(Date.now());if(Date.now()-lastPoll.current>=30000)void latest.current(false);}},10000);const changed=()=>{if(isVisible())resume();};
  if(process.env.TARO_ENV==='h5'){document.addEventListener('visibilitychange',changed);void import('@capacitor/core').then(async({Capacitor})=>{if(disposed||!Capacitor.isNativePlatform())return;const{App}=await import('@capacitor/app'),listener=await App.addListener('appStateChange',({isActive})=>{nativeVisible.current=isActive;changed();});if(disposed)void listener.remove();else removeNative=()=>void listener.remove();}).catch(()=>{});}
  return()=>{alive.current=false;disposed=true;generation.current++;clearInterval(timer);removeNative?.();if(process.env.TARO_ENV==='h5')document.removeEventListener('visibilitychange',changed);};
 },[]);
 return{results,errors,loading,clock,refresh};
}
