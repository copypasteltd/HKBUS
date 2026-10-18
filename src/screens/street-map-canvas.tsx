import {useEffect,useRef,useState} from 'react';
import {Map as GLMap,NavigationControl,AttributionControl,LngLatBounds,setWorkerUrl,type GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {View,Text,Button} from '@tarojs/components';
import {useDidShow,useDidHide} from '@tarojs/taro';
import {useApp} from '../state';
import {Icon} from '../components';
import {stopKey,type StreetMapProps} from '../services/map-model';
// MapLibre 6 ships its worker separately; its shared module is copied beside it by the H5 build.
setWorkerUrl('/assets/maplibre/v6.15.0/maplibre-gl-worker.mjs');
export default function StreetMapCanvas(props:StreetMapProps){
 const app=useApp(),container=useRef<HTMLDivElement>(null),mapRef=useRef<GLMap|null>(null),latest=useRef(props);latest.current=props;
 const[revision,setRevision]=useState(0),[ready,setReady]=useState(false),[warning,setWarning]=useState('');
 const[shown,setShown]=useState(true),[visible,setVisible]=useState(()=>document.visibilityState!=='hidden');
 useDidShow(()=>setShown(true));useDidHide(()=>setShown(false));
 useEffect(()=>{const change=()=>setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 const fit=()=>{const map=mapRef.current;if(!map||!latest.current.stops.length)return;const bounds=new LngLatBounds();latest.current.stops.forEach(stop=>bounds.extend([stop.longitude,stop.latitude]));latest.current.geometry?.coordinates.forEach(path=>path.forEach(point=>bounds.extend([point[0],point[1]])));map.fitBounds(bounds,{padding:40,maxZoom:16,duration:0});};
 const sync=()=>{
  const map=mapRef.current,{stops,geometry,selected,user}=latest.current;
  // Adding GeoJSON sources schedules a style update, so isStyleLoaded() is temporarily false.
  // Source existence is the right guard; otherwise the initial stop/route data can remain empty.
  if(!map?.getSource('stops')||!map.getSource('route')||!map.getSource('user'))return;
  const data={type:'FeatureCollection' as const,features:stops.map(stop=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[stop.longitude,stop.latitude]},properties:{key:stopKey(stop),name:app.name(stop.name),order:String(stop.sequence??''),selected:selected===stopKey(stop)||selected===stop.id?1:0}}))};
  const line={type:'FeatureCollection' as const,features:geometry?[{type:'Feature' as const,geometry,properties:{}}]:[]};
  (map.getSource('stops') as GeoJSONSource)?.setData(data);(map.getSource('route') as GeoJSONSource)?.setData(line);
  (map.getSource('user') as GeoJSONSource)?.setData({type:'FeatureCollection',features:user?[{type:'Feature',geometry:{type:'Point',coordinates:[user.longitude,user.latitude]},properties:{}}]:[]});
 };
 useEffect(()=>{
  if(!shown||!visible||!container.current){setReady(false);return;}let disposed=false,timeout:ReturnType<typeof setTimeout>|undefined;setReady(false);setWarning('');
  try{
   const map=new GLMap({container:container.current,style:'https://tiles.openfreemap.org/styles/'+(app.theme==='dark'?'dark':'positron'),center:[114.1694,22.3193],zoom:12,attributionControl:false,renderWorldCopies:false,maxZoom:19,minZoom:9});mapRef.current=map;
   map.addControl(new NavigationControl({showCompass:false}),'top-right');map.addControl(new AttributionControl({compact:false}),'bottom-left');
   map.on('load',()=>{if(disposed)return;map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':app.theme==='dark'?'#71d8c6':'#0c716e','line-width':5,'line-opacity':.85},layout:{'line-join':'round','line-cap':'round'}});
    map.addSource('stops',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'stop-points',type:'circle',source:'stops',paint:{'circle-radius':['case',['==',['get','selected'],1],10,7],'circle-color':['case',['==',['get','selected'],1],'#c65f4c','#0c716e'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
    map.addLayer({id:'stop-labels',type:'symbol',source:'stops',minzoom:13,layout:{'text-field':['get',props.route?'order':'name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.5],'text-anchor':'top'},paint:{'text-color':app.theme==='dark'?'#e5f2f4':'#163b63','text-halo-color':app.theme==='dark'?'#142e38':'#ffffff','text-halo-width':2}});
    map.addLayer({id:'stop-hit-targets',type:'circle',source:'stops',paint:{'circle-radius':22,'circle-opacity':0}});
    map.addSource('user',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'user-point',type:'circle',source:'user',paint:{'circle-radius':7,'circle-color':'#286fcc','circle-stroke-color':'#ffffff','circle-stroke-width':3}});
    sync();fit();setReady(true);setWarning('');clearTimeout(timeout);
   });
   map.on('click','stop-hit-targets',event=>{const keys=new Set(event.features?.map(feature=>feature.properties?.key));const stop=latest.current.stops.filter(item=>keys.has(stopKey(item))).sort((a,b)=>{const x=map.project([a.longitude,a.latitude]),y=map.project([b.longitude,b.latitude]);return Math.hypot(x.x-event.point.x,x.y-event.point.y)-Math.hypot(y.x-event.point.x,y.y-event.point.y);})[0];if(stop)latest.current.onSelect(stop);});
   map.on('error',()=>{if(!disposed)setWarning('tiles');});
   timeout=setTimeout(()=>{if(!disposed&&!map.loaded())setWarning('tiles');},20000);
   const resize=new ResizeObserver(()=>map.resize());resize.observe(container.current);
   return()=>{disposed=true;clearTimeout(timeout);resize.disconnect();map.remove();mapRef.current=null;};
  }catch{setWarning('unavailable');return()=>{disposed=true;clearTimeout(timeout);mapRef.current?.remove();mapRef.current=null;};}
 },[app.theme,revision,shown,visible]);
 useEffect(()=>{sync();},[props.stops,props.selected,props.geometry,props.user,ready,app.locale]);
 useEffect(()=>{if(ready)fit();},[props.stops,props.geometry,ready]);
 return <View className='street-map'><View className='map-toolbar'><Text className='row-title'>{app.tr('街道地圖','街道地图','Street map')}</Text><Button className='text-button' disabled={!ready} onClick={fit}><Icon name='target' color='teal' size={17}/>{app.tr('顯示全部','显示全部','Fit all')}</Button></View><div className='map-stage' ref={container} aria-busy={!ready} role='region' aria-label={app.tr('可拖動與縮放的官方車站地圖','可拖动与缩放的官方车站地图','Interactive map of official bus stops')}/>{!ready&&!warning&&<Text className='map-footnote'>{app.tr('正在載入地圖底圖…','正在加载地图底图…','Loading map tiles…')}</Text>}{warning&&<View className='map-warning'><Text>{app.tr('底圖載入未完成，可重試或使用下方車站列表。','底图加载未完成，可重试或使用下方车站列表。','Map tiles are unavailable. Retry or use the stop list below.')}</Text><Button className='text-button' onClick={()=>setRevision(x=>x+1)}>{app.tr('重試地圖','重试地图','Retry map')}</Button></View>}<Text className='map-footnote'>{props.stops.length} {app.tr('個官方車站 · 點按圓點選站','个官方车站 · 点击圆点选站','official stops · Tap a stop to select')}{props.route?(props.geometry?app.tr(' · 官方路線幾何',' · 官方路线几何',' · Official route geometry'):app.tr(' · 路線幾何暫不可用，只顯示車站',' · 路线几何暂不可用，仅显示车站',' · Route geometry unavailable; stops only')):''}{props.geometryState==='stale'?app.tr(' · 路線資料較舊',' · 路线数据较旧',' · Cached route data'):''}</Text></View>;
}
