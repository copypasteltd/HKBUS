import type {Stop,RouteReference} from './types';
export interface StreetMapProps {stops:Stop[];selected:string;onSelect:(stop:Stop)=>void;geometry?:RouteReference['geometry'];route?:boolean;geometryState?:RouteReference['state'];user?:{latitude:number;longitude:number}|null}
export const stopKey=(stop:Stop)=>stop.id+':'+(stop.sequence??0);
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
