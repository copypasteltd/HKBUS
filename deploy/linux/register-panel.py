"""Register the real SQLite file and its consistent backup task with installed BaoTa modules."""
from pathlib import Path
import contextlib
import grp
import hashlib
import io
import json
import os
import pwd
import shutil
import subprocess
import sys

panel=Path('/www/server/panel')
os.chdir(str(panel));sys.path.insert(0,str(panel));sys.path.insert(0,str(panel/'class'))
import public
from BTPanel import app,session
from databaseModel.sqliteModel import main as SQLiteModel
from crontab import crontab

base=Path('/www/wwwroot/hkbusgo');database=base/'shared/data/hkbusgo.db'
if not database.is_file():raise RuntimeError('The application must initialize its database first')
result={}
with app.test_request_context('/hkbusgo-local-maintenance'):
    backup_root=public.M('config').where('id=?',(1,)).getField('backup_path') or '/www/backup'
    session['config']={'backup_path':backup_root}
    directory=Path(backup_root)/'database/sqlite'/hashlib.md5(str(database).encode()).hexdigest()
    directory.mkdir(parents=True,exist_ok=True)
    owner=pwd.getpwnam('hkbusgo');os.chown(str(directory),owner.pw_uid,owner.pw_gid);os.chmod(str(directory),0o750)
    if not shutil.which('setfacl'):raise RuntimeError('Install the native acl package before registering the backup task')
    # BaoTa may keep backup parents private. Grant traversal only to this service,
    # preserving all existing owners, modes and other database contents.
    for parent in directory.parents:
        if str(parent) in ('/www','/'):break
        subprocess.run(['setfacl','-m','u:hkbusgo:--x',str(parent)],check=True)
    config=base/'shared/backup-config.json'
    config.write_text(json.dumps({'databasePath':str(database),'backupDirectory':str(directory),'retain':14},indent=2)+'\n')
    os.chown(str(config),0,owner.pw_gid);os.chmod(str(config),0o640)
    model=SQLiteModel();args=public.dict_obj();args.path=str(database);args.name='HKBusGo production / 港巴通正式业务库'
    with contextlib.redirect_stdout(io.StringIO()):
        if str(database) not in model.get_database_list():
            added=model.AddDatabase(args)
            if not added.get('status'):raise RuntimeError('Panel SQLite registration failed: '+str(added.get('msg')))
        databases=model.get_list(args)
        tables=model.get_table_list(args)
    registered=[item for item in databases if item['path']==str(database)]
    if len(registered)!=1 or not isinstance(tables,list) or len(tables)<15:raise RuntimeError('Panel SQLite read-back verification failed')
    result['database']={'name':registered[0]['name'],'path':str(database),'panelModel':'databaseModel.sqliteModel','tables':tables,'registered':True,'backupDirectory':str(directory)}
    task_name='HKBusGo SQLite Daily Consistent Backup'
    scheduler=crontab()
    existing=public.M('crontab').where('name=?',(task_name,)).field('id,name,echo,status,where_hour,where_minute').find()
    if not existing:
        args=public.dict_obj()
        values={'name':task_name,'type':'day','where1':'','hour':'4','minute':'20','week':'','sType':'toShell','sName':'','sBody':'set -euo pipefail\n/bin/bash /www/wwwroot/hkbusgo/ops/backup.sh','save':14,'backupTo':'localhost','urladdress':'','flock':0,'notice':0,'notice_channel':'','keyword':'','user':'root'}
        for key,value in values.items():setattr(args,key,value)
        with contextlib.redirect_stdout(io.StringIO()):created=scheduler.AddCrontab(args)
        if not created.get('status'):raise RuntimeError('Panel backup task creation failed: '+str(created.get('msg')))
        existing=public.M('crontab').where('name=?',(task_name,)).field('id,name,echo,status,where_hour,where_minute').find()
    if not existing or not existing.get('status'):raise RuntimeError('Panel backup task is not enabled')
    cron_file=Path(scheduler.get_cron_file())
    lines=[line for line in cron_file.read_text().splitlines() if str(existing['echo']) in line]
    if len(lines)!=1:raise RuntimeError('The panel task has not been synchronized into crond')
    result['task']={**existing,'schedule':'20 4 * * *','serverTimezone':'Asia/Shanghai (UTC+08:00)','installedCronLine':lines[0],'script':'/www/wwwroot/hkbusgo/ops/backup.sh'}
    result['panelVersion']=getattr(public,'get_panel_version',lambda:'installed local build')()

destination=base/'shared/panel-registration.json';destination.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
os.chmod(str(destination),0o640);os.chown(str(destination),0,grp.getgrnam('hkbusgo').gr_gid)
print(json.dumps(result,ensure_ascii=False,indent=2))
