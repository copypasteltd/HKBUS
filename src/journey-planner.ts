import {createHash} from 'node:crypto';
import {z} from 'zod';
import {AppError,haversine,now,type Stop,type Route} from './domain.js';
import type {Store} from './database.js';

export const pointSchema=z.object({latitude:z.number().min(22).max(23),longitude:z.number().min(113).max(115)}).strict();
export const journeyInputSchema=z.object({startId:z.string().min(1).max(120).optional(),endId:z.string().min(1).max(120).optional(),start:pointSchema.optional(),end:pointSchema.optional(),maxTransfers:z.number().int().min(0).max(2).default(1),transferRadius:z.number().int().min(0).max(500).default(0),accessRadius:z.number().int().min(100).max(1500).default(600),maxWalkingMeters:z.number().int().min(0).max(5000).default(2000),limit:z.number().int().min(1).max(12).default(8)}).strict().refine(x=>!!x.startId!==!!x.start,'Specify one origin').refine(x=>!!x.endId!==!!x.end,'Specify one destination');
export type JourneyInput=z.infer<typeof journeyInputSchema>;
export type Point=z.infer<typeof pointSchema>;
export type OrderedStop=Stop&{sequence:number};
export interface WalkingConnection {kind:'access'|'transfer'|'egress';from:Point&{stopId?:string};to:Point&{stopId?:string};distanceMeters:number;estimatedMinutes:number;basis:'straight-line';pathVerified:false}
export interface PlannedLeg {route:Route;board:OrderedStop;alight:OrderedStop;stops:number;path:OrderedStop[]}
export interface PlannedJourney {id:string;transfers:number;stopCount:number;legs:PlannedLeg[];walking:WalkingConnection[];walkingMeters:number;walkingMinutes:number;walkingVerified:boolean}
interface Graph {routes:{route:Route;stops:OrderedStop[]}[];stops:Map<string,Stop>;grid:Map<string,Stop[]>;at:Map<string,Set<string>>;token:number}
const graphs=new WeakMap<Store,Graph>();
const gridKey=(point:Point)=>Math.floor(point.latitude*200)+':'+Math.floor(point.longitude*200);
function graph(store:Store):Graph {
 const old=graphs.get(store);if(old?.token===store.catalogGeneration)return old;
 const stops=new Map(store.stops().map(stop=>[stop.id,stop])),routes=new Map(store.routes().map(route=>[route.id,{route,stops:[] as OrderedStop[]}]));
 const at=new Map<string,Set<string>>(),grid=new Map<string,Stop[]>();
 for(const stop of stops.values()){const key=gridKey(stop);grid.set(key,[...grid.get(key)||[],stop]);}
 for(const item of store.all<{route_id:string;stop_id:string;sequence:number}>('SELECT route_id,stop_id,sequence FROM route_stops ORDER BY route_id,sequence')){
  const route=routes.get(item.route_id),stop=stops.get(item.stop_id);if(!route||!stop)continue;
  route.stops.push({...stop,sequence:item.sequence});const ids=at.get(stop.id)||new Set<string>();ids.add(route.route.id);at.set(stop.id,ids);
 }
 const value={routes:[...routes.values()].filter(route=>route.stops.length>1),stops,grid,at,token:store.catalogGeneration};graphs.set(store,value);return value;
}
function near(g:Graph,point:Point,radius:number){
 const lat=Math.floor(point.latitude*200),lng=Math.floor(point.longitude*200),cells=Math.ceil(radius/500)+1,found:{stop:Stop;distance:number}[]=[];
 for(let x=-cells;x<=cells;x++)for(let y=-cells;y<=cells;y++)for(const stop of g.grid.get((lat+x)+':'+(lng+y))||[]){const distance=haversine(point.latitude,point.longitude,stop.latitude,stop.longitude);if(distance<=radius)found.push({stop,distance});}
 return found.sort((a,b)=>a.distance-b.distance||a.stop.id.localeCompare(b.stop.id));
}
export function mapStops(store:Store,bounds:{west:number;east:number;south:number;north:number},limit=250){
 const g=graph(store),latitude=(bounds.south+bounds.north)/2,longitude=(bounds.west+bounds.east)/2;
 const items=[...g.stops.values()].filter(stop=>stop.longitude>=bounds.west&&stop.longitude<=bounds.east&&stop.latitude>=bounds.south&&stop.latitude<=bounds.north).sort((a,b)=>haversine(latitude,longitude,a.latitude,a.longitude)-haversine(latitude,longitude,b.latitude,b.longitude)||a.id.localeCompare(b.id));
 return{items:items.slice(0,limit).map(stop=>({...stop,serviceCount:g.at.get(stop.id)?.size||0})),total:items.length,limit,truncated:items.length>limit,bounds,source:'live' as const,catalogSyncedAt:store.setting('catalogSyncedAt',null)};
}
const walk=(kind:WalkingConnection['kind'],from:Point&{stopId?:string},to:Point&{stopId?:string}):WalkingConnection=>{const distanceMeters=haversine(from.latitude,from.longitude,to.latitude,to.longitude);return{kind,from,to,distanceMeters,estimatedMinutes:Math.ceil(distanceMeters/75),basis:'straight-line',pathVerified:false};};
const location=(stop:Stop)=>({latitude:stop.latitude,longitude:stop.longitude,stopId:stop.id});
const rideKeys=new WeakMap<PlannedLeg[],string>();
const identity=(legs:PlannedLeg[])=>{let key=rideKeys.get(legs);if(key===undefined){key=legs.map(leg=>[leg.route.id,leg.board.sequence,leg.alight.sequence].join('@')).join('|');rideKeys.set(legs,key);}return key;};
interface Label {legs:PlannedLeg[];walking:WalkingConnection[];stopCount:number;walkingMeters:number}
const cost=(label:Label)=>label.stopCount+label.walkingMeters/100;
const lexical=(a:string,b:string)=>a===b?0:a<b?-1:1;
const compare=(a:Label,b:Label)=>cost(a)-cost(b)||a.walkingMeters-b.walkingMeters||a.stopCount-b.stopCount||lexical(identity(a.legs),identity(b.legs));
const labelKeys=new WeakMap<Label,string>();
function labelKey(label:Label){let key=labelKeys.get(label);if(key===undefined){key=identity(label.legs)+'#'+label.walking.map(x=>x.from.stopId+'>'+x.to.stopId).join('|');labelKeys.set(label,key);}return key;}
function insert(target:Map<string,Label[]>,id:string,value:Label,stats:{pruned:number},cap=8){
 const list=target.get(id)||[];
 if(list.length>=cap&&compare(list[list.length-1]!,value)<=0){stats.pruned++;return;}
 const key=labelKey(value),index=list.findIndex(item=>labelKey(item)===key);
 if(index>=0){if(compare(list[index]!,value)<=0)return;list.splice(index,1);}
 let position=0;while(position<list.length&&compare(list[position]!,value)<=0)position++;
 list.splice(position,0,value);if(list.length>cap){list.length=cap;stats.pruned++;}target.set(id,list);
}

