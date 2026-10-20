"""Suppress coordinate-bearing public requests in this BaoTa vhost's access/error logs."""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess
TARGET=Path('/www/server/panel/vhost/nginx/extension/hkbus-api.copypaste.hk/hkbusgo-location-privacy.conf')
NGINX='/www/server/nginx/sbin/nginx'
def main():
    assert TARGET.parent.is_dir()
    original=TARGET.read_bytes() if TARGET.exists() else None
    content='# HKBusGo public location requests: no coordinate URLs in access/error logs.\n'
    for path in ['/api/v1/map/stops','/api/v1/stops','/api/v1/home']:
        content+='location = '+path+' {\n    access_log off;\n    error_log /dev/null crit;\n    proxy_pass http://127.0.0.1:39410;\n    proxy_set_header Host 127.0.0.1;\n    proxy_set_header X-Real-IP $remote_addr;\n    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    proxy_http_version 1.1;\n    proxy_read_timeout 45s;\n    proxy_cache off;\n    proxy_no_cache 1;\n    proxy_cache_bypass 1;\n    add_header Cache-Control "no-store" always;\n}\n'
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup=Path('/www/wwwroot/hkbusgo/shared/backups')/('location-privacy-'+stamp+'.json');backup.parent.mkdir(exist_ok=True)
    backup.write_text(json.dumps({'path':str(TARGET),'previous':original.decode() if original else None,'createdAt':stamp},indent=2)+'\n')
    try:
        TARGET.write_text(content);subprocess.run([NGINX,'-t'],check=True);subprocess.run([NGINX,'-s','reload'],check=True)
    except BaseException:
        if original is None:TARGET.unlink(missing_ok=True)
        else:TARGET.write_bytes(original)
        subprocess.run([NGINX,'-t'],check=True);subprocess.run([NGINX,'-s','reload'],check=True);raise
    print(json.dumps({'coordinateUrlLogging':'disabled for map/stops/home only','backup':str(backup),'adminProxyChanged':False}))
if __name__=='__main__':main()
