export type Locale = 'tc' | 'sc' | 'en';
export type Names = Record<Locale, string>;
export type SourceMode = 'live' | 'fixture';
export interface Route { id: string; routeNo: string; bound: 'O' | 'I'; serviceType: string; operator: string; origin: Names; destination: Names; source: SourceMode; active?: boolean }
export interface Stop { id: string; name: Names; latitude: number; longitude: number; source: SourceMode; distanceMeters?: number; walkingMinutes?: number; routes?: Route[]; active?: boolean }
export interface Arrival { id: string; routeId: string; routeNo: string; bound: 'O' | 'I'; serviceType: string; stopId: string; stopSequence: number; destination: Names; eta: string | null; etaSequence: number; remark: Names; generatedAt: string; minutes: number | null; status: 'scheduled' | 'approaching' | 'no-estimate' | 'stale'; source: SourceMode }
export interface Notice { id: string; title: Names; body: Names; severity: 'info' | 'warning' | 'critical'; status: 'draft' | 'review' | 'approved' | 'published' | 'withdrawn'; validFrom: string; validUntil: string; routeIds: string[]; stopIds: string[]; platforms: string[]; sourceUrl: string; source?: 'operator' | 'fixture' | 'legacy'; version: number; updatedAt: string; updatedBy: string }
export interface Freshness { state: 'fresh' | 'stale' | 'unavailable'; generatedAt: string | null; fetchedAt: string | null; cached: boolean; source: SourceMode; provider: 'KMB' | 'TDAS' }
export interface ArrivalResult { stop: Stop; arrivals: Arrival[]; routes: Route[]; freshness: Freshness; warning?: string }
export interface RouteArrivalResult { route: Route; stops: (Stop & {sequence:number})[]; arrivals: Arrival[]; freshness: Freshness; warning?: string }
export interface Identity { sub: string; kind: 'admin' | 'profile'; role?: 'admin' | 'editor' | 'operator' | 'viewer'; sid: string }
export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false) { super(message); }
}
export const now = () => new Date().toISOString();
export const names = (tc: string, en = tc, sc = tc): Names => ({ tc, sc, en });
export function localized(value: Names, locale: Locale = 'tc'): string { return value[locale] || value.tc || value.en; }
export function haversine(lat: number, lng: number, lat2: number, lng2: number): number {
  const radians = (x: number) => x * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat) / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
