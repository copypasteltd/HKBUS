import { createApp } from './app.js';
const context=await createApp();
await context.app.listen({host:context.config.host,port:context.config.port});
const synced=context.store.setting<string|null>('catalogSyncedAt',null);
if(context.config.providerMode==='live'&&(!synced||Date.now()-Date.parse(synced)>context.config.syncHours*3600000))context.providers.startSync();
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;await context.app.close();}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
