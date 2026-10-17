import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fareAmount,fareReason,fareDay} from '../src/services/fares.ts';
import {cacheMaxAge,usableCache} from '../src/services/data-policy.ts';
test('fare display preserves integer cents and genuine zero without inventing an amount for missing or invalid data',()=>{
 assert.equal(fareAmount(1220),'HK$12.20');assert.equal(fareAmount(0),'HK$0.00');for(const value of [null,undefined,-1,NaN,1.1])assert.equal(fareAmount(value),'—');
});
test('section quotes and fare status never use offline monetary cache',()=>{
 for(const path of ['/v1/routes/KMB%3A112%3AO%3A1/fare?boardSequence=1&alightSequence=23','/v1/fares/status']){assert.equal(cacheMaxAge(path),0);assert.equal(usableCache({at:Date.now(),mode:'live',value:{amountCents:1220}},path),null);}
});
test('unverified, stale and conditional fares have three-language explanations without presuming daily applicability',()=>{
 for(const locale of ['tc','sc','en']){assert.ok(fareReason({reason:'STOP_UNMAPPED'},locale).length>5);assert.ok(fareReason({reason:'STALE_SOURCE'},locale).length>5);assert.ok(fareDay(null,locale).length>5);assert.notEqual(fareDay(null,locale),fareDay(511,locale));assert.ok(fareDay(288,locale).length>0);}
});
