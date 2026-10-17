/* Build the actual website on native Windows/Node, then optionally publish it. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const api='https://hkbus-api.copypaste.hk/api';
function trackedSources(){
  const names=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(name=>/^(src\/|config\/|scripts\/|test\/|package(?:-lock)?\.json$|babel\.config\.js$|tsconfig\.json$)/.test(name));
  return Object.fromEntries(names.sort().map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
}
function run(command,args){const result=spawnSync(command,args,{cwd:root,env:{...process.env,TARO_APP_API_BASE:api},stdio:'inherit',shell:process.platform==='win32'});if(result.status!==0)process.exit(result.status||1);}
const startedAt=new Date().toISOString(),sourceSha256=trackedSources(),sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
run('npm',['run','typecheck']);run('npm',['test']);run('npm',['run','build:h5']);
if(JSON.stringify(sourceSha256)!==JSON.stringify(trackedSources()))throw new Error('Source changed during release build. Rebuild before publishing.');
const dist=path.join(root,'dist/h5'),assets={};
function collect(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isSymbolicLink())throw new Error('Symlinks are not build artifacts.');if(item.isDirectory())collect(file);else assets[path.relative(dist,file).split(path.sep).join('/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}}
collect(dist);
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
if(!/\/css\/app\.[a-f0-9]{8}\.css/.test(html))throw new Error('Production CSS must have a content hash.');
const report={startedAt,finishedAt:new Date().toISOString(),sourceCommit,sourceSha256,apiBase:api+'/',assets,typecheck:true,tests:true,build:true,passed:true,physicalDevice:false,officialMiniProgramIDE:false};
fs.writeFileSync(path.join(root,'dist/h5-build.json'),JSON.stringify(report,null,2)+'\n');
console.log('Verified H5 files: '+Object.keys(assets).length);
if(process.argv.includes('--publish'))run(process.env.HKBUS_PYTHON||'python',['deploy/h5/publish-h5.py']);
