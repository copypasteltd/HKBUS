import {useState,useEffect,useCallback,useRef} from 'react';
export class ApiError extends Error {constructor(public code:string,message:string,public status=0,public requestId?:string,public fields?:{path:string;message:string}[]){super(message);}}
export const API_BASE=(import.meta.env.VITE_API_BASE||'https://hkbus-api.copypaste.hk/api').replace(/\/+$/,'');
export async function request<T>(path:string,method='GET',data?:unknown):Promise<T>{
  let response:Response;
  try{response=await fetch(API_BASE+path,{method,credentials:'include',headers:{'Content-Type':'application/json','X-HKBus-Admin':'1'},...(data!==undefined?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});}catch{throw new ApiError('NETWORK_ERROR','無法連線至服務，請檢查網絡或後端狀態。');}
  const body=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401&&!path.endsWith('/auth/login')&&!path.endsWith('/auth/me'))window.dispatchEvent(new Event('hkbus-session-expired'));throw new ApiError(body.error?.code||'REQUEST_FAILED',body.error?.message||'操作未完成，請重試。',response.status,body.error?.requestId,body.error?.fields);}
  if(body.meta?.mode!=='live')throw new ApiError('NON_LIVE_DATA','管理台只連接真實資料服務，請檢查 API 地址。');
  return body.data as T;
}
export function useResource<T>(path:string|null){
  const[data,setData]=useState<T|null>(null),[error,setError]=useState<ApiError|null>(null),[loading,setLoading]=useState(true);const generation=useRef(0);
  const reload=useCallback(async()=>{if(!path){setLoading(false);return null;}const ticket=++generation.current;setLoading(true);setError(null);try{const value=await request<T>(path);if(generation.current===ticket)setData(value);return value;}catch(error){if(generation.current===ticket)setError(error instanceof ApiError?error:new ApiError('UNKNOWN',String(error)));return null;}finally{if(generation.current===ticket)setLoading(false);}},[path]);
  useEffect(()=>{setData(null);void reload();return()=>{generation.current++;};},[reload]);return{data,error,loading,reload};
}
export function useDebounce(value:string,delay=250){const[result,setResult]=useState(value);useEffect(()=>{const timer=setTimeout(()=>setResult(value),delay);return()=>clearTimeout(timer);},[value,delay]);return result;}
export function query(values:Record<string,string|number|undefined>){const params=new URLSearchParams();for(const[key,value]of Object.entries(values))if(value!==undefined&&value!=='')params.set(key,String(value));return'?'+params;}
