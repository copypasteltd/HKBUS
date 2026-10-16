"""Run real HTTP acceptance on the installed server; requires root and restarts this service.

Creates two temporary anonymous profiles and removes them in finally. Never prints
credentials or publishes fabricated notices. TDAS source-side 403 is reported blocked.
"""
from pathlib import Path
import datetime
import hashlib
import json
import os
import sqlite3
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

BASE=Path('/www/wwwroot/hkbusgo')
URL='http://127.0.0.1:39410'
report={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'target':URL,'checks':[],'requests':[],'scope':'real HTTP, live upstreams, SQLite and service restart; no browser/IDE/device/store acceptance'}
sessions=[]
cookie={}

def check(name,condition,**details):
    report['checks'].append({'name':name,'status':'passed' if condition else 'failed',**details})
    print(json.dumps(report['checks'][-1],ensure_ascii=False),flush=True)
    if not condition:raise AssertionError(name)

def call(method,path,body=None,headers=None,expected=200,raw=False):
    values={'Accept':'application/json',**(headers or {})}
    data=None if body is None else json.dumps(body).encode()
    if data is not None:values['Content-Type']='application/json'
    req=urllib.request.Request(URL+path,data=data,headers=values,method=method)
    start=time.monotonic()
    try:response=urllib.request.urlopen(req,timeout=40)
    except urllib.error.HTTPError as error:response=error
    with response:
        content=response.read();status=response.status;response_headers=response.headers
    report['requests'].append({'method':method,'path':path,'status':status,'elapsedMs':round((time.monotonic()-start)*1000),'requestId':response_headers.get('x-request-id')})
    if status!=expected:raise AssertionError(method+' '+path+' returned '+str(status)+' instead of '+str(expected))
    if raw:return content,response_headers
    result=json.loads(content)
    if status<300:
        if result.get('meta',{}).get('mode')!='live':raise AssertionError('Non-live API envelope')
        if not response_headers.get('x-request-id'):raise AssertionError('Missing request ID')
    return result.get('data') if status<300 else result['error'],response_headers

def get(path,**kwargs):return call('GET',path,**kwargs)[0]
def auth(session):return {'Authorization':'Bearer '+session['accessToken']}
def admin_headers():return {**cookie,'X-HKBus-Admin':'1'}
def ready():
    for _ in range(30):
        try:
            data=get('/api/health')
            if data['status']=='ok':return data
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('Service did not become ready')

