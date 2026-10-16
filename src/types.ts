export type Role='admin'|'operator'|'editor'|'viewer';
export interface Admin {id:string;email:string;name:string;role:Role;active?:number;created_at?:string}
export type Names=Record<'tc'|'sc'|'en',string>;
export interface Route {id:string;routeNo:string;bound:'O'|'I';serviceType:string;operator:string;origin:Names;destination:Names;source:string;active:boolean}
export interface Stop {id:string;name:Names;latitude:number;longitude:number;source:string;active:boolean;sequence?:number}
export interface Page<T> {items:T[];page:number;pageSize:number;total:number}
export interface Notice {id:string;title:Names;body:Names;severity:'info'|'warning'|'critical';status:'draft'|'review'|'approved'|'published'|'withdrawn';version:number;validFrom:string;validUntil:string;routeIds:string[];stopIds:string[];platforms:string[];sourceUrl:string;updatedAt?:string}
export interface Setting {key:'content'|'features'|'freshness';value:Record<string,unknown>;version:number;updated_at?:string}
export interface Job {id:string;kind:string;status:string;actor:string;started_at:string;finished_at:string|null;details:string}
export interface Audit {id:string;actor:string;action:string;entity:string;details:string;created_at:string}
export interface Overview {mode:string;routes:number;stops:number;notices:number;activeReminders:number;requests:number;errors:number;availability:number|null;meanLatencyMs:number|null;catalogSyncedAt:string|null;timeline:{bucket:string;requests:number;errors:number;total_ms:number}[];recentJobs:Job[];recentAudit:Audit[]}
export interface Health {provider:string;mode:string;enabled:boolean;requests:number;successRate:number|null;p50Ms:number|null;p95Ms:number|null;lastEvent:{success:number;duration_ms:number;code:string|null;created_at:string}|null}
export interface Providers {health:Health[];quality:{routes:number;stops:number;relations:number;missingNames:number;invalidCoordinates:number};cacheEntries:number;syncedAt:string|null}
