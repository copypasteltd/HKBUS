const fs=require('node:fs');const path=require('node:path');const{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const release=process.argv.includes('--release');
const base=(process.env.TARO_APP_API_BASE||'https://hkbus-api.copypaste.hk/api').replace(/\/+$/,'');
if(release&&(!/^https:\/\//.test(base)||/example\.(com|invalid)|localhost|127\.0\.0\.1/.test(base)))throw new Error('Release requires a reachable HTTPS TARO_APP_API_BASE.');
if(release&&['HKBUS_KEYSTORE','HKBUS_STORE_PASSWORD','HKBUS_KEY_ALIAS','HKBUS_KEY_PASSWORD'].some(key=>!process.env[key]))throw new Error('Release requires HKBUS_KEYSTORE, HKBUS_STORE_PASSWORD, HKBUS_KEY_ALIAS and HKBUS_KEY_PASSWORD.');
const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk||!fs.existsSync(sdk))throw new Error('Set ANDROID_HOME to a native Android SDK installation.');
fs.writeFileSync(path.join(root,'android/local.properties'),'sdk.dir='+sdk.replace(/\\/g,'/').replace(/:/g,'\\:')+'\n');
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:root,env:{...process.env,TARO_APP_API_BASE:base},stdio:'inherit',shell:process.platform==='win32',...options});if(result.status!==0)process.exit(result.status||1);}
run('npm',['run','build:h5']);run('npx',['--no-install','cap','sync','android']);
run(process.platform==='win32'?'gradlew.bat':'./gradlew',[release?'assembleRelease':'assembleDebug','--no-daemon','--console=plain','--max-workers=2'],{cwd:path.join(root,'android')});
const variant=release?'release':'debug';const artifact=path.join(root,'android/app/build/outputs/apk',variant,'app-'+variant+'.apk');
if(!fs.existsSync(artifact))throw new Error('The Android build did not produce the expected APK.');
console.log('APK: '+artifact);
