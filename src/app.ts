import { brandLogoWhiteSvg, brandFaviconPng, brandUiScript } from './brand.js';
import Fastify, { type FastifyInstance, type FastifyRequest, type RouteHandlerMethod } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadConfig, isOriginAllowed, type Config } from './config.js';
import { Store, passwordHash } from './database.js';
import { AppError, now } from './domain.js';
import { Providers, type Fetcher } from './providers.js';
import {Fares} from './fares.js';
import {TransitReference} from './transit-reference.js';
import { seedSettings } from './settings.js';
import { validateMutationOrigin } from './auth.js';
import { evaluateReminders } from './usecases.js';
import { registerPublic } from './public-api.js';
import { registerProfile } from './profile-api.js';
import { registerAdmin } from './admin-api.js';
import { contract,documentSchema } from './contracts.js';

export interface Context { app:FastifyInstance;store:Store;providers:Providers;fares:Fares;reference:TransitReference;config:Config }
export function payload(ctx:Context,request:FastifyRequest,data:unknown){return{data,meta:{requestId:request.id,mode:ctx.config.providerMode,generatedAt:now()}};}
export function add(ctx:Context,method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',url:string,summary:string,handler:RouteHandlerMethod,options:Record<string,unknown>={}){
  ctx.app.route({method,url,schema:{tags:[url.includes('/admin')?'Admin':url.includes('/profile')?'Profile':'Transit'],summary,...contract(method,url)},handler,...options});
}
export async function createApp(overrides:Partial<Config>={},options:{logger?:boolean;fetcher?:Fetcher}={}){
  const config=loadConfig(overrides),store=new Store(config.databasePath);
  try { store.assertLiveDatabase(config.databasePath); } catch (error) { store.close(); throw error; }
  seedSettings(store);
  store.run('UPDATE jobs SET status=?,finished_at=?,details=? WHERE status=?','failed',now(),JSON.stringify({code:'PROCESS_RESTARTED',message:'服務重啟前任務未完成；保留上一版完整資料，可重新同步'}),'running');
  if(!store.get('SELECT id FROM admins LIMIT 1')&&config.adminEmail&&config.adminPassword){
    if(config.adminPassword.length<12)throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
    store.run('INSERT INTO admins VALUES(?,?,?,?,?,?,?)',randomUUID(),config.adminEmail.toLowerCase(),'管理員',passwordHash(config.adminPassword),'admin',1,now());
  }
  const app=Fastify({logger:options.logger===false?false:{level:'info',redact:['req.headers.authorization','req.headers.cookie','res.headers.set-cookie','password','token'],serializers:{req:req=>({method:req.method,url:String(req.url).split('?')[0]})}},genReqId:()=>randomUUID(),bodyLimit:262144,trustProxy:config.trustedProxies.length?config.trustedProxies:false});
  await app.register(cookie);
  // Reflect each permitted Origin so credentials work; omitted allowedHeaders reflects every requested header.
  await app.register(cors,{origin:(origin,cb)=>cb(null,isOriginAllowed(config,origin)),credentials:true,methods:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']});
  await app.register(jwt,{secret:config.jwtSecret,cookie:{cookieName:'hkbus_admin',signed:false}});
  await app.register(rateLimit,{max:config.rateLimitMax,timeWindow:'1 minute',errorResponseBuilder:()=>({error:{code:'RATE_LIMITED',message:'請求過於頻繁，請稍後重試',retryable:true}})});
  await app.register(swagger,{transform:({schema,url})=>({schema:documentSchema(schema),url}),openapi:{info:{title:'港巴通 API',version:'1.0.0',description:'KMB/LWB BFF、TDAS 道路參考及運營 API。只支援真實資料模式。成功：{data,meta:{requestId,mode:live,generatedAt}}；錯誤：{error:{code,message,requestId,retryable,fields?}}。Admin 寫入需 X-HKBus-Admin: 1；Zod 是輸入校驗來源。'},components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer'},adminCookie:{type:'apiKey',in:'cookie',name:'hkbus_admin'}}}}});
  await app.register(swaggerUI,{routePrefix:'/api/docs',logo:{type:'image/svg+xml',content:brandLogoWhiteSvg,href:'/api/docs/'},theme:{js:[{filename:'hkbus-brand.js',content:brandUiScript}],title:'港巴通 API',favicon:[{filename:'hkbus-favicon.png',rel:'icon',type:'image/png',sizes:'32x32',content:brandFaviconPng}]}});
  const providers=new Providers(store,config,options.fetcher),fares=new Fares(store,options.fetcher),reference=new TransitReference(store,options.fetcher),ctx:Context={app,store,providers,fares,reference,config};
  app.addHook('onRequest',async(request,reply)=>{reply.header('X-Request-Id',request.id);reply.header('X-Content-Type-Options','nosniff');reply.header('Cache-Control','no-store');validateMutationOrigin(config,request);});
  app.addHook('onResponse',async(request,reply)=>{
    const bucket=now().slice(0,13)+':00:00.000Z',route=request.routeOptions.url||'unmatched';
    store.run('INSERT INTO metrics VALUES(?,?,?,?,1,?) ON CONFLICT(bucket,method,route,status) DO UPDATE SET count=count+1,total_ms=total_ms+excluded.total_ms',bucket,request.method,route,reply.statusCode,Math.round(reply.elapsedTime));
  });
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof z.ZodError)return reply.code(422).send({error:{code:'VALIDATION_ERROR',message:'請檢查輸入內容',fields:error.issues.map(x=>({path:x.path.join('.'),message:x.message})),requestId:request.id,retryable:false}});
    if(error instanceof AppError)return reply.code(error.status).send({error:{code:error.code,message:error.message,requestId:request.id,retryable:error.retryable}});
    const statusCode=(error as {statusCode?:number}).statusCode;
    if(statusCode===429)return reply.code(429).send({error:{code:'RATE_LIMITED',message:'請求過於頻繁，請稍後重試',requestId:request.id,retryable:true}});
    const status=statusCode&&statusCode<500?statusCode:500;
    if(status===500)request.log.error({err:error,requestId:request.id},'request failed');
    return reply.code(status).send({error:{code:status===500?'INTERNAL_ERROR':'BAD_REQUEST',message:status===500?'服務暫時不可用，請稍後重試':'請求格式無效',requestId:request.id,retryable:status===500}});
  });
  app.setNotFoundHandler((request,reply)=>reply.code(404).send({error:{code:'NOT_FOUND',message:'找不到此資源',requestId:request.id,retryable:false}}));
  registerPublic(ctx);registerProfile(ctx);registerAdmin(ctx);
  app.get('/api/openapi.json',async()=>app.swagger());
  let workerRunning=false,closed=false;
  const tick=async()=>{if(workerRunning||closed)return;workerRunning=true;try{if(store.setting('features',{reminders:true}).reminders)await evaluateReminders(store,providers);}finally{workerRunning=false;}};
  const timer=config.workerEnabled?setInterval(()=>void tick().catch(error=>app.log.error({code:error instanceof AppError?error.code:'WORKER_ERROR'},'reminder worker failed')),15000):undefined;timer?.unref();
  const syncIfDue=()=>{const synced=store.setting<string|null>('catalogSyncedAt',null);if(!synced||!store.routes().length||Date.now()-Date.parse(synced)>=config.syncHours*3600000)providers.startSync();if(fares.due())fares.startSync();};
  const syncTimer=config.workerEnabled?setInterval(syncIfDue,60000):undefined;syncTimer?.unref();
  const cleanupTimer=config.workerEnabled?setInterval(()=>{
    store.run('DELETE FROM sessions WHERE expires_at<?',now());
    const week=new Date(Date.now()-7*86400000).toISOString();store.run('DELETE FROM provider_events WHERE created_at<?',week);store.run('DELETE FROM cache WHERE stale_until<?',now());
    store.run('DELETE FROM notifications WHERE created_at<?',new Date(Date.now()-30*86400000).toISOString());
    store.run('DELETE FROM metrics WHERE bucket<?',new Date(Date.now()-90*86400000).toISOString());
    store.run('DELETE FROM profiles WHERE id IN (SELECT profile_id FROM profile_credentials WHERE expires_at<?)',now());
  },3600000):undefined;cleanupTimer?.unref();
  app.addHook('onClose',async()=>{closed=true;clearInterval(timer);clearInterval(syncTimer);clearInterval(cleanupTimer);while(workerRunning)await new Promise(resolve=>setTimeout(resolve,30));await providers.settle();await fares.settle();await reference.settle();store.close();});
  await app.ready();
  if(config.workerEnabled)syncIfDue();
  return {...ctx,tick};
}
