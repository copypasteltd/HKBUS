import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { add, payload, type Context } from './app.js';
import { AppError, now } from './domain.js';
import { requireIdentity, issueSession } from './auth.js';
import { bookmarks, reminders, upsertReminder, type Reminder } from './usecases.js';
import { idSchema } from './public-api.js';
const bookmarkSchema=z.object({kind:z.enum(['stop','route']),entityId:z.string().min(1).max(120),alias:z.string().trim().max(24).default('')});
export function registerProfile(ctx:Context){
  const {app,store}=ctx;
  const identity=(request:Parameters<typeof requireIdentity>[2])=>requireIdentity(app,store,request,'profile');
  const profileSession=(profileId:string)=>{
    const refreshToken=randomBytes(32).toString('hex'),hash=createHash('sha256').update(refreshToken).digest('hex');
    store.run('INSERT INTO profile_credentials VALUES(?,?,?) ON CONFLICT(profile_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at',profileId,hash,new Date(Date.now()+365*86400000).toISOString());
    const session=issueSession(app,store,profileId,'profile');
    return{profileId,accessToken:session.token,expiresIn:session.expiresIn,refreshToken};
  };
  add(ctx,'POST','/api/v1/profile/sessions','建立匿名裝置檔案與存取憑證',async request=>{const id=randomUUID();const session=store.transaction(()=>{store.run('INSERT INTO profiles VALUES(?,?)',id,now());return profileSession(id);});return payload(ctx,request,session);},{config:{rateLimit:{max:20,timeWindow:'1 hour'}}});
  add(ctx,'POST','/api/v1/profile/sessions/refresh','輪換裝置憑證，保留收藏與提醒',async request=>{
    const {refreshToken}=z.object({refreshToken:z.string().regex(/^[a-f0-9]{64}$/)}).parse(request.body);
    const hash=createHash('sha256').update(refreshToken).digest('hex');
    const credentials=store.get<{profile_id:string;expires_at:string}>('SELECT profile_id,expires_at FROM profile_credentials WHERE token_hash=?',hash);
    if(!credentials||credentials.expires_at<=now())throw new AppError('PROFILE_SESSION_EXPIRED','裝置憑證已失效，請在設定清除本機個人資料後重新建立',401);
    const session=store.transaction(()=>{store.run('DELETE FROM sessions WHERE subject=? AND kind=?',credentials.profile_id,'profile');return profileSession(credentials.profile_id);});
    return payload(ctx,request,session);
  },{config:{rateLimit:{max:40,timeWindow:'1 hour'}}});
  add(ctx,'GET','/api/v1/profile/bookmarks','收藏與失效實體保留',async request=>{const user=await identity(request);return payload(ctx,request,bookmarks(store,user.sub));});
  add(ctx,'PUT','/api/v1/profile/bookmarks','幂等新增或重新命名收藏',async request=>{
    const user=await identity(request),input=bookmarkSchema.parse(request.body);const entity=input.kind==='stop'?store.stop(input.entityId):store.route(input.entityId);
    if(!entity?.active)throw new AppError('ENTITY_NOT_FOUND','不能收藏不存在或已停用的資料',404);
    const size=store.get<{n:number}>('SELECT count(*) n FROM bookmarks WHERE profile_id=?',user.sub)!.n;
    if(size>=100&&!store.get('SELECT entity_id FROM bookmarks WHERE profile_id=? AND kind=? AND entity_id=?',user.sub,input.kind,input.entityId))throw new AppError('BOOKMARK_LIMIT','最多可儲存 100 個收藏',422);
    store.run('INSERT INTO bookmarks VALUES(?,?,?,?,?,?) ON CONFLICT(profile_id,kind,entity_id) DO UPDATE SET alias=excluded.alias',user.sub,input.kind,input.entityId,input.alias,size,now());return payload(ctx,request,bookmarks(store,user.sub));
  });
  add(ctx,'PATCH','/api/v1/profile/bookmarks/order','完整且無重複的收藏排序',async request=>{
    const user=await identity(request),input=z.object({items:z.array(bookmarkSchema.pick({kind:true,entityId:true})).max(100)}).parse(request.body),existing=bookmarks(store,user.sub);
    const keys=input.items.map(x=>x.kind+':'+x.entityId);
    if(keys.length!==existing.length||new Set(keys).size!==keys.length||existing.some(x=>!keys.includes(x.kind+':'+x.entityId)))throw new AppError('INVALID_ORDER','排序必須包含全部收藏且不能重複',422);
    store.transaction(()=>input.items.forEach((x,index)=>store.run('UPDATE bookmarks SET position=? WHERE profile_id=? AND kind=? AND entity_id=?',index,user.sub,x.kind,x.entityId)));
    return payload(ctx,request,bookmarks(store,user.sub));
  });
  add(ctx,'DELETE','/api/v1/profile/bookmarks/:kind/:id','刪除收藏',async request=>{const user=await identity(request),input=z.object({kind:z.enum(['stop','route']),id:z.string().min(1).max(120)}).parse(request.params);store.run('DELETE FROM bookmarks WHERE profile_id=? AND kind=? AND entity_id=?',user.sub,input.kind,input.id);return payload(ctx,request,{deleted:true});});
  add(ctx,'GET','/api/v1/profile/recent','最多六項最近查看',async request=>{const user=await identity(request);return payload(ctx,request,store.all<{kind:string;entity_id:string}>('SELECT kind,entity_id FROM recent WHERE profile_id=? ORDER BY viewed_at DESC LIMIT 6',user.sub).map(x=>({...x,entityId:x.entity_id,entity:x.kind==='stop'?store.stop(x.entity_id):store.route(x.entity_id)})));});
  add(ctx,'POST','/api/v1/profile/recent','記錄最近查看',async request=>{const user=await identity(request),input=bookmarkSchema.pick({kind:true,entityId:true}).parse(request.body);if(!(input.kind==='stop'?store.stop(input.entityId):store.route(input.entityId)))throw new AppError('ENTITY_NOT_FOUND','資料不存在',404);store.transaction(()=>{store.run('INSERT INTO recent VALUES(?,?,?,?) ON CONFLICT(profile_id,kind,entity_id) DO UPDATE SET viewed_at=excluded.viewed_at',user.sub,input.kind,input.entityId,now());store.run('DELETE FROM recent WHERE profile_id=? AND rowid NOT IN (SELECT rowid FROM recent WHERE profile_id=? ORDER BY viewed_at DESC LIMIT 6)',user.sub,user.sub);});return payload(ctx,request,{saved:true});});
  add(ctx,'DELETE','/api/v1/profile/recent','清除最近查看',async request=>{const user=await identity(request);store.run('DELETE FROM recent WHERE profile_id=?',user.sub);return payload(ctx,request,{deleted:true});});
  add(ctx,'GET','/api/v1/profile/reminders','提醒狀態列表',async request=>{const user=await identity(request);return payload(ctx,request,reminders(store,user.sub));});
  add(ctx,'PUT','/api/v1/profile/reminders','按車站、方向幂等建立提醒',async request=>{const user=await identity(request);if(!store.setting('features',{reminders:false}).reminders)throw new AppError('FEATURE_DISABLED','提醒功能暫未開放',503);const input=z.object({stopId:z.string().min(1).max(120),routeId:z.string().min(1).max(120),threshold:z.number().int().min(1).max(30),channel:z.literal('in-app').default('in-app')}).parse(request.body);return payload(ctx,request,upsertReminder(store,user.sub,input));});
  add(ctx,'PATCH','/api/v1/profile/reminders/:id','暫停或重新啟用提醒',async request=>{const user=await identity(request),{id}=idSchema.parse(request.params),input=z.object({status:z.enum(['active','paused'])}).parse(request.body),reminder=store.get<Reminder>('SELECT * FROM reminders WHERE id=? AND profile_id=?',id,user.sub);if(!reminder)throw new AppError('REMINDER_NOT_FOUND','提醒不存在',404);if(input.status==='active'){const item=upsertReminder(store,user.sub,{stopId:reminder.stop_id,routeId:reminder.route_id,threshold:reminder.threshold,channel:'in-app'});return payload(ctx,request,item);}store.run('UPDATE reminders SET status=? WHERE id=?','paused',id);return payload(ctx,request,{id,status:'paused'});});
  add(ctx,'DELETE','/api/v1/profile/reminders/:id','刪除提醒',async request=>{const user=await identity(request),{id}=idSchema.parse(request.params);store.run('DELETE FROM reminders WHERE id=? AND profile_id=?',id,user.sub);return payload(ctx,request,{deleted:true});});
  add(ctx,'GET','/api/v1/profile/notifications','頁面提醒收件匣',async request=>{const user=await identity(request);return payload(ctx,request,store.all('SELECT id,message,created_at,read_at FROM notifications WHERE profile_id=? ORDER BY created_at DESC LIMIT 50',user.sub));});
  add(ctx,'PATCH','/api/v1/profile/notifications/:id','將提醒標記已讀',async request=>{const user=await identity(request),{id}=idSchema.parse(request.params);store.run('UPDATE notifications SET read_at=? WHERE id=? AND profile_id=?',now(),id,user.sub);return payload(ctx,request,{read:true});});
  add(ctx,'DELETE','/api/v1/profile','刪除本裝置檔案和全部個人資料',async request=>{const user=await identity(request);store.transaction(()=>{store.run('DELETE FROM profiles WHERE id=?',user.sub);store.run('DELETE FROM sessions WHERE subject=?',user.sub);});return payload(ctx,request,{deleted:true});});
}
