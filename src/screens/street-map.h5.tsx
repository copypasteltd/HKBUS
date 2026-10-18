import {lazy,Suspense} from 'react';
import {View,Text} from '@tarojs/components';
import {useApp} from '../state';
import type {StreetMapProps} from '../services/map-model';
const Canvas=lazy(()=>import('./street-map-canvas'));
export function StreetMap(props:StreetMapProps){const app=useApp();return <Suspense fallback={<View className='map-stage map-loading'><Text>{app.tr('正在載入街道地圖','正在加载街道地图','Loading street map')}</Text></View>}><Canvas {...props}/></Suspense>;}
