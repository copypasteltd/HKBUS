import type {Arrival,Arrivals} from './types';

export function stationArrivals(arrivals:Arrival[],routeId:string,stopId:string,sequence?:number,clock=Date.now()):Arrival[]{
  const seen=new Set<string>();
  return arrivals.filter(row=>row.routeId===routeId&&row.stopId===stopId&&(sequence===undefined||row.stopSequence===sequence)&&(row.eta===null||Date.parse(row.eta)>=clock-60000))
    .sort((a,b)=>a.stopSequence-b.stopSequence||a.etaSequence-b.etaSequence)
    .filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true;});
}

export function arrivalView(arrival:Arrival|undefined,clock=Date.now(),stale=false){
  if(!arrival)return {state:'none' as const,minutes:null,time:null};
  const generated=Date.parse(arrival.generatedAt),eta=arrival.eta===null?null:Date.parse(arrival.eta);
  if(stale||arrival.status==='stale'||!Number.isFinite(generated)||clock-generated>60000||generated>clock+60000||(eta!==null&&(!Number.isFinite(eta)||eta<clock-60000)))return {state:'stale' as const,minutes:null,time:null};
  if(eta===null)return {state:'none' as const,minutes:null,time:null};
  const minutes=Math.max(0,Math.ceil((eta-clock)/60000));
  // Hong Kong has no daylight-saving offset. This also works in mini-program JS engines.
  const time=new Date(eta+8*3600000).toISOString().slice(11,16);
  return {state:minutes===0?'due' as const:'minutes' as const,minutes,time};
}

export function staleArrivals(result:Pick<Arrivals,'freshness'>,offline=false,clock=Date.now()){
  const generated=Date.parse(result.freshness.generatedAt||'');
  return offline||result.freshness.state!=='fresh'||!Number.isFinite(generated)||clock-generated>60000;
}
