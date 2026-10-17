import type {Route,Stop,RouteArrivals} from './types';
import {arrivalView,stationArrivals,staleArrivals} from './arrivals';

export function routeSuggestions(routes:Route[],limit=6){return Array.from(new Set(routes.map(route=>route.routeNo))).slice(0,limit);}
export function findRouteStops<T extends Stop>(stops:T[],query:string):T[]{
  const term=query.trim().toLocaleLowerCase();if(!term)return stops;
  const sequence=/^\d+$/.test(term)?stops.filter(stop=>stop.sequence===Number(term)):[];
  if(sequence.length)return sequence;
  return stops.filter(stop=>Object.values(stop.name).some(name=>name.toLocaleLowerCase().includes(term))||(term.length>=4&&stop.id.toLocaleLowerCase().includes(term)));
}
export function routeStationStats(result:RouteArrivals,offline=false,clock=Date.now()){
  const stale=staleArrivals(result,offline,clock);
  const predicted=stale?0:result.stops.filter(stop=>{
    const first=stationArrivals(result.arrivals,result.route.id,stop.id,stop.sequence,clock)[0];
    return ['minutes','due'].includes(arrivalView(first,clock).state);
  }).length;
  return {total:result.stops.length,predicted,stale};
}
export function hongKongTime(value:string|null|undefined,includeDate=false){
  const timestamp=Date.parse(value||'');if(!Number.isFinite(timestamp))return null;
  const date=new Date(timestamp+8*3600000).toISOString();return (includeDate?date.slice(5,10).replace('-','/')+' ':'')+date.slice(11,16)+' HKT';
}
