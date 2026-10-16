import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync, chmodSync, readdirSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const base='/www/wwwroot/hkbusgo/shared';
const config=JSON.parse(readFileSync(join(base,'backup-config.json'),'utf8'));
const source=resolve(config.databasePath),folder=resolve(config.backupDirectory);
const suffix=createHash('md5').update(source).digest('hex');
if(source!==join(base,'data/hkbusgo.db')||!folder.endsWith('/database/sqlite/'+suffix))throw new Error('Unexpected database or panel backup directory');
if(!existsSync(source))throw new Error('The production database does not exist');
mkdirSync(folder,{recursive:true,mode:0o750});
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
const target=join(folder,stamp+'_hkbusgo.db');
if(existsSync(target))throw new Error('A backup with this timestamp already exists');
const database=new DatabaseSync(source);
let integrity,foreignKeys;
try{
  database.exec('PRAGMA busy_timeout=15000; PRAGMA foreign_keys=ON;');
  integrity=database.prepare('PRAGMA integrity_check').all();
  foreignKeys=database.prepare('PRAGMA foreign_key_check').all();
  if(integrity.some(x=>x.integrity_check!=='ok')||foreignKeys.length)throw new Error('Source integrity check failed');
  // A consistent snapshot includes committed WAL content while the service remains online.
  database.prepare('VACUUM INTO ?').run(target);
}finally{database.close();}
chmodSync(target,0o640);
const restored=new DatabaseSync(target,{readOnly:true});
let counts;
try{
  if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed');
  if(restored.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Backup references are invalid');
  counts=Object.fromEntries(['routes','stops','route_stops','profiles','admins'].map(table=>[table,Number(restored.prepare('SELECT count(*) n FROM '+table).get().n)]));
}finally{restored.close();}
const keep=Math.max(2,Number(config.retain||14));
const names=readdirSync(folder).filter(x=>/^\d{8}_\d{6}_hkbusgo\.db$/.test(x)).sort().reverse();
for(const name of names.slice(keep))unlinkSync(join(folder,name));
const result={createdAt:new Date().toISOString(),file:target,bytes:statSync(target).size,sha256:createHash('sha256').update(readFileSync(target)).digest('hex'),integrity:'ok',foreignKeyViolations:0,restoreReadCheck:true,counts,retained:Math.min(names.length,keep)};
writeFileSync(join(base,'last-backup.json'),JSON.stringify(result,null,2)+'\n',{mode:0o640});
console.log(JSON.stringify(result));
