import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stationArrivals,arrivalView,staleArrivals} from '../src/services/arrivals.ts';
import {usableCache} from '../src/services/data-policy.ts';

const clock=Date.parse('2026-10-17T11:00:00Z');
const row=(values={})=>({id:'first',routeId:'KMB:112:O:1',routeNo:'112',bound:'O',serviceType:'1',stopId:'A',stopSequence:1,etaSequence:1,eta:new Date(clock+180000).toISOString(),generatedAt:new Date(clock).toISOString(),status:'scheduled',source:'live',destination:{tc:'甲',sc:'甲',en:'A'},remark:{tc:'',sc:'',en:''},minutes:99,...values});
test('station predictions isolate direction, special service, repeated stop sequence and expired buses',()=>{
  const items=[row(),row(),row({id:'later',etaSequence:2}),row({id:'loop',stopSequence:9}),row({id:'inbound',routeId:'KMB:112:I:1'}),row({id:'special',routeId:'KMB:112:O:2'}),row({id:'other-stop',stopId:'B'}),row({id:'expired',eta:new Date(clock-61000).toISOString()})];
  assert.deepEqual(stationArrivals(items,'KMB:112:O:1','A',1,clock).map(x=>x.id),['first','later']);
  assert.deepEqual(stationArrivals(items,'KMB:112:O:1','A',9,clock).map(x=>x.id),['loop']);
});
test('display derives countdown and Hong Kong time from ETA instead of frozen server minutes',()=>{
  assert.deepEqual(arrivalView(row(),clock),{state:'minutes',minutes:3,time:'19:03'});
  assert.equal(arrivalView(row(),clock+60000).minutes,2);
  assert.equal(arrivalView(row({eta:new Date(clock).toISOString()}),clock).state,'due');
  assert.equal(arrivalView(row({eta:null}),clock).state,'none');
});
test('stale, failed refresh, malformed and expired data never display a live countdown',()=>{
  for(const item of [row({status:'stale'}),row({generatedAt:new Date(clock-61000).toISOString()}),row({eta:'bad'}),row({eta:new Date(clock-61000).toISOString()}),row({generatedAt:new Date(clock+61000).toISOString()})])assert.equal(arrivalView(item,clock).state,'stale');
  assert.equal(arrivalView(row(),clock,true).minutes,null);
  const fresh={freshness:{state:'fresh',generatedAt:new Date(clock).toISOString()}};
  assert.equal(staleArrivals(fresh,false,clock),false);assert.equal(staleArrivals(fresh,true,clock),true);assert.equal(staleArrivals(fresh,false,clock+61000),true);
  assert.equal(usableCache({at:clock-180000,mode:'live',value:{source:'live'}},'/v1/routes/KMB%3A112%3AO%3A1/arrivals?force=true',clock),null);
});
