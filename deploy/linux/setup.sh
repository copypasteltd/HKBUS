#!/bin/bash
set -euo pipefail
umask 027
base=/www/wwwroot/hkbusgo
upload=/home/ubuntu/.cache/hkbus-deploy-20261017
release_id=$(tr -d '\r\n' < "$upload/release-id.txt")
[[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || exit 2
release="$base/releases/$release_id"
if [[ -e "$base/current" || -e /etc/systemd/system/hkbusgo-backend.service ]]; then
  echo 'An existing deployment requires the documented update procedure.' >&2
  exit 3
fi
if ss -H -lnt 'sport = :39410' | read -r line; then
  echo 'Port 39410 is already occupied.' >&2
  exit 4
fi
node_version=$(/usr/local/bin/node -p 'process.versions.node.split(".")[0]')
[[ "$node_version" -ge 22 ]] || exit 5
id hkbusgo >/dev/null 2>&1 || useradd --system --user-group --home-dir "$base" --shell /usr/sbin/nologin hkbusgo
install -d -m 0755 "$base" "$base/releases" "$base/ops"
install -d -o root -g hkbusgo -m 0750 "$base/shared"
install -d -o hkbusgo -g hkbusgo -m 0750 "$base/shared/data" /www/wwwlogs/hkbusgo
install -o hkbusgo -g hkbusgo -m 0640 /dev/null "$base/shared/last-backup.json"
install -d -o ubuntu -g ubuntu -m 0755 "$release"
tar -xzf "$upload/backend-source.tar.gz" -C "$release" --no-same-owner
chown -R ubuntu:ubuntu "$release"
chmod -R u+rwX,go+rX "$release"
runuser -u ubuntu -- bash -c 'set -euo pipefail; cd "$1"; npm ci --no-audit --no-fund > "$2" 2>&1; npm run typecheck >> "$2" 2>&1; npm test >> "$2" 2>&1; npm run build >> "$2" 2>&1; npm prune --omit=dev --no-audit --no-fund >> "$2" 2>&1' _ "$release" "$upload/build.log"
test -f "$release/dist/main.js"
chown -R root:hkbusgo "$release"
chmod -R go-w "$release"
install -o root -g hkbusgo -m 0640 "$upload/backup.mjs" "$base/ops/backup.mjs"
install -o root -g root -m 0750 "$upload/backup.sh" "$base/ops/backup.sh"
python3 - <<'PY'
from pathlib import Path
import json,secrets,os
base=Path('/www/wwwroot/hkbusgo');shared=base/'shared'
email='admin@hkbusgo.local';password=secrets.token_urlsafe(24)
settings={'NODE_ENV':'production','HOST':'0.0.0.0','PORT':'39410','DATABASE_PATH':str(shared/'data/hkbusgo.db'),'JWT_SECRET':secrets.token_urlsafe(64),'ADMIN_EMAIL':email,'ADMIN_PASSWORD':password,'PROVIDER_MODE':'live','TDAS_ENABLED':'true','CORS_ORIGINS':'*','TRUSTED_PROXIES':'127.0.0.1,::1','RATE_LIMIT_MAX':'120','PUBLIC_APP_URL':'http://43.160.221.28:39410','PROVIDER_TIMEOUT_MS':'15000','CATALOG_SYNC_HOURS':'24'}
env=shared/'backend.env'
if env.exists():raise RuntimeError('Refusing to replace existing environment credentials')
env.write_text(''.join(k+'='+v+'\n' for k,v in settings.items()));os.chmod(env,0o640)
import grp
os.chown(env,0,grp.getgrnam('hkbusgo').gr_gid)
credentials=shared/'initial-admin.json'
credentials.write_text(json.dumps({'email':email,'password':password}));os.chmod(credentials,0o600)
print('Production environment generated; secrets omitted from logs.')
PY
install -d -m 0755 /www/backup/database/sqlite
ln -s "$release" "$base/current"
install -o root -g root -m 0644 "$upload/hkbusgo-backend.service" /etc/systemd/system/hkbusgo-backend.service
cat >/etc/logrotate.d/hkbusgo <<'ROTATE'
/www/wwwlogs/hkbusgo/backend.log {
    daily
    rotate 14
    maxsize 20M
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su hkbusgo hkbusgo
}
ROTATE
chmod 0644 /etc/logrotate.d/hkbusgo
systemd-analyze verify /etc/systemd/system/hkbusgo-backend.service
systemctl daemon-reload
systemctl enable --now hkbusgo-backend.service
for attempt in {1..30}; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:39410/api/health >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo 'Backend readiness probe failed; inspect its service log.' >&2
    exit 6
  fi
  sleep 1
done
printf 'DEPLOYED_RELEASE %s\n' "$release_id"
systemctl is-active hkbusgo-backend.service
