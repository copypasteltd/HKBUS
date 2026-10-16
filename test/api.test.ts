import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createTestApp } from './support.js';
import { evaluateReminders } from '../src/usecases.js';
let ctx:Awaited<ReturnType<typeof createApp>>;
let cookie='',token='',profileId='';
const adminHeaders=()=>({cookie,'x-hkbus-admin':'1',origin:'http://localhost:5174'});
const userHeaders=()=>({authorization:'Bearer '+token});
before(async()=>{ctx=await createTestApp({adminEmail:'test@example.com',adminPassword:'test-only-password-123'});});
after(async()=>{await ctx.app.close();});
test('rotating device credentials preserve data, reject replay and revoke deleted profiles',async()=>{
  const session=(await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions'})).json().data;
  const headers={authorization:'Bearer '+session.accessToken};
  await ctx.app.inject({method:'PUT',url:'/api/v1/profile/bookmarks',headers,payload:{kind:'stop',entityId:'stop-times',alias:'My daily stop'}});
  const refreshed=await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions/refresh',payload:{refreshToken:session.refreshToken}});
  assert.equal(refreshed.statusCode,200);const next=refreshed.json().data;assert.equal(next.profileId,session.profileId);assert.notEqual(next.refreshToken,session.refreshToken);
  assert.equal((await ctx.app.inject({url:'/api/v1/profile/bookmarks',headers})).statusCode,401);
  const renewedHeaders={authorization:'Bearer '+next.accessToken};const bookmarks=(await ctx.app.inject({url:'/api/v1/profile/bookmarks',headers:renewedHeaders})).json().data;assert.equal(bookmarks[0].alias,'My daily stop');
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions/refresh',payload:{refreshToken:session.refreshToken}})).statusCode,401);
  await ctx.app.inject({method:'DELETE',url:'/api/v1/profile',headers:renewedHeaders});
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions/refresh',payload:{refreshToken:next.refreshToken}})).statusCode,401);
});
test('health, config and canonical route identities are available',async()=>{
  const response=await ctx.app.inject('/api/health');assert.equal(response.statusCode,200);assert.equal(response.json().meta.mode,'live');assert.ok(response.headers['x-request-id']);
  const routes=(await ctx.app.inject('/api/v1/routes?q=112')).json().data.items;assert.equal(routes.length,2);assert.notEqual(routes[0].id,routes[1].id);
  const detail=(await ctx.app.inject('/api/v1/routes/'+encodeURIComponent('KMB:112:O:1'))).json().data;assert.equal(detail.stops[0].id,'stop-times');assert.equal(detail.directions.length,2);
});
test('invalid entities, partial coordinates and identical journey endpoints fail explicitly',async()=>{
  assert.equal((await ctx.app.inject('/api/v1/stops/missing/arrivals')).statusCode,404);
  assert.equal((await ctx.app.inject('/api/v1/stops?latitude=22.28')).statusCode,422);
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/v1/journeys',payload:{startId:'stop-times',endId:'stop-times'}})).statusCode,422);
  const found=(await ctx.app.inject('/api/v1/stops?latitude=22.2784&longitude=114.1828&radius=1000')).json().data.items;assert.equal(found[0].id,'stop-times');assert.equal(found[0].distanceMeters,0);
});
test('profile credentials, bookmark idempotency, aliases and complete ordering',async()=>{
  const created=(await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions'})).json().data;token=created.accessToken;profileId=created.profileId;
  const input={kind:'stop',entityId:'stop-times',alias:'返工'};
  for(let i=0;i<2;i++)assert.equal((await ctx.app.inject({method:'PUT',url:'/api/v1/profile/bookmarks',headers:userHeaders(),payload:input})).statusCode,200);
  const saved=(await ctx.app.inject({url:'/api/v1/profile/bookmarks',headers:userHeaders()})).json().data;assert.equal(saved.length,1);assert.equal(saved[0].alias,'返工');
  assert.equal((await ctx.app.inject({method:'PATCH',url:'/api/v1/profile/bookmarks/order',headers:userHeaders(),payload:{items:[]}})).statusCode,422);
  assert.equal((await ctx.app.inject({method:'PATCH',url:'/api/v1/profile/bookmarks/order',headers:userHeaders(),payload:{items:[{kind:'stop',entityId:'stop-times'}]}})).statusCode,200);
});
test('profile ownership is enforced and reminder delivery is idempotent',async()=>{
  const input={stopId:'stop-times',routeId:'KMB:112:O:1',threshold:5};
  const first=(await ctx.app.inject({method:'PUT',url:'/api/v1/profile/reminders',headers:userHeaders(),payload:input})).json().data;
  const duplicate=(await ctx.app.inject({method:'PUT',url:'/api/v1/profile/reminders',headers:userHeaders(),payload:input})).json().data;assert.equal(first.id,duplicate.id);
  const other=(await ctx.app.inject({method:'POST',url:'/api/v1/profile/sessions'})).json().data;
  assert.equal((await ctx.app.inject({method:'PATCH',url:'/api/v1/profile/reminders/'+first.id,headers:{authorization:'Bearer '+other.accessToken},payload:{status:'paused'}})).statusCode,404);
  await evaluateReminders(ctx.store,ctx.providers);await evaluateReminders(ctx.store,ctx.providers);
  const inbox=(await ctx.app.inject({url:'/api/v1/profile/notifications',headers:userHeaders()})).json().data;assert.equal(inbox.length,1);
  assert.equal(ctx.store.get<{status:string}>('SELECT status FROM reminders WHERE id=?',first.id)!.status,'sent');
});
test('admin cookie session, CSRF protection and role checks',async()=>{
  assert.equal((await ctx.app.inject('/api/admin/overview')).statusCode,401);
  const login=await ctx.app.inject({method:'POST',url:'/api/admin/auth/login',payload:{email:'test@example.com',password:'test-only-password-123'}});assert.equal(login.statusCode,200);
  cookie=String(login.headers['set-cookie']).split(';')[0]!;assert.ok(String(login.headers['set-cookie']).includes('HttpOnly'));assert.equal(login.json().data.accessToken,undefined);
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/admin/jobs/sync',headers:{cookie}})).statusCode,403);
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/admin/jobs/sync',headers:{...adminHeaders(),origin:'https://attacker.example'}})).statusCode,403);
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/admin/users',headers:adminHeaders(),payload:{email:'viewer@example.com',name:'Viewer',password:'viewer-test-password-123',role:'viewer'}})).statusCode,200);
  const viewer=await ctx.app.inject({method:'POST',url:'/api/admin/auth/login',payload:{email:'viewer@example.com',password:'viewer-test-password-123'}});const viewerCookie=String(viewer.headers['set-cookie']).split(';')[0]!;
  assert.equal((await ctx.app.inject({url:'/api/admin/overview',headers:{cookie:viewerCookie}})).statusCode,200);
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/admin/cache/purge',headers:{cookie:viewerCookie,'x-hkbus-admin':'1'}})).statusCode,403);
});
test('notice draft/review/approval/scheduled publication, conflicts and rollback',async()=>{
  const document={title:{tc:'新通告',sc:'新通告',en:'New notice'},body:{tc:'內容',sc:'内容',en:'Body'},severity:'warning',validFrom:new Date(Date.now()-1000).toISOString(),validUntil:new Date(Date.now()+86400000).toISOString(),routeIds:['KMB:112:O:1'],stopIds:[],platforms:['h5','weapp'],sourceUrl:'https://www.kmb.hk/'};
  let notice=(await ctx.app.inject({method:'POST',url:'/api/admin/notices',headers:adminHeaders(),payload:document})).json().data;assert.equal(notice.status,'draft');
  assert.equal((await ctx.app.inject('/api/v1/notices/'+notice.id)).statusCode,404);
  for(const action of ['submit','approve','publish']){const result=await ctx.app.inject({method:'POST',url:'/api/admin/notices/'+notice.id+'/transition',headers:adminHeaders(),payload:{action,version:notice.version}});assert.equal(result.statusCode,200,result.body);notice=result.json().data;}
  assert.equal((await ctx.app.inject('/api/v1/notices/'+notice.id)).statusCode,200);
  assert.equal((await ctx.app.inject({method:'PUT',url:'/api/admin/notices/'+notice.id,headers:adminHeaders(),payload:{version:1,document}})).statusCode,409);
  const rollback=await ctx.app.inject({method:'POST',url:'/api/admin/notices/'+notice.id+'/rollback',headers:adminHeaders(),payload:{version:1,currentVersion:notice.version}});assert.equal(rollback.statusCode,200);assert.equal(rollback.json().data.status,'draft');
  assert.equal((await ctx.app.inject('/api/v1/notices/'+notice.id)).statusCode,404);
  assert.equal((await ctx.app.inject({url:'/api/admin/notices/'+notice.id+'/versions',headers:adminHeaders()})).json().data.length,5);
});
test('configuration revisions, real content propagation and feature shutdown',async()=>{
  const records=(await ctx.app.inject({url:'/api/admin/settings',headers:adminHeaders()})).json().data;
  const feature=records.find((x:{key:string})=>x.key==='features');
  const changed=await ctx.app.inject({method:'PUT',url:'/api/admin/settings/features',headers:adminHeaders(),payload:{version:feature.version,value:{...feature.value,traffic:false}}});assert.equal(changed.statusCode,200);
  assert.equal((await ctx.app.inject({method:'PUT',url:'/api/admin/settings/features',headers:adminHeaders(),payload:{version:feature.version,value:feature.value}})).statusCode,409);
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/v1/traffic/route',payload:{}})).statusCode,503);
  const admin=(await ctx.app.inject({url:'/api/admin/auth/me',headers:adminHeaders()})).json().data;
  assert.equal((await ctx.app.inject({method:'PATCH',url:'/api/admin/users/'+admin.id,headers:adminHeaders(),payload:{active:false}})).statusCode,409);
});
test('profile deletion revokes access and cascades personal data',async()=>{
  const response=await ctx.app.inject({method:'DELETE',url:'/api/v1/profile',headers:userHeaders()});assert.equal(response.statusCode,200);
  assert.equal((await ctx.app.inject({url:'/api/v1/profile/bookmarks',headers:userHeaders()})).statusCode,401);
  assert.equal(ctx.store.get<{n:number}>('SELECT count(*) n FROM bookmarks WHERE profile_id=?',profileId)!.n,0);
  assert.equal(ctx.store.get<{n:number}>('SELECT count(*) n FROM notifications WHERE profile_id=?',profileId)!.n,0);
});
