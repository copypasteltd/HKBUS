"""Read-only public HTTPS and official KMB route-ETA acceptance. No fixture data."""
import json,time,urllib.parse,subprocess
from datetime import datetime,timezone

BASE='https://hkbus-api.copypaste.hk/api'
OFFICIAL='https://data.etabus.gov.hk/v1/transport/kmb'
def request(url,headers=None):
    command=['curl','--silent','--show-error','--include','--max-time','35']
    for key,value in (headers or {}).items():command.extend(['--header',key+': '+value])
    result=subprocess.run([*command,url],capture_output=True,check=True)
    head,body=result.stdout.split(b'\r\n\r\n',1)
    lines=head.decode().splitlines();status=int(lines[0].split()[1]);fields=dict(line.split(':',1) for line in lines[1:] if ':' in line)
    return status,{key.lower():value.strip() for key,value in fields.items()},json.loads(body)
def get(path):
    status,_,body=request(BASE+path);assert status==200,(path,status,body);return body['data']
def main():
    report={'startedAt':datetime.now(timezone.utc).isoformat(),'apiBase':BASE,'officialBase':OFFICIAL,'apiResponsesSubstituted':False,'tlsValidationDisabled':False,'checks':[],'samples':[],'passed':False}
    def check(name,value,**details):
        report['checks'].append({'name':name,'passed':bool(value),**details});assert value,name
    try:
        routes=get('/v1/routes?pageSize=100')['items'];special=next((row['id'] for row in routes if row['serviceType']!='1'),None)
        identities=['KMB:112:O:1','KMB:112:I:1','KMB:48X:O:1','KMB:48X:I:1','KMB:A31:O:1','KMB:A31:I:1']+([special] if special else [])
        for identity in identities:
            path='/v1/routes/'+urllib.parse.quote(identity,safe='')+'/arrivals'
            result=get(path+'?force=true');route=result['route'];by_seq={stop['sequence']:stop['id'] for stop in result['stops']}
            check(identity+' actual official identities',route['id']==identity and len(by_seq)>0 and all(row['source']=='live' and row['routeId']==identity and by_seq[row['stopSequence']]==row['stopId'] and row['bound']==route['bound'] and str(row['serviceType'])==route['serviceType'] for row in result['arrivals']),stops=len(by_seq),arrivals=len(result['arrivals']))
            check(identity+' timestamps and freshness',result['freshness']['source']=='live' and result['freshness']['provider']=='KMB' and bool(result['freshness']['generatedAt']) and all(row['eta'] is None or datetime.fromisoformat(row['eta'].replace('Z','+00:00')).timestamp()>=time.time()-62 for row in result['arrivals']),state=result['freshness']['state'])
            cached=get(path);check(identity+' shared real cache',cached['freshness']['cached'] is True)
            report['samples'].append({'route':route,'stops':len(by_seq),'freshness':result['freshness'],'arrivals':result['arrivals'][:6]})
        # Compare current normalized fields with the unmodified official response.
        matched=[]
        for attempt in range(2):
            result=get('/v1/routes/KMB%3A112%3AO%3A1/arrivals?force=true')
            status,_,raw=request(OFFICIAL+'/route-eta/112/1?_t='+str(int(time.time()//15)));assert status==200
            official={(int(row['seq']),int(row['eta_seq'])):row for row in raw['data'] if row['dir']=='O' and str(row['service_type'])=='1' and row['route']=='112'}
            for row in result['arrivals']:
                source=official.get((row['stopSequence'],row['etaSequence']))
                if not source or datetime.fromisoformat(source['data_timestamp']).timestamp()!=datetime.fromisoformat(row['generatedAt'].replace('Z','+00:00')).timestamp():continue
                source_eta=None if source['eta'] is None else datetime.fromisoformat(source['eta']).timestamp()
                eta=None if row['eta'] is None else datetime.fromisoformat(row['eta'].replace('Z','+00:00')).timestamp()
                assert source_eta==eta and source['dest_tc']==row['destination']['tc'] and source['rmk_tc']==row['remark']['tc']
                matched.append({'stopSequence':row['stopSequence'],'etaSequence':row['etaSequence'],'generatedAt':row['generatedAt'],'eta':row['eta']})
            if len(matched)>=3:break
        check('112 exact ETA/time/destination/remark match official live response',len(matched)>=3,matchedRows=len(matched));report['officialComparison']=matched
        status,headers,_=request(BASE+'/v1/routes/KMB%3A112%3AO%3A1/arrivals',{'Origin':'https://route-arrivals-check.example'})
        check('route ETA accepts arbitrary origin',status==200 and headers.get('Access-Control-Allow-Origin',headers.get('access-control-allow-origin'))=='https://route-arrivals-check.example')
        for path,expected in [('/v1/routes/MISSING/arrivals',404),('/v1/routes/KMB%3A112%3AO%3A1/arrivals?force=invalid',422)]:
            status,_,body=request(BASE+path);check('explicit error '+str(expected),status==expected and 'error' in body,status=status)
        docs=get('/health');check('existing service remains ready',docs['status']=='ok' and docs['database']=='ready')
        check('old stop ETA remains available',get('/v1/stops/'+result['stops'][4]['id']+'/arrivals')['freshness']['source']=='live')
        report['passed']=True
    finally:
        report['finishedAt']=datetime.now(timezone.utc).isoformat();report['summary']={'passed':sum(row['passed'] for row in report['checks']),'failed':sum(not row['passed'] for row in report['checks'])};print(json.dumps(report,ensure_ascii=False))
    if not report['passed']:raise SystemExit(1)
if __name__=='__main__':main()
