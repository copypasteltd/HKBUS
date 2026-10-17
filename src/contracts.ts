import type {FastifySchema} from 'fastify';
// Documentation only: handlers use Zod as the authoritative input validator.
// Keeping documentation under x-hkbus-* avoids AJV coercing or stripping the input before Zod sees it.
const str=(description:string,maxLength=120)=>({type:'string',maxLength,description});
const localized={type:'object',required:['tc','sc','en'],properties:{tc:str('繁體中文',10000),sc:str('简体中文',10000),en:str('English',10000)}};
const point={type:'object',required:['lat','long'],properties:{lat:{type:'number',minimum:22,maximum:23},long:{type:'number',minimum:113,maximum:115},buffer:{type:'integer',minimum:1,maximum:500}}};
const notice={type:'object',required:['title','body','severity','validFrom','validUntil','routeIds','stopIds','platforms','sourceUrl'],properties:{title:localized,body:localized,severity:{enum:['info','warning','critical']},validFrom:{type:'string',format:'date-time'},validUntil:{type:'string',format:'date-time'},routeIds:{type:'array',items:str('KMB:route:O|I:serviceType'),maxItems:200},stopIds:{type:'array',items:str('Official stop ID'),maxItems:200},platforms:{type:'array',items:{enum:['weapp','alipay','tt','h5','android']},minItems:1},sourceUrl:{type:'string',description:'Empty or HTTPS URL'}}};
const bookmark={type:'object',required:['kind','entityId'],properties:{kind:{enum:['stop','route']},entityId:str('官方車站或完整路線方向 ID'),alias:str('收藏名稱；最多 24 個字',24)}};
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required});
const version={type:'integer',minimum:1};
const bodies:Record<string,unknown>={
 'POST /api/v1/profile/sessions':object({},[]),
 'POST /api/v1/profile/sessions/refresh':object({refreshToken:{type:'string',pattern:'^[a-f0-9]{64}$'}}),
 'PUT /api/v1/profile/bookmarks':bookmark,
 'PATCH /api/v1/profile/bookmarks/order':object({items:{type:'array',maxItems:100,items:bookmark}}),
 'POST /api/v1/profile/recent':bookmark,
 'PUT /api/v1/profile/reminders':object({stopId:str('Stop ID'),routeId:str('Canonical route ID'),threshold:{type:'integer',minimum:1,maximum:30},channel:{const:'in-app'}}),
 'PATCH /api/v1/profile/reminders/:id':object({status:{enum:['active','paused']}}),
 'PATCH /api/v1/profile/notifications/:id':object({},[]),
 'POST /api/v1/journeys':object({startId:str('Boarding stop ID'),endId:str('Alighting stop ID')}),
 'POST /api/v1/traffic/route':object({start:point,end:point,departIn:{enum:[0,15,30,45,60,75,90],default:0},lang:{enum:['tc','sc','en'],default:'tc'},type:{enum:['ST','SD'],default:'ST'},tunnel:{enum:['cht','eht','wht']}},['start','end']),
 'POST /api/admin/auth/login':object({email:{type:'string',format:'email'},password:{type:'string',maxLength:256}}),
 'POST /api/admin/notices':notice,
 'PUT /api/admin/notices/:id':object({version,document:notice}),
 'POST /api/admin/notices/:id/transition':object({version,action:{enum:['submit','approve','publish','withdraw']}}),
 'POST /api/admin/notices/:id/rollback':object({version,currentVersion:version}),
 'PUT /api/admin/settings/:id':object({version,value:{type:'object',description:'features: reminders/traffic/planner/map booleans; freshness: cacheSeconds/etaFreshSeconds/etaStaleSeconds; content: localized coverage/privacy/help plus sourceUrl/privacyUrl/supportEmail/maintenance'}}),
 'POST /api/admin/users':object({email:{type:'string',format:'email'},name:str('Display name',60),password:{type:'string',minLength:12,maxLength:256},role:{enum:['admin','operator','editor','viewer']}}),
 'PATCH /api/admin/users/:id':object({role:{enum:['admin','operator','editor','viewer']},active:{type:'boolean'},password:{type:'string',minLength:12,maxLength:256}},[])
};
export function contract(method:string,url:string):FastifySchema{
 const schema:FastifySchema & Record<string,unknown>={};
 if(url.includes('/admin')&&!url.endsWith('/auth/login'))schema.security=[{adminCookie:[]}];
 if(url.includes('/profile')&&!url.includes('/sessions'))schema.security=[{bearerAuth:[]}];
 const params=[...url.matchAll(/:([a-zA-Z]+)/g)].map(x=>x[1]!);if(params.length)schema['x-hkbus-params']=object(Object.fromEntries(params.map(x=>[x,str(x)])));
 if(method==='GET'){
  const properties:Record<string,unknown>={};
  if(['/routes','/stops','/jobs','/audit','/notices'].some(x=>url.endsWith(x))){Object.assign(properties,{q:str('搜尋詞',100),page:{type:'integer',minimum:1,default:1},pageSize:{type:'integer',minimum:1,maximum:100,default:30}});}
  if(url.endsWith('/search'))Object.assign(properties,{q:str('三語搜尋',100),type:{enum:['all','route','stop','road']},limit:{type:'integer',minimum:1,maximum:100,default:30}});
  if(url.endsWith('/home')||url==='/api/v1/stops')Object.assign(properties,{latitude:{type:'number',minimum:22,maximum:23},longitude:{type:'number',minimum:113,maximum:115},...(url.endsWith('/home')?{platform:{enum:['weapp','alipay','tt','h5','android']},stopId:str('Stop ID')}:{radius:{type:'number',minimum:100,maximum:10000},walking:{type:'number',minimum:1,maximum:120}})});
  if(url.endsWith('/arrivals'))Object.assign(properties,{force:{enum:['true','false'],default:'false'},...(url.includes('/stops/')?{routeId:str('Only arrivals matching this full route identity')}:{})});
  if(url==='/api/v1/notices')Object.assign(properties,{platform:str('weapp/alipay/tt/h5/android'),routeId:str('Route identity'),stopId:str('Stop ID')});
  if(url==='/api/v1/notices/:id')properties.platform={enum:['weapp','alipay','tt','h5','android']};
  if(url==='/api/admin/notices')properties.status={enum:['all','draft','review','approved','published','withdrawn']};
  if(Object.keys(properties).length)schema['x-hkbus-query']=object(properties,[]);
 }
 const body=bodies[method+' '+url];if(body)schema['x-hkbus-body']=body;
 return schema;
}
export function documentSchema(schema:FastifySchema){const result:FastifySchema & Record<string,unknown>={...schema};for(const[from,to]of [['x-hkbus-query','querystring'],['x-hkbus-params','params'],['x-hkbus-body','body']] as const)if(result[from]){result[to]=result[from];delete result[from];}return result;}
