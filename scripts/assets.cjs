const {Resvg}=require('@resvg/resvg-js');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),paths=require('../assets/sources/icons.json');
const colors={ink:'#163b63',teal:'#0c716e',muted:'#536b7d',white:'#ffffff',amber:'#f2b642',coral:'#e86d5d'};
const folder=path.join(root,'src/assets/icons');fs.mkdirSync(folder,{recursive:true});
for(const [name,shape]of Object.entries(paths))for(const [color,value]of Object.entries(colors)){
  const svg=`<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="${value}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${shape}</svg>`;
  fs.writeFileSync(path.join(folder,`${name}-${color}.png`),new Resvg(svg).render().asPng());
}
// The approved logo is a checked-in vector asset. Never regenerate a generic bus logo.
const logoSvg=fs.readFileSync(path.join(root,'assets/brand/logo-primary.svg'),'utf8');
const brandFolder=path.join(root,'src/assets/brand');fs.mkdirSync(brandFolder,{recursive:true});
for(const size of [64,128,256])fs.writeFileSync(path.join(brandFolder,`logo-${size}.png`),new Resvg(logoSvg,{fitTo:{mode:'width',value:size}}).render().asPng());
fs.writeFileSync(path.join(brandFolder,'favicon-32.png'),new Resvg(logoSvg,{fitTo:{mode:'width',value:32}}).render().asPng());
const appSvg=logoSvg.replace(/(<svg[^>]*>)/,'$1<path fill="#FFFFFF" d="M0 0H1024V1024H0Z"/>');
fs.mkdirSync(path.join(root,'resources'),{recursive:true});
for(const [size,file] of [[1024,'resources/icon.png'],[512,'resources/mini-program-avatar.png'],[192,'src/assets/brand/app-icon-192.png']])fs.writeFileSync(path.join(root,file),new Resvg(appSvg,{fitTo:{mode:'width',value:size}}).render().asPng());
console.log(`Generated ${Object.keys(paths).length*Object.keys(colors).length} UI PNG icons and approved #10 brand assets.`);
