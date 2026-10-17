import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Store } from './database.js';
import { AppError, now, type Identity } from './domain.js';
import { isOriginAllowed, type Config } from './config.js';

export async function requireIdentity(app:FastifyInstance,store:Store,request:FastifyRequest,kind:'admin'|'profile',roles?:string[]):Promise<Identity>{
  let value:Identity;
  try{value=await request.jwtVerify<Identity>();}catch{throw new AppError('UNAUTHENTICATED','請重新登入',401);}
  const session=store.get<{subject:string;kind:string;expires_at:string}>('SELECT subject,kind,expires_at FROM sessions WHERE id=?',value.sid);
  if(value.kind!==kind||!session||session.subject!==value.sub||session.kind!==kind||session.expires_at<=now())throw new AppError('UNAUTHENTICATED','登入已失效',401);
  if(kind==='admin'){
    const admin=store.get<{role:string;active:number}>('SELECT role,active FROM admins WHERE id=?',value.sub);
    if(!admin?.active)throw new AppError('UNAUTHENTICATED','帳號已停用',401);
    if(roles&&!roles.includes(admin.role))throw new AppError('FORBIDDEN','目前帳號沒有此操作權限',403);
    value.role=admin.role as Identity['role'];
  }else if(!store.get('SELECT id FROM profiles WHERE id=?',value.sub))throw new AppError('UNAUTHENTICATED','裝置檔案已刪除',401);
  return value;
}
export function issueSession(app:FastifyInstance,store:Store,subject:string,kind:'admin'|'profile',role?:Identity['role']){
  const sid=randomUUID(),seconds=kind==='admin'?28800:2592000;
  store.run('INSERT INTO sessions VALUES(?,?,?,?)',sid,subject,kind,new Date(Date.now()+seconds*1000).toISOString());
  return{token:app.jwt.sign({sub:subject,kind,sid,...(role?{role}:{})},{expiresIn:seconds}),expiresIn:seconds,sid};
}
export function validateMutationOrigin(config:Config,request:FastifyRequest){
  if(!['POST','PUT','PATCH','DELETE'].includes(request.method)||!request.url.startsWith('/api/admin'))return;
  const origin=request.headers.origin;
  if(!isOriginAllowed(config,origin))throw new AppError('ORIGIN_FORBIDDEN','不允許的請求來源',403);
  // Cookie-authenticated writes require the Admin client marker, independently of the CORS origin policy.
  if(request.cookies.hkbus_admin&&request.headers['x-hkbus-admin']!=='1')throw new AppError('CSRF_REJECTED','管理操作缺少請求標識',403);
}
