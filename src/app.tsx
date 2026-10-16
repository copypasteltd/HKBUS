import {useEffect,type PropsWithChildren} from 'react';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {AppProvider,startNotificationPolling,stopNotificationPolling} from './state';
import './app.scss';
export default function App({children}:PropsWithChildren){
  useEffect(()=>{
    if(process.env.TARO_ENV!=='h5')return;
    const enrich=()=>{
      document.querySelectorAll<HTMLElement>('taro-button-core').forEach(element=>{element.setAttribute('role','button');const control=element as HTMLElement & {disabled?:boolean;loading?:boolean};const disabled=control.disabled===true||control.loading===true;element.tabIndex=disabled?-1:0;element.setAttribute('aria-disabled',String(disabled));});
      document.querySelectorAll<HTMLElement>('taro-input-core[aria-label],taro-textarea-core[aria-label]').forEach(element=>element.querySelector('input,textarea')?.setAttribute('aria-label',element.getAttribute('aria-label')||''));
      document.querySelectorAll<HTMLElement>('.brand-name,.page-heading,.section-title').forEach(element=>{element.setAttribute('role','heading');element.setAttribute('aria-level',element.classList.contains('section-title')?'2':'1');});
    };
    enrich();const observer=new MutationObserver(enrich);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','loading']});
    const key=(event:KeyboardEvent)=>{if(event.key!=='Enter'&&event.key!==' ')return;const element=event.target as HTMLElement;if(element.tagName==='TARO-BUTTON-CORE'&&element.getAttribute('aria-disabled')!=='true'){event.preventDefault();element.click();}};
    document.addEventListener('keydown',key);return()=>{observer.disconnect();document.removeEventListener('keydown',key);};
  },[]);
  useDidShow(()=>startNotificationPolling());useDidHide(()=>stopNotificationPolling());
  useEffect(()=>{
    if(process.env.TARO_ENV==='h5'){
      let remove:(()=>void)|undefined;
      void import('@capacitor/core').then(async({Capacitor})=>{if(!Capacitor.isNativePlatform())return;const {App:NativeApp}=await import('@capacitor/app');const listener=await NativeApp.addListener('backButton',()=>{if(Taro.getCurrentPages().length>1)void Taro.navigateBack();else void NativeApp.exitApp();});remove=()=>void listener.remove();});
      return()=>{remove?.();stopNotificationPolling();};
    }
    return()=>stopNotificationPolling();
  },[]);
  return <AppProvider>{children}</AppProvider>;
}
