const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist/h5'),port=Number(process.env.PORT||10087),backend=new URL(process.env.HKBUS_BACKEND||'http://127.0.0.1:4100');
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('Run npm run build:h5 first.');
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
http.createServer((request,response)=>{
 if(request.url.startsWith('/api/')){const upstream=http.request({hostname:backend.hostname,port:backend.port||80,path:request.url,method:request.method,headers:{...request.headers,host:backend.host}},result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'PROXY_UNAVAILABLE',message:'後端服務未啟動'}}));});request.pipe(upstream);return;}
 let target;try{target=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));}catch{response.writeHead(400);response.end();return;}
 if(target!==root&&!target.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
 if(fs.existsSync(target)&&fs.statSync(target).isDirectory())target=path.join(target,'index.html');
 if(!fs.existsSync(target)||!fs.statSync(target).isFile()){response.writeHead(404);response.end('Not found');return;}
 response.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});fs.createReadStream(target).pipe(response);
}).listen(port,'127.0.0.1',()=>console.log('Production H5 preview: http://127.0.0.1:'+port));
