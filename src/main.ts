import { createApp } from './app.js';
const context=await createApp();
await context.app.listen({host:context.config.host,port:context.config.port});
let stopping=false;
async function shutdown(){if(stopping)return;stopping=true;await context.app.close();}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
