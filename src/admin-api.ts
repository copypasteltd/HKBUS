import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { add, payload, type Context } from './app.js';
import { requireIdentity, issueSession } from './auth.js';
import { passwordMatches, passwordHash } from './database.js';
import { AppError, now, type Identity, type Notice } from './domain.js';
import { pageSchema, idSchema, paginate } from './public-api.js';
import { transitionNotice, evaluateReminders } from './usecases.js';

const localizedSchema=z.object({tc:z.string().trim().min(1).max(10000),sc:z.string().trim().min(1).max(10000),en:z.string().trim().min(1).max(10000)});
const safeUrl=z.union([z.literal(''),z.string().url().refine(value=>value.startsWith('https://'),'僅允許 HTTPS 網址')]);
const noticeSchema=z.object({title:localizedSchema.refine(value=>Object.values(value).every(x=>x.length<=160),'標題最多 160 字'),body:localizedSchema,severity:z.enum(['info','warning','critical']),validFrom:z.string().datetime(),validUntil:z.string().datetime(),routeIds:z.array(z.string().max(120)).max(200),stopIds:z.array(z.string().max(120)).max(200),platforms:z.array(z.enum(['weapp','alipay','tt','h5','android'])).min(1),sourceUrl:safeUrl}).refine(value=>value.validUntil>value.validFrom,'結束時間必須晚於開始時間');
const featuresSchema=z.object({reminders:z.boolean(),traffic:z.boolean(),planner:z.boolean(),map:z.boolean()}).strict();
const freshnessSchema=z.object({etaFreshSeconds:z.number().int().min(15).max(300),etaStaleSeconds:z.number().int().min(30).max(3600),cacheSeconds:z.number().int().min(5).max(60)}).refine(x=>x.cacheSeconds<=x.etaFreshSeconds&&x.etaFreshSeconds<=x.etaStaleSeconds,'需要快取時間 ≤ 新鮮時間 ≤ 降級保留時間');
const contentSchema=z.object({coverage:localizedSchema,privacy:localizedSchema,help:localizedSchema,sourceUrl:safeUrl,privacyUrl:safeUrl,supportEmail:z.union([z.literal(''),z.string().email()]),maintenance:z.boolean()}).strict();
const userPublic='id,email,name,role,active,created_at';

