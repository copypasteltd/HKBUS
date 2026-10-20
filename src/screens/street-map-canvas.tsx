import {useEffect,useRef,useState} from 'react';
import {Map as GLMap,NavigationControl,AttributionControl,LngLatBounds,setWorkerUrl,type GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {View,Text,Button} from '@tarojs/components';
import {useDidShow,useDidHide} from '@tarojs/taro';
import {useApp} from '../state';
import {Icon} from '../components';
import {stopKey,routePalette,boundedMapArea,type MapLine,type StreetMapProps} from '../services/map-model';
setWorkerUrl('/assets/maplibre/v6.15.0/maplibre-gl-worker.mjs');
export default function StreetMapCanvas(props:StreetMapProps){
 const app=useApp(),container=useRef<HTMLDivElement>(null),mapRef=useRef<GLMap|null>(null),latest=useRef(props);latest.current=props;
 const[revision,setRevision]=useState(0),[ready,setReady]=useState(false),[warning,setWarning]=useState(''),[shown,setShown]=useState(true),[visible,setVisible]=useState(()=>document.visibilityState!=='hidden');
 useDidShow(()=>setShown(true));useDidHide(()=>setShown(false));
 useEffect(()=>{const change=()=>setVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
 const view=()=>{const map=mapRef.current;if(!map)return;const bounds=map.getBounds(),center=map.getCenter(),area=boundedMapArea({west:bounds.getWest(),east:bounds.getEast(),south:bounds.getSouth(),north:bounds.getNorth()});if(area)latest.current.onViewChange?.(area,{latitude:center.lat,longitude:center.lng});};
 const fit=()=>{const map=mapRef.current,p=latest.current;if(!map)return;const bounds=new LngLatBounds();p.stops.forEach(stop=>bounds.extend([stop.longitude,stop.latitude]));p.geometry?.coordinates.forEach(path=>path.forEach(point=>bounds.extend([point[0],point[1]])));p.lines?.forEach(line=>line.geometry.coordinates.forEach(path=>path.forEach(point=>bounds.extend([point[0],point[1]]))));if(p.pickedPoint)bounds.extend([p.pickedPoint.longitude,p.pickedPoint.latitude]);if(bounds.isEmpty()&&p.center)bounds.extend([p.center.longitude,p.center.latitude]);if(!bounds.isEmpty())map.fitBounds(bounds,{padding:44,maxZoom:16,duration:0});};
 const sync=()=>{
  const map=mapRef.current,p=latest.current;if(!map?.getSource('stops')||!map.getSource('route'))return;
  const points={type:'FeatureCollection' as const,features:p.stops.map(stop=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:[stop.longitude,stop.latitude]},properties:{key:stopKey(stop),name:app.name(stop.name),order:stop.mapLabel||String(stop.sequence??''),selected:p.selected===stopKey(stop)||p.selected===stop.id?1:0}}))};
  const lines:MapLine[]=[...p.geometry?[{id:'route',geometry:p.geometry,color:0}]:[],...p.lines||[]];
  const collection=(dashed:boolean)=>({type:'FeatureCollection' as const,features:lines.filter(line=>!!line.dashed===dashed).map(line=>({type:'Feature' as const,geometry:line.geometry,properties:{color:routePalette[line.color%routePalette.length]}}))});
  (map.getSource('stops') as GeoJSONSource).setData(points);(map.getSource('route') as GeoJSONSource).setData(collection(false));(map.getSource('walks') as GeoJSONSource).setData(collection(true));
  for(const[id,point]of [['user',p.user],['picked',p.pickedPoint]] as const)(map.getSource(id) as GeoJSONSource).setData({type:'FeatureCollection',features:point?[{type:'Feature',geometry:{type:'Point',coordinates:[point.longitude,point.latitude]},properties:{}}]:[]});
 };
 useEffect(()=>{
  if(!shown||!visible||!container.current){setReady(false);return;}let disposed=false,timeout:ReturnType<typeof setTimeout>|undefined;setReady(false);setWarning('');
  try{
   const initial=latest.current.center||{latitude:22.3193,longitude:114.1694};
   const map=new GLMap({container:container.current,style:'https://tiles.openfreemap.org/styles/'+(app.theme==='dark'?'dark':'positron'),center:[initial.longitude,initial.latitude],zoom:14,attributionControl:false,renderWorldCopies:false,maxZoom:19,minZoom:9,maxBounds:[[112.9,21.9],[115.1,23.1]]});mapRef.current=map;
   map.addControl(new NavigationControl({showCompass:false}),'top-right');map.addControl(new AttributionControl({compact:false}),'bottom-left');
   map.on('load',()=>{if(disposed)return;
    for(const id of ['route','walks','stops','user','picked'])map.addSource(id,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':['get','color'],'line-width':5,'line-opacity':.9},layout:{'line-join':'round','line-cap':'round'}});
    map.addLayer({id:'walk-line',type:'line',source:'walks',paint:{'line-color':app.theme==='dark'?'#e5f2f4':'#516773','line-width':3,'line-dasharray':[2,2]}});
    map.addLayer({id:'stop-points',type:'circle',source:'stops',paint:{'circle-radius':['case',['==',['get','selected'],1],10,7],'circle-color':['case',['==',['get','selected'],1],'#c65f4c','#0c716e'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
    map.addLayer({id:'stop-labels',type:'symbol',source:'stops',minzoom:13,layout:{'text-field':['get',latest.current.route?'order':'name'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,1.5],'text-anchor':'top'},paint:{'text-color':app.theme==='dark'?'#e5f2f4':'#163b63','text-halo-color':app.theme==='dark'?'#142e38':'#ffffff','text-halo-width':2}});
    map.addLayer({id:'stop-hit-targets',type:'circle',source:'stops',paint:{'circle-radius':22,'circle-opacity':0}});
    for(const id of ['user','picked'])map.addLayer({id:id+'-point',type:'circle',source:id,paint:{'circle-radius':id==='picked'?10:7,'circle-color':id==='picked'?'#c65f4c':'#286fcc','circle-stroke-color':'#fff','circle-stroke-width':3}});
    sync();if(latest.current.autoFit!==false)fit();view();setReady(true);setWarning('');clearTimeout(timeout);
   });
   map.on('moveend',view);
   map.on('click',event=>{if(!map.getLayer('stop-hit-targets'))return;const hits=map.queryRenderedFeatures([[event.point.x-22,event.point.y-22],[event.point.x+22,event.point.y+22]],{layers:['stop-hit-targets']}),keys=new Set(hits.map(feature=>feature.properties?.key));
    const stop=latest.current.stops.filter(item=>keys.has(stopKey(item))).sort((a,b)=>{const x=map.project([a.longitude,a.latitude]),y=map.project([b.longitude,b.latitude]);return Math.hypot(x.x-event.point.x,x.y-event.point.y)-Math.hypot(y.x-event.point.x,y.y-event.point.y);})[0];
    if(stop)latest.current.onSelect(stop);else latest.current.onPick?.({latitude:event.lngLat.lat,longitude:event.lngLat.lng});
   });
   map.on('error',()=>{if(!disposed)setWarning('tiles');});timeout=setTimeout(()=>{if(!disposed&&!map.loaded())setWarning('tiles');},20000);
   const resize=new ResizeObserver(()=>map.resize());resize.observe(container.current);
   return()=>{disposed=true;clearTimeout(timeout);resize.disconnect();map.remove();mapRef.current=null;};
  }catch{setWarning('unavailable');return()=>{disposed=true;clearTimeout(timeout);mapRef.current?.remove();mapRef.current=null;};}
 },[app.theme,revision,shown,visible]);
 useEffect(()=>{sync();},[props.stops,props.selected,props.geometry,props.lines,props.user,props.pickedPoint,ready,app.locale]);
 useEffect(()=>{if(ready&&props.autoFit!==false)fit();},[props.stops,props.geometry,props.lines,ready]);
 useEffect(()=>{if(ready&&props.center&&props.autoFit===false)mapRef.current?.jumpTo({center:[props.center.longitude,props.center.latitude],zoom:15});},[props.center?.latitude,props.center?.longitude,ready]);
 return <View className={'street-map '+(props.large?'map-large':'')}><View className='map-toolbar'><Text className='row-title'>{app.tr('街道地圖','街道地图','Street map')}</Text><Button className='text-button' disabled={!ready} onClick={fit}><Icon name='target' color='teal' size={17}/>{app.tr('顯示全部','显示全部','Fit all')}</Button></View><div className='map-stage' ref={container} aria-busy={!ready} role='region' aria-label={app.tr('可拖動與縮放的官方車站地圖','可拖动与缩放的官方车站地图','Interactive map of official bus stops')}/>{props.onPick&&<Button className='map-center-button text-button' disabled={!ready} onClick={()=>{const center=mapRef.current?.getCenter();if(center)props.onPick?.({latitude:center.lat,longitude:center.lng});}}><Icon name='pin' color='teal'/>{app.tr('選取地圖中心','选取地图中心','Select map centre')}</Button>}{!ready&&!warning&&<Text className='map-footnote'>{app.tr('正在載入地圖底圖…','正在加载地图底图…','Loading map tiles…')}</Text>}{warning&&<View className='map-warning'><Text>{app.tr('底圖載入未完成，可重試或使用下方車站列表。','底图加载未完成，可重试或使用下方车站列表。','Map tiles are unavailable. Retry or use the stop list below.')}</Text><Button className='text-button' onClick={()=>setRevision(x=>x+1)}>{app.tr('重試地圖','重试地图','Retry map')}</Button></View>}<Text className='map-footnote'>{props.stops.length} {app.tr('個官方車站 · 點按圓點選站','个官方车站 · 点击圆点选站','official stops · Tap a stop to select')}{props.route?(props.geometry?app.tr(' · 官方路線幾何',' · 官方路线几何',' · Official route geometry'):app.tr(' · 路線幾何暫不可用，只顯示車站',' · 路线几何暂不可用，仅显示车站',' · Route geometry unavailable; stops only')):''}{props.geometryState==='stale'?app.tr(' · 路線資料較舊',' · 路线数据较旧',' · Cached route data'):''}</Text></View>;
}
