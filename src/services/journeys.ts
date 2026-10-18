import type {Stop,Route,FareQuote,JourneyPricing,RouteArrivals} from './types';
import type {WatchItem} from './device-store';

export interface JourneyLeg {route:Route;board:Stop;alight:Stop;stops:number;fare?:FareQuote}
export interface Journey {id:string;transfers:number;stopCount:number;legs:JourneyLeg[];pricing?:JourneyPricing}
export interface JourneyResult {start:Stop;end:Stop;journeys:Journey[];notice:string}
export type JourneyFilter='all'|'direct'|'transfer';
export type JourneySort='stops'|'transfers'|'fare';

/** Partial/stale/conditional totals are never promoted to zero or to a verified price. */
export function verifiedTotal(journey:Journey):number|null {
  const p=journey.pricing;
  return p?.state==='complete'&&p.pricedLegs===journey.legs.length&&p.totalLegs===journey.legs.length&&Number.isSafeInteger(p.totalCents)&&p.totalCents!==null&&p.totalCents>=0?p.totalCents:null;
}
export function selectJourneys(items:Journey[],filter:JourneyFilter,sort:JourneySort,pricedOnly=false):Journey[]{
  return items.map((value,index)=>({value,index})).filter(({value})=>(filter==='all'||value.transfers===(filter==='direct'?0:1))&&(!pricedOnly||verifiedTotal(value)!==null))
    .sort((a,b)=>{
      const first=a.value,second=b.value;
      if(sort==='fare'){
        const left=verifiedTotal(first),right=verifiedTotal(second);
        if(left===null&&right!==null)return 1;if(left!==null&&right===null)return -1;
        if(left!==null&&right!==null&&left!==right)return left-right;
      }
      return (sort==='transfers'?first.transfers-second.transfers:0)||first.stopCount-second.stopCount||first.transfers-second.transfers||a.index-b.index;
    }).map(x=>x.value);
}
export function toggleComparison(selected:string[],id:string):string[]{
  if(selected.includes(id))return selected.filter(x=>x!==id);
  if(selected.length>=3)throw new Error('最多比較 3 條行程，請先移除其中一條。');
  return [...selected,id];
}
/** Validate the physical stop and its occurrence against the current complete official route. */
export function watchStop(item:Pick<WatchItem,'route'|'stop'|'sequence'>,result:RouteArrivals):Stop|null {
  const route=result.route;
  if(route.id!==item.route.id||route.bound!==item.route.bound||route.serviceType!==item.route.serviceType||route.routeNo!==item.route.routeNo||route.source!=='live'||route.active===false)return null;
  return result.stops.find(stop=>stop.id===item.stop.id&&stop.sequence===item.sequence&&stop.source==='live'&&stop.active!==false)||null;
}
