import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
const source=resolve(process.env.DATABASE_PATH||'./data/hkbusgo.db');
const target=resolve(process.argv[2]||'./data/backups/hkbusgo-'+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
if(source===target)throw new Error('Backup target must differ from source.');
mkdirSync(dirname(target),{recursive:true});
const db=new DatabaseSync(source);try{db.prepare('VACUUM INTO ?').run(target);}finally{db.close();}
console.log('一致性備份已寫入 '+target);
