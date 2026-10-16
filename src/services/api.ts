import Taro from '@tarojs/taro';
import {dataNamespace,isLiveData,cacheMaxAge,usableCache} from './data-policy';
export class ApiError extends Error {constructor(public code:string,message:string,public requestId?:string,public status=0){super(message);}}
export const API_BASE=__API_BASE__.replace(/\/$/,'');
export const storage={get<T>(key:string,fallback:T):T{try{const value=Taro.getStorageSync(key);return value===undefined||value===null||value===''?fallback:value as T;}catch{return fallback;}},set(key:string,value:unknown){try{Taro.setStorageSync(key,value);return true;}catch{return false;}},remove(key:string){try{Taro.removeStorageSync(key);}catch{}}};
const namespace=dataNamespace(API_BASE);
export const profileKey=(name:string)=>namespace+':session:'+name;
export const hasProfileSession=()=>!!storage.get(profileKey('token'),'');
const keys=()=>{try{return Taro.getStorageInfoSync().keys;}catch{return[] as string[];}};
// Previous caches and credentials shared all API hosts and could originate from a fixture server.
for(const key of keys())if(key.startsWith('hkbus-cache:')||key.startsWith('hkbus-profile-'))storage.remove(key);
const cacheKey=(path:string,profile:boolean)=>namespace+':cache:'+(profile?'profile:'+storage.get(profileKey('id'),'none')+':':'public:')+path;
const pending=new Map<string,Promise<unknown>>();
let profilePromise:Promise<string>|null=null;
let personalGeneration=0;
async function perform<T>(path:string,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',body?:unknown,profile=false):Promise<T>{
  const generation=personalGeneration;
  const token=profile?await ensureProfile():null;
  if(profile&&generation!==personalGeneration)throw new ApiError('PROFILE_RESET','本機個人資料已清除，請重新載入');
  let response:Taro.request.SuccessCallbackResult<{data:T;meta?:{mode?:string};error?:{code:string;message:string;requestId?:string}}>;
  try{response=await Taro.request({url:API_BASE+path,method,data:body===undefined&&method==='POST'?{}:body,timeout:35000,header:{'Content-Type':body!==undefined||method==='POST'?'application/json':'text/plain',...(token?{Authorization:'Bearer '+token}:{})}});}catch{throw new ApiError('NETWORK_ERROR','連線暫時中斷，請檢查網絡後重試');}
  if(profile&&generation!==personalGeneration)throw new ApiError('PROFILE_RESET','本機個人資料已清除，請重新載入');
  if(response.statusCode<200||response.statusCode>=300){const error=response.data?.error;throw new ApiError(error?.code||'REQUEST_FAILED',error?.message||'資料暫時無法載入',error?.requestId,response.statusCode);}
  if(response.data?.meta?.mode!=='live'||!isLiveData(response.data.data))throw new ApiError('NON_LIVE_DATA','資料來源尚未核實，請連接真實資料服務');
  return response.data.data;
}
interface ProfileSession {accessToken:string;profileId:string;expiresIn:number;refreshToken:string}
export async function ensureProfile():Promise<string>{
  if(profilePromise)return profilePromise;
  const saved=storage.get<string>(profileKey('token'),''),expires=storage.get<number>(profileKey('expires'),0),refreshToken=storage.get<string>(profileKey('refresh'),'');
  if(saved&&(!expires||expires>Date.now()+86400000))return saved;
  if(saved&&!refreshToken)throw new ApiError('PROFILE_SESSION_EXPIRED','裝置憑證已過期，請在設定清除本機資料後重新開始');
  const generation=personalGeneration;
  const promise=perform<ProfileSession>(saved?'/v1/profile/sessions/refresh':'/v1/profile/sessions','POST',saved?{refreshToken}:undefined).then(session=>{
    if(generation!==personalGeneration)throw new ApiError('PROFILE_RESET','本機個人資料已清除，請重新載入');
    storage.set(profileKey('token'),session.accessToken);storage.set(profileKey('id'),session.profileId);storage.set(profileKey('expires'),Date.now()+session.expiresIn*1000);storage.set(profileKey('refresh'),session.refreshToken);return session.accessToken;
  }).finally(()=>{if(profilePromise===promise)profilePromise=null;});profilePromise=promise;return promise;
}
export const api={
  get<T>(path:string,profile=false):Promise<T>{
    const generation=personalGeneration,key=cacheKey(path,profile)+(profile?':generation:'+generation:'');if(pending.has(key))return pending.get(key) as Promise<T>;
    const promise=perform<T>(path,'GET',undefined,profile).then(value=>{
      if(profile&&generation!==personalGeneration)throw new ApiError('PROFILE_RESET','本機個人資料已清除，請重新載入');
      if(cacheMaxAge(path)>0)storage.set(cacheKey(path,profile),{at:Date.now(),mode:'live',value});
      const entries=keys().filter(x=>x.startsWith(namespace+':cache:'));
      if(entries.length>60)entries.map(key=>({key,at:storage.get<{at:number}>(key,{at:0}).at})).sort((a,b)=>a.at-b.at).slice(0,entries.length-60).forEach(x=>storage.remove(x.key));
      return value;
    }).finally(()=>pending.delete(key));pending.set(key,promise);return promise;
  },
  post<T>(path:string,body?:unknown,profile=false){return perform<T>(path,'POST',body,profile);},
  put<T>(path:string,body:unknown,profile=false){return perform<T>(path,'PUT',body,profile);},
  patch<T>(path:string,body:unknown,profile=false){return perform<T>(path,'PATCH',body,profile);},
  delete<T>(path:string,profile=false){return perform<T>(path,'DELETE',undefined,profile);},
  cached<T>(path:string,profile=false):T|null{if(profile&&!hasProfileSession())return null;return usableCache(storage.get<{at:number;mode:string;value:T}|null>(cacheKey(path,profile),null),path);}
};
export function query(values:Record<string,string|number|undefined>){const pairs=Object.entries(values).filter(([,value])=>value!==undefined&&value!=='');return pairs.length?'?'+pairs.map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(String(value))).join('&'):'';}
export function clearProfileStorage(){personalGeneration++;profilePromise=null;for(const key of keys())if(key.startsWith(namespace+':cache:profile:')||key.startsWith(namespace+':session:'))storage.remove(key);}
