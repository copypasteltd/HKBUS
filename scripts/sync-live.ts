import { createApp } from '../src/app.js';
const ctx=await createApp({workerEnabled:false},{logger:false});
try {
  const catalog=await ctx.providers.syncCatalog();
  console.log(JSON.stringify({syncedAt:ctx.store.setting('catalogSyncedAt',null),...catalog}));
} finally { await ctx.app.close(); }
