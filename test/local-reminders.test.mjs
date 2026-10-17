import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url),ts=require('typescript');
function load(name){const module={exports:{}};const source=readFileSync(new URL('../src/services/'+name+'.ts',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:relative=>load(relative.slice(2)),Date,Set,Number,Math});return module.exports;}
const {matchingReminder}=load('local-reminders'),clock=Date.parse('2026-10-17T12:00:00Z');
const reminder={id:'local-test',route_id:'KMB:112:O:1',stop_id:'D12FB3A70DDAED02',stop_sequence:8,status:'active',threshold:5,expires_at:new Date(clock+7200000).toISOString()};
const row={id:'official-shaped-test',routeId:reminder.route_id,stopId:reminder.stop_id,stopSequence:8,etaSequence:1,eta:new Date(clock+180000).toISOString(),generatedAt:new Date(clock-1000).toISOString(),status:'scheduled'};
const result={route:{id:reminder.route_id},freshness:{state:'fresh',generatedAt:row.generatedAt},arrivals:[row]};
test('local reminders require fresh matching stop sequence and a reached threshold',()=>{
  assert.equal(matchingReminder(reminder,result,clock),true);
  for(const changed of [{...row,stopSequence:20},{...row,routeId:'KMB:112:I:1'},{...row,eta:null},{...row,generatedAt:new Date(clock-61000).toISOString()},{...row,eta:new Date(clock+360000).toISOString()}])assert.equal(matchingReminder(reminder,{...result,arrivals:[changed]},clock),false);
  assert.equal(matchingReminder(reminder,{...result,freshness:{...result.freshness,state:'stale'}},clock),false);
});
test('paused or expired reminders and stale earlier predictions cannot trigger a later bus',()=>{
  assert.equal(matchingReminder({...reminder,status:'paused'},result,clock),false);assert.equal(matchingReminder({...reminder,expires_at:new Date(clock-1).toISOString()},result,clock),false);
  const stale={...row,status:'stale'},later={...row,id:'later',etaSequence:2};assert.equal(matchingReminder(reminder,{...result,arrivals:[stale,later]},clock),false);
});
