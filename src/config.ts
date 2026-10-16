import { resolve } from 'node:path';
import type { SourceMode } from './domain.js';
export interface Config {
  host: string; port: number; rateLimitMax:number; databasePath: string; jwtSecret: string; adminEmail?: string; adminPassword?: string;
  providerMode: SourceMode; trustedProxies:string[]; origins: string[]; publicAppUrl: string; kmbBaseUrl: string; tdasBaseUrl: string;
  providerTimeoutMs: number; tdasEnabled: boolean; syncHours: number; production: boolean; workerEnabled: boolean;
}
export function loadConfig(overrides: Partial<Config> = {}): Config {
  const cfg: Config = {
    host: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 4100),rateLimitMax:Number(process.env.RATE_LIMIT_MAX||120),
    databasePath: resolve(process.env.DATABASE_PATH || './data/hkbusgo.db'), jwtSecret: process.env.JWT_SECRET || '',
    adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD,
    providerMode: process.env.PROVIDER_MODE === 'fixture' ? 'fixture' : 'live',
    trustedProxies:(process.env.TRUSTED_PROXIES||'').split(',').map(x=>x.trim()).filter(Boolean),
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5174,http://127.0.0.1:5174,http://localhost:4174,http://127.0.0.1:4174,http://localhost:10086,http://127.0.0.1:10086,http://localhost:10087,http://127.0.0.1:10087,https://localhost').split(',').map(x => x.trim()),
    publicAppUrl: process.env.PUBLIC_APP_URL || 'http://localhost:10086',
    kmbBaseUrl: process.env.KMB_BASE_URL || 'https://data.etabus.gov.hk/v1/transport/kmb',
    tdasBaseUrl: process.env.TDAS_BASE_URL || 'https://tdas-api.hkemobility.gov.hk/tdas/api/route',
    providerTimeoutMs: Number(process.env.PROVIDER_TIMEOUT_MS || 8000), tdasEnabled: process.env.TDAS_ENABLED === 'true',
    syncHours: Number(process.env.CATALOG_SYNC_HOURS || 24), production: process.env.NODE_ENV === 'production', workerEnabled: true,
    ...overrides
  };
  if (cfg.jwtSecret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters. Run npm run bootstrap first.');
  if (cfg.production && cfg.providerMode === 'fixture') throw new Error('Production must use PROVIDER_MODE=live.');
  if (!Number.isFinite(cfg.providerTimeoutMs) || cfg.providerTimeoutMs < 100 || cfg.providerTimeoutMs > 30000) throw new Error('Invalid provider timeout.');
  if(!Number.isInteger(cfg.rateLimitMax)||cfg.rateLimitMax<1||cfg.rateLimitMax>10000)throw new Error('Invalid RATE_LIMIT_MAX.');
  return cfg;
}
