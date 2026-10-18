import {useEffect,type PropsWithChildren} from 'react';
import Taro,{useDidShow,useDidHide} from '@tarojs/taro';
import {AppProvider,startNotificationPolling,stopNotificationPolling} from './state';
import './app.scss';
import './refinement.scss';
import './travel.scss';
export default function App({children}:PropsWithChildren){
  useEffect(()=>{
    if(process.env.TARO_ENV!=='h5')return;
    const enrich=()=>{
      document.querySelectorAll<HTMLElement>('taro-button-core').forEach(element=>{element.setAttribute('role','button');const control=element as HTMLElement & {disabled?:boolean;loading?:boolean};const disabled=control.disabled===true||control.loading===true;element.tabIndex=disabled?-1:0;element.setAttribute('aria-disabled',String(disabled));});
      document.querySelectorAll<HTMLElement>('taro-input-core[aria-label],taro-textarea-core[aria-label]').forEach(element=>element.querySelector('input,textarea')?.setAttribute('aria-label',element.getAttribute('aria-label')||''));
      document.querySelectorAll<HTMLElement>('.filter-chip,.preference-stop,.preference-toggle,.setting-row,.journey-price-toggle,.comparison-toggle').forEach(element=>{const toggle=element.querySelector('.switch');if(toggle)element.setAttribute('aria-pressed',String(toggle.classList.contains('on')));else if(element.matches('.filter-chip,.preference-stop,.comparison-toggle'))element.setAttribute('aria-pressed',String(element.classList.contains('selected')));});
      document.querySelectorAll<HTMLElement>('.guide-toggle').forEach(element=>element.setAttribute('aria-expanded',String(element.parentElement?.classList.contains('is-open')||false)));
      document.querySelectorAll<HTMLElement>('.route-stop>.timeline-row').forEach(element=>element.setAttribute('aria-expanded',String(element.parentElement?.classList.contains('is-expanded')||false)));
      document.querySelectorAll<HTMLElement>('.brand-name,.page-heading,.section-title').forEach(element=>{element.setAttribute('role','heading');element.setAttribute('aria-level',element.classList.contains('section-title')?'2':'1');});
    };
    enrich();const observer=new MutationObserver(enrich);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','loading','class']});
    const key=(event:KeyboardEvent)=>{if(event.key!=='Enter'&&event.key!==' ')return;const element=event.target as HTMLElement;if(element.tagName==='TARO-BUTTON-CORE'&&element.getAttribute('aria-disabled')!=='true'){event.preventDefault();element.click();}};
    document.addEventListener('keydown',key);return()=>{observer.disconnect();document.removeEventListener('keydown',key);};
  },[]);
  useDidShow(()=>startNotificationPolling());useDidHide(()=>stopNotificationPolling());
  useEffect(()=>{
    if(process.env.TARO_ENV==='h5'){
      let remove:(()=>void)|undefined,disposed=false;
      const visibility=()=>{if(document.visibilityState==='hidden')stopNotificationPolling();else startNotificationPolling();};document.addEventListener('visibilitychange',visibility);visibility();
      void import('@capacitor/core').then(async({Capacitor})=>{if(disposed||!Capacitor.isNativePlatform())return;const {App:NativeApp}=await import('@capacitor/app');const listener=await NativeApp.addListener('backButton',()=>{if(Taro.getCurrentPages().length>1)void Taro.navigateBack();else void NativeApp.exitApp();});const state=await NativeApp.addListener('appStateChange',({isActive})=>{if(isActive)startNotificationPolling();else stopNotificationPolling();});if(disposed){void listener.remove();void state.remove();}else remove=()=>{void listener.remove();void state.remove();};}).catch(()=>{});
      return()=>{disposed=true;document.removeEventListener('visibilitychange',visibility);remove?.();stopNotificationPolling();};
    }
    return()=>stopNotificationPolling();
  },[]);
  return <AppProvider>{children}</AppProvider>;
}
