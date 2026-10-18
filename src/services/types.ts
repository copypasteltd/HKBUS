export type Locale='tc'|'sc'|'en';
export type Names=Record<Locale,string>;
export interface Route {id:string;routeNo:string;bound:'O'|'I';serviceType:string;operator:string;origin:Names;destination:Names;source:'live';active?:boolean}
export interface Stop {id:string;name:Names;latitude:number;longitude:number;source:'live';distanceMeters?:number;walkingMinutes?:number;routes?:Route[];active?:boolean;sequence?:number;road?:Names;address?:Names;roadId?:string}
export interface Arrival {id:string;routeId:string;routeNo:string;bound:'O'|'I';serviceType:string;stopId:string;stopSequence:number;destination:Names;eta:string|null;etaSequence:number;remark:Names;generatedAt:string;minutes:number|null;status:'scheduled'|'approaching'|'no-estimate'|'stale';source:'live'}
export interface Notice {id:string;title:Names;body:Names;severity:'info'|'warning'|'critical';status:string;validFrom:string;validUntil:string;routeIds:string[];stopIds:string[];platforms:string[];sourceUrl:string;version:number;routes?:Route[]}
export interface StopService {route:Route;sequence:number}
export interface ServiceSelection {routeId:string;sequence:number}
export interface Arrivals {stop:Stop;arrivals:Arrival[];routes:Route[];services?:StopService[];freshness:{state:'fresh'|'stale'|'unavailable';generatedAt:string|null;fetchedAt:string|null;cached:boolean;source:'live';provider:string};warning?:string}
export interface RouteArrivals {route:Route;stops:(Stop & {sequence:number})[];arrivals:Arrival[];freshness:Arrivals['freshness'];warning?:string}
export interface Features {reminders:boolean;traffic:boolean;planner:boolean;map:boolean}
export interface ProductContent {coverage:Names;privacy:Names;help:Names;sourceUrl:string;privacyUrl:string;supportEmail:string;maintenance:boolean}
export interface ProductConfig {mode:'live';features:Features;content:ProductContent;shareBaseUrl?:string;tdasEnabled:boolean;catalogSyncedAt:string|null;sources:{name:string;url:string}[]}
export interface Bookmark {kind:'stop'|'route';entityId:string;alias:string;position:number;available:boolean;entity:Stop|Route|null;pinned:boolean;selectedServices:'all'|ServiceSelection[]}
export interface Road {id:string;name:Names;stopIds:string[];source:'live'}
export interface ScheduleBand {dayCode:string;raw:string;frequency:string;windows:{start:number;end:number}[];departures:number[];parsed:boolean}
export interface OperatingHours {basis:'origin-departure';source:'live';routeId:string;origin:Names;bands:ScheduleBand[];fetchedAt:string;sourceUrl:string;state:'available'|'unavailable'|'stale';reason?:string}
export interface RouteReference {routeId:string;source:'live';fetchedAt:string;sourceUrl:string;geometry:{type:'MultiLineString';coordinates:number[][][]}|null;operatingHours:OperatingHours;state:'available'|'unavailable'|'stale';reason?:string;today:{date:string;minute:number;holiday:string|null;calendarKnown:boolean;state:'unverified'|'within-origin-hours'|'not-listed-today'|'before-first'|'outside-origin-hours';windows:{start:number;end:number}[];carryover:{start:number;end:number}[];firstDeparture:number|null;lastDeparture:number|null;sourceUrl:string;basis:'origin-departure'};roads:{id:string;name:Names;stopId:string;sequence:number}[]}
export interface Reminder {id:string;stop_id:string;route_id:string;threshold:number;status:'active'|'paused'|'sent'|'expired';channel:string;expires_at:string;stop:Stop|null;route:Route|null}
export interface PageResult<T> {items:T[];total:number;page:number;pageSize:number}
export interface FareQuote {state:'available'|'conditional'|'unavailable'|'stale';currency:'HKD';amountCents:number|null;options:{dayCode:number|null;amountCents:number}[];reason:string|null;basis:'adult-single-undiscounted';routeId:string;boardSequence:number;alightSequence:number;boardStopId:string;alightStopId:string;source:{provider:'TD';source:'live';url:string;dataDate:string;syncedAt:string}|null;checkedAt:string|null;officialUrl:string}
export interface RouteFares {fullFare:FareQuote|null;boardingFares:(FareQuote|null)[]}
export interface JourneyPricing {state:'complete'|'partial'|'unavailable';currency:'HKD';totalCents:number|null;knownSubtotalCents:number;pricedLegs:number;totalLegs:number;discountsApplied:false}
export interface HomeData {nextBus:Arrivals|null;nearbyStops:Stop[];notices:Notice[];features:Features;content:ProductContent;warnings:{code:string;message:string;retryable:boolean}[];mode:'live';selection:'location'|'selected'|'none'}