/** Round-based bounded multi-label search; every ride uses an exact forward occurrence. No synthetic duration. */
export function planJourney(store:Store,startId:string,endId:string):ReturnType<typeof planJourneys>{return planJourneys(store,{startId,endId,maxTransfers:1,transferRadius:0,accessRadius:600,maxWalkingMeters:2000,limit:8});}
export function planJourneys(store:Store,input:JourneyInput){
 const g=graph(store),resolve=(id:string|undefined,point:Point|undefined)=>{
  if(id){const stop=g.stops.get(id);if(!stop)throw new AppError('STOP_NOT_FOUND','起點或終點車站不存在',404);return{kind:'stop' as const,point:location(stop),candidates:[{stop,distance:0}]};}
  const candidates=near(g,point!,input.accessRadius);return{kind:'point' as const,point:point!,candidates};
 };
 const start=resolve(input.startId,input.start),end=resolve(input.endId,input.end);
 if(input.startId&&input.startId===input.endId||start.kind==='point'&&end.kind==='point'&&haversine(start.point.latitude,start.point.longitude,end.point.latitude,end.point.longitude)<2)throw new AppError('SAME_ENDPOINTS','起點與終點不能相同',422);
 const stats={pruned:0,routeScans:0,labels:0,budgetExceeded:false},results=new Map<string,PlannedJourney>(),ends=new Map(end.candidates.map(x=>[x.stop.id,x]));
 let frontier=new Map<string,Label[]>();
 for(const candidate of start.candidates){const walking=start.kind==='point'?[walk('access',start.point,location(candidate.stop))]:[];if(candidate.distance<=input.maxWalkingMeters)insert(frontier,candidate.stop.id,{legs:[],walking,stopCount:0,walkingMeters:candidate.distance},stats);}
 const neighbors=new Map<string,ReturnType<typeof near>>();
 for(let round=0;round<=input.maxTransfers&&frontier.size;round++){
  const boarding=new Map<string,Label[]>();
  for(const[id,labels]of frontier){const stop=g.stops.get(id)!;for(const label of labels)insert(boarding,id,label,stats);
   if(round>0&&input.transferRadius>0){let candidates=neighbors.get(id);if(!candidates){candidates=near(g,stop,input.transferRadius);neighbors.set(id,candidates);}
    for(const candidate of candidates){if(candidate.stop.id===id)continue;for(const label of labels){if(label.walkingMeters+candidate.distance>input.maxWalkingMeters)continue;const connection=walk('transfer',location(stop),location(candidate.stop));insert(boarding,candidate.stop.id,{...label,walking:[...label.walking,connection],walkingMeters:label.walkingMeters+connection.distanceMeters},stats);}}
   }
  }
  const next=new Map<string,Label[]>();
  for(const entry of g.routes){
   if(!entry.stops.some(stop=>boarding.has(stop.id)))continue;stats.routeScans++;
   let active:{label:Label;boardIndex:number}[]=[];
   for(let index=0;index<entry.stops.length;index++){
    const stop=entry.stops[index]!;
    for(const state of active){
     if(++stats.labels>1_500_000){stats.budgetExceeded=true;break;}
     const board=entry.stops[state.boardIndex]!;
     if(state.label.legs.some(leg=>leg.board.id===stop.id||leg.alight.id===stop.id)||stop.id===board.id)continue;
     const leg={route:entry.route,board,alight:stop,stops:index-state.boardIndex,path:[] as OrderedStop[]},value={...state.label,legs:[...state.label.legs,leg],stopCount:state.label.stopCount+leg.stops};
     insert(next,stop.id,value,stats);
     const finish=ends.get(stop.id);if(finish){const egress=end.kind==='point'?[walk('egress',location(stop),end.point)]:[],walking=[...value.walking,...egress],walkingMeters=walking.reduce((sum,x)=>sum+x.distanceMeters,0);if(walkingMeters>input.maxWalkingMeters)continue;
      const id=createHash('sha256').update(identity(value.legs)+'#'+walking.map(x=>x.from.stopId+'>'+x.to.stopId).join('|')).digest('hex').slice(0,24);
      const journey={id,legs:value.legs,transfers:value.legs.length-1,stopCount:value.stopCount,walking,walkingMeters,walkingMinutes:walking.reduce((sum,x)=>sum+x.estimatedMinutes,0),walkingVerified:walking.length===0};
      const previous=results.get(id);if(!previous||journey.walkingMeters<previous.walkingMeters)results.set(id,journey);
     }
    }
    if(stats.budgetExceeded)break;
    const eligible=(boarding.get(stop.id)||[]).filter(label=>!label.legs.some(leg=>leg.route.id===entry.route.id));
    for(const label of eligible)active.push({label,boardIndex:index});
    active.sort((a,b)=>(cost(a.label)-a.boardIndex)-(cost(b.label)-b.boardIndex)||a.label.walkingMeters-b.label.walkingMeters||b.boardIndex-a.boardIndex);
    // Keep distinct route histories and stop occurrences, not merely the first physical ID.
    const seen=new Set<string>();active=active.filter(state=>{const key=identity(state.label.legs)+'@'+state.boardIndex;if(seen.has(key))return false;seen.add(key);return true;});
    if(active.length>16){active.length=16;stats.pruned++;}
   }
   if(stats.budgetExceeded)break;
  }
  frontier=next;if(stats.budgetExceeded)break;
 }
 const all=[...results.values()].sort((a,b)=>a.transfers-b.transfers||compare(a,b)),byFamily=new Map<string,PlannedJourney>();
 for(const journey of all){const family=journey.legs.map(leg=>leg.route.id).join('|');if(!byFamily.has(family))byFamily.set(family,journey);}
 // Materialise only returned paths. Search labels retain identities instead of allocating
 // full stop arrays for every intermediate candidate on a city-wide graph.
 const sequences=new Map(g.routes.map(entry=>[entry.route.id,entry.stops]));
 const selected=[...byFamily.values()].slice(0,input.limit).map(journey=>({...journey,legs:journey.legs.map(leg=>({...leg,path:sequences.get(leg.route.id)!.filter(stop=>stop.sequence>=leg.board.sequence&&stop.sequence<=leg.alight.sequence)}))})),request={maxTransfers:input.maxTransfers,transferRadius:input.transferRadius,accessRadius:input.accessRadius,maxWalkingMeters:input.maxWalkingMeters};
 return{start:start.candidates[0]?.stop||null,end:end.candidates[0]?.stop||null,journeys:selected,request,endpoints:{start:{kind:start.kind,point:start.point,candidateStops:start.candidates.length},end:{kind:end.kind,point:end.point,candidateStops:end.candidates.length}},search:{algorithm:'round-based-multi-label',candidateCount:all.length,routeFamilies:byFamily.size,returned:selected.length,routeScans:stats.routeScans,labels:stats.labels,limited:stats.pruned>0||byFamily.size>input.limit||stats.budgetExceeded,exhaustive:false,catalogSyncedAt:store.setting('catalogSyncedAt',null),generatedAt:now()},notice:'依現行官方站序搜尋最多兩次轉乘候選，不是即時最快或全網最優保證。步行連線與分鐘為直線估算，未核實路徑、過路設施或無障礙；需自行確認。車費未計轉乘及付款優惠，不預測巴士乘車或總行程時間。'};
}

