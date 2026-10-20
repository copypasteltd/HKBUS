import {writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {Store} from '../src/database.js';
import {journeyInputSchema,planJourneys} from '../src/journey-planner.js';
import {journeyGeometry} from '../src/journey-geometry.js';
const store=new Store(homedir()+'/.codex/private/hkbusgo/map-planner-audit.db');
try{
 const route=store.sequence('KMB:112:O:1'),start=route[0]!,end=route.at(-1)!,cases=[{startId:start.id,endId:end.id,maxTransfers:0},{startId:start.id,endId:end.id,maxTransfers:2},{start:{latitude:start.latitude+.0001,longitude:start.longitude+.0001},end:{latitude:end.latitude-.0001,longitude:end.longitude-.0001},maxTransfers:2,transferRadius:200,accessRadius:600}];
 const results=cases.map(input=>{const at=performance.now(),value=planJourneys(store,journeyInputSchema.parse(input));return{input,ms:Math.round(performance.now()-at),search:value.search,results:value.journeys.map(journey=>({id:journey.id,transfers:journey.transfers,stops:journey.stopCount,walkingMeters:journey.walkingMeters,legs:journey.legs.map(leg=>({routeId:leg.route.id,board:leg.board.sequence,alight:leg.alight.sequence}))}))};});
 const rows=store.all<{route_id:string;document:string}>('SELECT route_id,document FROM route_references LIMIT 12');const geometry=rows.map(row=>{const value=JSON.parse(row.document),stops=store.sequence(row.route_id),board=stops[Math.floor(stops.length*.2)]!,alight=stops[Math.floor(stops.length*.7)]!,at=performance.now(),clipped=journeyGeometry(value.geometry,stops,board.sequence,alight.sequence);return{routeId:row.route_id,matched:!!clipped,fullPoints:value.geometry?.coordinates.flat().length||0,selectedPoints:clipped?.coordinates.flat().length||0,board:board.sequence,alight:alight.sequence,ms:Math.round(performance.now()-at)};});
 const report={createdAt:new Date().toISOString(),source:'consistent private read-copy of actual production catalog',routes:store.routes().length,stops:store.stops().length,cases:results,geometry,passed:results.every(value=>value.results.length>0&&value.ms<15000)};writeFileSync(process.argv[2]!,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,cases:results.map(x=>({ms:x.ms,returned:x.results.length,limited:x.search.limited})),geometry:geometry.map(x=>({routeId:x.routeId,matched:x.matched,ms:x.ms}))}));if(!report.passed)process.exitCode=1;
}finally{store.close();}
