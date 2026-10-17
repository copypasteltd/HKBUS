import Taro from '@tarojs/taro';
export type Screen='home'|'routes'|'search'|'nearby'|'arrivals'|'route'|'bookmarks'|'settings'|'notices'|'notice'|'help'|'reminders'|'planner'|'traffic';
export function go(screen:Screen,params:Record<string,string|number>={}){const suffix=Object.entries(params).map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(String(value))).join('&');const url='/pages/'+screen+'/index'+(suffix?'?'+suffix:'');if(['home','routes','bookmarks','settings'].includes(screen))void Taro.reLaunch({url});else void Taro.navigateTo({url});}
export function back(){if(Taro.getCurrentPages().length>1)void Taro.navigateBack();else go('home');}
export function openStop(id:string){go('arrivals',{id});}
export function openRoute(id:string){go('route',{id});}
export function useParam(name:string){const value=Taro.useRouter().params[name]||'';try{return decodeURIComponent(value);}catch{return value;}}
export function currentPath(){const pages=Taro.getCurrentPages(),last=pages[pages.length-1];if(!last)return'/pages/home/index';const options=(last as unknown as {options?:Record<string,string>}).options||{};return'/'+last.route+Object.entries(options).map(([key,value],index)=>(index?'&':'?')+encodeURIComponent(key)+'='+encodeURIComponent(decodeQueryValue(value))).join('');}

function decodeQueryValue(value:string){try{return decodeURIComponent(value);}catch{return value;}}
