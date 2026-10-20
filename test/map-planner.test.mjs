import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapCoordinate,mapOriginal,nativeMapPoint,boundedMapArea,hongKongPoint} from '../src/services/map-model.ts';
import {cacheMaxAge,usableCache} from '../src/services/data-policy.ts';
import {selectJourneys,journeyBody,journeyCheckBody,defaultJourneyOptions} from '../src/services/journeys.ts';
import {journeyDraft,setJourneyEndpoint,setJourneyEndpoints,rememberJourney,rememberedJourney,clearJourneySession,subscribeJourneySession} from '../src/services/journey-session.ts';
const stop=(id,sequence=1)=>({id,sequence,name:{tc:id,sc:id,en:id},latitude:22.3,longitude:114.15,source:'live'});
const ride=(id='route',board=stop('A'),alight=stop('B',2))=>({route:{id,source:'live'},board,alight,stops:alight.sequence-board.sequence});
const journey=(id,transfers,walkingMeters=0)=>({id,transfers,walkingMeters,stopCount:4,legs:Array.from({length:transfers+1},(_,i)=>ride('R'+i))});
test('native map inverse preserves the catalog and handles both platform tap/region event shapes',()=>{
 for(const point of [{latitude:22.28,longitude:114.15},{latitude:22.5,longitude:114.08},{latitude:22.29,longitude:113.94}]){const converted=mapCoordinate(point.latitude,point.longitude),original=mapOriginal(converted.latitude,converted.longitude);assert.ok(Math.abs(original.latitude-point.latitude)<1e-8);assert.ok(Math.abs(original.longitude-point.longitude)<1e-8);assert.deepEqual(nativeMapPoint({detail:converted}),original);assert.deepEqual(nativeMapPoint({detail:{centerLocation:converted}}),original);assert.notDeepEqual(point,converted);}
 assert.equal(nativeMapPoint({detail:{}}),null);assert.equal(hongKongPoint({latitude:NaN,longitude:114}),false);assert.equal(hongKongPoint({latitude:23.1,longitude:114}),false);
});
test('viewport clipping rejects outside/empty/invalid areas and limits valid discovery to service bounds',()=>{
 assert.deepEqual(boundedMapArea({west:112,east:116,south:21,north:24}),{west:113,east:115,south:22,north:23});
 for(const bounds of [{west:116,east:117,south:22,north:23},{west:114,east:114,south:22,north:23},{west:NaN,east:115,south:22,north:23}])assert.equal(boundedMapArea(bounds),null);
});
test('precise viewport and point queries never become durable offline cache',()=>{
 for(const path of ['/v1/map/stops?west=114.1&east=114.2&south=22.2&north=22.3','/v1/stops?latitude=22.3&longitude=114.1','/v1/stops?west=114.1']){assert.equal(cacheMaxAge(path),0);assert.equal(usableCache({at:100,mode:'live',value:{source:'live'}},path,101),null);}
 assert.ok(cacheMaxAge('/v1/stops/ABC')>0);
});
test('journey endpoint contracts use exactly one ID or in-memory coordinate at either end',()=>{
 const start={kind:'point',point:{latitude:22.31,longitude:114.16}},end={kind:'stop',stop:stop('E')},body=journeyBody(start,end,{...defaultJourneyOptions,maxTransfers:2,transferRadius:400});assert.deepEqual(body.start,start.point);assert.equal('startId'in body,false);assert.equal(body.endId,'E');assert.equal('end'in body,false);assert.equal(body.maxTransfers,2);assert.equal(body.transferRadius,400);
 const reverse=journeyBody(end,start,defaultJourneyOptions);assert.equal(reverse.startId,'E');assert.deepEqual(reverse.end,start.point);
});
test('two-transfer suggestions remain in transfer filters and walking sort does not treat unknown fare as free',()=>{
 const items=[journey('two',2,130),journey('direct',0,0),journey('one',1,250)];assert.deepEqual(selectJourneys(items,'transfer','walking').map(x=>x.id),['two','one']);assert.deepEqual(selectJourneys(items,'all','transfers').map(x=>x.id),['direct','one','two']);assert.equal(selectJourneys(items,'all','fare',true).length,0);
});
test('departure check sends exact physical IDs and repeated route occurrences without personal credentials',()=>{
 const value={...journey('loop',0),legs:[ride('loop',stop('A',6),stop('E',10))]},body=journeyCheckBody(value,200);assert.deepEqual(body,{transferRadius:200,legs:[{routeId:'loop',boardStopId:'A',boardSequence:6,alightStopId:'E',alightSequence:10}]});assert.equal(JSON.stringify(body).includes('token'),false);
});
test('map drafts and detail selection stay in memory and are invalidated by endpoint edits and full data clear',()=>{
 clearJourneySession();let changes=0;const remove=subscribeJourneySession(()=>changes++),point={kind:'point',point:{latitude:22.311234,longitude:114.161234}};setJourneyEndpoint('start',point);setJourneyEndpoint('end',{kind:'stop',stop:stop('E')});assert.deepEqual(journeyDraft().start,point);rememberJourney(journey('selected',0),defaultJourneyOptions);assert.ok(rememberedJourney('selected'));setJourneyEndpoints(journeyDraft().end,journeyDraft().start);assert.equal(rememberedJourney('selected'),null);rememberJourney(journey('again',0),defaultJourneyOptions);clearJourneySession();assert.equal(journeyDraft().start,null);assert.equal(journeyDraft().end,null);assert.equal(rememberedJourney('again'),null);assert.equal(changes,4);remove();
});
