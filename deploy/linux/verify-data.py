"""Verify real production HTTPS data and TDAS combinations. No simulated responses."""
from pathlib import Path
import argparse
import datetime
import http.cookiejar
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request

parser=argparse.ArgumentParser()
parser.add_argument('--base-url',default='https://hkbus-api.copypaste.hk')
parser.add_argument('--private-env',default='/www/wwwroot/hkbusgo/shared/backend.env')
parser.add_argument('--credentials',default='/www/wwwroot/hkbusgo/shared/initial-admin.json')
parser.add_argument('--output',default='/www/wwwroot/hkbusgo/shared/data-reachability.json')
args=parser.parse_args()
origin=args.base_url.rstrip('/')
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'target':origin,'scope':'actual production HTTPS, official TDAS through owned authenticated egress, KMB catalogue/ETA and data health','checks':[],'requests':[],'credentialsRecorded':False}
jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(path,method='GET',body=None,expected=200,private=False):
    url=path if path.startswith('https://') else origin+path
    headers={'User-Agent':'HKBusGo/1.0','Accept':'application/json','Origin':origin,'X-HKBus-Admin':'1'}
    if body is not None:headers['Content-Type']='application/json'
    if private:
        time.sleep(20)  # Reference probes bypass the BFF scheduler; keep them deliberately sparse.
        headers['Authorization']='Bearer '+env['TDAS_EGRESS_SECRET']
    req=urllib.request.Request(url,data=None if body is None else json.dumps(body,separators=(',',':')).encode(),headers=headers,method=method)
    started=time.monotonic()
    try:response=opener.open(req,timeout=35)
    except urllib.error.HTTPError as error:response=error
    with response:status=response.status;raw=response.read();response_headers=response.headers
    item={'method':method,'path':urllib.parse.urlsplit(url).path,'status':status,'elapsedMs':round((time.monotonic()-started)*1000),'requestId':response_headers.get('X-Request-Id')}
    if private:item.update({'provider':'TDAS','region':response_headers.get('X-HKBus-Region'),'upstreamStatus':response_headers.get('X-HKBus-Upstream-Status')})
    report['requests'].append(item)
    if status!=expected:raise AssertionError(method+' '+item['path']+' returned '+str(status)+' instead of '+str(expected))
    data=json.loads(raw)
    if private:return data
    if status>=400:return data.get('error',{})
    assert data.get('meta',{}).get('mode')=='live' and response_headers.get('X-Request-Id')
    return data['data']


def check(name,action):
    try:
        details=action() or {};item={**details,'name':name,'status':'passed'}
    except Exception as error:item={'name':name,'status':'failed','errorType':type(error).__name__,'reason':str(error)}
    report['checks'].append(item);print(json.dumps(item,ensure_ascii=True),flush=True)
    return item['status']=='passed'


def require(value,message):
    if not value:raise AssertionError(message)


def road_input(start=None,end=None,**options):
    return {'start':start or {'lat':22.2784,'long':114.1828,'buffer':200},'end':end or {'lat':22.2821,'long':114.1581,'buffer':200},'departIn':0,'lang':'tc','type':'ST',**options}


def road_case(body,tunnel=None):
    result=call('/api/v1/traffic/route','POST',body)
    require(result['source']=='live' and result['provider']=='TDAS','Wrong data source')
    require(result['distanceMeters']>0 and result['durationSeconds']>0 and len(result['segments'])>0,'Missing real road metrics/segments')
    require(result['departIn']==body['departIn'] and result['routeType']==body['type'],'Query options were lost')
    require(math.isfinite(result['averageSpeedKmh']) if result['averageSpeedKmh'] is not None else True,'Invalid speed')
    if tunnel:require(result['tunnels'][tunnel] is True,'Requested harbour tunnel was not used')
    return {'input':body,'source':result['source'],'distanceMeters':result['distanceMeters'],'durationSeconds':result['durationSeconds'],'averageSpeedKmh':result['averageSpeedKmh'],'sections':len(result['segments']),'alternatives':len(result['alternatives']),'tunnels':result['tunnels'],'cached':result['cached'],'generatedAt':result['generatedAt']}