try:
    health=ready()
    check('Health and live catalogue ready',health['source']=='live' and health['catalogRoutes']>1000,health=health)
    config=get('/api/v1/config')
    check('Product configuration uses live-only data',config['mode']=='live' and config['dataPolicy']['liveOnly'] and config['tdasEnabled'])
    contract=json.loads(call('GET','/api/openapi.json',raw=True)[0])
    operations=sum(1 for path in contract['paths'].values() for method in path if method in ('get','post','put','patch','delete'))
    check('OpenAPI contract published',operations>=50,operations=operations)
    docs=call('GET','/api/docs/',raw=True)[0]
    favicon=call('GET','/api/docs/static/theme/hkbus-favicon.png',raw=True)[0]
    check('Interactive API documentation and approved favicon',b'swagger' in docs.lower() and favicon.startswith(b'\x89PNG'),faviconSha256=hashlib.sha256(favicon).hexdigest())
    routes=get('/api/v1/routes?q=112&pageSize=100')
    check('Route search and pagination',routes['total']>=2 and all(x['source']=='live' for x in routes['items']))
    rid='KMB:112:O:1';route=get('/api/v1/routes/'+urllib.parse.quote(rid,safe=''))
    stops=route['stops'];start=stops[4];end=stops[-4];sid=start['id']
    check('Canonical direction and complete ordered stops',len(stops)>10 and len(route['directions'])>=2 and all(a['sequence']<b['sequence'] for a,b in zip(stops,stops[1:])),routeId=rid,stopCount=len(stops))
    stop=get('/api/v1/stops/'+sid)
    check('Stop detail and routes',stop['stop']['id']==sid and rid in [x['id'] for x in stop['routes']])
    nearby=get('/api/v1/stops?'+urllib.parse.urlencode({'latitude':start['latitude'],'longitude':start['longitude'],'radius':1000,'pageSize':10}))
    distances=[x['distanceMeters'] for x in nearby['items']]
    check('Nearby distance ordering',distances==sorted(distances) and distances[0]==0 and nearby['distanceKind']=='straight-line',nearbyCount=nearby['total'])
    check('Multilingual search returns real entities',get('/api/v1/search?'+urllib.parse.urlencode({'q':start['name']['tc']}))['total']>0)
    home=get('/api/v1/home')
    check('Unlocated home requests location',home['nextBus'] is None and home['selection']=='none' and any(x['code']=='LOCATION_REQUIRED' for x in home['warnings']))
    located=get('/api/v1/home?stopId='+sid)
    check('Selected-stop home aggregates live ETA',located['selection']=='selected' and located['nextBus']['freshness']['source']=='live')
    eta=get('/api/v1/stops/'+sid+'/arrivals?force=true')
    check('KMB ETA requested from official upstream',eta['freshness']['source']=='live' and not eta['freshness']['cached'] and all(x['source']=='live' and x['stopId']==sid for x in eta['arrivals']),stopId=sid,freshness=eta['freshness'],arrivals=len(eta['arrivals']),nonNullEtas=sum(x['eta'] is not None for x in eta['arrivals']))
    cached=get('/api/v1/stops/'+sid+'/arrivals')
    check('ETA cache preserves source and freshness',cached['freshness']['cached'] and cached['freshness']['source']=='live')
    filtered=get('/api/v1/stops/'+sid+'/arrivals?'+urllib.parse.urlencode({'routeId':rid}))
    check('ETA route-direction filtering',all(x['routeId']==rid for x in filtered['arrivals']))
    journeys=call('POST','/api/v1/journeys',{'startId':sid,'endId':end['id']})[0]
    check('Journey candidates follow real stop order',any(x['transfers']==0 and x['legs'][0]['route']['id']==rid for x in journeys['journeys']),candidates=len(journeys['journeys']))
    notices=get('/api/v1/notices')
    check('No fabricated published service notices',notices==[],publishedNotices=len(notices))
    for path,expected in [('/api/v1/routes/missing',404),('/api/v1/stops/missing/arrivals',404),('/api/v1/notices/missing',404),('/api/v1/stops?latitude=22.28',422),('/api/v1/profile/bookmarks',401),('/api/admin/overview',401)]:
        error=call('GET',path,expected=expected)[0]
        check('Explicit validation/authentication '+path,bool(error.get('code')))
    call('POST','/api/v1/journeys',{'startId':sid,'endId':sid},expected=422)
    check('Identical journey endpoints rejected',True)
    preflight=call('OPTIONS','/api/v1/profile/bookmarks',headers={'Origin':'https://localhost','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'},expected=204,raw=True)[1]
    check('Native app CORS preflight',preflight.get('access-control-allow-origin')=='https://localhost' and 'PUT' in preflight.get('access-control-allow-methods',''))
    rejected=call('OPTIONS','/api/v1/profile/bookmarks',headers={'Origin':'https://untrusted.invalid','Access-Control-Request-Method':'PUT'},expected=404,raw=True)[1]
    check('Unapproved origin receives no CORS permission',not rejected.get('access-control-allow-origin'))

    traffic_input={'start':{'lat':22.2784,'long':114.1828,'buffer':200},'end':{'lat':22.2821,'long':114.1581,'buffer':200},'departIn':0,'lang':'tc','type':'ST'}
    try:
        traffic=call('POST','/api/v1/traffic/route',traffic_input)[0]
        check('TDAS real road route',traffic['source']=='live' and traffic['distanceMeters']>0 and traffic['durationSeconds']>0,distanceMeters=traffic['distanceMeters'],durationSeconds=traffic['durationSeconds'])
    except AssertionError as error:
        req=urllib.request.Request('https://tdas-api.hkemobility.gov.hk/tdas/api/route',data=json.dumps(traffic_input).encode(),headers={'Content-Type':'application/json','Accept':'application/json'})
        try:upstream=urllib.request.urlopen(req,timeout=35)
        except urllib.error.HTTPError as response:upstream=response
        with upstream:status=upstream.status;server=upstream.headers.get('server');upstream.read()
        if status!=403:raise error
        item={'name':'TDAS real road route','status':'blocked','upstreamStatus':status,'upstreamServer':server,'reason':'The official upstream rejects this server egress; no mock or unrelated proxy is substituted.'}
        report['checks'].append(item);print(json.dumps(item),flush=True)

    for _ in range(2):sessions.append(call('POST','/api/v1/profile/sessions')[0])
    current,other=sessions
    check('Anonymous profile sessions are distinct',current['profileId']!=other['profileId'])
    bookmark={'kind':'stop','entityId':sid,'alias':'部署验证'}
    for _ in range(2):call('PUT','/api/v1/profile/bookmarks',bookmark,auth(current))
    check('Bookmark writes are idempotent',len(get('/api/v1/profile/bookmarks',headers=auth(current)))==1)
    call('PUT','/api/v1/profile/bookmarks',{'kind':'route','entityId':rid,'alias':'Route check'},auth(current))
    order=[{'kind':'route','entityId':rid},{'kind':'stop','entityId':sid}]
    ordered=call('PATCH','/api/v1/profile/bookmarks/order',{'items':order},auth(current))[0]
    check('Complete bookmark ordering persists',ordered[0]['kind']=='route' and ordered[1]['kind']=='stop')
    call('PATCH','/api/v1/profile/bookmarks/order',{'items':[]},auth(current),expected=422)
    check('Incomplete bookmark reorder rejected',True)
    call('POST','/api/v1/profile/recent',{'kind':'stop','entityId':sid},auth(current))
    check('Recent history read/write',get('/api/v1/profile/recent',headers=auth(current))[0]['entityId']==sid)
    reminder=call('PUT','/api/v1/profile/reminders',{'stopId':sid,'routeId':rid,'threshold':1},auth(current))[0]
    duplicate=call('PUT','/api/v1/profile/reminders',{'stopId':sid,'routeId':rid,'threshold':1},auth(current))[0]
    check('Reminder creation is idempotent',reminder['id']==duplicate['id'])
    reminder_path='/api/v1/profile/reminders/'+reminder['id']
    call('PATCH',reminder_path,{'status':'paused'},auth(other),expected=404)
    check('Reminder ownership enforced',get('/api/v1/profile/bookmarks',headers=auth(other))==[])
    call('PATCH',reminder_path,{'status':'paused'},auth(current))
    check('Reminder pause',get('/api/v1/profile/reminders',headers=auth(current))[0]['status']=='paused')
    call('PATCH',reminder_path,{'status':'active'},auth(current))
    call('PATCH',reminder_path,{'status':'paused'},auth(current))
    check('Reminder reactivation and notifications endpoint',isinstance(get('/api/v1/profile/notifications',headers=auth(current)),list))

    before=subprocess.check_output(['systemctl','show','--property=MainPID','--value','hkbusgo-backend.service'],text=True).strip()
    subprocess.run(['systemctl','restart','hkbusgo-backend.service'],check=True)
    ready()
    after=subprocess.check_output(['systemctl','show','--property=MainPID','--value','hkbusgo-backend.service'],text=True).strip()
    persisted=get('/api/v1/profile/bookmarks',headers=auth(current))
    check('Actual systemd restart preserves SQLite sessions and bookmarks',before!=after and len(persisted)==2 and any(x['alias']=='部署验证' for x in persisted),previousPid=int(before),newPid=int(after))
    refreshed=call('POST','/api/v1/profile/sessions/refresh',{'refreshToken':current['refreshToken']})[0]
    old=current.copy();current.clear();current.update(refreshed)
    call('GET','/api/v1/profile/bookmarks',headers=auth(old),expected=401)
    call('POST','/api/v1/profile/sessions/refresh',{'refreshToken':old['refreshToken']},expected=401)
    check('Refresh rotation revokes old access and prevents replay',len(get('/api/v1/profile/bookmarks',headers=auth(current)))==2)
    call('DELETE','/api/v1/profile/bookmarks/route/'+urllib.parse.quote(rid,safe=''),headers=auth(current))
    check('Bookmark deletion',len(get('/api/v1/profile/bookmarks',headers=auth(current)))==1)
    call('DELETE','/api/v1/profile/recent',headers=auth(current))
    call('DELETE',reminder_path,headers=auth(current))
    check('Recent history and reminder deletion',get('/api/v1/profile/recent',headers=auth(current))==[] and get('/api/v1/profile/reminders',headers=auth(current))==[])

    credentials=json.loads((BASE/'shared/initial-admin.json').read_text())
    login,headers=call('POST','/api/admin/auth/login',credentials)
    credentials.clear()
    secure_cookie=headers.get('set-cookie','');cookie={'Cookie':secure_cookie.split(';',1)[0]}
    check('Admin authentication retains Secure HttpOnly SameSite cookie',all(x.lower() in secure_cookie.lower() for x in ['Secure','HttpOnly','SameSite=Strict']) and 'accessToken' not in login)
    check('Admin identity and role',get('/api/admin/auth/me',headers=cookie)['role']=='admin')
    for path in ['overview','routes','stops','notices','settings','providers','jobs','audit','users']:
        get('/api/admin/'+path,headers=cookie);check('Authenticated admin '+path,True)
    call('POST','/api/admin/jobs/sync',headers=cookie,expected=403)
    call('POST','/api/admin/jobs/sync',headers={**admin_headers(),'Origin':'https://untrusted.invalid'},expected=403)
    check('Admin mutations enforce CSRF header and approved origin',True)
    job=call('POST','/api/admin/jobs/sync',headers=admin_headers(),expected=202)[0]
    for _ in range(20):
        job_rows=get('/api/admin/jobs',headers=cookie)['items']
        found=next(x for x in job_rows if x['id']==job['jobId'])
        if found['status']!='running':break
        time.sleep(1)
    check('Admin-triggered real catalogue synchronization',found['status']=='succeeded',jobStatus=found['status'],details=json.loads(found['details']))
    check('Manual live reminder worker',call('POST','/api/admin/reminders/evaluate',headers=admin_headers())[0]['evaluated']==0)
    call('POST','/api/admin/auth/logout',headers=admin_headers())
    call('GET','/api/admin/auth/me',headers=cookie,expected=401)
    cookie={}
    check('Admin logout revokes the session',True)
