import {useState} from 'react';
import {View,Text,Button,Input} from '@tarojs/components';
import {Action,Icon,Modal} from '../components';
import {useApp,useAction} from '../state';
import {localUser,saveLocalWatch} from '../services/local-user';
import {go} from '../navigation';
import type {Stop,Route} from '../services/types';

export function WatchButton({stop,route,sequence}:{stop:Stop;route:Route;sequence?:number}){
  const app=useApp(),action=useAction();
  const saved=app.watches.some(x=>x.route.id===route.id&&x.stop.id===stop.id&&(sequence===undefined||x.sequence===sequence));
  return <Button className='text-button watch-add' disabled={action.busy} onClick={()=>saved?go('watchboard'):void action.run(()=>saveLocalWatch(stop,route,sequence),app.tr('已加入候車看板','已加入候车看板','Added to waiting board'))}><Icon name='clock' color='teal' size={17}/>{saved?app.tr('查看候車看板','查看候车看板','View waiting board'):action.busy?app.tr('核對站序中','核对站序中','Checking stop'):app.tr('加入候車看板','加入候车看板','Add to waiting board')}</Button>;
}
export function SaveTripButton({start,end}:{start:Stop;end:Stop}){
  const app=useApp(),action=useAction(),[open,setOpen]=useState(false),[alias,setAlias]=useState('');
  const existing=app.trips.find(x=>x.start.id===start.id&&x.end.id===end.id);
  return <><Button className='text-button' onClick={()=>{setAlias(existing?.alias||'');setOpen(true);}}><Icon name='star' color='teal' size={17}/>{existing?app.tr('編輯常用行程','编辑常用行程','Edit saved journey'):app.tr('儲存常用行程','保存常用行程','Save this journey')}</Button>{open&&<Modal title={app.tr('常用行程名稱','常用行程名称','Save a regular journey')} onClose={()=>setOpen(false)}><Text className='description'>{app.name(start.name)} → {app.name(end.name)}</Text><View className='field'><Text className='field-label'>{app.tr('名稱（選填，最多 24 字）','名称（选填，最多 24 字）','Name (optional, up to 24 characters)')}</Text><Input className='field-control' value={alias} maxlength={24} onInput={event=>setAlias(event.detail.value)} ariaLabel={app.tr('行程名稱','行程名称','Journey name')} placeholder={app.tr('例如：上班、回家','例如：上班、回家','e.g. Work, Home')}/></View><Text className='field-hint'>{app.tr('僅在本機記住起終點；再次查詢時重新取得真實路線及車費。','仅在本机记住起终点；再次查询时重新获取真实路线及票价。','Only the stop pair is saved on this device. Routes and fares are fetched again when you search.')}</Text><View className='button-row'><Action secondary onClick={()=>setOpen(false)}>{app.tr('取消','取消','Cancel')}</Action><Action loading={action.busy} onClick={()=>void action.run(async()=>{localUser.trip(start,end,alias);setOpen(false);},app.tr('行程已儲存','行程已保存','Journey saved'))}>{app.tr('儲存','保存','Save')}</Action></View></Modal>}</>;
}
