import { timingSafeEqual } from 'node:crypto';

const upstream='https://tdas-api.hkemobility.gov.hk/tdas/api/route';

export function validInput(body){
  if(!body||typeof body!=='object'||Array.isArray(body))return false;
  for(const point of [body.start,body.end]){
    if(!point||typeof point!=='object'||Array.isArray(point))return false;
    if(typeof point.lat!=='number'||!Number.isFinite(point.lat)||point.lat<22||point.lat>23)return false;
    if(typeof point.long!=='number'||!Number.isFinite(point.long)||point.long<113||point.long>115)return false;
    if(point.buffer!==undefined&&(!Number.isInteger(point.buffer)||point.buffer<1||point.buffer>500))return false;
  }
  if(body.start.lat===body.end.lat&&body.start.long===body.end.long)return false;
  return (body.departIn===undefined||[0,15,30,45,60,75,90].includes(body.departIn))
    &&(body.lang===undefined||['tc','sc','en'].includes(body.lang))
    &&(body.type===undefined||['ST','SD'].includes(body.type))
    &&(body.tunnel===undefined||['cht','eht','wht'].includes(body.tunnel));
}

export function createHandler({secret=()=>process.env.TDAS_EGRESS_SECRET,fetcher=fetch}={}){
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-HKBus-Provider','TDAS');
    res.setHeader('X-HKBus-Region',process.env.VERCEL_REGION||'local');
    const send=(status,value)=>res.status(status).json(value);
    if(req.method!=='POST'){
      res.setHeader('Allow','POST');
      return send(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    }
    const key=secret();
    if(!key||key.length<32)return send(503,{error:{code:'EGRESS_NOT_CONFIGURED'}});
    const authorization=req.headers.authorization;
    const expected=Buffer.from('Bearer '+key),provided=Buffer.from(typeof authorization==='string'?authorization:'');
    if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return send(401,{error:{code:'UNAUTHENTICATED'}});
    if(Number(req.headers['content-length']||0)>4096)return send(413,{error:{code:'BODY_TOO_LARGE'}});
    if(!validInput(req.body))return send(422,{error:{code:'INVALID_ROAD_INPUT'}});
    const {start,end,departIn=0,lang='tc',type='ST',tunnel}=req.body;
    const point=value=>({lat:value.lat,long:value.long,...value.buffer!==undefined?{buffer:value.buffer}:{}});
    const body={start:point(start),end:point(end),departIn,lang,type,...tunnel?{tunnel}:{}};
    try{
      const response=await fetcher(upstream,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'HKBusGo/1.0'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
      res.setHeader('X-HKBus-Upstream-Status',String(response.status));
      const raw=await response.text();
      if(!response.ok)return send(response.status===400?400:response.status===429?429:502,{error:{code:'TDAS_UPSTREAM_HTTP',upstreamStatus:response.status}});
      let data;
      try{data=JSON.parse(raw);}catch{return send(502,{error:{code:'TDAS_UPSTREAM_SCHEMA'}});}
      if(!data||typeof data.eta!=='string'||typeof data.distM!=='number'||!Array.isArray(data.route))return send(502,{error:{code:'TDAS_UPSTREAM_SCHEMA'}});
      return send(200,data);
    }catch(error){
      const timeout=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');
      return send(timeout?504:502,{error:{code:timeout?'TDAS_UPSTREAM_TIMEOUT':'TDAS_UPSTREAM_CONNECTION'}});
    }
  };
}

export default createHandler();
