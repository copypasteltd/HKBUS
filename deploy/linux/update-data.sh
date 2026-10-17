#!/bin/bash
# Update the installed native service with private, authenticated TDAS connectivity.
set -euo pipefail
umask 027
base=/www/wwwroot/hkbusgo
upload=${1:?Pass the uploaded versioned staging directory}
[[ "$upload" =~ ^/home/ubuntu/\.cache/hkbus-data-[0-9]{8}T[0-9]{6}Z$ ]] || exit 2
release_id=$(tr -d '\r\n' < "$upload/release-id.txt")
[[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || exit 2
release="$base/releases/$release_id"
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* && -f "$previous/dist/main.js" ]] || exit 3
[[ ! -e "$release" ]] || exit 4
test -f "$base/shared/backend.env"
test -f "$upload/tdas-egress.json"
test "$(stat -c %a "$upload/tdas-egress.json")" = 600
cleanup() { rm -f -- "$upload/tdas-egress.json"; }
trap cleanup EXIT
systemctl is-active --quiet hkbusgo-backend.service
"$base/ops/backup.sh"
install -d -o ubuntu -g ubuntu -m 0755 "$release"
tar -xzf "$upload/backend-source.tar.gz" -C "$release" --no-same-owner
chown -R ubuntu:ubuntu "$release"
chmod -R u+rwX,go+rX "$release"
runuser -u ubuntu -- bash -c 'set -euo pipefail; cd "$1"; npm ci --no-audit --no-fund > "$2" 2>&1; npm run typecheck >> "$2" 2>&1; npm test >> "$2" 2>&1; npm run build >> "$2" 2>&1; npm prune --omit=dev --no-audit --no-fund >> "$2" 2>&1' _ "$release" "$upload/build.log"
test -f "$release/dist/main.js"
chown -R root:hkbusgo "$release"
chmod -R go-w "$release"
env_backup="$base/shared/backend.env.before-$release_id"
install -o root -g root -m 0600 "$base/shared/backend.env" "$env_backup"
rollback() {
  trap - ERR
  set +e
  install -o root -g hkbusgo -m 0640 "$env_backup" "$base/shared/backend.env"
  ln -s "$previous" "$base/current-rollback-$release_id"
  mv -Tf "$base/current-rollback-$release_id" "$base/current"
  systemctl restart hkbusgo-backend.service
  echo 'Data update failed; previous release and private environment restored.' >&2
  exit 5
}
trap rollback ERR
python3 - "$base/shared/backend.env" "$upload/tdas-egress.json" "$release_id" <<'PY'
from pathlib import Path
import grp,json,os,re,sys,urllib.parse
env=Path(sys.argv[1]);private=Path(sys.argv[2]);config=json.loads(private.read_text())
url=config['url'];secret=config['secret'];parsed=urllib.parse.urlsplit(url)
assert parsed.scheme=='https' and parsed.hostname and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment
assert not re.search(r'\s',url) and re.fullmatch(r'[A-Za-z0-9_-]{32,}',secret)
lines=env.read_text().splitlines();before=dict(line.split('=',1) for line in lines if line and not line.startswith('#'))
keys={'TDAS_EGRESS_URL','TDAS_EGRESS_SECRET'}
lines=[line for line in lines if line.split('=',1)[0] not in keys]
lines.extend(['TDAS_EGRESS_URL='+url,'TDAS_EGRESS_SECRET='+secret])
updated='\n'.join(lines)+'\n';after=dict(line.split('=',1) for line in updated.splitlines() if line and not line.startswith('#'))
assert {k:v for k,v in before.items() if k not in keys}=={k:v for k,v in after.items() if k not in keys}
assert after['CORS_ORIGINS']=='*' and after['PROVIDER_MODE']=='live' and after['TDAS_ENABLED']=='true' and after['PORT']=='39410'
next_env=env.with_name(env.name+'.next-'+sys.argv[3])
with next_env.open('x') as file:file.write(updated)
os.chmod(next_env,0o640);os.chown(next_env,0,grp.getgrnam('hkbusgo').gr_gid);os.replace(next_env,env)
private.unlink()
PY
ln -s "$release" "$base/current-next-$release_id"
mv -Tf "$base/current-next-$release_id" "$base/current"
systemctl restart hkbusgo-backend.service
python3 - <<'PY'
import json,time,urllib.request
base='http://127.0.0.1:39410'
def get(path):
    with urllib.request.urlopen(base+path,timeout=35) as response:return json.load(response)['data']
for attempt in range(30):
    try:
        health=get('/api/health');assert health['status']=='ok' and health['database']=='ready';break
    except Exception:
        if attempt==29:raise
        time.sleep(1)
body={'start':{'lat':22.2784,'long':114.1828,'buffer':200},'end':{'lat':22.2821,'long':114.1581,'buffer':200},'departIn':0,'lang':'tc','type':'ST'}
req=urllib.request.Request(base+'/api/v1/traffic/route',data=json.dumps(body).encode(),headers={'Content-Type':'application/json'},method='POST')
with urllib.request.urlopen(req,timeout=35) as response:road=json.load(response)['data']
assert road['provider']=='TDAS' and road['source']=='live' and road['distanceMeters']>0 and road['durationSeconds']>0 and len(road['segments'])>0
route=get('/api/v1/routes/KMB%3A112%3AO%3A1');stop=route['stops'][4]
eta=get('/api/v1/stops/'+stop['id']+'/arrivals?force=true')
assert eta['freshness']['source']=='live' and not eta['freshness']['cached']
health=get('/api/health');assert health['dataStatus']=='healthy' and all(item['state']=='available' for item in health['dataServices'])
print(json.dumps({'road':{'source':road['source'],'distanceMeters':road['distanceMeters'],'durationSeconds':road['durationSeconds']},'eta':{'source':eta['freshness']['source'],'arrivals':len(eta['arrivals'])},'dataStatus':health['dataStatus']}))
PY
systemctl is-active --quiet hkbusgo-backend.service
trap - ERR
printf 'DEPLOYED_RELEASE %s\nPREVIOUS_RELEASE %s\nDATA_TRANSPORT authenticated-egress\nPORT 39410\n' "$release_id" "${previous##*/}"
