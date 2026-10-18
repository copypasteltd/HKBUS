import {useState,useEffect,useRef} from 'react';
import {View,Text,Button,Picker} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {Shell,Intro,Section,Action,Icon,StateCard,ModeNote,RouteChip} from '../components';
import {useApp,useAction} from '../state';
import {api} from '../services/api';
import {StopSelect} from './transit';
import {go,useParam} from '../navigation';
import {SaveTripButton} from './travel-actions';
import {JourneyCard,JourneyControls,JourneyComparison} from './journey-tools';
import {selectJourneys,toggleComparison,type JourneyResult,type JourneyFilter,type JourneySort} from '../services/journeys';
import type {Stop} from '../services/types';
import {GuideLink,JourneySteps} from './content';
import {hongKongTime} from '../services/discovery';

interface RoadResult {provider:string;source:'live';distanceMeters:number;durationSeconds:number;averageSpeedKmh:number|null;generatedAt:string;alternatives:{name:string;distU:string;eta:string}[];notice:string}
export function Planner(){
  const app=useApp(),action=useAction(),startId=useParam('startId'),endId=useParam('endId'),auto=useParam('auto');
  const[start,setStart]=useState<Stop|null>(null),[end,setEnd]=useState<Stop|null>(null),[result,setResult]=useState<JourneyResult|null>(null),[error,setError]=useState(''),[resolving,setResolving]=useState(false);
  const[filter,setFilter]=useState<JourneyFilter>('all'),[sort,setSort]=useState<JourneySort>('stops'),[pricedOnly,setPricedOnly]=useState(false),[compared,setCompared]=useState<string[]>([]),[comparison,setComparison]=useState(false);
  const generation=useRef(0);
  const invalidate=()=>{generation.current++;setResolving(false);setResult(null);setError('');setCompared([]);setComparison(false);};
  const select=(which:'start'|'end',stop:Stop)=>{invalidate();(which==='start'?setStart:setEnd)(stop);};
  async function find(a:Stop,b:Stop,ticket:number){
    const value=await api.post<JourneyResult>('/v1/journeys',{startId:a.id,endId:b.id});
    if(ticket!==generation.current)return;
    if(value.start.id!==a.id||value.end.id!==b.id)throw new Error(app.tr('行程站點已變更，請重新查詢','行程站点已变更，请重新查询','Journey stops changed. Search again.'));
    setResult(value);
  }
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{
    if(!startId&&!endId)return;
    invalidate();setStart(null);setEnd(null);
    const ticket=generation.current;
    if(!startId&&!endId)return;
    setResolving(true);
    const resolve=async(id:string)=>{
      if(!/^[A-F0-9]{16}$/.test(id))throw new Error(app.tr('車站連結無效，請重新選站','车站链接无效，请重新选站','Invalid stop link. Choose a stop again.'));
      const value=await api.get<{stop:Stop}>('/v1/stops/'+encodeURIComponent(id));
      if(value.stop?.id!==id||value.stop.active===false)throw new Error(app.tr('車站已變更，請重新選站','车站已变更，请重新选站','This stop changed. Choose it again.'));
      return value.stop;
    };
    void (async()=>{
      try{
        const[a,b]=await Promise.all([startId?resolve(startId):null,endId?resolve(endId):null]);
        if(ticket!==generation.current)return;setStart(a);setEnd(b);
        if(auto==='1'&&a&&b&&a.id!==b.id&&app.config.features.planner)await find(a,b,ticket);
      }catch(problem){if(ticket===generation.current)setError(problem instanceof Error?problem.message:'Unable to load stops');}
      finally{if(ticket===generation.current)setResolving(false);}
    })();
    return()=>{generation.current++;};
  },[startId,endId,auto,app.config.features.planner]);
  const search=()=>void action.run(async()=>{
    invalidate();const ticket=generation.current;
    if(!start||!end){setError(app.tr('請選擇出發地與目的地','请选择出发地与目的地','Choose both your origin and destination.'));return;}
    if(start.id===end.id){setError(app.tr('起點與終點不能相同','起点与终点不能相同','Choose two different stops.'));return;}
    try{await find(start,end,ticket);}catch(problem){if(ticket===generation.current)setError(problem instanceof Error?problem.message:'Unable to find journeys');}
  });
  const journeys=selectJourneys(result?.journeys||[],filter,sort,pricedOnly),chosen=(result?.journeys||[]).filter(x=>compared.includes(x.id));
  const compare=(id:string)=>{try{setCompared(toggleComparison(compared,id));}catch{void Taro.showToast({title:app.tr('最多比較 3 條行程，請先移除一條','最多比较 3 条行程，请先移除一条','Compare up to three journeys. Remove one first.'),icon:'none'});}};
  return <Shell screen='planner' title={app.tr('行程規劃','行程规划','Plan a journey')} subtitle='Journey planner'>
    <Intro eyebrow='One journey at a time' title={app.tr('從這裡，到想去的地方。','从这里，到想去的地方。','From here to where you want to be.')} description={app.tr('查找直達或同站轉乘，再選一條適合你的行程。','查找直达或同站换乘，再选一条适合你的行程。','Find direct buses or a same-stop transfer, then compare your options.')}/>
    <Button className='travel-entry' onClick={()=>go('trips')}><Icon name='star' color='teal' size={20}/><Text>{app.tr('使用常用行程','使用常用行程','Use a saved journey')}</Text><Text className='count-badge'>{app.trips.length}</Text><Icon name='chevron' size={16}/></Button>
    <View className='card journey-form'><StopSelect label={app.tr('出發地','出发地','From')} value={start} onChange={stop=>select('start',stop)}/><Button className='icon-button' disabled={resolving} ariaLabel={app.tr('交換起終點','交换起终点','Swap origin and destination')} onClick={()=>{invalidate();setStart(end);setEnd(start);}}><Icon name='refresh' color='teal'/></Button><StopSelect label={app.tr('目的地','目的地','To')} value={end} onChange={stop=>select('end',stop)}/><Text className='field-hint'>{app.tr('只提供目前資料中的直達或一次同站轉乘候選，不含步行轉乘。站數不代表乘車時間；車費未計優惠。','仅提供当前数据中的直达或一次同站换乘候选，不含步行换乘。站数不代表乘车时间；票价未计优惠。','Suggestions cover direct buses or one same-stop transfer, without walking transfers. Stop count is not journey time. Fares exclude discounts.')}</Text>{resolving&&<Text className='caption'>{app.tr('核對官方車站與行程中…','核对官方车站与行程中…','Checking current stops and journeys…')}</Text>}{error&&<Text className='form-error' {...(process.env.TARO_ENV==='h5'?{role:'alert'}:{})}>{error}</Text>}<View className='button-row'><Action loading={action.busy||resolving} disabled={!app.config.features.planner} onClick={search}><Icon name='route' color='white'/>{app.tr('查看建議','查看建议','Find journeys')}</Action><Action secondary onClick={()=>{invalidate();setResolving(false);setStart(null);setEnd(null);}}>{app.tr('重設','重置','Reset')}</Action></View>{start&&end&&start.id!==end.id&&!resolving&&<SaveTripButton start={start} end={end}/>}</View>
    {!app.config.features.planner&&<StateCard title={app.tr('行程查詢暫未開啟','行程查询暂未开启','Journey search is unavailable')}/>}
    {result?<Section title={app.tr('建議行程','建议行程','Suggested journeys')} caption={app.name(result.start.name)+' → '+app.name(result.end.name)}>
      {!!result.journeys.length&&<><JourneyControls filter={filter} sort={sort} pricedOnly={pricedOnly} onFilter={setFilter} onSort={setSort} onPriced={()=>setPricedOnly(!pricedOnly)} total={result.journeys.length} visible={journeys.length}/><View className='comparison-bar'><Text className='caption'>{compared.length}/3 {app.tr('已選比較','已选比较','selected to compare')}</Text><Button className='text-button' disabled={!compared.length} onClick={()=>setComparison(true)}>{app.tr('查看比較','查看比较','Compare selected')}<Icon name='chevron' color='teal' size={16}/></Button></View></>}
      {journeys.map(journey=><JourneyCard key={journey.id} journey={journey} selected={compared.includes(journey.id)} onCompare={()=>compare(journey.id)}/>)}
      {!journeys.length&&<StateCard title={result.journeys.length?app.tr('沒有符合篩選的行程','没有符合筛选的行程','No journeys match these filters'):app.tr('暫未找到行程','暂未找到行程','No journeys found')} description={app.tr('可清除篩選，或改選鄰近車站。只比較這次查詢返回的候選，不保證全港最低車費。','可清除筛选，或改选邻近车站。仅比较本次查询返回的候选，不保证全港最低票价。','Clear filters or choose nearby stops. Comparisons cover the suggestions returned for this search, not every route in Hong Kong.')} retry={result.journeys.length?()=>{setFilter('all');setPricedOnly(false);}:undefined} actionLabel={app.tr('清除篩選','清除筛选','Clear filters')}/>}
    </Section>:!resolving&&<Section title={app.tr('準備出發','准备出发','Ready when you are')}><JourneySteps/></Section>}
    {app.config.features.traffic&&<Button className='text-button' onClick={()=>go('traffic')}><Icon name='traffic' color='teal'/>{app.tr('查看道路交通參考','查看道路交通参考','Road traffic reference')}</Button>}<GuideLink topic='planning'/><ModeNote/>
    {comparison&&<JourneyComparison journeys={chosen} onRemove={id=>setCompared(compared.filter(x=>x!==id))} onClear={()=>setCompared([])} onClose={()=>setComparison(false)}/>}
  </Shell>;
}
export function Traffic(){
  const app=useApp(),action=useAction();const[start,setStart]=useState<Stop|null>(null),[end,setEnd]=useState<Stop|null>(null),[depart,setDepart]=useState(0),[type,setType]=useState<'ST'|'SD'>('ST'),[tunnel,setTunnel]=useState(''),[result,setResult]=useState<RoadResult|null>(null),[error,setError]=useState('');
  const departValues=[0,15,30,45,60,75,90],tunnels=['','cht','eht','wht'];const tunnelLabels=[app.tr('自動選擇','自动选择','Automatic'),app.tr('紅磡海底隧道','红磡海底隧道','Cross Harbour Tunnel'),app.tr('東區海底隧道','东区海底隧道','Eastern Harbour Crossing'),app.tr('西區海底隧道','西区海底隧道','Western Harbour Crossing')];
  const clear=()=>{setResult(null);setError('');};
  const search=()=>void action.run(async()=>{clear();if(!start||!end){setError(app.tr('請選擇兩個不同的車站位置','请选择两个不同的车站位置','Choose two different stop locations.'));return;}if(start.id===end.id){setError(app.tr('起終點不能相同','起终点不能相同','Choose two different locations.'));return;}try{setResult(await api.post<RoadResult>('/v1/traffic/route',{start:{lat:start.latitude,long:start.longitude,buffer:200},end:{lat:end.latitude,long:end.longitude,buffer:200},departIn:depart,lang:app.locale,type,...tunnel?{tunnel}:{}}));}catch(problem){setError(problem instanceof Error?problem.message:'Road reference is unavailable');}});
  const available=app.config.features.traffic&&app.config.tdasEnabled;
  return <Shell screen='traffic' title={app.tr('道路交通','道路交通','Road traffic')} subtitle='Traffic reference'><Intro eyebrow='A separate road reference' title={app.tr('出發前，看看路況。','出发前，看看路况。','A look at the road ahead.')} description={app.tr('使用車站位置查詢道路行駛時間，作獨立參考。','使用车站位置查询道路行驶时间，作独立参考。','Use stop locations to look up a separate road travel estimate.')}/><View className='status-banner warning'><Icon name='info' color='teal'/><Text>{app.tr('TDAS 是道路交通參考，不能當作巴士到站、候車或乘車時間。','TDAS 是道路交通参考，不能当作巴士到站、候车或乘车时间。','TDAS is a road traffic reference. It does not predict bus arrivals, waiting time or bus journey duration.')}</Text></View><View className='card journey-form'><StopSelect label={app.tr('起點位置','起点位置','Start location')} value={start} onChange={stop=>{setStart(stop);clear();}}/><StopSelect label={app.tr('終點位置','终点位置','End location')} value={end} onChange={stop=>{setEnd(stop);clear();}}/><View className='field'><Text className='field-label'>{app.tr('出發時間','出发时间','Departure')}</Text><Picker range={departValues.map(x=>x===0?app.tr('現在出發','现在出发','Leave now'):x+' '+app.tr('分鐘後','分钟后','minutes from now'))} value={departValues.indexOf(depart)} onChange={event=>{setDepart(departValues[Number(event.detail.value)]);clear();}}><View className='field-control'>{depart===0?app.tr('現在出發','现在出发','Leave now'):depart+' '+app.tr('分鐘後','分钟后','minutes from now')}<Icon name='chevronDown'/></View></Picker></View><View className='field'><Text className='field-label'>{app.tr('路線偏好','路线偏好','Route preference')}</Text><View className='filter-row'>{(['ST','SD'] as const).map(value=><Button key={value} className={'filter-chip '+(type===value?'selected':'')} onClick={()=>{setType(value);clear();}}>{value==='ST'?app.tr('較短時間','较短时间','Shortest time'):app.tr('較短距離','较短距离','Shortest distance')}</Button>)}</View></View><View className='field'><Text className='field-label'>{app.tr('過海隧道','过海隧道','Harbour crossing')}</Text><Picker range={tunnelLabels} value={tunnels.indexOf(tunnel)} onChange={event=>{setTunnel(tunnels[Number(event.detail.value)]);clear();}}><View className='field-control'>{tunnelLabels[tunnels.indexOf(tunnel)]}<Icon name='chevronDown'/></View></Picker></View>{error&&<Text className='form-error' {...(process.env.TARO_ENV==='h5'?{role:'alert'}:{})}>{error}</Text>}<Action loading={action.busy} disabled={!available} onClick={search}>{app.tr('查詢道路參考','查询道路参考','Check road traffic')}</Action></View>{!available&&<StateCard title={app.tr('道路參考暫不可用','道路参考暂不可用','Road reference unavailable')} description={app.tr('服務尚未啟用，可繼續查看巴士到站。','服务尚未启用，可继续查看巴士到站。','The service is not enabled. Bus arrivals remain available.')} retry={()=>go('search')}/>} {result&&<Section title={app.tr('道路行駛參考','道路行驶参考','Road travel reference')}><View className='card'><View className='metrics-pair'><View className='metric'><Text className='metric-number'>{Math.ceil(result.durationSeconds/60)}</Text><Text className='metric-unit'>{app.tr('分鐘 · 道路行駛','分钟 · 道路行驶','min · by road')}</Text></View><View className='metric'><Text className='metric-number'>{(result.distanceMeters/1000).toFixed(1)}</Text><Text className='metric-unit'>{app.tr('公里','公里','km')}</Text></View></View><Text className='card-caption'>TDAS · {app.tr('查詢時間','查询时间','Fetched')} · {hongKongTime(result.generatedAt,true)||'—'}</Text></View>{result.alternatives.map((alternative,index)=><View className='card' key={index}><Text className='card-title'>{alternative.name}</Text><Text className='caption'>{alternative.distU} · {alternative.eta}</Text></View>)}</Section>}<GuideLink topic='road'/><ModeNote/></Shell>;
}
