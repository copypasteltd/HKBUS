"""Run on the existing BaoTa host via sudo; atomically publish only HKBusGo H5."""
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import argparse
import grp
import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import time

SITE = Path('/www/wwwroot/hkbus.copypaste.hk')
BASE = SITE/'.hkbusgo'
VHOST = Path('/www/server/panel/vhost/nginx/hkbus.copypaste.hk.conf')
SNIPPET = Path('/www/server/panel/vhost/nginx/extension/hkbus.copypaste.hk/hkbusgo-h5.conf')
NGINX = '/www/server/nginx/sbin/nginx'
URL = 'https://hkbus.copypaste.hk/'
API = 'https://hkbus-api.copypaste.hk/api'
CURRENT = BASE/'current'
OWNER = BASE/'owner.json'
CONFIG = '''# Actual HKBusGo H5. BaoTa domain root, ACME and logging remain in the main vhost.
location ^~ /.hkbusgo/ { return 404; }
location = / {
    root /www/wwwroot/hkbus.copypaste.hk/.hkbusgo/current;
    try_files /index.html =404;
    add_header Cache-Control "no-store, no-transform" always;
    add_header X-Content-Type-Options nosniff always;
}
location = /index.html {
    root /www/wwwroot/hkbus.copypaste.hk/.hkbusgo/current;
    try_files $uri =404;
    add_header Cache-Control "no-store, no-transform" always;
    add_header X-Content-Type-Options nosniff always;
}
location ^~ /js/ {
    root /www/wwwroot/hkbus.copypaste.hk/.hkbusgo/current;
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable, no-transform";
    add_header X-Content-Type-Options nosniff always;
}
location ^~ /css/ {
    root /www/wwwroot/hkbus.copypaste.hk/.hkbusgo/current;
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable, no-transform";
    add_header X-Content-Type-Options nosniff always;
}
location ^~ /assets/ {
    root /www/wwwroot/hkbus.copypaste.hk/.hkbusgo/current;
    try_files $uri =404;
    add_header Cache-Control "no-cache, no-transform" always;
    add_header X-Content-Type-Options nosniff always;
}
location / {
    root /www/wwwroot/hkbus.copypaste.hk/.hkbusgo/current;
    try_files $uri =404;
    add_header Cache-Control "no-store, no-transform" always;
    add_header X-Content-Type-Options nosniff always;
}
'''


def sha(content):return hashlib.sha256(content).hexdigest()