env={}
logged_in=False
try:
    for line in Path(args.private_env).read_text().splitlines():
        if line and not line.startswith('#') and '=' in line:
            key,value=line.split('=',1)
            if key in ['TDAS_EGRESS_URL','TDAS_EGRESS_SECRET']:env[key]=value
    require(bool(env.get('TDAS_EGRESS_URL')) and len(env.get('TDAS_EGRESS_SECRET',''))>=32,'Missing private egress configuration')
    login=call('/api/admin/auth/login','POST',json.loads(Path(args.credentials).read_text()))
    require(login['user']['role']=='admin','Admin role not verified');logged_in=True
    check('Administrative HTTPS identity',lambda:{'role':call('/api/admin/auth/me')['role']})
    call('/api/admin/cache/purge','POST',{})

    config=call('/api/v1/config')
    check('Real road capability remains enabled',lambda:(require(config['tdasEnabled'] and config['features']['traffic'] and config['dataPolicy']['liveOnly'],'Road feature disabled or data mode invalid') or {'mode':config['mode']}))
    routes=call('/api/v1/routes?q=112&pageSize=100')
    route=call('/api/v1/routes/KMB%3A112%3AO%3A1');stops=route['stops'];stop=stops[4]
    check('KMB canonical route and stop sequence',lambda:(require(routes['total']>=2 and len(stops)>10 and all(s['source']=='live' for s in stops),'Missing real catalogue') or {'routeId':route['route']['id'],'stops':len(stops)}))
    def initial_eta():
        eta=call('/api/v1/stops/'+stop['id']+'/arrivals?force=true')
        policy=next(item['value'] for item in call('/api/admin/settings') if item['key']=='freshness')
        freshness=eta['freshness'];age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(freshness['generatedAt'].replace('Z','+00:00'))).total_seconds()
        context=json.dumps({'freshness':freshness,'ageSeconds':round(age,2),'arrivals':len(eta['arrivals'])})
        require(freshness['source']=='live' and not freshness['cached'] and any(x['eta'] for x in eta['arrivals']),'Missing uncached real ETA: '+context)
        require(freshness['state'] in ['fresh','stale'] and -5<=age<=policy['etaStaleSeconds']+2,'ETA outside the explicit freshness window: '+context)
        require(age<=policy['etaFreshSeconds']+2 if freshness['state']=='fresh' else age>=policy['etaFreshSeconds']-2,'Freshness contradicts the official data timestamp: '+context)
        return {'stopId':stop['id'],'arrivals':len(eta['arrivals']),'freshness':freshness,'officialDataAgeSeconds':round(age,2),'freshnessPolicy':policy}
    check('Uncached real KMB ETA with honest upstream freshness',initial_eta)
    provider=call('/api/admin/providers')
    check('Live catalogue quality',lambda:(require(provider['quality']['routes']>1000 and provider['quality']['stops']>6000 and provider['quality']['missingNames']==0 and provider['quality']['invalidCoordinates']==0,'Catalogue quality failed') or {'quality':provider['quality'],'syncedAt':provider['syncedAt']}))

    for lang in ['tc','sc','en']:
        check('TDAS language '+lang,lambda lang=lang:road_case(road_input(lang=lang)))
    check('TDAS shortest-distance route',lambda:road_case(road_input(type='SD')))
    for minutes in [15,30,45,60,75,90]:
        check('TDAS departure +'+str(minutes)+' minutes',lambda minutes=minutes:road_case(road_input(departIn=minutes)))
    kowloon={'lat':22.2986,'long':114.1720,'buffer':200};island={'lat':22.2784,'long':114.1828,'buffer':200}
    check('TDAS cross-harbour default',lambda:road_case(road_input(kowloon,island)))
    for tunnel in ['cht','eht','wht']:
        check('TDAS harbour tunnel '+tunnel,lambda tunnel=tunnel:road_case(road_input(kowloon,island,tunnel=tunnel),tunnel))
    point=lambda stop:{'lat':stop['latitude'],'long':stop['longitude'],'buffer':200}
    check('TDAS using actual KMB-selected stops',lambda:road_case(road_input(point(stops[4]),point(stops[-4]))))
    territory=call('/api/v1/routes/KMB%3A48X%3AO%3A1')['stops']
    check('TDAS New Territories actual KMB stops',lambda:road_case(road_input(point(territory[3]),point(territory[-4]),lang='en')))

    def mapping():
        body=road_input(lang='en',type='SD',departIn=30)
        before=call(env['TDAS_EGRESS_URL'],'POST',body,private=True)
        actual=call('/api/v1/traffic/route','POST',body)
        after=call(env['TDAS_EGRESS_URL'],'POST',body,private=True)
        def matches(raw):
            hours,minutes=map(int,raw['eta'].split(':'))
            return actual['distanceMeters']==raw['distM'] and actual['durationSeconds']==hours*3600+minutes*60 and actual['segments']==raw['route'] and actual['alternatives']==raw.get('ar',[])
        require(matches(before) or matches(after),'BFF fields do not match surrounding actual official responses')
        return {'rawDistanceMeters':after['distM'],'rawDuration':after['eta'],'distanceMeters':actual['distanceMeters'],'durationSeconds':actual['durationSeconds'],'officialSegmentsPreserved':True,'officialAlternativesPreserved':True,'cached':actual['cached']}
    check('BFF output matches official TDAS data and HH:MM semantics',mapping)

    def cache():
        a=call('/api/v1/traffic/route','POST',road_input(lang='sc',type='SD',departIn=45));b=call('/api/v1/traffic/route','POST',road_input(lang='sc',type='SD',departIn=45))
        require(not a['cached'] and b['cached'] and a['generatedAt']==b['generatedAt'] and a['segments']==b['segments'],'Cold/warm real-data cache is incorrect')
        return {'firstCached':a['cached'],'secondCached':b['cached'],'sameGeneratedAt':True}
    check('TDAS cold query and real 60-second cache',cache)
    for label,body in [('identical endpoints',road_input(end={'lat':22.2784,'long':114.1828,'buffer':200})),('invalid departure',road_input(departIn=1)),('outside Hong Kong coordinates',road_input(start={'lat':0,'long':0}))]:
        check('TDAS input rejection: '+label,lambda body=body:(require(bool(call('/api/v1/traffic/route','POST',body,expected=422).get('code')),'Missing explicit validation error') or {'httpStatus':422}))
    def no_match():
        body=road_input({'lat':22.01,'long':114.80,'buffer':1},{'lat':22.02,'long':114.81,'buffer':1})
        error=call('/api/v1/traffic/route','POST',body,expected=422)
        require(error['code']=='ROAD_MATCH_FAILED' and error['retryable'] is False,'No-match misclassified as outage')
        return {'httpStatus':422,'code':error['code'],'retryable':error['retryable']}
    check('Official no-road result is a location error, not an outage',no_match)
    check('TDAS valid query still works after no-road result',lambda:road_case(road_input(departIn=75,lang='en',type='SD')))
    def final_eta():
        latest=call('/api/v1/stops/'+stop['id']+'/arrivals?force=true')
        require(latest['freshness']['source']=='live' and latest['freshness']['state']=='fresh' and not latest['freshness']['cached'],'Final real KMB query failed')
        return {'freshness':latest['freshness'],'arrivals':len(latest['arrivals'])}
    check('Final KMB refresh after sustained TDAS queries',final_eta)
    def health():
        data=call('/api/health')
        require(data['status']=='ok' and data['dataStatus']=='healthy' and all(x['state']=='available' for x in data['dataServices']),'Process readiness differs from working data sources')
        return {'processStatus':data['status'],'dataStatus':data['dataStatus'],'dataServices':data['dataServices']}
    check('Final public HTTPS health verifies both actual providers',health)
except Exception as error:
    report['checks'].append({'name':'Verification execution','status':'failed','errorType':type(error).__name__,'reason':str(error)})
finally:
    if logged_in:
        check('Temporary Admin session logged out',lambda:(require(call('/api/admin/auth/logout','POST',{})['loggedOut'],'Logout failed') or {'loggedOut':True}))
    report['summary']={status:sum(item['status']==status for item in report['checks']) for status in ['passed','failed']}
    report['passed']=report['summary']['failed']==0 and report['summary']['passed']>=31
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'report':args.output,'summary':report['summary'],'passed':report['passed']}),flush=True)

raise SystemExit(0 if report['passed'] else 1)
