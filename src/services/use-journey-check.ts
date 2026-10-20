import {useState,useEffect,useRef} from 'react';
import {useDidShow,useDidHide} from '@tarojs/taro';
import {api} from './api';
import {journeyCheckBody,type Journey,type JourneyCheck} from './journeys';
/** Foreground-only, at most one current request. Old/hidden/reset responses cannot restore a result. */
export function useJourneyCheck(journey:Journey|null,radius:number,enabled:boolean){
 const[data,setData]=useState<JourneyCheck|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[clock,setClock]=useState(Date.now());
 const body=journey?journeyCheckBody(journey,radius):null,key=enabled&&body?JSON.stringify(body):'',latest=useRef(key);latest.current=key;
 const generation=useRef(0),visible=useRef(true),nativeVisible=useRef(true),pending=useRef<number|null>(null),last=useRef(0);
 const active=()=>visible.current&&nativeVisible.current&&(process.env.TARO_ENV!=='h5'||document.visibilityState!=='hidden');
 const reload=async()=>{if(!latest.current||!active()||pending.current!==null)return;const ticket=++generation.current,request=latest.current;pending.current=ticket;last.current=Date.now();setLoading(true);setError('');try{const value=await api.post<JourneyCheck>('/v1/journeys/check',JSON.parse(request));if(ticket===generation.current&&request===latest.current&&active()){setData(value);setClock(Date.now());}}catch(problem){if(ticket===generation.current)setError(problem instanceof Error?problem.message:'Departure check unavailable');}finally{if(pending.current===ticket){pending.current=null;setLoading(false);}}};
 const pause=()=>{generation.current++;pending.current=null;setLoading(false);};
 useDidHide(()=>{visible.current=false;pause();});useDidShow(()=>{visible.current=true;void reload();});
 useEffect(()=>{generation.current++;pending.current=null;setData(null);setError('');setLoading(false);void reload();const timer=setInterval(()=>{if(active()){setClock(Date.now());if(Date.now()-last.current>=30000)void reload();}},10000);return()=>{clearInterval(timer);generation.current++;pending.current=null;};},[key]);
 useEffect(()=>{let disposed=false,removeNative:(()=>void)|undefined;const changed=()=>{if(active())void reload();else pause();};if(process.env.TARO_ENV==='h5'){document.addEventListener('visibilitychange',changed);void import('@capacitor/core').then(async({Capacitor})=>{if(disposed||!Capacitor.isNativePlatform())return;const {App}=await import('@capacitor/app');const listener=await App.addListener('appStateChange',({isActive})=>{nativeVisible.current=isActive;changed();});if(disposed)void listener.remove();else removeNative=()=>void listener.remove();}).catch(()=>{});}return()=>{disposed=true;if(process.env.TARO_ENV==='h5')document.removeEventListener('visibilitychange',changed);removeNative?.();};},[]);
 return{data,error,loading,clock,reload};
}
