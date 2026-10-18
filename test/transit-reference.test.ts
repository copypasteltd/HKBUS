// Synthetic records exercise operator formats; no test data is shipped as live data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import {Store} from '../src/database.js';
import {HK80,stopCoordinates} from '../src/fare-source.js';
import {names,type Route,type Stop} from '../src/domain.js';
import {buildPlaces,matchScore,normalizeSearch,operatingToday,parseBand,parseCalendar,parseOperatorRoute,parseSchedule,TransitReference} from '../src/transit-reference.js';
import {createTestApp} from './support.js';
const route:Route={id:'KMB:112:O:1',routeNo:'112',bound:'O',serviceType:'1',origin:names('起點','Origin'),destination:names('終點','Terminus'),operator:'KMB',source:'live'};
const point=stopCoordinates('839172.9375','816903.75'),stops=[{id:'A',name:names('測試站','Test stop'),...point,source:'live' as const,sequence:1},{id:'B',name:names('測試站乙','Test stop B'),latitude:point.latitude+.001,longitude:point.longitude+.001,source:'live' as const,sequence:2}];
const at='2026-10-19T00:00:00.000Z';
const schedule=(day='MF',time='06:00-23:30')=>({result:true,data:{'01':[{Route:'112',ServiceType:'01   ',DayType:day+'  ',BoundText1:time,BoundTime1:'10-20',BoundText2:'07:00-00:30',BoundTime2:'15'}]}});
function operator(){return{result:true,data:{routeStops:stops.map((s,i)=>{const p=proj4('WGS84',HK80,[s.longitude,s.latitude]);return{Route:'112',Bound:'1',ServiceType:'1',Seq:String(i),X:String(p[0]),Y:String(p[1])};}),route:{lineGeometry:'{paths:[[[839172.9375,816903.75],[839180,816910]]]}'}}};}
const calendar={dates:{'2026-10-19':'Test public holiday'},years:[2025,2026,2027],sourceUrl:'https://www.1823.gov.hk/common/ical/en.json',fetchedAt:at};
test('search normalises traditional/simplified, width, case and road abbreviations with exact priority',()=>{
 assert.equal(normalizeSearch('  ＮＡＴＨＡＮ　ＲＤ. '),'nathan road');assert.equal(normalizeSearch('彌敦道'),normalizeSearch('弥敦道'));
 assert.equal(matchScore('Nathan Rd',['NATHAN ROAD']),0);assert.equal(matchScore('中心',['中環中心']),20);assert.equal(matchScore('road nathan',['Nathan Road']),20);assert.equal(matchScore('unknown',['Nathan Road']),null);
});
test('operator bands keep overnight windows and exact departures without interpreting unknown text',()=>{
 assert.deepEqual(parseBand('23:10-00:30','20','MF').windows,[{start:1390,end:1470}]);assert.deepEqual(parseBand('06:10, 07:20','', 'S').departures,[370,440]);assert.equal(parseBand('按需求提供服務','','X').parsed,false);assert.equal(parseBand('25:99-26:10','','D').parsed,false);
 const reverse=parseSchedule(schedule(),{...route,id:'KMB:112:I:1',bound:'I'},at);assert.equal(reverse.bands[0]!.raw,'07:00-00:30');assert.equal(reverse.basis,'origin-departure');assert.equal(parseSchedule(schedule(),{...route,serviceType:'2'},at).state,'unavailable');assert.equal(parseSchedule({result:false,data:schedule().data},route,at).state,'unavailable');
});
test('Hong Kong holiday selection, previous-day overnight and uncertainty are independent of missing ETA',()=>{
 const hours=parseSchedule(schedule('MF','23:00-00:30'),route,at);
 assert.equal(operatingToday(hours,calendar,Date.parse('2026-10-17T00:15:00+08:00')).state,'within-origin-hours'); // Friday after midnight
 assert.equal(operatingToday(hours,calendar,Date.parse('2026-10-19T23:15:00+08:00')).state,'not-listed-today'); // Monday holiday
 const holiday=parseSchedule(schedule('H','06:00-23:30'),route,at);assert.equal(operatingToday(holiday,calendar,Date.parse('2026-10-19T10:00:00+08:00')).state,'within-origin-hours');
 assert.equal(operatingToday(holiday,null).state,'unverified');assert.equal(operatingToday({...holiday,state:'stale'},calendar).state,'unverified');assert.equal(operatingToday({...holiday,bands:[...holiday.bands,parseBand('08:00','','X')]},calendar).state,'unverified');
 assert.equal(operatingToday(parseSchedule(schedule('D','06:00-23:30'),route,at),calendar,Date.parse('2026-10-19T05:00:00+08:00')).state,'before-first');
});
test('geometry is transformed from HK80 and must match every current direction/service/stop sequence',()=>{
 const value=parseOperatorRoute(operator(),route,stops,at,schedule());assert.equal(value.geometry!.coordinates.length,1);assert.ok(Math.abs(value.geometry!.coordinates[0]![0]![0]!-point.longitude)<1e-8);
 const terminal=operator();terminal.data.routeStops[1]!.Seq='999';assert.equal(parseOperatorRoute(terminal,route,stops,at,schedule()).state,'available');terminal.data.routeStops[0]!.Seq='999';assert.throws(()=>parseOperatorRoute(terminal,route,stops,at,schedule()));
 const wrong=operator();wrong.data.routeStops[1]!.Bound='2';assert.throws(()=>parseOperatorRoute(wrong,route,stops,at,schedule()));assert.throws(()=>parseOperatorRoute(operator(),route,[...stops,stops[0]!],at,schedule()));
 const unsafe=operator();unsafe.data.route.lineGeometry='{paths: process.exit()}';assert.throws(()=>parseOperatorRoute(unsafe,route,stops,at,schedule()));
});
test('roads use name plus coordinates; nearby same-name ambiguity and distant stops are rejected',()=>{
 const raw={result:true,data:{stops:[{CName:'測試站',EName:'Test stop',x:'839172.9375',y:'816903.75',ELocation1:'NATHAN RD',ELocation2:'HSE NO 10',CLocation1:'彌敦道門牌10號',BSICode:'TEST'}]}};
 const result=buildPlaces(raw,stops);assert.equal(result.places[0]!.road.sc,'弥敦道');assert.equal(result.roads[0]!.name.en,'NATHAN RD');assert.deepEqual(result.roads[0]!.stopIds,['A']);
 assert.throws(()=>buildPlaces(raw,[{...stops[0]!,latitude:22.5}]));assert.throws(()=>buildPlaces(raw,[...stops,{...stops[0]!,id:'AMBIGUOUS'}]));
});
test('calendar parser checks official schema and extracts covered years rather than assuming all future years',()=>{
 const raw={vcalendar:[{prodid:'HKSARG',vevent:Array.from({length:10},(_,i)=>({dtstart:['202601'+String(i+1).padStart(2,'0')],summary:'Holiday'}))}]};const result=parseCalendar(raw,at);assert.deepEqual(result.years,[2026]);assert.equal(result.dates['2026-01-01'],'Holiday');assert.throws(()=>parseCalendar({},at));
});
test('public reference requests coalesce, preserve verified cache and reject changed stop identities',async()=>{
 const store=new Store(':memory:');store.saveCatalog([route],stops,[{routeId:route.id,sequence:1,stopId:'A'},{routeId:route.id,sequence:2,stopId:'B'}]);
 let calls=0,down=false;const service=new TransitReference(store,async input=>{calls++;if(down)throw new Error('offline');const url=new URL(String(input));if(url.hostname==='www.1823.gov.hk')throw new Error('calendar unavailable in this test');return new Response(JSON.stringify(url.searchParams.get('action')==='getschedule'?schedule():operator()));});
 try{const values=await Promise.all([service.route(route.id),service.route(route.id)]);assert.equal(values[0]!.state,'available');assert.equal(calls,3);assert.equal(values[1]!.today.state,'unverified');down=true;const stale=await service.route(route.id,true);assert.equal(stale.state,'stale');assert.equal(stale.today.state,'unverified');
 store.saveCatalog([route],[...stops,{...stops[0]!,id:'NEW'}],[{routeId:route.id,sequence:1,stopId:'NEW'},{routeId:route.id,sequence:2,stopId:'B'}]);const changed=await service.route(route.id,true);assert.equal(changed.state,'unavailable');assert.equal(changed.geometry,null);
 }finally{await service.settle();store.close();}
});
test('station service endpoint retains repeated stops even when no ETA is published',async()=>{
 const ctx=await createTestApp();try{ctx.store.run('INSERT INTO route_stops VALUES(?,?,?)','KMB:112:O:1',99,'stop-times');const response=await ctx.app.inject({url:'/api/v1/stops/stop-times/services'});assert.equal(response.statusCode,200);const rows=response.json().data.services.filter((s:{route:Route})=>s.route.id==='KMB:112:O:1');assert.deepEqual(rows.map((s:{sequence:number})=>s.sequence),[1,99]);assert.equal((await ctx.app.inject({url:'/api/v1/stops/missing/services'})).statusCode,404);}finally{await ctx.app.close();}
});