def fetch(url,origin=False):
    args=['curl','--silent','--show-error','--fail-with-body','--max-time','30','--user-agent','HKBusGo/1.0','--dump-header','/dev/stderr']
    if origin:args += ['--header','Host: hkbus.copypaste.hk']
    process=subprocess.run([*args,url],capture_output=True)
    assert process.returncode == 0,'HTTPS/origin request failed: '+url+' '+process.stderr.decode(errors='replace')[-1000:]
    headers=process.stderr.decode(errors='replace')
    assert re.search(r'^HTTP/\S+ 200\b',headers,re.M),url
    return process.stdout,headers


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('staging');args=parser.parse_args()
    assert os.geteuid() == 0
    assert re.fullmatch(r'/home/ubuntu/\.cache/hkbus-h5-\d{8}T\d{6}Z',args.staging)
    staging=Path(args.staging);spec=json.loads((staging/'manifest.json').read_text())
    assert re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{12}',spec['releaseId'])
    assert re.fullmatch(r'[a-f0-9]{40}',spec['sourceCommit'])
    assert spec['apiBase'] == API+'/'
    assert SITE.is_dir() and not SITE.is_symlink() and SITE.resolve() == SITE
    assert re.search(r'^\s*root\s+'+re.escape(str(SITE))+r';',VHOST.read_text(),re.M)
    assert 'include '+str(SNIPPET.parent)+'/*.conf;' in VHOST.read_text()
    assert not BASE.exists() or OWNER.is_file() and json.loads(OWNER.read_text())['project'] == 'HKBusGo H5'
    assert not SNIPPET.exists() or OWNER.is_file() and SNIPPET.read_text() == CONFIG,'Unowned or manually edited H5 extension'
    assert not CURRENT.exists() or CURRENT.is_symlink() and CURRENT.resolve().is_relative_to(BASE/'releases')
    assert sha((staging/'h5-dist.tar.gz').read_bytes()) == spec['archiveSha256']
    release=BASE/'releases'/spec['releaseId'];assert not release.exists()
    previous_link=os.readlink(CURRENT) if CURRENT.is_symlink() else None
    previous_snippet=SNIPPET.read_bytes() if SNIPPET.exists() else None
    previous_owner=OWNER.read_bytes() if OWNER.exists() else None
    initial_vhost=sha(VHOST.read_bytes())
    report={**spec,'startedAt':datetime.now(timezone.utc).isoformat(),'publicUrl':URL,'siteRoot':str(SITE),'releasePath':str(release),'nginxExtension':str(SNIPPET),'rollbackPreviousRelease':previous_link,'checks':[],'passed':False,'backendUpdated':False,'databaseReplaced':False,'demoTouched':False}
    switched=False;configuration_written=False
    os.umask(0o022)
    try:
        if previous_owner is None:
            # The existing actual site stays intact; preserve an additional offline backup.
            original=[x for x in SITE.iterdir() if x != BASE]
            for item in original:
                assert not item.is_symlink()
                if item.is_dir():assert not any(x.is_symlink() for x in item.rglob('*'))
            backup=Path('/www/backup/hkbusgo-h5')/(spec['releaseId']+'-before.tar.gz')
            backup.parent.mkdir(parents=True,exist_ok=True);assert not backup.exists()
            with tarfile.open(backup,'w:gz') as package:
                for item in original:package.add(item,arcname=item.name)
                package.add(VHOST,arcname='baota/hkbus.copypaste.hk.conf')
            os.chmod(backup,0o600);report['initialBackup']={'path':str(backup),'sha256':sha(backup.read_bytes())}
        release.mkdir(parents=True)
        with tarfile.open(staging/'h5-dist.tar.gz','r:gz') as package:
            members=package.getmembers();assert len(members) == len(spec['assets'])
            seen=set()
            for entry in members:
                target=(release/entry.name).resolve()
                assert target.is_relative_to(release) and entry.isfile() and entry.name not in seen and entry.name in spec['assets']
                assert entry.name == 'index.html' or re.fullmatch(r'(?:js|css|assets)/[a-zA-Z0-9_./@-]+',entry.name)
                seen.add(entry.name);content=package.extractfile(entry).read();assert sha(content) == spec['assets'][entry.name]
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(content)
            assert seen == set(spec['assets'])
        html=(release/'index.html').read_text()
        assert re.search(r'/css/app\.[a-f0-9]{8}\.css',html)
        assert API.encode() in b''.join(x.read_bytes() for x in (release/'js').glob('*.js'))
        assert b'prototype/' not in b''.join(x.read_bytes() for x in (release/'js').glob('*.js'))
        # Preserve old lazy chunks for tabs that were opened before the atomic switch.
        compatibility=[];old_root=CURRENT.resolve() if previous_link else SITE
        for directory in ['js','css','assets']:
            for old in (old_root/directory).rglob('*'):
                if not old.is_file():continue
                assert not old.is_symlink() and old.resolve().is_relative_to(old_root)
                relative=old.relative_to(old_root);target=release/relative
                if not target.exists():
                    target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(old,target);compatibility.append(relative.as_posix())
        report['retainedCompatibilityFiles']=compatibility
        group=grp.getgrnam('www').gr_gid
        for item in [BASE,BASE/'releases',release,*release.rglob('*')]:
            os.chown(item,0,group);os.chmod(item,0o755 if item.is_dir() else 0o644)
        candidate=BASE/('next-'+spec['releaseId']);candidate.symlink_to(release);os.replace(candidate,CURRENT);switched=True
        SNIPPET.parent.mkdir(parents=True,exist_ok=True);SNIPPET.write_text(CONFIG);os.chmod(SNIPPET,0o644);configuration_written=True
        subprocess.run([NGINX,'-t'],check=True);subprocess.run([NGINX,'-s','reload'],check=True)
        for attempt in range(30):
            try:
                body,_=fetch('http://127.0.0.1/',origin=True)
                assert sha(body) == spec['assets']['index.html'];break
            except Exception:
                if attempt == 29:raise
                time.sleep(.5)
        def verify(item):
            name,digest=item;body,headers=fetch(URL+('' if name=='index.html' else name))
            assert sha(body) == digest,'Public artifact mismatch: '+name
            assert 'no-transform' in headers.lower(),'Cache header missing: '+name
            return {'path':'/'+('' if name=='index.html' else name),'status':200,'sha256':digest}
        with ThreadPoolExecutor(max_workers=4) as pool:report['checks']=list(pool.map(verify,spec['assets'].items()))
        body,headers=fetch(URL+'index.html');assert sha(body) == spec['assets']['index.html'] and 'no-store' in headers.lower()
        body,_=fetch(API+'/health');assert json.loads(body)['data']['status'] == 'ok'
        response=subprocess.run(['curl','--silent','--show-error','--fail','--max-time','40','--user-agent','HKBusGo/1.0','--header','Origin: '+URL.rstrip('/'),'--dump-header','/dev/stderr',API+'/v1/routes/KMB%3A112%3AO%3A1/arrivals'],capture_output=True)
        assert response.returncode == 0
        payload=json.loads(response.stdout)['data'];assert payload['route']['id'] == 'KMB:112:O:1' and len(payload['stops'])>0
        assert 'access-control-allow-origin: '+URL.rstrip('/') in response.stderr.decode().lower()
        report['routeApiCheck']={'routeId':payload['route']['id'],'stops':len(payload['stops']),'arrivalRows':len(payload['arrivals']),'crossOriginAllowed':True}
        assert sha(VHOST.read_bytes()) == initial_vhost
        report.update({'mainVhostUnchanged':True,'apiStillReady':True,'passed':True})
        OWNER.write_text(json.dumps({'project':'HKBusGo H5','releaseId':spec['releaseId'],'sourceCommit':spec['sourceCommit'],'updatedAt':datetime.now(timezone.utc).isoformat()})+'\n');os.chmod(OWNER,0o640)
        (BASE/'deployment.json').write_text(json.dumps(report,indent=2)+'\n');os.chmod(BASE/'deployment.json',0o640)
    except Exception as error:
        report['error']=str(error)
        if switched:
            if previous_link:
                rollback=BASE/('rollback-'+spec['releaseId']);rollback.symlink_to(previous_link);os.replace(rollback,CURRENT)
            elif CURRENT.is_symlink():CURRENT.unlink()
        if configuration_written:
            if previous_snippet is None:SNIPPET.unlink(missing_ok=True)
            else:SNIPPET.write_bytes(previous_snippet)
            subprocess.run([NGINX,'-t'],check=True);subprocess.run([NGINX,'-s','reload'],check=True)
        if previous_owner is not None:OWNER.write_bytes(previous_owner)
        report['rolledBack']=True
        raise
    finally:
        report['finishedAt']=datetime.now(timezone.utc).isoformat()
        (staging/'deployment.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps({'passed':report['passed'],'releaseId':spec['releaseId'],'publicUrl':URL,'publicFilesVerified':len(report['checks']),'rolledBack':report.get('rolledBack',False)}),flush=True)


if __name__ == '__main__':main()
