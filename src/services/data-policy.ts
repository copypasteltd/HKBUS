export const DATA_CACHE_VERSION='live-v2';
export function dataNamespace(base:string){return 'hkbus-'+DATA_CACHE_VERSION+':'+encodeURIComponent(base.replace(/\/$/,''));}
export function isLiveData(value:unknown):boolean {
  if(!value||typeof value!=='object')return true;
  if(Array.isArray(value))return value.every(isLiveData);
  const row=value as Record<string,unknown>;
  if(row.source==='fixture'||row.mode==='fixture')return false;
  return Object.values(row).every(isLiveData);
}
export function cacheMaxAge(path:string){
  if(/[?&](?:lat|long|lon|lng|latitude|longitude)=/i.test(path))return 0;
  if(/^\/v1\/home(?:\?|$)|^\/v1\/(?:stops|routes)\/[^/]+\/arrivals(?:\?|$)/.test(path))return 180000;
  // Notices can be withdrawn or expire. Fetch their current publication state each time.
  if(/^\/v1\/notices(?:\/|\?|$)|^\/v1\/profile\/(?:notifications|reminders)/.test(path))return 0;
  return 86400000;
}
export function usableCache<T>(item:{at:number;mode:string;value:T}|null,path:string,clock=Date.now()):T|null {
  if(!item||item.mode!=='live'||!Number.isFinite(item.at)||item.at>clock||clock-item.at>=cacheMaxAge(path)||!isLiveData(item.value))return null;
  if(/^\/v1\/home(?:\?|$)/.test(path)&&item.value&&typeof item.value==='object')return {...item.value,notices:[]} as T;
  return item.value;
}
