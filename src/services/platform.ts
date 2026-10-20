import Taro from '@tarojs/taro';
import {api} from './api';
import {mapCoordinate} from './map-model';
import type {Stop} from './types';
export async function position(){
  if(process.env.TARO_ENV==='h5'){
    const {Capacitor}=await import('@capacitor/core');
    if(Capacitor.isNativePlatform()){const {Geolocation}=await import('@capacitor/geolocation');const value=await Geolocation.getCurrentPosition({enableHighAccuracy:false,timeout:10000});return{latitude:value.coords.latitude,longitude:value.coords.longitude};}
  }
  const value=await Taro.getLocation({type:'wgs84'});return{latitude:value.latitude,longitude:value.longitude};
}
export async function share(title:string,path:string){
  if(process.env.TARO_ENV==='h5'){
    const {Capacitor}=await import('@capacitor/core');
    if(Capacitor.isNativePlatform()){const {Share}=await import('@capacitor/share');const config=api.cached<{shareBaseUrl?:string}>('/v1/config');const base=config?.shareBaseUrl;await Share.share({title,text:title,url:path.startsWith('https://')?path:base&&/^https:\/\//.test(base)?base.replace(/\/$/,'')+'/#/'+path.replace(/^\//,''):undefined});return;}
    const url=window.location.origin+window.location.pathname+'#/'+path.replace(/^\//,'');
    if(navigator.share){await navigator.share({title,url});return;}
    if(navigator.clipboard){await navigator.clipboard.writeText(url);Taro.showToast({title:'連結已複製',icon:'none'});return;}
  }
  await Taro.setClipboardData({data:title+' · '+path});
}
export async function notificationPermission(){
  if(process.env.TARO_ENV==='h5'){const {Capacitor}=await import('@capacitor/core');if(Capacitor.isNativePlatform()){const {LocalNotifications}=await import('@capacitor/local-notifications');const value=await LocalNotifications.requestPermissions();return value.display==='granted';}}
  return false;
}
export async function deliverNotification(id:string,message:string){
  if(process.env.TARO_ENV==='h5'){const {Capacitor}=await import('@capacitor/core');if(Capacitor.isNativePlatform()){const {LocalNotifications}=await import('@capacitor/local-notifications');const permission=await LocalNotifications.checkPermissions();if(permission.display==='granted'){let numeric=0;for(const character of id)numeric=(numeric*31+character.charCodeAt(0))&0x7fffffff;await LocalNotifications.schedule({notifications:[{id:numeric,title:'港巴通',body:message}]});}}}
  Taro.showToast({title:message,icon:'none',duration:4000});
}
export function platformName(){if(process.env.TARO_ENV==='h5'&&typeof window!=='undefined'&&(window as unknown as {Capacitor?:{isNativePlatform?:()=>boolean}}).Capacitor?.isNativePlatform?.())return'android';return process.env.TARO_ENV||'h5';}
export async function openExternal(url:string){if(!/^https:\/\//.test(url))return;if(process.env.TARO_ENV==='h5'){window.open(url,'_blank','noopener,noreferrer');return;}await Taro.setClipboardData({data:url});}
export async function openStopMap(stop:Stop,name:string){if(process.env.TARO_ENV==='h5'){await openExternal('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(stop.latitude+','+stop.longitude));return;}await Taro.openLocation({...mapCoordinate(stop.latitude,stop.longitude),name,address:stop.id,scale:17});}
