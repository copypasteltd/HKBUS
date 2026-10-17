#!/usr/bin/env bash
# Update official fares in the existing service; add only compatible fare tables, preserve credentials and database.
set -Eeuo pipefail
upload=${1:?An existing upload directory is required}
base=/www/wwwroot/hkbusgo
[[ "$upload" == /home/ubuntu/.cache/hkbus-fares-* ]] || exit 2
release_id=$(tr -d '\r\n' < "$upload/release-id.txt")
[[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || exit 2
release="$base/releases/$release_id"
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* && -f "$previous/dist/main.js" ]] || exit 3
[[ ! -e "$release" ]] || exit 4
systemctl is-active --quiet hkbusgo-backend.service
env_before=$(sha256sum "$base/shared/backend.env" | cut -d ' ' -f 1)
"$base/ops/backup.sh"
install -d -o ubuntu -g ubuntu -m 0755 "$release"
tar -xzf "$upload/backend-source.tar.gz" -C "$release" --no-same-owner
chown -R ubuntu:ubuntu "$release"
chmod -R u+rwX,go+rX "$release"
runuser -u ubuntu -- bash -c 'set -euo pipefail; cd "$1"; npm ci --no-audit --no-fund > "$2" 2>&1; npm run typecheck >> "$2" 2>&1; npm test >> "$2" 2>&1; npm run build >> "$2" 2>&1; npm prune --omit=dev --no-audit --no-fund >> "$2" 2>&1' _ "$release" "$upload/build.log"
test -f "$release/dist/main.js"
chown -R root:hkbusgo "$release"
chmod -R go-w "$release"
rollback() {
  trap - ERR
  set +e
  ln -s "$previous" "$base/current-rollback-$release_id"
  mv -Tf "$base/current-rollback-$release_id" "$base/current"
  systemctl restart hkbusgo-backend.service
  echo 'Official fare verification failed; restored previous release.' >&2
  exit 5
}
trap rollback ERR
ln -s "$release" "$base/current-next-$release_id"
mv -Tf "$base/current-next-$release_id" "$base/current"
systemctl restart hkbusgo-backend.service
python3 - <<'PY'
import json,time,urllib.parse,urllib.request
base='http://127.0.0.1:39410'
def get(path):
    with urllib.request.urlopen(base+path,timeout=35) as response:return json.load(response)['data']
for attempt in range(30):
    try:
        health=get('/api/health');assert health['status']=='ok' and health['database']=='ready';break
    except Exception:
        if attempt==29:raise
        time.sleep(1)
for identity in ['KMB:112:O:1','KMB:112:I:1','KMB:48X:O:1']:
    result=get('/api/v1/routes/'+urllib.parse.quote(identity,safe='')+'/arrivals?force=true')
    assert result['route']['id']==identity and result['freshness']['source']=='live' and result['stops']
    by_seq={stop['sequence']:stop['id'] for stop in result['stops']}
    assert all(row['source']=='live' and row['routeId']==identity and by_seq[row['stopSequence']]==row['stopId'] for row in result['arrivals'])
    print(json.dumps({'routeId':identity,'stops':len(result['stops']),'arrivals':len(result['arrivals']),'freshness':result['freshness']}))
for attempt in range(180):
    status=get('/api/v1/fares/status')
    if status['state']=='available' and status['coverage']['matched']>500:break
    if status['lastFailure']:raise RuntimeError('Fare sync failed: '+status['lastFailure']['code'])
    if attempt==179:raise RuntimeError('Official fare sync did not become available')
    time.sleep(2)
quote=get('/api/v1/routes/KMB%3A112%3AO%3A1/fare?boardSequence=10&alightSequence=23')
assert quote['state']=='available' and quote['currency']=='HKD' and isinstance(quote['amountCents'],int)
assert quote['source']['provider']=='TD' and quote['source']['source']=='live'
print(json.dumps({'fareDataDate':status['source']['dataDate'],'coverage':status['coverage'],'sampleSectionCents':quote['amountCents']}))
assert get('/api/v1/routes/KMB%3A112%3AO%3A1')['fares']['fullFare']['state']=='available'
PY
test "$env_before" = "$(sha256sum "$base/shared/backend.env" | cut -d ' ' -f 1)"
systemctl is-active --quiet hkbusgo-backend.service
trap - ERR
printf 'DEPLOYED_RELEASE %s\nPREVIOUS_RELEASE %s\nPORT 39410\n' "$release_id" "${previous##*/}"