export function registerAdmin(ctx:Context){
  const {app,store,providers,config}=ctx;
  const user=(request:Parameters<typeof requireIdentity>[2],roles?:string[])=>requireIdentity(app,store,request,'admin',roles);
  const ensureReferences=(input:{routeIds:string[];stopIds:string[]})=>{if(input.routeIds.some(id=>!store.route(id)?.active)||input.stopIds.some(id=>!store.stop(id)?.active))throw new AppError('CONTENT_REFERENCE_INVALID','關聯路線或車站不存在',422);};
  add(ctx,'POST','/api/admin/auth/login','管理員登入（HttpOnly Cookie）',async(request,reply)=>{
    const input=z.object({email:z.string().email().max(200),password:z.string().min(1).max(256)}).parse(request.body);
    const admin=store.get<{id:string;email:string;name:string;password_hash:string;role:Identity['role'];active:number}>('SELECT * FROM admins WHERE email=?',input.email.toLowerCase());
    const valid=passwordMatches(input.password,admin?.password_hash||passwordHash('invalid-password-placeholder'));
    if(!admin?.active||!valid)throw new AppError('INVALID_CREDENTIALS','電郵或密碼不正確',401);
    const session=issueSession(app,store,admin.id,'admin',admin.role);
    reply.setCookie('hkbus_admin',session.token,{httpOnly:true,sameSite:'strict',secure:config.production,path:'/api/admin',maxAge:session.expiresIn});
    store.audit(admin.id,'auth.login',admin.id);
    return payload(ctx,request,{user:{id:admin.id,email:admin.email,name:admin.name,role:admin.role},expiresIn:session.expiresIn});
  },{config:{rateLimit:{max:10,timeWindow:'15 minutes'}}});
  add(ctx,'GET','/api/admin/auth/me','目前管理員與權限',async request=>{const current=await user(request);return payload(ctx,request,store.get('SELECT '+userPublic+' FROM admins WHERE id=?',current.sub));});
  add(ctx,'POST','/api/admin/auth/logout','撤銷管理員會話',async(request,reply)=>{const current=await user(request);store.run('DELETE FROM sessions WHERE id=?',current.sid);reply.clearCookie('hkbus_admin',{path:'/api/admin'});return payload(ctx,request,{loggedOut:true});});
  add(ctx,'GET','/api/admin/overview','真實請求、資料覆蓋與提醒統計',async request=>{
    await user(request);
    const since=new Date(Date.now()-86400000).toISOString();
    const metrics=store.all<{bucket:string;requests:number;errors:number;total_ms:number}>('SELECT bucket,sum(count) requests,sum(CASE WHEN status>=500 THEN count ELSE 0 END) errors,sum(total_ms) total_ms FROM metrics WHERE bucket>=? GROUP BY bucket ORDER BY bucket',since);
    const requests=metrics.reduce((sum,x)=>sum+x.requests,0),errors=metrics.reduce((sum,x)=>sum+x.errors,0);
    return payload(ctx,request,{mode:config.providerMode,routes:store.routes().length,stops:store.stops().length,notices:store.get<{n:number}>('SELECT count(*) n FROM notices WHERE status=?','published')!.n,activeReminders:store.get<{n:number}>('SELECT count(*) n FROM reminders WHERE status=?','active')!.n,requests,errors,availability:requests?Math.round((1-errors/requests)*10000)/100:null,meanLatencyMs:requests?Math.round(metrics.reduce((sum,x)=>sum+x.total_ms,0)/requests):null,timeline:metrics,catalogSyncedAt:store.setting('catalogSyncedAt',null),recentJobs:store.all('SELECT * FROM jobs ORDER BY started_at DESC LIMIT 5'),recentAudit:store.all('SELECT id,action,entity,created_at FROM audit ORDER BY created_at DESC LIMIT 6')});
  });
  add(ctx,'GET','/api/admin/routes','唯讀官方路線資料庫',async request=>{await user(request);const q=pageSchema.parse(request.query);return payload(ctx,request,paginate(store.routes(false).filter(x=>!q.q||JSON.stringify([x.routeNo,x.origin,x.destination]).toLowerCase().includes(q.q.toLowerCase())),q.page,q.pageSize));});
  add(ctx,'GET','/api/admin/stops','唯讀官方車站資料庫',async request=>{await user(request);const q=pageSchema.parse(request.query);return payload(ctx,request,paginate(store.stops(false).filter(x=>!q.q||JSON.stringify([x.id,x.name]).toLowerCase().includes(q.q.toLowerCase())),q.page,q.pageSize));});
  add(ctx,'GET','/api/admin/notices','全部通告與工作流狀態',async request=>{await user(request);const q=pageSchema.extend({status:z.enum(['all','draft','review','approved','published','withdrawn']).default('all')}).parse(request.query);const items=store.all<{document:string}>('SELECT document FROM notices ORDER BY rowid DESC').map(x=>JSON.parse(x.document) as Notice).filter(x=>(q.status==='all'||x.status===q.status)&&(!q.q||JSON.stringify(x.title).toLowerCase().includes(q.q.toLowerCase())));return payload(ctx,request,paginate(items,q.page,q.pageSize));});
  add(ctx,'POST','/api/admin/notices','建立三語通告草稿',async request=>{const current=await user(request,['admin','editor','operator']),input=noticeSchema.parse(request.body);ensureReferences(input);const notice:Notice={...input,id:randomUUID(),status:'draft',version:1,updatedAt:now(),updatedBy:current.sub};store.saveNotice(notice,current.sub);return payload(ctx,request,notice);});
  add(ctx,'PUT','/api/admin/notices/:id','樂觀鎖更新通告，已發布內容改為草稿',async request=>{
    const current=await user(request,['admin','editor','operator']),{id}=idSchema.parse(request.params),body=z.object({version:z.number().int().positive(),document:noticeSchema}).parse(request.body),notice=store.notice(id);
    if(!notice)throw new AppError('NOTICE_NOT_FOUND','通告不存在',404);if(notice.version!==body.version)throw new AppError('VERSION_CONFLICT','通告已被其他人更新，請重新載入',409);ensureReferences(body.document);
    const updated:Notice={...body.document,id,status:'draft',version:notice.version+1,updatedAt:now(),updatedBy:current.sub};store.saveNotice(updated,current.sub);return payload(ctx,request,updated);
  });
  add(ctx,'POST','/api/admin/notices/:id/transition','提交審核、審核通過、發布/排程與撤回',async request=>{
    const current=await user(request,['admin','editor','operator']),{id}=idSchema.parse(request.params),input=z.object({action:z.enum(['submit','approve','publish','withdraw']),version:z.number().int().positive()}).parse(request.body),notice=store.notice(id);
    if(!notice)throw new AppError('NOTICE_NOT_FOUND','通告不存在',404);if(input.version!==notice.version)throw new AppError('VERSION_CONFLICT','通告已更新，請重新載入',409);
    if(input.action==='publish'&&notice.validUntil<=now())throw new AppError('CONTENT_EXPIRED','通告已過期，請先修改有效時間',422);
    const updated:Notice={...notice,status:transitionNotice(notice,input.action,current.role!),version:notice.version+1,updatedAt:now(),updatedBy:current.sub};store.saveNotice(updated,current.sub);return payload(ctx,request,updated);
  });
  add(ctx,'GET','/api/admin/notices/:id/versions','通告版本與發布歷史',async request=>{await user(request);const {id}=idSchema.parse(request.params);if(!store.notice(id))throw new AppError('NOTICE_NOT_FOUND','通告不存在',404);return payload(ctx,request,store.all<{version:number;actor:string;created_at:string;document:string}>('SELECT version,actor,created_at,document FROM notice_versions WHERE notice_id=? ORDER BY version DESC',id).map(x=>({...x,document:JSON.parse(x.document)})));});
  add(ctx,'POST','/api/admin/notices/:id/rollback','將歷史內容恢復為新草稿版本',async request=>{const current=await user(request,['admin','operator']),{id}=idSchema.parse(request.params),input=z.object({version:z.number().int().positive(),currentVersion:z.number().int().positive()}).parse(request.body),notice=store.notice(id),previous=store.get<{document:string}>('SELECT document FROM notice_versions WHERE notice_id=? AND version=?',id,input.version);if(!notice||!previous)throw new AppError('VERSION_NOT_FOUND','歷史版本不存在',404);if(notice.version!==input.currentVersion)throw new AppError('VERSION_CONFLICT','通告已更新，請重新載入',409);const updated:Notice={...JSON.parse(previous.document),id,status:'draft',version:notice.version+1,updatedAt:now(),updatedBy:current.sub};store.saveNotice(updated,current.sub);store.audit(current.sub,'notice.rollback',id,{fromVersion:input.version,toVersion:updated.version});return payload(ctx,request,updated);});
  add(ctx,'GET','/api/admin/settings','能力、來源說明、私隱與快取策略',async request=>{await user(request);return payload(ctx,request,store.all<{key:string;value:string;version:number;updated_at:string}>('SELECT * FROM settings WHERE key IN (?,?,?)','features','freshness','content').map(x=>({...x,value:JSON.parse(x.value)})));});
  add(ctx,'PUT','/api/admin/settings/:id','更新可公開設定並寫入審計',async request=>{
    const current=await user(request,['admin','operator']),{id}=idSchema.parse(request.params),body=z.object({version:z.number().int().positive(),value:z.unknown()}).parse(request.body);
    const schemas={features:featuresSchema,freshness:freshnessSchema,content:contentSchema};if(!(id in schemas))throw new AppError('SETTING_NOT_EDITABLE','此設定不能透過後台修改',403);
    const value=schemas[id as keyof typeof schemas].parse(body.value);
    store.transaction(()=>{const existing=store.get<{version:number}>('SELECT version FROM settings WHERE key=?',id);if(!existing||existing.version!==body.version)throw new AppError('VERSION_CONFLICT','設定已更新，請重新載入',409);store.setSetting(id,value);store.audit(current.sub,'setting.update',id,{version:body.version+1});});
    return payload(ctx,request,{key:id,value,version:body.version+1});
  });
  add(ctx,'GET','/api/admin/providers','供應商健康與資料品質',async request=>{
    await user(request);const health=['KMB','TDAS'].map(provider=>{const events=store.all<{success:number;duration_ms:number;code:string|null;created_at:string}>('SELECT success,duration_ms,code,created_at FROM provider_events WHERE provider=? ORDER BY created_at DESC LIMIT 1000',provider),times=events.map(x=>x.duration_ms).sort((a,b)=>a-b);return{provider,mode:config.providerMode,enabled:provider==='KMB'||config.tdasEnabled,requests:events.length,successRate:events.length?Math.round(events.filter(x=>x.success).length/events.length*10000)/100:null,p50Ms:times.length?times[Math.floor((times.length-1)*.5)]:null,p95Ms:times.length?times[Math.floor((times.length-1)*.95)]:null,lastEvent:events[0]||null};});
    const routes=store.routes(),stops=store.stops();return payload(ctx,request,{health,quality:{routes:routes.length,stops:stops.length,relations:store.get<{n:number}>('SELECT count(*) n FROM route_stops')!.n,missingNames:stops.filter(x=>!x.name.tc||!x.name.sc||!x.name.en).length,invalidCoordinates:stops.filter(x=>!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude)).length},cacheEntries:store.get<{n:number}>('SELECT count(*) n FROM cache')!.n,syncedAt:store.setting('catalogSyncedAt',null)});
  });
  add(ctx,'POST','/api/admin/jobs/sync','觸發原子主資料同步任務',async(request,reply)=>{const current=await user(request,['admin','operator']);reply.code(202);return payload(ctx,request,{jobId:providers.startSync(current.sub)});});
  add(ctx,'GET','/api/admin/jobs','同步任務與失敗紀錄',async request=>{await user(request);const q=pageSchema.parse(request.query);const total=store.get<{n:number}>('SELECT count(*) n FROM jobs')!.n;return payload(ctx,request,{items:store.all('SELECT * FROM jobs ORDER BY started_at DESC LIMIT ? OFFSET ?',q.pageSize,(q.page-1)*q.pageSize),total,page:q.page,pageSize:q.pageSize});});
  add(ctx,'POST','/api/admin/cache/purge','清除到站/道路快取，不改寫官方主資料',async request=>{const current=await user(request,['admin','operator']);const result=store.run('DELETE FROM cache');store.audit(current.sub,'cache.purge','cache',{entries:Number(result.changes)});return payload(ctx,request,{purged:Number(result.changes)});});
  add(ctx,'POST','/api/admin/reminders/evaluate','手動執行真實提醒評估',async request=>{const current=await user(request,['admin','operator']);const result=await evaluateReminders(store,providers);store.audit(current.sub,'reminders.evaluate','worker',result);return payload(ctx,request,result);});
  add(ctx,'GET','/api/admin/audit','操作審計，不包含密碼、座標或 API 憑證',async request=>{await user(request,['admin','operator']);const q=pageSchema.parse(request.query);const total=store.get<{n:number}>('SELECT count(*) n FROM audit')!.n;return payload(ctx,request,{items:store.all('SELECT * FROM audit ORDER BY created_at DESC LIMIT ? OFFSET ?',q.pageSize,(q.page-1)*q.pageSize),total,page:q.page,pageSize:q.pageSize});});
  add(ctx,'GET','/api/admin/users','管理員與角色列表',async request=>{await user(request,['admin']);return payload(ctx,request,store.all('SELECT '+userPublic+' FROM admins ORDER BY created_at'));});
  add(ctx,'POST','/api/admin/users','建立管理員並賦予最小角色',async request=>{const current=await user(request,['admin']),input=z.object({email:z.string().email().max(200),name:z.string().trim().min(1).max(60),password:z.string().min(12).max(256),role:z.enum(['admin','operator','editor','viewer'])}).parse(request.body);if(store.get('SELECT id FROM admins WHERE email=?',input.email.toLowerCase()))throw new AppError('EMAIL_EXISTS','此電郵已存在',409);const id=randomUUID();store.run('INSERT INTO admins VALUES(?,?,?,?,?,?,?)',id,input.email.toLowerCase(),input.name,passwordHash(input.password),input.role,1,now());store.audit(current.sub,'admin.create',id,{role:input.role});return payload(ctx,request,store.get('SELECT '+userPublic+' FROM admins WHERE id=?',id));});
  add(ctx,'PATCH','/api/admin/users/:id','停用、角色或密碼變更並撤銷會話',async request=>{
    const current=await user(request,['admin']),{id}=idSchema.parse(request.params),input=z.object({role:z.enum(['admin','operator','editor','viewer']).optional(),active:z.boolean().optional(),password:z.string().min(12).max(256).optional()}).refine(x=>Object.keys(x).length>0,'需要至少一個欄位').parse(request.body),target=store.get<{role:string;active:number}>('SELECT role,active FROM admins WHERE id=?',id);
    if(!target)throw new AppError('USER_NOT_FOUND','管理員不存在',404);
    if(target.role==='admin'&&target.active&&(input.active===false||(input.role&&input.role!=='admin'))&&store.get<{n:number}>('SELECT count(*) n FROM admins WHERE role=? AND active=1 AND id<>?','admin',id)!.n===0)throw new AppError('LAST_ADMIN','不能停用或降級最後一位管理員',409);
    store.transaction(()=>{if(input.role)store.run('UPDATE admins SET role=? WHERE id=?',input.role,id);if(input.active!==undefined)store.run('UPDATE admins SET active=? WHERE id=?',input.active?1:0,id);if(input.password)store.run('UPDATE admins SET password_hash=? WHERE id=?',passwordHash(input.password),id);store.run('DELETE FROM sessions WHERE subject=? AND kind=?',id,'admin');store.audit(current.sub,'admin.update',id,{role:input.role,active:input.active,passwordChanged:!!input.password});});return payload(ctx,request,store.get('SELECT '+userPublic+' FROM admins WHERE id=?',id));
  });
}
