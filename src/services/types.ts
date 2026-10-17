export type Locale='tc'|'sc'|'en';
export type Names=Record<Locale,string>;
export interface Route {id:string;routeNo:string;bound:'O'|'I';serviceType:string;operator:string;origin:Names;destination:Names;source:'live';active?:boolean}
export interface Stop {id:string;name:Names;latitude:number;longitude:number;source:'live';distanceMeters?:number;walkingMinutes?:number;routes?:Route[];active?:boolean;sequence?:number}
export interface Arrival {id:string;routeId:string;routeNo:string;bound:'O'|'I';serviceType:string;stopId:string;stopSequence:number;destination:Names;eta:string|null;etaSequence:number;remark:Names;generatedAt:string;minutes:number|null;status:'scheduled'|'approaching'|'no-estimate'|'stale';source:'live'}
export interface Notice {id:string;title:Names;body:Names;severity:'info'|'warning'|'critical';status:string;validFrom:string;validUntil:string;routeIds:string[];stopIds:string[];platforms:string[];sourceUrl:string;version:number;routes?:Route[]}
export interface Arrivals {stop:Stop;arrivals:Arrival[];routes:Route[];freshness:{state:'fresh'|'stale'|'unavailable';generatedAt:string|null;fetchedAt:string|null;cached:boolean;source:'live';provider:string};warning?:string}
export interface RouteArrivals {route:Route;stops:(Stop & {sequence:number})[];arrivals:Arrival[];freshness:Arrivals['freshness'];warning?:string}
export interface Features {reminders:boolean;traffic:boolean;planner:boolean;map:boolean}
export interface ProductContent {coverage:Names;privacy:Names;help:Names;sourceUrl:string;privacyUrl:string;supportEmail:string;maintenance:boolean}
export interface ProductConfig {mode:'live';features:Features;content:ProductContent;shareBaseUrl?:string;tdasEnabled:boolean;catalogSyncedAt:string|null;sources:{name:string;url:string}[]}
export interface Bookmark {kind:'stop'|'route';entityId:string;alias:string;position:number;available:boolean;entity:Stop|Route|null}
export interface Reminder {id:string;stop_id:string;route_id:string;threshold:number;status:'active'|'paused'|'sent'|'expired';channel:string;expires_at:string;stop:Stop|null;route:Route|null}
export interface PageResult<T> {items:T[];total:number;page:number;pageSize:number}
export interface HomeData {nextBus:Arrivals|null;nearbyStops:Stop[];notices:Notice[];features:Features;content:ProductContent;warnings:{code:string;message:string;retryable:boolean}[];mode:'live';selection:'location'|'selected'|'none'}
