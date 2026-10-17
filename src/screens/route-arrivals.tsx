import {View,Text,Button} from '@tarojs/components';
import {useApp} from '../state';
import {ArrivalNumber,Icon} from '../components';
import {openStop} from '../navigation';
import {arrivalView,stationArrivals} from '../services/arrivals';
import type {Arrival,Route,Stop} from '../services/types';

export function RouteStopArrivals({route,stop,arrivals,clock,stale,phase,expanded,onToggle,onRemind}:{route:Route;stop:Stop;arrivals:Arrival[];clock:number;stale:boolean;phase:'loading'|'error'|'ready';expanded:boolean;onToggle:()=>void;onRemind?:()=>void}){
  const app=useApp(),rows=stationArrivals(arrivals,route.id,stop.id,stop.sequence,clock).slice(0,3);
  const values=rows.map(row=>arrivalView(row,clock,stale));
  const summary=phase==='loading'?app.tr('讀取到站中','读取到站中','Loading arrivals'):phase==='error'?app.tr('到站資料暫不可用','到站数据暂不可用','Arrivals unavailable'):stale||values[0]?.state==='stale'?app.tr('資料較舊','数据较旧','Stale data'):values[0]?.state==='minutes'?values[0].minutes+' '+app.tr('分鐘','分钟','min'):values[0]?.state==='due'?app.tr('即將到達','即将到达','Due'):app.tr('暫無預計','暂无预计','No estimate');
  return <View className={'route-stop '+(expanded?'is-expanded':'')}>
    <Button className='timeline-row' onClick={onToggle} ariaLabel={String(stop.sequence)+' · '+app.name(stop.name)+' · '+summary+' · '+(expanded?app.tr('收起班次','收起班次','Collapse predictions'):app.tr('展開班次','展开班次','Expand predictions'))}>
      <View className='timeline-order'>{stop.sequence}</View>
      <View className='timeline-copy'><Text className='row-title'>{app.name(stop.name)}</Text>{app.locale!=='en'&&<Text className='caption'>{stop.name.en}</Text>}<Text className={'route-eta-summary '+(stale?'is-stale':'')}>{summary}</Text>{phase==='ready'&&!stale&&values.length>1&&<Text className='caption route-eta-subsequent'>{app.tr('其後：','其后：','Then: ')}{values.slice(1).map(value=>value.state==='minutes'?value.minutes+' '+app.tr('分','分','min'):value.state==='due'?app.tr('即將到達','即将到达','Due'):'—').join(' · ')}</Text>}</View>
      <Icon name={expanded?'chevronDown':'chevron'} size={17}/>
    </Button>
    {expanded&&<View className='route-stop-detail'>
      <Text className='route-detail-title'>{app.tr('預計到達本站','预计到达本站','Expected at this stop')}</Text>
      {phase==='loading'&&<Text className='description'>{app.tr('正在取得官方到站資料…','正在取得官方到站数据…','Fetching official arrival predictions…')}</Text>}
      {phase==='error'&&<Text className='description'>{app.tr('未能取得資料，請使用上方刷新重試。','未能取得数据，请使用上方刷新重试。','Predictions are unavailable. Use Refresh above to try again.')}</Text>}
      {phase==='ready'&&rows.map((row,index)=>{const value=values[index];return <View className='route-prediction' key={row.id}>
        <View className='route-prediction-label'><Text>{index===0?app.tr('下一班','下一班','Next bus'):app.tr('其後第 ','其后第 ','Following ')+index+app.tr(' 班',' 班','')}</Text><Text className='caption'>{value.time?value.time+' HKT':value.state==='stale'?app.tr('預計時間已過時','预计时间已过时','Prediction is outdated'):app.tr('官方未提供時間','官方未提供时间','No time supplied')}</Text></View>
        <ArrivalNumber arrival={row} clock={clock} stale={stale}/>
        {app.name(row.remark)&&<Text className='caption route-prediction-remark'>{app.name(row.remark)}</Text>}
      </View>;})}
      {phase==='ready'&&!rows.length&&<Text className='description'>{app.tr('本站暫無預計到站資料，不代表路線停駛。','本站暂无预计到站数据，不代表路线停驶。','No arrival estimate is available for this stop. This does not mean the route is suspended.')}</Text>}
      <View className='route-stop-actions'><Button className='text-button' onClick={()=>openStop(stop.id)}><Icon name='bus' color='teal' size={17}/>{app.tr('車站所有路線','车站所有路线','All routes at this stop')}</Button>{onRemind&&<Button className='text-button' onClick={onRemind}><Icon name='bell' color='teal' size={17}/>{app.tr('到站提醒','到站提醒','Arrival reminder')}</Button>}</View>
    </View>}
  </View>;
}