export const journeyCheckSchema=z.object({legs:z.array(z.object({routeId:z.string().min(1).max(120),boardStopId:z.string().min(1).max(120),boardSequence:z.number().int().min(1).max(300),alightStopId:z.string().min(1).max(120),alightSequence:z.number().int().min(1).max(300)}).strict()).min(1).max(3),transferRadius:z.number().int().min(0).max(500).default(0)}).strict();
export function validateJourney(store:Store,input:z.infer<typeof journeyCheckSchema>){
 const legs=input.legs.map((identity,index)=>{const route=store.route(identity.routeId),stops=route?.active?store.sequence(identity.routeId):[],board=stops.find(stop=>stop.id===identity.boardStopId&&stop.sequence===identity.boardSequence),alight=stops.find(stop=>stop.id===identity.alightStopId&&stop.sequence===identity.alightSequence);const valid=!!route?.active&&!!board&&!!alight&&store.stop(board.id)?.active!==false&&store.stop(alight.id)?.active!==false&&alight.sequence>board.sequence;return{index,identity,state:valid?'valid' as const:'changed' as const,route:route||null,board:board||null,alight:alight||null,path:valid?stops.filter(stop=>stop.sequence>=board!.sequence&&stop.sequence<=alight!.sequence):[],reason:valid?null:'ROUTE_STOP_IDENTITY_CHANGED'};});
 const connections=legs.slice(1).map((leg,index)=>{const previous=legs[index]!;if(previous.state!=='valid'||leg.state!=='valid')return{index,state:'unverified',distanceMeters:null,pathVerified:false};const distance=haversine(previous.alight!.latitude,previous.alight!.longitude,leg.board!.latitude,leg.board!.longitude),same=previous.alight!.id===leg.board!.id;return{index,state:same?'same-stop':input.transferRadius>0&&distance<=input.transferRadius?'walking-candidate':'invalid',distanceMeters:distance,pathVerified:same};});
 const repeated=new Set(legs.map(leg=>leg.identity.routeId)).size!==legs.length;
 return{state:legs.every(leg=>leg.state==='valid')&&connections.every(x=>x.state==='same-stop'||x.state==='walking-candidate')&&!repeated?'valid' as const:'changed' as const,legs,connections,repeatedRoute:repeated,checkedAt:now(),source:'live' as const};
}
