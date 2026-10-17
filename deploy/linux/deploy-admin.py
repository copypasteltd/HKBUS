"""Publish the actual Admin dist under the existing BaoTa API site's /admin/ path."""
from pathlib import Path
import argparse
import grp
import hashlib
import json
import os
import re
import subprocess
import tarfile
import urllib.request

parser=argparse.ArgumentParser()
parser.add_argument('staging')
args=parser.parse_args()
assert os.geteuid()==0,'Run through sudo on the existing production server'
assert re.fullmatch(r'/home/ubuntu/\.cache/hkbus-admin-\d{8}T\d{6}Z',args.staging)
staging=Path(args.staging);spec=json.loads((staging/'manifest.json').read_text())
assert re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{12}',spec['releaseId'])
base=Path('/www/wwwroot/hkbusgo-admin')
marker=Path('/www/wwwroot/hkbusgo/shared/admin-deployment.json')
snippet=Path('/www/server/panel/vhost/nginx/extension/hkbus-api.copypaste.hk/hkbusgo-admin.conf')
vhost=Path('/www/server/panel/vhost/nginx/hkbus-api.copypaste.hk.conf')
nginx='/www/server/nginx/sbin/nginx'
configuration='''# HKBusGo actual Admin; static files only. Keep the existing /api proxy.
location = /admin {
    return 308 https://hkbus-api.copypaste.hk/admin/;
}
location ^~ /admin/ {
    alias /www/wwwroot/hkbusgo-admin/current/;
    index index.html;
    autoindex off;
    add_header Cache-Control "private, no-store" always;
    add_header X-Content-Type-Options nosniff always;
}
'''
assert 'include '+str(snippet.parent)+'/*.conf;' in vhost.read_text(),'Expected BaoTa extension hook is missing'
assert not base.exists() or marker.exists(),'Refusing to replace an unowned static directory'
assert not snippet.exists() or marker.exists() and snippet.read_text()==configuration,'Refusing to replace an unowned or edited Nginx extension'
archive=staging/'admin-dist.tar.gz'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==spec['archiveSha256']
release=base/'releases'/spec['releaseId'];assert not release.exists()
old_link=os.readlink(base/'current') if (base/'current').is_symlink() else None
old_snippet=snippet.read_bytes() if snippet.exists() else None
old_marker=marker.read_bytes() if marker.exists() else None
switched=False
os.umask(0o022)
try:
    release.mkdir(parents=True,mode=0o755)
    with tarfile.open(archive,'r:gz') as package:
        entries=package.getmembers()
        for entry in entries:
            target=(release/entry.name).resolve()
            assert target.is_relative_to(release.resolve()) and entry.isfile(),'Only regular files within this release are accepted'
            assert entry.name in spec['assets'],'Unexpected artifact'
            target.parent.mkdir(parents=True,exist_ok=True)
            with package.extractfile(entry) as source:content=source.read()
            assert hashlib.sha256(content).hexdigest()==spec['assets'][entry.name]
            target.write_bytes(content)
        assert len(entries)==len(spec['assets'])
    assert (release/'index.html').is_file() and b'https://hkbus-api.copypaste.hk/api' in b''.join(file.read_bytes() for file in release.rglob('*.js'))
    group=grp.getgrnam('www').gr_gid
    for target in [base,base/'releases',release,*release.rglob('*')]:
        os.chown(target,0,group);os.chmod(target,0o755 if target.is_dir() else 0o644)
    candidate=base/('current-next-'+spec['releaseId']);candidate.symlink_to(release);os.replace(candidate,base/'current');switched=True
    snippet.parent.mkdir(parents=True,exist_ok=True)
    snippet.write_text(configuration);os.chmod(snippet,0o644)
    subprocess.run([nginx,'-t'],check=True)
    subprocess.run([nginx,'-s','reload'],check=True)
    checks=[]
    for name,digest in spec['assets'].items():
        request=urllib.request.Request('https://hkbus-api.copypaste.hk/admin/'+name,headers={'User-Agent':'HKBusGo/1.0','Cache-Control':'no-cache'})
        with urllib.request.urlopen(request,timeout=20) as response:
            body=response.read();actual=hashlib.sha256(body).hexdigest()
            assert response.status==200 and actual==digest,'Published Admin asset differs from compiled dist'
            checks.append({'path':'/admin/'+name,'status':response.status,'sha256':actual,'cacheControl':response.headers.get('Cache-Control')})
    request=urllib.request.Request('https://hkbus-api.copypaste.hk/api/health',headers={'User-Agent':'HKBusGo/1.0'})
    with urllib.request.urlopen(request,timeout=20) as response:health=json.load(response)['data']
    assert health['status']=='ok','Existing API is no longer ready'
    report={**spec,'publicUrl':'https://hkbus-api.copypaste.hk/admin/','nginxExtension':str(snippet),'staticBase':str(base),'checks':checks,'apiStillReady':True,'backendRelease':str(Path('/www/wwwroot/hkbusgo/current').resolve()),'backendPort':39410,'passed':True,'rollbackPreviousRelease':old_link}
    marker.write_text(json.dumps(report,indent=2)+'\n');os.chmod(marker,0o640)
    (staging/'admin-deployment.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report),flush=True)
except Exception:
    if switched:
        current=base/'current'
        if old_link:
            previous=base/('current-rollback-'+spec['releaseId']);previous.symlink_to(old_link);os.replace(previous,current)
        elif current.is_symlink():current.unlink()
    if old_snippet is None:
        if snippet.exists():snippet.unlink()
    else:snippet.write_bytes(old_snippet)
    if old_marker is not None:marker.write_bytes(old_marker)
    elif marker.exists():marker.unlink()
    subprocess.run([nginx,'-t'],check=False);subprocess.run([nginx,'-s','reload'],check=False)
    raise
