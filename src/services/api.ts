import Taro from '@tarojs/taro';
import {dataNamespace,isLiveData,cacheMaxAge,usableCache} from './data-policy';
export class ApiError extends Error {constructor(public code:string,message:string,public requestId?:string,public status=0){super(message);}}
export const API_BASE=__API_BASE__.replace(/\/$/,'');
export const storage={get<T>(key:string,fallback:T):T{try{const value=Taro.getStorageSync(key);return value===undefined||value===null||value===''?fallback:value as T;}catch{return fallback;}},set(key:string,value:unknown){try{Taro.setStorageSync(key,value);return true;}catch{return false;}},remove(key:string){try{Taro.removeStorageSync(key);}catch{}}};
const namespace=dataNamespace(API_BASE);
const keys=()=>{try{return Taro.getStorageInfoSync().keys;}catch{return[] as string[];}};
for(const key of keys())if(key.startsWith('hkbus-cache:')||key.startsWith('hkbus-profile-'))storage.remove(key);
const cacheKey=(path:string)=>namespace+':cache:public:'+path;
// Older builds cached location queries; remove them without retaining precise coordinates.
for(const key of keys())if(key.startsWith(namespace+':cache:public:')&&(/\/v1\/map\//.test(key)||/[?&](?:lat|long|lon|lng|latitude|longitude|west|east|south|north)=/i.test(key)))storage.remove(key);
const personal=(path:string)=>/^\/v1\/profile(?:\/|\?|$)/.test(path);
const pending=new Map<string,Promise<unknown>>();
let cacheGeneration=0;
async function perform<T>(path:string,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',body?:unknown,profile=false):Promise<T>{
  // Preferences never create a server identity or send a Bearer token.
  if(profile||personal(path))throw new ApiError('LOCAL_ONLY','個人喜好僅儲存於本裝置，請使用本機設定。');
  let response:Taro.request.SuccessCallbackResult<{data:T;meta?:{mode?:string};error?:{code:string;message:string;requestId?:string}}>;
  try{response=await Taro.request({url:API_BASE+path,method,data:body===undefined&&method==='POST'?{}:body,timeout:35000,header:{'Content-Type':body!==undefined||method==='POST'?'application/json':'text/plain'}});}catch{throw new ApiError('NETWORK_ERROR','連線暫時中斷，請檢查網絡後重試');}
  if(response.statusCode<200||response.statusCode>=300){const error=response.data?.error;throw new ApiError(error?.code||'REQUEST_FAILED',error?.message||'資料暫時無法載入',error?.requestId,response.statusCode);}
  if(response.data?.meta?.mode!=='live'||!isLiveData(response.data.data))throw new ApiError('NON_LIVE_DATA','資料來源尚未核實，請連接真實資料服務');
  return response.data.data;
}
export const api={
  get<T>(path:string,profile=false,force=false):Promise<T>{
    if(profile||personal(path))return Promise.reject(new ApiError('LOCAL_ONLY','個人喜好僅儲存於本裝置，請使用本機設定。'));
    const requestPath=force?path+(path.includes('?')?'&':'?')+'force=true':path;
    const generation=cacheGeneration,key=cacheKey(requestPath);if(pending.has(key))return pending.get(key) as Promise<T>;
    const promise=perform<T>(requestPath,'GET',undefined,profile).then(value=>{
      if(generation!==cacheGeneration)throw new ApiError('LOCAL_RESET','本機資料已清除，請重新操作。');
      if(cacheMaxAge(path)>0)storage.set(cacheKey(path),{at:Date.now(),mode:'live',value});
      const entries=keys().filter(x=>x.startsWith(namespace+':cache:public:'));
      if(entries.length>60)entries.map(key=>({key,at:storage.get<{at:number}>(key,{at:0}).at})).sort((a,b)=>a.at-b.at).slice(0,entries.length-60).forEach(x=>storage.remove(x.key));
      return value;
    }).finally(()=>{if(pending.get(key)===promise)pending.delete(key);});pending.set(key,promise);return promise;
  },
  post<T>(path:string,body?:unknown,profile=false){return perform<T>(path,'POST',body,profile);},
  put<T>(path:string,body:unknown,profile=false){return perform<T>(path,'PUT',body,profile);},
  patch<T>(path:string,body:unknown,profile=false){return perform<T>(path,'PATCH',body,profile);},
  delete<T>(path:string,profile=false){return perform<T>(path,'DELETE',undefined,profile);},
  cached<T>(path:string,profile=false):T|null{if(profile||personal(path))return null;return usableCache(storage.get<{at:number;mode:string;value:T}|null>(cacheKey(path),null),path);},
  clearCache(){cacheGeneration++;pending.clear();for(const key of keys())if(key.startsWith(namespace+':cache:'))storage.remove(key);}
};
export function query(values:Record<string,string|number|undefined>){const pairs=Object.entries(values).filter(([,value])=>value!==undefined&&value!=='');return pairs.length?'?'+pairs.map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(String(value))).join('&'):'';}
