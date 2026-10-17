// Synthetic XML is confined to this isolated unit test; production only downloads TD's official files.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import {createApp} from '../src/app.js';
import {issueSession} from '../src/auth.js';
import {passwordHash} from '../src/database.js';
import {FARE_BASE,HK80,moneyCents,stopCoordinates,mapRoute,readOfficialXml} from '../src/fare-source.js';
import {fixtureRoutes,fixtureStops,fixtureRelations,testFetcher} from './support.js';
const today=new Date().toISOString().slice(0,10);
const xml=(tag:string,rows:Record<string,string|number>[])=>'<?xml version="1.0" encoding="UTF-8"?><dataroot generated="'+today+'T00:00:00">'+rows.map(r=>'<'+tag+'>'+Object.entries(r).map(([k,v])=>'<'+k+'>'+String(v).replaceAll('&','&amp;').replaceAll('<','&lt;')+'</'+k+'>').join('')+'</'+tag+'>').join('')+'</dataroot>';
function sources(options:{day?:number;price?:string;duplicate?:boolean}={}){
 const seq=fixtureRelations.filter(r=>r.routeId==='KMB:112:O:1').map(r=>fixtureStops.find(s=>s.id===r.stopId)!);
 const rows=[{ROUTE_ID:1001,ROUTE_SEQ:1,ON_SEQ:1,OFF_SEQ:5,PRICE:options.price||'6.70',...(options.day?{DAY_CODE:options.day}:{}),LAST_UPDATE_DATE:today+'T00:00:00'},{ROUTE_ID:1001,ROUTE_SEQ:1,ON_SEQ:3,OFF_SEQ:5,PRICE:'4.20',LAST_UPDATE_DATE:today+'T00:00:00'},{ROUTE_ID:1001,ROUTE_SEQ:2,ON_SEQ:1,OFF_SEQ:5,PRICE:'8.10',LAST_UPDATE_DATE:today+'T00:00:00'}];
 return new Map([
 ['DATA_LAST_UPDATED_DATE.csv','Date\n'+today],
 ['ROUTE_BUS.xml',xml('ROUTE',[{ROUTE_ID:1001,COMPANY_CODE:'KMB',ROUTE_NAMEE:'112',SPECIAL_TYPE:0,FULL_FARE:'6.70',HYPERLINK_C:'https://search.kmb.hk/KMBWebSite/?route=112',LAST_UPDATE_DATE:today}])],
 ['STOP_BUS.xml',xml('STOP',seq.map((s,i)=>{const xy=proj4('WGS84',HK80,[s.longitude,s.latitude]);return{STOP_ID:i+1,X:xy[0]!,Y:xy[1]!};}))],
 ['RSTOP_BUS.xml',xml('RSTOP',(['1','2']).flatMap(bound=>(bound==='1'?seq:seq.slice().reverse()).map((s,i)=>({ROUTE_ID:1001,ROUTE_SEQ:bound,STOP_SEQ:i+1,STOP_ID:seq.indexOf(s)+1,STOP_PICK_DROP:i===0?2:i===4?1:3,STOP_NAMEC:s.name.tc,STOP_NAMES:s.name.sc,STOP_NAMEE:s.name.en}))))],
 ['FARE_BUS.xml',xml('FARE',options.duplicate?[...rows,rows[0]!]:rows)]
 ]);
}
async function setup(options:Parameters<typeof sources>[0]={}){
 const files=sources(options);let fail=false;let xmlRequests=0;
 const ctx=await createApp({databasePath:':memory:',jwtSecret:'isolated-fares-test-secret-at-least-32-characters',workerEnabled:false},{logger:false,fetcher:async(input,init)=>{
  if(!String(input).startsWith(FARE_BASE))return testFetcher(input,init);if(fail)return new Response('Unavailable',{status:503});const key=String(input).slice(FARE_BASE.length);if(key.endsWith('.xml'))xmlRequests++;return new Response(files.get(key)||'',{headers:{'Content-Type':'application/xml'}});
 }});ctx.store.saveCatalog(fixtureRoutes,fixtureStops,fixtureRelations);return{...ctx,files,fail:()=>{fail=true;},xmlCount:()=>xmlRequests};
}
test('money uses exact HKD cents, rejects malformed/negative/floating precision, and keeps a genuine official zero',()=>{
 assert.equal(moneyCents('12.2'),1220);assert.equal(moneyCents('6.70'),670);assert.equal(moneyCents('0'),0);
 for(const value of ['NaN','-1','1.001','1e2','01.2',''])assert.throws(()=>moneyCents(value));
});
test('HK80 transformation agrees with the independent LandsD published check point',()=>{
 const p=stopCoordinates('818097.267','838477.970');assert.ok(Math.abs(p.longitude-(114+1.079932/3600))<0.000001);assert.ok(Math.abs(p.latitude-(22+29/60+8.777176/3600))<0.000001);
});
test('exact direction and boarding sequence select section fares; missing is null, not zero; invalid pairs are rejected',async()=>{
 const ctx=await setup();try{await ctx.fares.sync();assert.equal(ctx.fares.quote('KMB:112:O:1',1,5).amountCents,670);assert.equal(ctx.fares.quote('KMB:112:O:1',3,5).amountCents,420);assert.equal(ctx.fares.quote('KMB:112:I:1',1,5).amountCents,810);assert.equal(ctx.fares.quote('KMB:112:O:1',1,2).amountCents,null);assert.equal(ctx.fares.quote('KMB:112:O:1',1,2).reason,'NO_FARE');assert.equal(ctx.fares.quote('KMB:112:O:1',1,5).options[0]!.dayCode,null);assert.throws(()=>ctx.fares.quote('KMB:112:O:1',5,1));
 const response=await ctx.app.inject('/api/v1/routes/KMB%3A112%3AO%3A1/fare?boardSequence=3&alightSequence=5');assert.equal(response.statusCode,200);assert.equal(response.json().data.amountCents,420);assert.equal((await ctx.app.inject('/api/v1/routes/KMB%3A112%3AO%3A1/fare?boardSequence=1.5&alightSequence=5')).statusCode,422);assert.equal((await ctx.app.inject('/api/v1/routes/KMB%3A112%3AO%3A1')).json().data.fares.boardingFares[2].amountCents,420);
 }finally{await ctx.app.close();}
});
test('conditional day fares are exposed without guessing holidays; a partial journey never claims a total',async()=>{
 const ctx=await setup({day:288});try{await ctx.fares.sync();const quote=ctx.fares.quote('KMB:112:O:1',1,5);assert.equal(quote.state,'conditional');assert.equal(quote.amountCents,null);assert.equal(quote.options[0]!.dayCode,288);
 const stops=ctx.store.sequence('KMB:112:O:1'),route=fixtureRoutes[0]!;const result=ctx.fares.journey({legs:[{route,board:stops[2]!,alight:stops[4]!},{route,board:stops[0]!,alight:stops[4]!}]});assert.equal(result.pricing.totalCents,null);assert.equal(result.pricing.state,'partial');assert.equal(result.pricing.knownSubtotalCents,420);assert.equal(result.pricing.discountsApplied,false);
 }finally{await ctx.app.close();}
});
test('complete journey totals add integer cents and preserve genuine zero fares',async()=>{
 const ctx=await setup({price:'0'});try{await ctx.fares.sync();const sequence=ctx.store.sequence('KMB:112:O:1'),route=fixtureRoutes[0]!;const result=ctx.fares.journey({legs:[{route,board:sequence[0]!,alight:sequence[4]!},{route,board:sequence[2]!,alight:sequence[4]!}]});assert.equal(result.pricing.totalCents,420);assert.equal(result.pricing.pricedLegs,2);assert.equal(result.pricing.state,'complete');}finally{await ctx.app.close();}
});
test('catalogue fingerprint blocks stale mappings, repeated sequences remain distinct, and duplicate matching services stay unverified',async()=>{
 const ctx=await setup();try{await ctx.fares.sync();const route=fixtureRoutes[0]!,stops=ctx.store.sequence(route.id),direction=JSON.parse(ctx.store.get<{document:string}>('SELECT document FROM fare_directions WHERE id=?','1001:1')!.document);
 assert.equal(mapRoute(route,stops,[direction,{...direction,key:'other'}]).status,'ambiguous');assert.deepEqual(mapRoute(route,stops,[direction]).stopMap,[1,2,3,4,5]);
 ctx.store.run('UPDATE route_stops SET stop_id=? WHERE route_id=? AND sequence=?','stop-hennessy',route.id,2);assert.equal(ctx.fares.quote(route.id,1,5).reason,'CATALOG_CHANGED');assert.equal(ctx.fares.status().coverage.changed,1);
 }finally{await ctx.app.close();}
});
test('unchanged source checks reuse persisted prices, remap catalogues, and failures retain the previous complete revision',async()=>{
 const ctx=await setup();try{await ctx.fares.sync();const count=ctx.xmlCount();const repeat=await ctx.fares.sync();assert.equal(repeat.unchanged,true);assert.equal(ctx.xmlCount(),count);const source=ctx.store.setting('fareSource',null);ctx.fail();const id=ctx.fares.startSync('unit-test');assert.equal(ctx.fares.startSync('another'),id);await ctx.fares.settle();assert.equal(ctx.store.get<{status:string}>('SELECT status FROM jobs WHERE id=?',id)!.status,'failed');assert.deepEqual(ctx.store.setting('fareSource',null),source);assert.equal(ctx.fares.quote('KMB:112:O:1',1,5).state,'stale');assert.equal(ctx.fares.quote('KMB:112:O:1',1,5).amountCents,670);
 }finally{await ctx.app.close();}
});
test('malformed or duplicate official fares cannot publish a partial snapshot',async()=>{
 const ctx=await setup({duplicate:true});try{await assert.rejects(()=>ctx.fares.sync());assert.equal(ctx.store.setting('fareSource',null),null);assert.equal(ctx.store.get<{n:number}>('SELECT count(*) n FROM fare_directions')!.n,0);}finally{await ctx.app.close();}
});
test('streaming XML rejects DTD, malformed input and oversized bodies even when split across transport chunks',async()=>{
 for(const value of ['<!DOCTYPE dataroot [<!ENTITY x SYSTEM "file:///etc/passwd">]><dataroot generated="'+today+'T00:00:00"><FARE><PRICE>&x;</PRICE></FARE></dataroot>',xml('FARE',[{PRICE:'6.70'}]).replace('</PRICE>',''),xml('FARE',[{PRICE:'6.70'}])]){
  const fetcher:typeof fetch=async()=>new Response(new ReadableStream({start(c){const b=new TextEncoder().encode(value);for(let i=0;i<b.length;i+=7)c.enqueue(b.slice(i,i+7));c.close();}}));await assert.rejects(()=>readOfficialXml(fetcher,'FARE_BUS.xml','FARE',()=>{},value.includes('DOCTYPE')||!value.includes('</PRICE>')?5000:20));
 }
});
test('fare management remains authenticated and mutations require an operator role',async()=>{
 const ctx=await setup();try{assert.equal((await ctx.app.inject('/api/admin/fares')).statusCode,401);assert.equal((await ctx.app.inject({method:'POST',url:'/api/admin/jobs/fares/sync',headers:{'x-hkbus-admin':'1'},payload:{}})).statusCode,401);ctx.store.run('INSERT INTO admins VALUES(?,?,?,?,?,?,?)','viewer','viewer@example.test','Viewer',passwordHash('test-only-password'),'viewer',1,new Date().toISOString());const viewer=issueSession(ctx.app,ctx.store,'viewer','admin','viewer').token;assert.equal((await ctx.app.inject({url:'/api/admin/fares',headers:{authorization:'Bearer '+viewer}})).statusCode,200);assert.equal((await ctx.app.inject({method:'POST',url:'/api/admin/jobs/fares/sync',headers:{authorization:'Bearer '+viewer,'x-hkbus-admin':'1'},payload:{}})).statusCode,403);
 }finally{await ctx.app.close();}
});
