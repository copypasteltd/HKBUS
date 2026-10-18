import {useMemo,useState} from 'react';
import {Map,View,Text,Button} from '@tarojs/components';
import {useApp} from '../state';
import {Icon} from '../components';
import {mapCoordinate,stopKey,type StreetMapProps} from '../services/map-model';
export function StreetMap({stops,selected,onSelect,geometry,route,geometryState,user}:StreetMapProps){
 const app=useApp(),[revision,setRevision]=useState(0),[failed,setFailed]=useState(false);
 const points=useMemo(()=>stops.map(stop=>mapCoordinate(stop.latitude,stop.longitude)),[stops]);
 const center=points[0]||mapCoordinate(22.3193,114.1694);
 const markers=stops.map((stop,index)=>({id:index+1,...points[index],iconPath:'/assets/icons/pin-'+(selected===stopKey(stop)||selected===stop.id?'coral':'teal')+'.png',width:44,height:44,title:app.name(stop.name)}));
 if(user)markers.push({id:0,...mapCoordinate(user.latitude,user.longitude),iconPath:'/assets/icons/target-teal.png',width:28,height:28,title:app.tr('本次位置','本次位置','Current location')});
 return <View className='street-map'><View className='map-toolbar'><Text className='row-title'>{app.tr('街道地圖','街道地图','Street map')}</Text><Button className='text-button' onClick={()=>{setFailed(false);setRevision(x=>x+1);}}><Icon name='target' color='teal' size={17}/>{app.tr('顯示全部','显示全部','Fit all')}</Button></View><Map key={revision} id={'transit-map-'+revision} className='map-stage' latitude={center.latitude} longitude={center.longitude} scale={14} markers={markers} polyline={geometry?.coordinates.map(path=>({points:path.map(point=>mapCoordinate(point[1],point[0])),color:'#0c716e',width:5}))||[]} includePoints={points} enableZoom enableScroll showCompass onMarkerTap={event=>{const stop=stops[Number(event.detail.markerId)-1];if(stop)onSelect(stop);}} onError={()=>setFailed(true)}/>{failed&&<Text className='map-warning'>{app.tr('地圖未能載入，請重試或使用下方車站列表。','地图未能加载，请重试或使用下方车站列表。','The map could not load. Retry or use the stop list below.')}</Text>}<Text className='map-footnote'>{stops.length} {app.tr('個官方車站 · 點按標記選站','个官方车站 · 点击标记选站','official stops · Tap a stop to select')}{route?(geometry?app.tr(' · 官方路線幾何',' · 官方路线几何',' · Official route geometry'):app.tr(' · 路線幾何暫不可用，只顯示車站',' · 路线几何暂不可用，仅显示车站',' · Route geometry unavailable; stops only')):''}{geometryState==='stale'?app.tr(' · 路線資料較舊',' · 路线数据较旧',' · Cached route data'):''}</Text></View>;
}