except Exception as error:
    report['checks'].append({'name':'Verification execution','status':'failed','reason':str(error)})
    print(json.dumps(report['checks'][-1],ensure_ascii=False),flush=True)
finally:
    if cookie:
        try:call('POST','/api/admin/auth/logout',headers=admin_headers())
        except Exception:pass
    for session in sessions:
        try:
            call('DELETE','/api/v1/profile',headers=auth(session))
            call('GET','/api/v1/profile/bookmarks',headers=auth(session),expected=401)
            call('POST','/api/v1/profile/sessions/refresh',{'refreshToken':session['refreshToken']},expected=401)
        except Exception as error:report['checks'].append({'name':'Verification profile cleanup','status':'failed','reason':str(error)})
    try:
        database=sqlite3.connect(str(BASE/'shared/data/hkbusgo.db'))
        try:
            integrity=database.execute('PRAGMA integrity_check').fetchone()[0]
            foreign=database.execute('PRAGMA foreign_key_check').fetchall()
            counts={table:database.execute('SELECT count(*) FROM '+table).fetchone()[0] for table in ['routes','stops','route_stops','profiles','profile_credentials','bookmarks','recent','reminders','notifications','admins','notices']}
            check('Database integrity and foreign keys',integrity=='ok' and foreign==[],integrity=integrity,foreignKeyViolations=len(foreign),counts=counts)
            ids=[x['profileId'] for x in sessions]
            check('Verification profiles and related records removed',all(database.execute('SELECT count(*) FROM profiles WHERE id=?',(id,)).fetchone()[0]==0 for id in ids),createdProfilesRemoved=len(ids))
            sources={table:database.execute("SELECT count(*) FROM "+table+" WHERE coalesce(json_extract(document,'$.source'),'')!='live'").fetchone()[0] for table in ['routes','stops']}
            check('Catalogue contains exclusively real data',all(value==0 for value in sources.values()),nonLive=sources)
            report['database']={'path':str(BASE/'shared/data/hkbusgo.db'),'integrity':integrity,'foreignKeyViolations':len(foreign),'counts':counts,'userVersion':database.execute('PRAGMA user_version').fetchone()[0],'journalMode':database.execute('PRAGMA journal_mode').fetchone()[0]}
        finally:database.close()
    except Exception as error:report['checks'].append({'name':'Database verification','status':'failed','reason':str(error)})
    report['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    report['summary']={status:sum(x['status']==status for x in report['checks']) for status in ['passed','failed','blocked']}
    destination=BASE/'shared/deployment-verification.json'
    destination.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');os.chmod(str(destination),0o640)
    print(json.dumps({'report':str(destination),'summary':report['summary']}),flush=True)

raise SystemExit(1 if report['summary']['failed'] else 0)
