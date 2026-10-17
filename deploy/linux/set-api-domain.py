"""Allow the finalized API origin without changing stored credentials or business data."""
from pathlib import Path
import datetime,grp,json,os,subprocess,time,urllib.request

base=Path('/www/wwwroot/hkbusgo');path=base/'shared/backend.env'
origin='https://hkbus-api.copypaste.hk'
previous=path.read_bytes();lines=previous.decode().splitlines()
settings=dict(line.split('=',1) for line in lines if '=' in line and not line.lstrip().startswith('#'))
assert settings['PORT']=='39410' and settings['PROVIDER_MODE']=='live'
origins=list(dict.fromkeys([origin]+settings.get('CORS_ORIGINS','').split(',')))
value=','.join(item for item in origins if item)
new='\n'.join('CORS_ORIGINS='+value if line.startswith('CORS_ORIGINS=') else line for line in lines)+'\n'
backup=base/'shared/backend.before-https-20261017.env'
if not backup.exists():
    with backup.open('xb') as stream:stream.write(previous)
    os.chmod(backup,0o600)
if new.encode()!=previous:
    staging=path.with_name('backend.env.pending-domain')
    with staging.open('xb') as stream:stream.write(new.encode())
    os.chmod(staging,0o640);os.chown(staging,0,grp.getgrnam('hkbusgo').gr_gid)
    os.replace(staging,path)
    subprocess.run(['systemctl','restart','hkbusgo-backend.service'],check=True)
for _ in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:39410/api/health',timeout=3) as response:health=json.load(response)
        if health['data']['status']=='ok':break
    except Exception:pass
    time.sleep(1)
else:raise RuntimeError('The service did not become ready; the original private environment backup is retained')
request=urllib.request.Request('http://127.0.0.1:39410/api/admin/auth/login',method='OPTIONS',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-hkbus-admin'})
with urllib.request.urlopen(request,timeout=5) as response:
    assert response.status==204 and response.headers['access-control-allow-origin']==origin
    assert response.headers['access-control-allow-credentials']=='true'
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'apiBase':origin+'/api','port':39410,'allowedOrigins':origins,'credentialsPreserved':True,'databasePreserved':True,'preflightVerified':True,'health':health['data']}
destination=base/'shared/https-domain.json';destination.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');os.chmod(destination,0o640)
print(json.dumps(result,ensure_ascii=False))
