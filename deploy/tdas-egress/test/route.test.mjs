import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../api/route.mjs';

const key='isolated-egress-test-secret-at-least-32-characters';
const body={start:{lat:22.2784,long:114.1828,buffer:200},end:{lat:22.2821,long:114.1581,buffer:200},departIn:15,lang:'en',type:'ST'};
async function call(handler,{method='POST',authorization='Bearer '+key,input=body,headers={}}={}){
  const result={headers:{},status:0,body:null};
  const response={setHeader:(name,value)=>{result.headers[name]=value;},status:(status)=>{result.status=status;return response;},json:value=>{result.body=value;return response;}};
  await handler({method,headers:{authorization,...headers},body:input},response);return result;
}

test('egress authenticates and validates requests before contacting TDAS',async()=>{
  let calls=0;
  const handler=createHandler({secret:()=>key,fetcher:async()=>{calls++;throw new Error('must not call');}});
  assert.equal((await call(handler,{authorization:''})).status,401);
  assert.equal((await call(handler,{method:'GET'})).status,405);
  assert.equal((await call(handler,{input:{...body,start:{lat:0,long:0}}})).status,422);
  assert.equal((await call(handler,{input:{...body,departIn:1}})).status,422);
  assert.equal((await call(handler,{headers:{'content-length':'5000'}})).status,413);
  assert.equal(calls,0);
});

test('egress forwards only validated parameters to the fixed official endpoint',async()=>{
  const reply={jSpeed:'41 km/h',distM:3953,eta:'00:06',route:[{segment:[{rid:[1],dir:3}]}]};
  let sent;
  const handler=createHandler({secret:()=>key,fetcher:async(url,options)=>{sent={url,options};return new Response(JSON.stringify(reply));}});
  const result=await call(handler,{input:{...body,url:'https://unused.example',start:{...body.start,ignored:'unused'}}});
  assert.equal(result.status,200);assert.deepEqual(result.body,reply);
  assert.equal(sent.url,'https://tdas-api.hkemobility.gov.hk/tdas/api/route');
  assert.deepEqual(JSON.parse(sent.options.body),body);
  assert.equal(sent.options.headers.Authorization,undefined);
  assert.equal(result.headers['X-HKBus-Upstream-Status'],'200');
});

test('egress preserves meaningful upstream failures and rejects invalid success bodies',async()=>{
  for(const [upstream,status] of [[400,400],[403,502],[429,429],[503,502]]){
    const handler=createHandler({secret:()=>key,fetcher:async()=>new Response('upstream',{status:upstream})});
    const result=await call(handler);assert.equal(result.status,status);assert.equal(result.body.error.upstreamStatus,upstream);
  }
  const invalid=createHandler({secret:()=>key,fetcher:async()=>new Response('{}')});
  assert.equal((await call(invalid)).body.error.code,'TDAS_UPSTREAM_SCHEMA');
  const unavailable=createHandler({secret:()=>key,fetcher:async()=>{throw new Error('network');}});
  assert.equal((await call(unavailable)).status,502);
  assert.equal((await call(unavailable)).body.error.code,'TDAS_UPSTREAM_CONNECTION');
  const timeout=createHandler({secret:()=>key,fetcher:async()=>{throw new DOMException('deadline','TimeoutError');}});
  assert.equal((await call(timeout)).status,504);
  assert.equal((await call(timeout)).body.error.code,'TDAS_UPSTREAM_TIMEOUT');
});
