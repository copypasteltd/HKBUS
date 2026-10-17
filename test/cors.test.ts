import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './support.js';

let ctx: Awaited<ReturnType<typeof createTestApp>>;
const email='cors-test@example.com',password='cors-test-only-password-123';
const origins=['https://new-h5.example','http://localhost:9876','https://preview.example:8443','capacitor://localhost','null'];

before(async()=>{ctx=await createTestApp({origins:['*'],adminEmail:email,adminPassword:password});});
after(async()=>{await ctx.app.close();});

test('wildcard origins permit public and error responses with credentials and cache variation',async()=>{
  for(const origin of origins){
    for(const [url,status] of [['/api/health',200],['/api/admin/auth/me',401]] as const){
      const response=await ctx.app.inject({url,headers:{origin}});
      assert.equal(response.statusCode,status);
      assert.equal(response.headers['access-control-allow-origin'],origin);
      assert.equal(response.headers['access-control-allow-credentials'],'true');
      assert.match(String(response.headers.vary),/\bOrigin\b/i);
    }
  }
  assert.equal((await ctx.app.inject('/api/health')).statusCode,200);
});

test('preflights accept arbitrary client headers and every implemented request method',async()=>{
  const requestedHeaders='authorization,content-type,x-hkbus-admin,x-client-version,x-custom-integration';
  for(const origin of origins){
    for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){
      const response=await ctx.app.inject({method:'OPTIONS',url:'/api/admin/auth/login',headers:{origin,'access-control-request-method':method,'access-control-request-headers':requestedHeaders}});
      assert.equal(response.statusCode,204);
      assert.equal(response.headers['access-control-allow-origin'],origin);
      assert.equal(response.headers['access-control-allow-credentials'],'true');
      assert.equal(response.headers['access-control-allow-headers'],requestedHeaders);
      assert.ok(String(response.headers['access-control-allow-methods']).split(/,\s*/).includes(method));
      assert.match(String(response.headers.vary),/Access-Control-Request-Headers/i);
    }
  }
});

test('any-origin Admin sessions reach authentication and support marked cookie writes',async()=>{
  const origin='https://new-admin.example';
  const invalid=await ctx.app.inject({method:'POST',url:'/api/admin/auth/login',headers:{origin},payload:{email,password:'incorrect'}});
  assert.equal(invalid.statusCode,401);
  assert.equal(invalid.json().error.code,'INVALID_CREDENTIALS');
  const login=await ctx.app.inject({method:'POST',url:'/api/admin/auth/login',headers:{origin},payload:{email,password}});
  assert.equal(login.statusCode,200);
  assert.equal(login.headers['access-control-allow-origin'],origin);
  const cookie=String(login.headers['set-cookie']).split(';')[0]!;
  assert.equal((await ctx.app.inject({url:'/api/admin/auth/me',headers:{origin,cookie}})).statusCode,200);
  const missingMarker=await ctx.app.inject({method:'POST',url:'/api/admin/auth/logout',headers:{origin,cookie}});
  assert.equal(missingMarker.statusCode,403);
  assert.equal(missingMarker.json().error.code,'CSRF_REJECTED');
  assert.equal((await ctx.app.inject({method:'POST',url:'/api/admin/auth/logout',headers:{origin,cookie,'x-hkbus-admin':'1'}})).statusCode,200);
  assert.equal((await ctx.app.inject({url:'/api/admin/auth/me',headers:{origin,cookie}})).statusCode,401);
});

test('an explicitly configured origin allowlist still rejects other Admin origins',async()=>{
  const restricted=await createTestApp({origins:['https://chosen.example']});
  try{
    const denied=await restricted.app.inject({method:'POST',url:'/api/admin/auth/login',headers:{origin:'https://other.example'},payload:{email,password}});
    assert.equal(denied.statusCode,403);
    assert.equal(denied.json().error.code,'ORIGIN_FORBIDDEN');
    assert.equal(denied.headers['access-control-allow-origin'],undefined);
    const accepted=await restricted.app.inject({url:'/api/health',headers:{origin:'https://chosen.example'}});
    assert.equal(accepted.statusCode,200);
    assert.equal(accepted.headers['access-control-allow-origin'],'https://chosen.example');
  }finally{await restricted.app.close();}
});
