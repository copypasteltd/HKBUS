import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const file=resolve('.env.local');
if(existsSync(file))throw new Error('.env.local already exists; no credentials were replaced.');
const password=randomBytes(18).toString('base64url');
writeFileSync(file,[
  'HOST=127.0.0.1','PORT=4100','DATABASE_PATH=./data/hkbusgo.db',
  'JWT_SECRET='+randomBytes(48).toString('hex'),'ADMIN_EMAIL=admin@hkbusgo.local','ADMIN_PASSWORD='+password,
  'PROVIDER_MODE=live',
  'CORS_ORIGINS=*',
  'PUBLIC_APP_URL=http://localhost:10086','TDAS_ENABLED=true','PROVIDER_TIMEOUT_MS=15000'
].join('\n')+'\n',{mode:0o600,flag:'wx'});
console.log('已建立本機 .env.local。管理員電郵與隨機初始密碼只保存在此檔，請自行開啟；沒有輸出 JWT 憑證。');
console.log('保持 PROVIDER_MODE=live。啟動後會同步 KMB 官方資料，TDAS 已啟用；不支援示例模式或示例資料庫。');
