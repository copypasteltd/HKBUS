"""Native uploader for the user-authorized actual H5 website. Never deploys demo."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import base64
import hashlib
import json
import re
import shlex
import subprocess
import tarfile
import paramiko

REPO = Path(__file__).resolve().parents[2]
HOST = '43.160.221.28'
FINGERPRINT = 'SHA256:RRe4A9Z+YdIUgq4l2DYxXnmuucnIVzeBbmeB2E16LqE'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--access-file', type=Path, default=Path.home()/'.codex/private/hkbusgo/ssh-session.json')
    parser.add_argument('--known-hosts', type=Path, default=Path.home()/'.codex/private/hkbusgo/known_hosts')
    parser.add_argument('--out', type=Path, default=REPO/'dist/h5-deployment')
    args = parser.parse_args()
    build = json.loads((REPO/'dist/h5-build.json').read_text(encoding='utf-8'))
    assert build['passed'] and build['typecheck'] and build['tests'] and build['build']
    assert build['apiBase'] == 'https://hkbus-api.copypaste.hk/api/'
    for name, digest in build['sourceSha256'].items():
        assert sha(REPO/name) == digest, 'Source changed after build: '+name
    dist = REPO/'dist/h5'
    assets = {x.relative_to(dist).as_posix():sha(x) for x in dist.rglob('*') if x.is_file()}
    assert not any(x.is_symlink() for x in dist.rglob('*'))
    assert assets == build['assets'], 'Compiled files changed after verification'
    assert all(not re.search(r'(^|/)(\.|node_modules|prototype)|\.(map|zip|db|apk|env|tar|gz)$',name) for name in assets)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    release = stamp+'-'+build['sourceCommit'][:12]
    out = args.out.resolve();out.mkdir(parents=True, exist_ok=True)
    archive = out/'h5-dist.tar.gz'
    with tarfile.open(archive,'w:gz') as package:
        for name in sorted(assets):package.add(dist/name,arcname=name,recursive=False)
    manifest = {'releaseId':release,'sourceCommit':build['sourceCommit'],'apiBase':build['apiBase'],'assets':assets,'archiveSha256':sha(archive),'buildVerifiedAt':build['finishedAt']}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    details = globals().get('TASK_SSH_DETAILS') or json.loads(args.access_file.read_text(encoding='utf-8'))
    assert details['host'] == HOST and details['user'] == 'ubuntu'
    client = paramiko.SSHClient();client.load_host_keys(str(args.known_hosts));client.set_missing_host_key_policy(paramiko.RejectPolicy())
    transport_report = {'startedAt':datetime.now(timezone.utc).isoformat(),'releaseId':release,'sshClosed':False,'passed':False}
    try:
        client.connect(HOST,username='ubuntu',password=details['password'],timeout=20,allow_agent=False,look_for_keys=False)
        transport = client.get_transport();transport.set_keepalive(30)
        assert 'SHA256:'+base64.b64encode(hashlib.sha256(transport.get_remote_server_key().asbytes()).digest()).decode().rstrip('=') == FINGERPRINT
        staging = '/home/ubuntu/.cache/hkbus-h5-'+stamp
        _,stdout,stderr = client.exec_command('install -d -m 0700 '+shlex.quote(staging))
        assert stdout.channel.recv_exit_status() == 0, stderr.read().decode()
        with client.open_sftp() as sftp:
            sftp.put(str(archive),staging+'/h5-dist.tar.gz')
            sftp.put(str(out/'manifest.json'),staging+'/manifest.json')
            sftp.put(str(Path(__file__).with_name('deploy-site.py')),staging+'/deploy-site.py')
        _,stdout,stderr = client.exec_command('sudo -n python3 '+shlex.quote(staging+'/deploy-site.py')+' '+shlex.quote(staging),timeout=360)
        stdout_text=stdout.read().decode();stderr_text=stderr.read().decode();code=stdout.channel.recv_exit_status()
        (out/'deployment.log').write_text(stdout_text+stderr_text,encoding='utf-8')
        with client.open_sftp() as sftp:sftp.get(staging+'/deployment.json',str(out/'deployment.json'))
        assert code == 0, 'Deployment failed; inspect deployment.json and rollback state'
        deployment = json.loads((out/'deployment.json').read_text())
        assert deployment['passed'] and deployment['releaseId'] == release
        transport_report['passed'] = True
        print(json.dumps({'passed':True,'publicUrl':deployment['publicUrl'],'root':deployment['siteRoot'],'releaseId':release,'publicFilesVerified':len(deployment['checks'])}),flush=True)
    finally:
        client.close();transport_report.update({'sshClosed':True,'finishedAt':datetime.now(timezone.utc).isoformat()})
        (out/'transport.json').write_text(json.dumps(transport_report,indent=2)+'\n',encoding='utf-8')


if __name__ == '__main__':main()
