import type {Stop,Route,FareQuote,JourneyPricing,RouteArrivals,RouteReference,Arrivals} from './types';
import type {WatchItem} from './device-store';

export interface JourneyPoint {latitude:number;longitude:number}
export type PlannerEndpoint={kind:'stop';stop:Stop}|{kind:'point';point:JourneyPoint};
export interface JourneyOptions {maxTransfers:number;transferRadius:number;accessRadius:number;maxWalkingMeters:number}
export const defaultJourneyOptions:JourneyOptions={maxTransfers:1,transferRadius:0,accessRadius:600,maxWalkingMeters:2000};
export interface WalkingConnection {kind:'access'|'transfer'|'egress';from:JourneyPoint&{stopId?:string};to:JourneyPoint&{stopId?:string};distanceMeters:number;estimatedMinutes:number;basis:'straight-line';pathVerified:false}
export interface JourneyLeg {route:Route;board:Stop;alight:Stop;stops:number;path?:Stop[];fare?:FareQuote}
export interface Journey {id:string;transfers:number;stopCount:number;legs:JourneyLeg[];pricing?:JourneyPricing;walking?:WalkingConnection[];walkingMeters?:number;walkingMinutes?:number;walkingVerified?:boolean}
export interface JourneyResult {start:Stop|null;end:Stop|null;journeys:Journey[];notice:string;request?:JourneyOptions;endpoints?:{start:{kind:'stop'|'point';point:JourneyPoint;candidateStops:number};end:{kind:'stop'|'point';point:JourneyPoint;candidateStops:number}};search?:{candidateCount:number;routeFamilies:number;returned:number;limited:boolean;exhaustive:false;catalogSyncedAt:string|null;generatedAt:string}}
export interface JourneyCheckLeg {index:number;state:'valid'|'changed';route:Route|null;board:Stop|null;alight:Stop|null;path:Stop[];reason:string|null;arrivals:{items:Arrivals['arrivals'];freshness:Arrivals['freshness'];warning:string|null}|null;reference:RouteReference|null;fare:FareQuote|null;geometry:RouteReference['geometry'];geometryScope:'official-selected-segment'|'unavailable'}
export interface JourneyCheck {state:'valid'|'changed';legs:JourneyCheckLeg[];connections:{index:number;state:'same-stop'|'walking-candidate'|'invalid'|'unverified';distanceMeters:number|null;pathVerified:boolean}[];checkedAt:string;source:'live';notice:string}
export type JourneyFilter='all'|'direct'|'transfer';
export type JourneySort='stops'|'transfers'|'fare'|'walking';

export function journeyBody(start:PlannerEndpoint,end:PlannerEndpoint,options:JourneyOptions){return {...(start.kind==='stop'?{startId:start.stop.id}:{start:start.point}),...(end.kind==='stop'?{endId:end.stop.id}:{end:end.point}),...options};}
export function journeyCheckBody(journey:Journey,transferRadius:number){return{transferRadius,legs:journey.legs.map(leg=>({routeId:leg.route.id,boardStopId:leg.board.id,boardSequence:leg.board.sequence,alightStopId:leg.alight.id,alightSequence:leg.alight.sequence}))};}

/** Partial/stale/conditional totals are never promoted to zero or to a verified price. */
export function verifiedTotal(journey:Journey):number|null {
  const p=journey.pricing;
  return p?.state==='complete'&&p.pricedLegs===journey.legs.length&&p.totalLegs===journey.legs.length&&Number.isSafeInteger(p.totalCents)&&p.totalCents!==null&&p.totalCents>=0?p.totalCents:null;
}
export function selectJourneys(items:Journey[],filter:JourneyFilter,sort:JourneySort,pricedOnly=false):Journey[]{
  return items.map((value,index)=>({value,index})).filter(({value})=>(filter==='all'||(filter==='direct'?value.transfers===0:value.transfers>=1))&&(!pricedOnly||verifiedTotal(value)!==null))
    .sort((a,b)=>{
      const first=a.value,second=b.value;
      if(sort==='walking'&&(first.walkingMeters??0)!==(second.walkingMeters??0))return(first.walkingMeters??0)-(second.walkingMeters??0);
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
