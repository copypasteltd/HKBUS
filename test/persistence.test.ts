import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join,resolve,dirname} from 'node:path';import {tmpdir} from 'node:os';import {DatabaseSync} from 'node:sqlite';import {createApp} from '../src/app.js';
test('SQLite restart and consistent backup preserve profile data and migrations',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'hkbusgo-persistence-')),databasePath=join(directory,'primary.db'),backup=join(directory,'backup.db');
 const settings={databasePath,jwtSecret:'isolated-persistence-test-secret-123456789',providerMode:'fixture' as const,workerEnabled:false};let ctx=await createApp(settings,{logger:false});
 try{
  const session=(await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions'})).json().data,headers={authorization:'Bearer '+session.accessToken};
  await ctx.app.inject({method:'PUT',url:'/api/v1/profile/bookmarks',headers,payload:{kind:'route',entityId:'KMB:112:O:1',alias:'Morning route'}});
  ctx.store.run('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)','interrupted-job','catalog-sync','running','test',new Date().toISOString(),null,'{}');
  await ctx.app.close();ctx=await createApp(settings,{logger:false});
  const restored=await ctx.app.inject({url:'/api/v1/profile/bookmarks',headers});assert.equal(restored.statusCode,200);assert.equal(restored.json().data[0].alias,'Morning route');
  assert.equal(ctx.store.get<{status:string}>('SELECT status FROM jobs WHERE id=?','interrupted-job')!.status,'failed');
  ctx.store.db.prepare('VACUUM INTO ?').run(backup);const copy=new DatabaseSync(backup);try{assert.equal(copy.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');assert.equal(copy.prepare('PRAGMA user_version').get()!.user_version,2);assert.equal(copy.prepare('SELECT alias FROM bookmarks').get()!.alias,'Morning route');}finally{copy.close();}
 }finally{await ctx.app.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(directory.includes('hkbusgo-persistence-'));rmSync(directory,{recursive:true,force:true});}
});
