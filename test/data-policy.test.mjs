import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dataNamespace,isLiveData,usableCache} from '../src/services/data-policy.ts';

test('fixture responses are rejected even when nested in an otherwise live payload',()=>{
  assert.equal(isLiveData({mode:'live',nextBus:{arrivals:[{source:'fixture'}]}}),false);
  assert.equal(isLiveData({mode:'fixture',arrivals:[]}),false);
  assert.equal(isLiveData({mode:'live',arrivals:[{source:'live'}],notice:{source:'operator'}}),true);
});
test('cache isolates API hosts and rejects legacy, fixture, expired and future entries',()=>{
  assert.notEqual(dataNamespace('https://a.example/api'),dataNamespace('https://b.example/api'));
  const clock=1000000,valid={at:clock-1000,mode:'live',value:{source:'live'}};
  assert.deepEqual(usableCache(valid,'/v1/routes',clock),valid.value);
  assert.equal(usableCache({...valid,mode:'fixture'},'/v1/routes',clock),null);
  assert.equal(usableCache({...valid,value:{source:'fixture'}},'/v1/routes',clock),null);
  assert.equal(usableCache({...valid,at:clock-180000},'/v1/home',clock),null);
  assert.equal(usableCache({...valid,at:clock-180000},'/v1/stops/ABC/arrivals?force=true',clock),null);
  assert.equal(usableCache({...valid,at:clock+1},'/v1/routes',clock),null);
});
test('withdrawable notices, reminders and notifications never use offline cache',()=>{
  const clock=1000000,item={at:clock,mode:'live',value:[]};
  for(const path of ['/v1/notices','/v1/notices/ABC?platform=weapp','/v1/profile/notifications','/v1/profile/reminders'])assert.equal(usableCache(item,path,clock),null);
  assert.deepEqual(usableCache({...item,value:{mode:'live',notices:[{id:'withdrawn'}]}},'/v1/home',clock).notices,[]);
});
