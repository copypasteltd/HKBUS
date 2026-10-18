import {useEffect,useRef,useState,useCallback} from 'react';
import {useDidShow,useDidHide} from '@tarojs/taro';
import {api} from './api';
import type {RouteArrivals} from './types';
import type {WatchItem} from './device-store';

/** One public request per unique route, with lifecycle cleanup and no persistent watch predictions. */
export function useWatchBoard(items:WatchItem[],paused:boolean){
  const key=Array.from(new Set(items.map(x=>x.route.id))).sort().join('|');
  const[results,setResults]=useState<Record<string,RouteArrivals>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[loading,setLoading]=useState(false),[clock,setClock]=useState(Date.now());
  const generation=useRef(0),busy=useRef(false),lastPoll=useRef(0),visible=useRef(true),nativeVisible=useRef(true),isPaused=useRef(paused);
  isPaused.current=paused;
  const isVisible=()=>visible.current&&nativeVisible.current&&(process.env.TARO_ENV!=='h5'||document.visibilityState!=='hidden');
  const refresh=useCallback(async(force=true)=>{
    if(busy.current||!key||!isVisible())return;
    const ticket=generation.current;busy.current=true;setLoading(true);lastPoll.current=Date.now();
    const next:Record<string,RouteArrivals>={},failures:Record<string,string>={};
    await Promise.all(key.split('|').map(async id=>{
      const path='/v1/routes/'+encodeURIComponent(id)+'/arrivals';
      try{const result=await api.get<RouteArrivals>(path,false,force);if(result.route.id!==id)throw new Error('官方路線資料不一致，請重新選擇。');next[id]=result;}
      catch(problem){failures[id]=problem instanceof Error?problem.message:'到站資料暫不可用';const cached=api.cached<RouteArrivals>(path);if(cached?.route.id===id)next[id]=cached;}
    }));
    if(ticket===generation.current){setResults(next);setErrors(failures);setClock(Date.now());setLoading(false);busy.current=false;}
  },[key]);
  const latest=useRef(refresh);latest.current=refresh;
  const resume=()=>{if(!isPaused.current&&isVisible()&&Date.now()-lastPoll.current>1000)void latest.current(false);};
  useDidShow(()=>{visible.current=true;resume();});
  useDidHide(()=>{visible.current=false;});
  useEffect(()=>{
    generation.current++;busy.current=false;setResults({});setErrors({});setLoading(false);lastPoll.current=0;
    if(!isPaused.current)void refresh(false);
    return()=>{generation.current++;busy.current=false;};
  },[refresh]);
  useEffect(()=>{if(!paused)resume();setClock(Date.now());},[paused]);
  useEffect(()=>{
    let disposed=false,removeNative:(()=>void)|undefined;
    const timer=setInterval(()=>{if(!isVisible())return;setClock(Date.now());if(!isPaused.current&&Date.now()-lastPoll.current>=30000)void latest.current(false);},10000);
    const changed=()=>{if(isVisible())resume();};
    if(process.env.TARO_ENV==='h5'){
      document.addEventListener('visibilitychange',changed);
      void import('@capacitor/core').then(async({Capacitor})=>{
        if(disposed||!Capacitor.isNativePlatform())return;
        const {App}=await import('@capacitor/app');const listener=await App.addListener('appStateChange',({isActive})=>{nativeVisible.current=isActive;changed();});
        if(disposed)void listener.remove();else removeNative=()=>void listener.remove();
      }).catch(()=>{/* Browser and page lifecycle still pause polling when the native bridge is absent. */});
    }
    return()=>{disposed=true;clearInterval(timer);if(process.env.TARO_ENV==='h5')document.removeEventListener('visibilitychange',changed);removeNative?.();};
  },[]);
  return {results,errors,loading,clock,refresh};
}
