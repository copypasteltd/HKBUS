import {useState} from 'react';
import {View,Text,Button} from '@tarojs/components';
import {Icon,Modal} from '../components';
import {useApp} from '../state';
import type {Stop} from '../services/types';

export function LocalPrivacy(){const app=useApp();return <View className='local-privacy'>
  <Text className='description'>{app.tr('無需登入。語言、閱讀偏好、首頁車站、收藏、最近查看、提醒、常用行程及候車看板均儲存在目前裝置，不建立雲端個人檔案。','无需登录。语言、阅读偏好、首页车站、收藏、最近查看、提醒、常用行程及候车看板均保存在当前设备，不建立云端个人档案。','No sign-in is needed. Language, reading preferences, home stop, favourites, history, reminders, saved journeys and watches stay on this device; no cloud profile is created.')}</Text>
  <Text className='description'>{app.tr('不同瀏覽器、小程式或裝置各自保存，暫不互相同步。清除網站/小程式資料或移除應用程式後，這些設定可能遺失。','不同浏览器、小程序或设备分别保存，暂不互相同步。清除网站/小程序数据或卸载应用后，这些设置可能丢失。','Browsers, mini-programs and devices keep separate settings. Clearing site/app storage or uninstalling may remove them.')}</Text>
  <Text className='description'>{app.tr('查詢路線、車站、到站和道路資料仍需連線。定位僅在你主動同意時用於目前查詢，不保存精確位置。到站提醒只在 App 或頁面開啟時檢查。','查询路线、车站、到站和道路数据仍需联网。定位仅在你主动同意时用于当前查询，不保存精确位置。到站提醒只在 App 或页面打开时检查。','Transit and road queries still use the live API. Location is requested only by your action and is not saved. Arrival reminders are checked while the app or page is open.')}</Text>
</View>;}

export function PreferenceSections(){
  const app=useApp(),[chooseStop,setChooseStop]=useState(false),p=app.preferences;
  const stops=app.bookmarks.filter(x=>x.kind==='stop'&&x.entity),selected=stops.find(x=>x.entityId===p.homeStopId);
  return <>
    <View className='local-data-note'><Icon name='lock' color='teal' size={22}/><View><Text className='card-title'>{app.tr('免登入，記在本機。','免登录，记在本机。','No sign-in. Kept on this device.')}</Text><Text className='caption'>{app.tr('變更會自動儲存，不會跨裝置同步。','修改会自动保存，不会跨设备同步。','Changes save automatically and stay on this device.')}</Text></View></View>
    <View className='setting-group'><Text className='setting-label'>{app.tr('閱讀與語言','阅读与语言','Reading and language')}</Text><View className='setting-list'>
      <Button className='setting-row preference-toggle' onClick={()=>app.setLarge(!app.large)} ariaLabel={app.tr('大字模式','大字模式','Large text')}><Icon name='accessibility' color='teal' size={23}/><View className='setting-content'><Text className='setting-title'>{app.tr('大字模式','大字模式','Large text')}</Text><Text className='caption'>{app.tr('放大主要文字，保留完整操作','放大主要文字，保留完整操作','Larger text with all controls available')}</Text></View><View className={'switch '+(app.large?'on':'')}><View className='switch-knob'/></View></Button>
      <View className='preference-field'><Text className='field-label'>{app.tr('介面語言','界面语言','Interface language')}</Text><View className='preference-options'>{([['tc','繁體中文'],['sc','简体中文'],['en','English']] as const).map(([value,label])=><Button key={value} className={'filter-chip '+(app.locale===value?'selected':'')} onClick={()=>app.setLocale(value)}>{label}</Button>)}</View></View>
      <View className='preference-field'><Text className='field-label'>{app.tr('到站顯示方式','到站显示方式','Arrival display')}</Text><View className='preference-options'>{([['minutes','倒數分鐘','倒数分钟','Minutes away'],['clock','香港時刻','香港时刻','Hong Kong time']] as const).map(([value,tc,sc,en])=><Button key={value} className={'filter-chip '+(p.etaDisplay===value?'selected':'')} onClick={()=>app.setPreferences({etaDisplay:value})}>{app.tr(tc,sc,en)}</Button>)}</View><Text className='caption'>{app.tr('只調整顯示，不改變官方到站預計。','仅调整显示，不改变官方到站预测。','Changes the display only; operator predictions stay the same.')}</Text></View>
    </View></View>
    <View className='setting-group'><Text className='setting-label'>{app.tr('常用出行偏好','常用出行偏好','Your regular journeys')}</Text><View className='setting-list'>
      <Button className='setting-row' onClick={()=>setChooseStop(true)} ariaLabel={app.tr('首頁預設車站','首页默认车站','Home stop')}><Icon name='pin' color='teal' size={23}/><View className='setting-content'><Text className='setting-title'>{app.tr('首頁預設車站','首页默认车站','Home stop')}</Text><Text className='caption'>{selected?selected.alias||app.name((selected.entity as Stop).name):app.tr('自動使用第一個收藏車站','自动使用第一个收藏车站','Use the first saved stop')}</Text></View><Icon name='chevron' size={17}/></Button>
      <View className='preference-field'><Text className='field-label'>{app.tr('預設提前提醒','默认提前提醒','Default reminder')}</Text><View className='preference-options'>{([5,10,15] as const).map(value=><Button key={value} className={'filter-chip '+(p.defaultReminderMinutes===value?'selected':'')} onClick={()=>app.setPreferences({defaultReminderMinutes:value})}>{value} {app.tr('分鐘','分钟','min')}</Button>)}</View><Text className='caption'>{app.tr('新建提醒時使用；不更改已建立的提醒。','新建提醒时使用；不修改已创建的提醒。','Used for new reminders. Existing reminders keep their threshold.')}</Text></View>
      <Button className='setting-row preference-toggle' onClick={()=>app.setPreferences({rememberRecent:!p.rememberRecent})} ariaLabel={app.tr('記住最近查看','记住最近查看','Remember recent views')}><Icon name='refresh' color='teal' size={23}/><View className='setting-content'><Text className='setting-title'>{app.tr('記住最近查看','记住最近查看','Remember recent views')}</Text><Text className='caption'>{app.tr('最多 20 項；關閉後清除並停止記錄','最多 20 项；关闭后清除并停止记录','Up to 20 items. Turning off clears and stops history.')}</Text></View><View className={'switch '+(p.rememberRecent?'on':'')}><View className='switch-knob'/></View></Button>
    </View></View>
    {chooseStop&&<Modal title={app.tr('首頁預設車站','首页默认车站','Home stop')} onClose={()=>setChooseStop(false)}><View className='preference-stop-list'>
      <Button className={'preference-stop '+(!p.homeStopId?'selected':'')} onClick={()=>{app.setPreferences({homeStopId:null});setChooseStop(false);}}>{app.tr('自動使用第一個收藏車站','自动使用第一个收藏车站','Use the first saved stop')}</Button>
      {stops.map(item=><Button key={item.entityId} className={'preference-stop '+(p.homeStopId===item.entityId?'selected':'')} onClick={()=>{app.setPreferences({homeStopId:item.entityId});setChooseStop(false);}}><Text>{item.alias||app.name((item.entity as Stop).name)}</Text><Text className='caption'>{item.entityId}</Text></Button>)}
      {!stops.length&&<Text className='description'>{app.tr('先在車站到站頁收藏常用車站，即可在此選擇。','先在车站到站页收藏常用车站，即可在此选择。','Save a stop from its arrivals page to choose it here.')}</Text>}
    </View></Modal>}
  </>;
}
