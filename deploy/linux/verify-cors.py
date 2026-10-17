"""Check the deployed CORS policy via the actual public HTTPS domain; keep credentials in memory."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,http.cookiejar,json,re,time,urllib.error,urllib.request

BASE='https://hkbus-api.copypaste.hk/api'
ORIGINS=['https://new-h5.example','http://localhost:9876','https://preview.example:8443','capacitor://localhost','null']
METHODS=['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']
CUSTOM='authorization,content-type,x-hkbus-admin,x-client-version,x-custom-integration'
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
report={'startedAt':datetime.now(timezone.utc).isoformat(),'apiBase':BASE,'transport':'Ubuntu Python urllib over public HTTPS','tlsVerification':True,'userAgent':'HKBusGo/1.0','checks':[],'adminSessionRevoked':False,'profilesCreated':0}

def request(path,method='GET',origin=None,data=None,extra=None):
    headers={'User-Agent':'HKBusGo/1.0','Accept':'application/json'}
    if origin is not None:headers['Origin']=origin
    if extra:headers.update(extra)
    body=None
    if data is not None:headers['Content-Type']='application/json';body=json.dumps(data).encode()
    req=urllib.request.Request(BASE+path,body,headers,method=method)
    start=time.monotonic()
    try:response=client.open(req,timeout=20)
    except urllib.error.HTTPError as error:response=error
    with response:
        raw=response.read();status=response.status
        selected={key.lower():value for key,value in response.headers.items() if key.lower().startswith('access-control-') or key.lower() in ['vary','content-type']}
    try:content=json.loads(raw)
    except (ValueError,UnicodeError):content=None
    return status,content,selected,round((time.monotonic()-start)*1000)

def check(name,path,method='GET',origin=None,data=None,extra=None,expected=200,validate=None):
    status,content,headers,ms=request(path,method,origin,data,extra)
    passed=status==expected
    if origin is not None:
        passed &= headers.get('access-control-allow-origin')==origin
        passed &= headers.get('access-control-allow-credentials')=='true'
        passed &= 'origin' in headers.get('vary','').lower()
    if validate:passed &= bool(validate(content,headers))
    row={'name':name,'path':path,'method':method,'origin':origin,'status':status,'milliseconds':ms,'headers':headers,'passed':bool(passed)}
    if content and 'error' in content:row['errorCode']=content['error']['code']
    report['checks'].append(row)
    print(name+': '+str(status)+' '+('PASS' if passed else 'FAIL'),flush=True)
    assert passed,name
    return content

def main():
    for origin in ORIGINS:
        check('health '+origin,'/health',origin=origin,validate=lambda b,h:b['data']['status']=='ok' and b['meta']['mode']=='live')
        check('unauthenticated response '+origin,'/admin/auth/me',origin=origin,expected=401)
        for method in METHODS:
            check('preflight '+method+' '+origin,'/admin/auth/login',method='OPTIONS',origin=origin,extra={'Access-Control-Request-Method':method,'Access-Control-Request-Headers':CUSTOM},expected=204,validate=lambda b,h,m=method:h.get('access-control-allow-headers')==CUSTOM and m in h.get('access-control-allow-methods','').split(', ') and 'access-control-request-headers' in h.get('vary','').lower())
    check('native/server request without Origin','/health',validate=lambda b,h:b['meta']['mode']=='live')
    origin='https://new-h5.example'
    check('real KMB catalogue with custom headers','/v1/routes?q=112&pageSize=5',origin=origin,extra={'X-Client-Version':'cors-verification-20261017','X-Custom-Integration':'hkbusgo'},validate=lambda b,h:b['data']['total']>0 and all(x['source']=='live' for x in b['data']['items']))
    check('real public mutation reaches validation','/v1/journeys',method='POST',origin=origin,data={},expected=422,validate=lambda b,h:b['error']['code']=='VALIDATION_ERROR')
    check('unknown resource still readable cross-origin','/v1/not-a-real-resource',origin=origin,expected=404)
    credentials=json.loads(args.credentials.read_text(encoding='utf-8'))
    email=credentials['email'];password=credentials['password']
    adminOrigin='https://admin-new.example'
    logged=False
    try:
        check('arbitrary Admin origin reaches credential validation','/admin/auth/login',method='POST',origin=adminOrigin,data={'email':email,'password':'incorrect-cors-check'},expected=401,validate=lambda b,h:b['error']['code']=='INVALID_CREDENTIALS')
        check('Admin login with arbitrary Origin','/admin/auth/login',method='POST',origin=adminOrigin,data={'email':email,'password':password})
        logged=True
        cookie=next(c for c in jar if c.name=='hkbus_admin')
        report['adminCookiePolicy']={'secure':cookie.secure,'httpOnly':cookie.has_nonstandard_attr('HttpOnly'),'sameSite':cookie.get_nonstandard_attr('SameSite')}
        assert report['adminCookiePolicy']=={'secure':True,'httpOnly':True,'sameSite':'Strict'}
        check('authenticated Admin response with arbitrary Origin','/admin/auth/me',origin=adminOrigin)
        check('Admin marker remains required','/admin/auth/logout',method='POST',origin=adminOrigin,expected=403,validate=lambda b,h:b['error']['code']=='CSRF_REJECTED')
    finally:
        if logged:
            check('Admin logout with arbitrary Origin','/admin/auth/logout',method='POST',origin=adminOrigin,extra={'X-HKBus-Admin':'1'})
            report['adminSessionRevoked']=True
    check('logged-out Admin access is revoked','/admin/auth/me',origin=adminOrigin,expected=401)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--credentials',type=Path,default=Path('/www/wwwroot/hkbusgo/shared/initial-admin.json'))
    args=parser.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    try:main();report['passed']=True
    except Exception as error:
        report['passed']=False
        report['errorType']=type(error).__name__
        raise
    finally:
        report['finishedAt']=datetime.now(timezone.utc).isoformat()
        report['checkCount']=len(report['checks'])
        args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
