"""Trigger only the registered HKBusGo task through BaoTa's installed scheduler."""
from pathlib import Path
import contextlib
import io
import json
import os
import sys

panel=Path('/www/server/panel')
os.chdir(str(panel));sys.path.insert(0,str(panel));sys.path.insert(0,str(panel/'class'))
import public
from BTPanel import app
from crontab import crontab

with app.test_request_context('/hkbusgo-local-backup'):
    task=public.M('crontab').where('name=?',('HKBusGo SQLite Daily Consistent Backup',)).find()
    if not task or not task.get('status'):raise RuntimeError('HKBusGo panel backup task is absent or disabled')
    args=public.dict_obj();args.id=task['id']
    with contextlib.redirect_stdout(io.StringIO()):result=crontab().StartTask(args)
    if not result.get('status'):raise RuntimeError('BaoTa rejected the HKBusGo backup trigger')
    print(json.dumps({'taskId':task['id'],'triggerAccepted':True}))
