import type {Stop,RouteReference} from './types';
export interface MapPoint {latitude:number;longitude:number}
export interface MapBounds {west:number;east:number;south:number;north:number}
export interface MapLine {id:string;geometry:NonNullable<RouteReference['geometry']>;color:number;dashed?:boolean}
export type MapStop=Stop&{mapKey?:string;mapLabel?:string};
export interface StreetMapProps {stops:MapStop[];selected:string;onSelect:(stop:MapStop)=>void;geometry?:RouteReference['geometry'];route?:boolean;geometryState?:RouteReference['state'];user?:MapPoint|null;lines?:MapLine[];center?:MapPoint;autoFit?:boolean;large?:boolean;onViewChange?:(bounds:MapBounds,center:MapPoint)=>void;onPick?:(point:MapPoint)=>void;pickedPoint?:MapPoint|null}
export const stopKey=(stop:MapStop)=>stop.mapKey||stop.id+':'+(stop.sequence??0);
export const routePalette=['#0c716e','#b04f3c','#405eab'];
export function hongKongPoint(point:MapPoint){return Number.isFinite(point.latitude)&&Number.isFinite(point.longitude)&&point.latitude>=22&&point.latitude<=23&&point.longitude>=113&&point.longitude<=115;}
export function boundedMapArea(bounds:MapBounds):MapBounds|null{const value={west:Math.max(113,bounds.west),east:Math.min(115,bounds.east),south:Math.max(22,bounds.south),north:Math.min(23,bounds.north)};return Object.values(value).every(Number.isFinite)&&value.west<value.east&&value.south<value.north?value:null;}
/** Inverse is used only for native map events. Public coordinates remain WGS84 everywhere else. */
export function mapOriginal(latitude:number,longitude:number){let point={latitude,longitude};for(let i=0;i<5;i++){const projected=mapCoordinate(point.latitude,point.longitude);point={latitude:point.latitude+latitude-projected.latitude,longitude:point.longitude+longitude-projected.longitude};}return point;}
export function nativeMapPoint(event:unknown):MapPoint|null{const value=event as {detail?:{latitude?:number;longitude?:number;centerLocation?:MapPoint}};const point=value?.detail?.centerLocation||value?.detail;return point&&typeof point.latitude==='number'&&typeof point.longitude==='number'?mapOriginal(point.latitude,point.longitude):null;}
/** Include road bends outside stop bounds without sending thousands of extra includePoints to a native map. */
export function mapFitPoints(stops:Stop[],geometry?:RouteReference['geometry']){
 const points=[...stops.map(stop=>[stop.longitude,stop.latitude]),...geometry?.coordinates.flat()||[]].map(point=>mapCoordinate(point[1],point[0]));
 if(!points.length)return[];
 return[{latitude:Math.min(...points.map(point=>point.latitude)),longitude:Math.min(...points.map(point=>point.longitude))},{latitude:Math.max(...points.map(point=>point.latitude)),longitude:Math.max(...points.map(point=>point.longitude))}];
}
/** Render-only WGS84 → GCJ-02 conversion for Chinese mini-program map components. Catalog coordinates stay WGS84. */
export function mapCoordinate(latitude:number,longitude:number){
 if(longitude<113||longitude>115||latitude<22||latitude>23)return{latitude,longitude};
 const x=longitude-105,y=latitude-35,pi=Math.PI;
 let lat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
 lat+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3+(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3+(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;
 let lng=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
 lng+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3+(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3+(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;
 const rad=latitude/180*pi,sin=Math.sin(rad),magic=1-.00669342162296594323*sin*sin,sqrt=Math.sqrt(magic);
 return{latitude:latitude+lat*180/(6378245*(1-.00669342162296594323)/(magic*sqrt)*pi),longitude:longitude+lng*180/(6378245/sqrt*Math.cos(rad)*pi)};
}
