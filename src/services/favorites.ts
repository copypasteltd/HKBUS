import type {Arrivals,Bookmark,ServiceSelection,Stop,StopService} from './types';
export const serviceKey=(service:ServiceSelection)=>service.routeId+':'+service.sequence;
export function stopServiceGroups(result:Arrivals):{route:StopService['route'];sequence?:number}[]{
 if(result.services)return result.services;
 return result.routes.flatMap(route=>{const sequences=[...new Set(result.arrivals.filter(row=>row.routeId===route.id&&row.stopId===result.stop.id).map(row=>row.stopSequence))];return(sequences.length?sequences:[undefined]).map(sequence=>({route,sequence}));});
}
export function chosenServices(result:Arrivals,selection:'all'|ServiceSelection[]){const groups=stopServiceGroups(result);return selection==='all'?groups:groups.filter(service=>selection.some(item=>item.routeId===service.route.id&&item.sequence===service.sequence));}
export function distanceTo(stop:Stop,point:{latitude:number;longitude:number}|null){if(!point)return null;const rad=(n:number)=>n*Math.PI/180,a=Math.sin(rad(stop.latitude-point.latitude)/2)**2+Math.cos(rad(point.latitude))*Math.cos(rad(stop.latitude))*Math.sin(rad(stop.longitude-point.longitude)/2)**2;return Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));}
export function sortedBookmarks(items:Bookmark[],sort:'manual'|'distance',point:{latitude:number;longitude:number}|null){return [...items].sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(sort==='distance'&&point?(a.kind==='stop'&&a.entity?distanceTo(a.entity as Stop,point)!:Infinity)-(b.kind==='stop'&&b.entity?distanceTo(b.entity as Stop,point)!:Infinity)||a.position-b.position:a.position-b.position));}
