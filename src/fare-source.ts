import {createHash} from 'node:crypto';
import {setImmediate as yieldThread} from 'node:timers/promises';
import {SaxesParser} from 'saxes';
import proj4 from 'proj4';
import {AppError, haversine, type Names, type Route, type Stop} from './domain.js';

export const FARE_BASE='https://static.data.gov.hk/td/routes-fares-xml/';
export const FARE_SOURCE_URL='https://data.gov.hk/tc-data/dataset/hk-td-tis_14-routes-fares-xml';
export const FARE_SPEC_URL=FARE_BASE+'dataspec/ptroutefare_xml_dataspec.pdf';
// LandsD 7P_ITRF96_HK80_V1.0. Its coordinate-frame rotations are inverted for PROJ's position-vector convention.
export const HK80='+proj=tmerc +lat_0=22.31213333333334 +lon_0=114.1785555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243648,-1.158828,-1.094246 +units=m +no_defs';
export type XmlRow=Record<string,string>;
export interface SourceFile {name:string;bytes:number;sha256:string;generatedDate:string;lastModified:string|null}
export interface TdStop {sequence:number;id:string;name:Names;pickup:number;latitude:number;longitude:number}
export type FareCell=[on:number,off:number,dayCode:number|null,cents:number];
export interface FareDirection {key:string;routeNo:string;operator:string;specialType:number;fullFareCents:number;officialUrl:string;updatedAt:string;stops:TdStop[];cells:FareCell[]}
export interface FareMapping {routeId:string;signature:string;key:string|null;status:'matched'|'partial'|'unmatched'|'ambiguous';stopMap:(number|null)[];matchedStops:number;totalStops:number}
export type OrderedStop=Stop&{sequence:number};
const invalid=()=>new AppError('FARE_SOURCE_INVALID','官方收費資料校驗失敗；保留上一版完整資料',502,true);
export function integer(value:string|undefined,min=1,max=100000000){if(!value||!/^\d+$/.test(value))throw invalid();const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw invalid();return n;}
export function moneyCents(value:string){if(!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(value))throw invalid();const [whole,decimal='']=value.split('.');return Number(whole)*100+Number(decimal.padEnd(2,'0'));}
export function stopCoordinates(x:string,y:string){const pair=proj4(HK80,'WGS84',[Number(x),Number(y)]);if(!Number.isFinite(pair[0])||!Number.isFinite(pair[1])||pair[0]!<113||pair[0]!>115||pair[1]!<22||pair[1]!>23)throw invalid();return{longitude:pair[0]!,latitude:pair[1]!};}

/** The largest official XML is ~149 MB. Parse bounded UTF-8 chunks; no DOM, DTD, external entities or raw-source database blobs. */
export async function readOfficialXml(fetcher:typeof fetch,name:string,recordName:string,accept:(row:XmlRow)=>void,maxBytes=220_000_000):Promise<SourceFile>{
 const response=await fetcher(FARE_BASE+name,{headers:{Accept:'application/xml','User-Agent':'HKBusGo/1.0'},signal:AbortSignal.timeout(180000),redirect:'error'});
 if(!response.ok||!response.body)throw new AppError('FARE_UPSTREAM_UNAVAILABLE','官方收費資料暫不可用',502,true);
 if(Number(response.headers.get('content-length'))>maxBytes)throw invalid();
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),hash=createHash('sha256'),parser=new SaxesParser();
 let depth=0,key='',row:XmlRow={},bytes=0,count=0,generatedDate='';
 parser.on('doctype',()=>{throw invalid();});parser.on('error',()=>{throw invalid();});
 parser.on('opentag',node=>{
  depth++;if(depth===1){if(node.name!=='dataroot')throw invalid();const generated=String(node.attributes.generated||'');if(!/^\d{4}-\d{2}-\d{2}T/.test(generated))throw invalid();generatedDate=generated.slice(0,10);}
  else if(depth===2){if(node.name!==recordName)throw invalid();row={};}
  else if(depth===3){key=node.name;if(Object.hasOwn(row,key))throw invalid();row[key]='';}
  else throw invalid();
 });
 parser.on('text',value=>{if(depth===3){row[key]+=value;if(row[key]!.length>10000)throw invalid();}else if(value.trim())throw invalid();});
 parser.on('closetag',()=>{if(depth===2){if(++count>2_000_000)throw invalid();accept(row);}depth--;key='';});
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw invalid();hash.update(value);for(let offset=0;offset<value.length;offset+=65536)parser.write(decoder.decode(value.subarray(offset,offset+65536),{stream:true}));await yieldThread();}parser.write(decoder.decode()).close();if(!count||!generatedDate)throw invalid();}
 catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 return{name,bytes,sha256:hash.digest('hex'),generatedDate,lastModified:response.headers.get('last-modified')};
}
function normalize(value:string){return value.normalize('NFKC').toUpperCase().replace(/\s*\([A-Z]{1,3}\d{2,4}[A-Z]?\)\s*$/,'').replace(/[^\p{L}\p{N}]/gu,'');}
function variants(value:string){return value.split(/\/|<br\s*\/?>/i).map(normalize).filter(Boolean);}
export function sameStop(k:OrderedStop,t:TdStop){
 const same=['tc','en'].some(locale=>variants(k.name[locale as 'tc'|'en']).some(v=>variants(t.name[locale as 'tc'|'en']).includes(v)));
 const d=haversine(k.latitude,k.longitude,t.latitude,t.longitude);
 const suffix=variants(k.name.tc).some(a=>variants(t.name.tc).some(b=>Math.min(a.length,b.length)>=3&&(a.endsWith(b)||b.endsWith(a))));
 return(same&&d<=150)||(suffix&&d<=60)||d<=25;
}
export function routeSignature(route:Route,stops:OrderedStop[]){return createHash('sha256').update(JSON.stringify([route.id,route.origin,route.destination,stops.map(s=>[s.sequence,s.id,s.name,s.latitude,s.longitude])])).digest('hex');}

