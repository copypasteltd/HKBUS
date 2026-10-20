#!/usr/bin/env bash
# Deploy bounded map planning and exact-sequence departure checks; preserve BaoTa schema 3 and credentials.
set -Eeuo pipefail
upload=${1:?An existing upload directory is required}
base=/www/wwwroot/hkbusgo
[[ "$upload" == /home/ubuntu/.cache/hkbus-map-planner-* ]] || exit 2
release_id=$(tr -d '\r\n' < "$upload/release-id.txt")
[[ "$release_id" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$ ]] || exit 2
release="$base/releases/$release_id"
previous=$(readlink -f "$base/current")
[[ "$previous" == "$base/releases/"* && -f "$previous/dist/main.js" ]] || exit 3
[[ ! -e "$release" ]] || exit 4
systemctl is-active --quiet hkbusgo-backend.service
env_before=$(sha256sum "$base/shared/backend.env" | cut -d ' ' -f 1)
"$base/ops/backup.sh"
schema_before=$(python3 -c 'import sqlite3; c=sqlite3.connect("/www/wwwroot/hkbusgo/shared/data/hkbusgo.db"); assert c.execute("PRAGMA integrity_check").fetchone()[0]=="ok"; print(c.execute("PRAGMA user_version").fetchone()[0]); c.close()')
[[ "$schema_before" == 3 ]] || exit 6
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
  systemctl stop hkbusgo-backend.service
  # No database migration in this release. Roll back only the application symlink.
  ln -s "$previous" "$base/current-rollback-$release_id"
  mv -Tf "$base/current-rollback-$release_id" "$base/current"
  systemctl restart hkbusgo-backend.service
  echo 'Transit alignment verification failed; restored previous release; schema and data retained.' >&2
  exit 5
}
trap rollback ERR
ln -s "$release" "$base/current-next-$release_id"
mv -Tf "$base/current-next-$release_id" "$base/current"
systemctl restart hkbusgo-backend.service
python3 "$release/deploy/linux/configure-location-privacy.py"
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
reference=get('/api/v1/routes/KMB%3A112%3AO%3A1/reference')
assert reference['state']=='available' and reference['geometry']['type']=='MultiLineString'
assert len(reference['geometry']['coordinates'])>=20 and reference['operatingHours']['state']=='available'
assert reference['today']['calendarKnown'] and reference['operatingHours']['basis']=='origin-departure'
roads=get('/api/v1/search?q=Nathan%20Rd&type=road')
assert roads['items'] and roads['items'][0]['entity']['name']['en'].startswith('NATHAN')
road=get('/api/v1/roads/'+urllib.parse.quote(roads['items'][0]['id'],safe=''));assert len(road['stops'])>10
services=get('/api/v1/stops/'+road['stops'][0]['id']+'/services');assert services['services']
print(json.dumps({'routeReference':reference['routeId'],'geometryPoints':sum(map(len,reference['geometry']['coordinates'])),'timetableBands':len(reference['operatingHours']['bands']),'today':reference['today'],'referenceStatus':get('/api/v1/reference/status'),'roadStopCount':len(road['stops']),'services':len(services['services'])}))
def post(path,body):
    request=urllib.request.Request(base+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=45) as response:return json.load(response)['data']
viewport=get('/api/v1/map/stops?west=114.1&east=114.2&south=22.25&north=22.35&limit=5')
assert len(viewport['items'])==5 and viewport['total']>5 and viewport['truncated']
route=get('/api/v1/routes/KMB%3A112%3AO%3A1');a,b=route['stops'][0],route['stops'][7]
plan=post('/api/v1/journeys',{'startId':a['id'],'endId':b['id'],'maxTransfers':2})
assert plan['journeys'] and plan['search']['exhaustive'] is False and plan['request']['maxTransfers']==2
journey=next(x for x in plan['journeys'] if len(x['legs'])==1 and x['legs'][0]['route']['id']=='KMB:112:O:1')
leg=journey['legs'][0];identity={'routeId':leg['route']['id'],'boardStopId':leg['board']['id'],'boardSequence':leg['board']['sequence'],'alightStopId':leg['alight']['id'],'alightSequence':leg['alight']['sequence']}
checked=post('/api/v1/journeys/check',{'legs':[identity]});assert checked['state']=='valid'
assert checked['legs'][0]['geometryScope']=='official-selected-segment' and checked['legs'][0]['arrivals']['freshness']['source']=='live'
assert post('/api/v1/journeys/check',{'legs':[{**identity,'boardSequence':299}]})['state']=='changed'
points=post('/api/v1/journeys',{'start':{'latitude':a['latitude']+.0001,'longitude':a['longitude']+.0001},'end':{'latitude':b['latitude']+.0001,'longitude':b['longitude']+.0001},'maxTransfers':2,'transferRadius':200})
assert points['journeys'] and points['endpoints']['start']['kind']=='point' and any(x['walking'] for x in points['journeys'])
assert all(not w['pathVerified'] for x in points['journeys'] for w in x['walking'])
print(json.dumps({'mapTotal':viewport['total'],'mapReturned':len(viewport['items']),'mapTruncated':viewport['truncated'],'journeyCandidates':len(plan['journeys']),'pointCandidates':len(points['journeys']),'selectedGeometry':checked['legs'][0]['geometryScope'],'checks':'actual public sources; no vehicles or fabricated durations'}))
import sqlite3
c=sqlite3.connect('/www/wwwroot/hkbusgo/shared/data/hkbusgo.db');assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok';assert c.execute('PRAGMA user_version').fetchone()[0]==3
print(json.dumps({'databaseIntegrity':'ok','schema':3,'tables':{name:c.execute('SELECT count(*) FROM '+name).fetchone()[0] for name in ['routes','stops','route_stops','profiles','admins','stop_places','roads','route_references']}}));c.close()
PY
test "$env_before" = "$(sha256sum "$base/shared/backend.env" | cut -d ' ' -f 1)"
systemctl is-active --quiet hkbusgo-backend.service
trap - ERR
printf 'DEPLOYED_RELEASE %s\nPREVIOUS_RELEASE %s\nPORT 39410\n' "$release_id" "${previous##*/}"
