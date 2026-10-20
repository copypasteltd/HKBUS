import type {Journey,JourneyOptions,PlannerEndpoint} from './journeys';
// Ephemeral only. Precise map points must never enter storage, URL parameters, or saved trips.
let draft:{start:PlannerEndpoint|null;end:PlannerEndpoint|null;revision:number}={start:null,end:null,revision:0};
const listeners=new Set<()=>void>();
const details=new Map<string,{journey:Journey;options:JourneyOptions;createdAt:number}>();
export function journeyDraft(){return draft;}
export function subscribeJourneySession(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function setJourneyEndpoints(start:PlannerEndpoint|null,end:PlannerEndpoint|null){draft={start,end,revision:draft.revision+1};details.clear();for(const listener of listeners)listener();}
export function setJourneyEndpoint(which:'start'|'end',value:PlannerEndpoint){setJourneyEndpoints(which==='start'?value:draft.start,which==='end'?value:draft.end);}
export function rememberJourney(journey:Journey,options:JourneyOptions){details.set(journey.id,{journey,options:{...options},createdAt:Date.now()});if(details.size>12)details.delete(details.keys().next().value!);return journey.id;}
export function rememberedJourney(id:string){const value=details.get(id);return value&&Date.now()-value.createdAt<30*60000?value:null;}
export function clearJourneySession(){setJourneyEndpoints(null,null);}