/** Unique monotone alignment, with both terminal stops verified. Unmapped intermediate stops never inherit a neighbouring fare. */
export function alignStops(ks:OrderedStop[],ts:TdStop[]):(number|null)[]|null{
 const n=ks.length,m=ts.length;if(n<2||m<2||!sameStop(ks[0]!,ts[0]!)||!sameStop(ks[n-1]!,ts[m-1]!)||Math.min(n,m)<.9*Math.max(n,m))return null;
 if(n===m&&ks.every((k,i)=>sameStop(k,ts[i]!)))return ts.map(t=>t.sequence);
 // Endpoints are fixed; a repeated terminal is therefore not mistaken for an earlier visit.
 const dp=Array.from({length:n},()=>new Uint16Array(m));
 for(let i=n-2;i>=1;i--)for(let j=m-2;j>=1;j--)dp[i]![j]=sameStop(ks[i]!,ts[j]!)?1+dp[i+1]![j+1]!:Math.max(dp[i+1]![j]!,dp[i]![j+1]!);
 if((dp[1]?.[1]||0)+2<.9*Math.max(n,m))return null;
 const result:(number|null)[]=Array(n).fill(null);result[0]=ts[0]!.sequence;result[n-1]=ts[m-1]!.sequence;
 let i=1,j=1;while(i<n-1&&j<m-1){
  const value=dp[i]![j]!;
  if(sameStop(ks[i]!,ts[j]!)&&(1+dp[i+1]![j+1]!)===value){
   // An equally good alternative match would make a boarding sequence ambiguous.
   if(value&&((dp[i+1]![j]===value)||(dp[i]![j+1]===value)))return null;
   result[i]=ts[j]!.sequence;i++;j++;
  }else if(dp[i+1]![j]!>dp[i]![j+1]!)i++;else if(dp[i+1]![j]!<dp[i]![j+1]!)j++;else{if(value)return null;i++;j++;}
 }
 return result;
}
export function mapRoute(route:Route,stops:OrderedStop[],directions:FareDirection[]):FareMapping{
 const candidates=directions.filter(d=>d.routeNo===route.routeNo).map(d=>({key:d.key,map:alignStops(stops,d.stops),length:d.stops.length})).filter(x=>x.map!==null);
 const complete=candidates.filter(c=>c.length===stops.length&&c.map!.every(x=>x!==null));
 const matches=complete.length?complete:candidates;
 const unique=matches.length===1?matches[0]!:null;const stopMap=unique?.map||stops.map(()=>null),matchedStops=stopMap.filter(x=>x!==null).length;
 return{routeId:route.id,signature:routeSignature(route,stops),key:unique?.key||null,status:matches.length>1?'ambiguous':!unique?'unmatched':matchedStops===stops.length?'matched':'partial',stopMap,matchedStops,totalStops:stops.length};
}
