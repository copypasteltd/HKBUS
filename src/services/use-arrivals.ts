import {useEffect,useRef,useState} from 'react';
import {useDidHide,useDidShow} from '@tarojs/taro';
import {useResource} from '../state';

/** One whole-route/stop request every 30s while visible; a 10s display clock. */
export function useArrivals<T>(path:string|null){
  const resource=useResource<T>(path),[clock,setClock]=useState(Date.now());
  const latest=useRef(resource);latest.current=resource;
  const visible=useRef(true),nativeVisible=useRef(true),timer=useRef<ReturnType<typeof setInterval>>(),lastPoll=useRef(Date.now());
  const isVisible=()=>visible.current&&nativeVisible.current&&(process.env.TARO_ENV!=='h5'||document.visibilityState!=='hidden');
  const pause=()=>{clearInterval(timer.current);timer.current=undefined;};
  const resume=(reload=false)=>{
    pause();if(!path||!isVisible())return;
    setClock(Date.now());lastPoll.current=Date.now();
    if(reload&&!latest.current.loading)void latest.current.reload();
    timer.current=setInterval(()=>{
      if(!isVisible())return;
      const at=Date.now();setClock(at);
      if(at-lastPoll.current>=30000&&!latest.current.loading){lastPoll.current=at;void latest.current.reload();}
    },10000);
  };
  useDidShow(()=>{visible.current=true;resume();});
  useDidHide(()=>{visible.current=false;pause();});
  useEffect(()=>{
    let disposed=false,removeNative:(()=>void)|undefined;
    resume();
    const changed=()=>{if(isVisible())resume(true);else pause();};
    if(process.env.TARO_ENV==='h5'){
      document.addEventListener('visibilitychange',changed);
      void import('@capacitor/core').then(async({Capacitor})=>{
        if(disposed||!Capacitor.isNativePlatform())return;
        const {App}=await import('@capacitor/app');
        const listener=await App.addListener('appStateChange',({isActive})=>{nativeVisible.current=isActive;changed();});
        if(disposed)void listener.remove();else removeNative=()=>void listener.remove();
      }).catch(()=>{/* Page lifecycle still controls refresh when no native bridge exists. */});
    }
    return()=>{disposed=true;pause();if(process.env.TARO_ENV==='h5')document.removeEventListener('visibilitychange',changed);removeNative?.();};
  },[path]);
  return {...resource,clock};
}
