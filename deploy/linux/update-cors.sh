#!/bin/bash
# Versioned native update for the existing HKBusGo service; does not reinstall BaoTa or SQLite.
set -euo pipefail
umask 027
base=/www/wwwroot/hkbusgo
upload=${1:?Pass the uploaded versioned staging directory}
[[ "$upload" =~ ^/home/ubuntu/\.cache/hkbus-cors-[0-9]{8}T[0-9]{6}Z$ ]] || exit 2
release_id=$(tr -d '\r\n' < "$upload/release-id.txt")
[[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || exit 2
release="$base/releases/$release_id"
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* && -f "$previous/dist/main.js" ]] || exit 3
[[ ! -e "$release" ]] || exit 4
test -f "$base/shared/backend.env"
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
  echo 'Update failed; previous release and environment restored.' >&2
  exit 5
}
trap rollback ERR
python3 - "$base/shared/backend.env" "$release_id" <<'PY'
from pathlib import Path
import grp,os,sys
env=Path(sys.argv[1]);lines=env.read_text().splitlines()
before=dict(line.split('=',1) for line in lines if line and not line.startswith('#'))
lines=[line for line in lines if not line.startswith('CORS_ORIGINS=')]
lines.append('CORS_ORIGINS=*')
updated='\n'.join(lines)+'\n'
after=dict(line.split('=',1) for line in updated.splitlines() if line and not line.startswith('#'))
assert {k:v for k,v in before.items() if k!='CORS_ORIGINS'}=={k:v for k,v in after.items() if k!='CORS_ORIGINS'}
assert after['CORS_ORIGINS']=='*'
next_env=env.with_name(env.name+'.next-'+sys.argv[2])
with next_env.open('x') as file:file.write(updated)
os.chmod(next_env,0o640);os.chown(next_env,0,grp.getgrnam('hkbusgo').gr_gid)
os.replace(next_env,env)
PY
ln -s "$release" "$base/current-next-$release_id"
mv -Tf "$base/current-next-$release_id" "$base/current"
systemctl restart hkbusgo-backend.service
python3 - <<'PY'
import json,time,urllib.request
origin='https://deployment-probe.example'
for attempt in range(30):
    try:
        req=urllib.request.Request('http://127.0.0.1:39410/api/health',headers={'Origin':origin})
        with urllib.request.urlopen(req,timeout=2) as response:
            assert response.status==200
            assert response.headers['Access-Control-Allow-Origin']==origin
            assert response.headers['Access-Control-Allow-Credentials']=='true'
            health=json.load(response)
            assert health['meta']['mode']=='live'
            assert health['data']['status']=='ok' and health['data']['database']=='ready'
        break
    except Exception:
        if attempt==29:raise
        time.sleep(1)
PY
systemctl is-active --quiet hkbusgo-backend.service
trap - ERR
printf 'DEPLOYED_RELEASE %s\nPREVIOUS_RELEASE %s\nCORS_ORIGINS *\nPORT 39410\n' "$release_id" "${previous##*/}"
