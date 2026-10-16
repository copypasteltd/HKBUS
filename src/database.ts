import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { now, type Route, type Stop, type Notice } from './domain.js';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version=Number(this.db.prepare('PRAGMA user_version').get()!.user_version);
    if(version>2){this.db.close();throw new Error('Database schema is newer than this server.');}
    this.db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS routes(id TEXT PRIMARY KEY, route_no TEXT NOT NULL, bound TEXT NOT NULL, service_type TEXT NOT NULL, document TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS stops(id TEXT PRIMARY KEY, document TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS route_stops(route_id TEXT REFERENCES routes(id), sequence INTEGER, stop_id TEXT REFERENCES stops(id), PRIMARY KEY(route_id,sequence));
      CREATE INDEX IF NOT EXISTS route_stop_reverse ON route_stops(stop_id);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, subject TEXT NOT NULL, kind TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS profile_credentials(profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bookmarks(profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, kind TEXT NOT NULL, entity_id TEXT NOT NULL, alias TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(profile_id,kind,entity_id));
      CREATE TABLE IF NOT EXISTS recent(profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, kind TEXT, entity_id TEXT, viewed_at TEXT, PRIMARY KEY(profile_id,kind,entity_id));
      CREATE TABLE IF NOT EXISTS reminders(id TEXT PRIMARY KEY, profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, stop_id TEXT NOT NULL, route_id TEXT NOT NULL, threshold INTEGER NOT NULL, status TEXT NOT NULL, channel TEXT NOT NULL, expires_at TEXT NOT NULL, generation TEXT NOT NULL, sent_at TEXT, created_at TEXT NOT NULL, UNIQUE(profile_id,stop_id,route_id));
      CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY, profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE, reminder_id TEXT NOT NULL, generation TEXT UNIQUE NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT);
      CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY, document TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL, valid_from TEXT NOT NULL, valid_until TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notice_versions(id TEXT PRIMARY KEY, notice_id TEXT NOT NULL, version INTEGER NOT NULL, document TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(notice_id,version));
      CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, actor TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, details TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_events(id TEXT PRIMARY KEY, provider TEXT NOT NULL, operation TEXT NOT NULL, success INTEGER NOT NULL, duration_ms INTEGER NOT NULL, code TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at TEXT NOT NULL, stale_until TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metrics(bucket TEXT NOT NULL, method TEXT NOT NULL, route TEXT NOT NULL, status INTEGER NOT NULL, count INTEGER NOT NULL, total_ms INTEGER NOT NULL, PRIMARY KEY(bucket,method,route,status));
      PRAGMA user_version=2;
      COMMIT;
    `);
  }
  all<T = Record<string, unknown>>(sql: string, ...args: SQLInputValue[]): T[] { return this.db.prepare(sql).all(...args) as T[]; }
  get<T = Record<string, unknown>>(sql: string, ...args: SQLInputValue[]): T | undefined { return this.db.prepare(sql).get(...args) as T | undefined; }
  run(sql: string, ...args: SQLInputValue[]) { return this.db.prepare(sql).run(...args); }
  transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const value = fn(); this.db.exec('COMMIT'); return value; } catch (error) { this.db.exec('ROLLBACK'); throw error; } }
  setting<T>(key: string, fallback: T): T { const row = this.get<{ value: string }>('SELECT value FROM settings WHERE key=?', key); return row ? JSON.parse(row.value) as T : fallback; }
  assertLiveDatabase(path: string) {
    const mixed = this.get<{n:number}>(`SELECT (SELECT count(*) FROM routes WHERE coalesce(json_extract(document,'$.source'),'')<>'live') + (SELECT count(*) FROM stops WHERE coalesce(json_extract(document,'$.source'),'')<>'live') + (SELECT count(*) FROM notices WHERE id IN ('notice-roadwork','notice-service') OR json_extract(document,'$.source')='fixture') n`)!.n;
    if (/(^|[\\/])[^\\/]*fixture[^\\/]*\.db$/i.test(path) || mixed) throw new Error('SAMPLE_DATABASE_FORBIDDEN: This database contains sample data. Use DATABASE_PATH=./data/hkbusgo.db or a new live database; the sample database has been preserved.');
  }
  setSetting(key: string, value: unknown) { this.run('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,version=version+1,updated_at=excluded.updated_at', key, JSON.stringify(value), now()); }
  audit(actor: string, action: string, entity: string, details: unknown = {}) { this.run('INSERT INTO audit VALUES(?,?,?,?,?,?)', randomUUID(), actor, action, entity, JSON.stringify(details), now()); }
  route(id: string): Route | undefined { const row = this.get<{ document: string; active: number }>('SELECT document,active FROM routes WHERE id=?', id); return row ? { ...JSON.parse(row.document), active: !!row.active } as Route : undefined; }
  stop(id: string): Stop | undefined { const row = this.get<{ document: string; active: number }>('SELECT document,active FROM stops WHERE id=?', id); return row ? { ...JSON.parse(row.document), active: !!row.active } as Stop : undefined; }
  routes(activeOnly = true): Route[] { return this.all<{ document: string; active: number }>(`SELECT document,active FROM routes ${activeOnly ? 'WHERE active=1' : ''} ORDER BY length(route_no),route_no,bound,service_type`).map(row => ({ ...JSON.parse(row.document), active: !!row.active })); }
  stops(activeOnly = true): Stop[] { return this.all<{ document: string; active: number }>(`SELECT document,active FROM stops ${activeOnly ? 'WHERE active=1' : ''}`).map(row => ({ ...JSON.parse(row.document), active: !!row.active })); }
  routesAt(stopId: string): Route[] { return this.all<{ document: string }>('SELECT DISTINCT r.document FROM routes r JOIN route_stops rs ON rs.route_id=r.id WHERE rs.stop_id=? AND r.active=1 ORDER BY r.route_no,r.bound,r.service_type', stopId).map(x => JSON.parse(x.document)); }
  sequence(routeId: string): (Stop & { sequence: number })[] { return this.all<{ document: string; sequence: number }>('SELECT s.document,rs.sequence FROM route_stops rs JOIN stops s ON s.id=rs.stop_id WHERE rs.route_id=? ORDER BY rs.sequence', routeId).map(x => ({ ...JSON.parse(x.document), sequence: x.sequence })); }
  saveCatalog(routes: Route[], stops: Stop[], sequence: { routeId: string; sequence: number; stopId: string }[]) {
    if (routes.some(x=>x.source!=='live') || stops.some(x=>x.source!=='live')) throw new Error('Only live provider catalogues can be saved.');
    this.transaction(() => {
      this.db.exec('UPDATE routes SET active=0; UPDATE stops SET active=0; DELETE FROM route_stops;');
      for (const route of routes) this.run('INSERT INTO routes VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET route_no=excluded.route_no,bound=excluded.bound,service_type=excluded.service_type,document=excluded.document,active=1', route.id, route.routeNo, route.bound, route.serviceType, JSON.stringify(route));
      for (const stop of stops) this.run('INSERT INTO stops VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET document=excluded.document,active=1', stop.id, JSON.stringify(stop));
      for (const item of sequence) this.run('INSERT INTO route_stops VALUES(?,?,?)', item.routeId, item.sequence, item.stopId);
      this.setSetting('catalogSyncedAt', now());
      this.setSetting('catalogSource', 'live');
    });
  }
  notice(id: string): Notice | undefined { const row = this.get<{ document: string }>('SELECT document FROM notices WHERE id=?', id); return row ? JSON.parse(row.document) : undefined; }
  saveNotice(notice: Notice, actor: string) {
    this.transaction(() => {
      this.run('INSERT INTO notices VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document,version=excluded.version,status=excluded.status,valid_from=excluded.valid_from,valid_until=excluded.valid_until', notice.id, JSON.stringify(notice), notice.version, notice.status, notice.validFrom, notice.validUntil);
      this.run('INSERT INTO notice_versions VALUES(?,?,?,?,?,?)', randomUUID(), notice.id, notice.version, JSON.stringify(notice), actor, now());
      this.audit(actor, 'notice.' + notice.status, notice.id, { version: notice.version });
    });
  }
  close() { this.db.close(); }
}
export function passwordHash(password: string): string { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
export function passwordMatches(password: string, hash: string): boolean { const [salt, value] = hash.split(':'); if (!salt || !value) return false; const actual = scryptSync(password, salt, 64); const expected = Buffer.from(value, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
