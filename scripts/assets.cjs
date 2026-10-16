const {Resvg}=require('@resvg/resvg-js');
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),paths=require('../assets/sources/icons.json');
const colors={ink:'#163b63',teal:'#0c716e',muted:'#536b7d',white:'#ffffff',amber:'#f2b642',coral:'#e86d5d'};
const folder=path.join(root,'src/assets/icons');fs.mkdirSync(folder,{recursive:true});
for(const [name,shape]of Object.entries(paths))for(const [color,value]of Object.entries(colors)){
  const svg=`<svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="${value}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${shape}</svg>`;
  fs.writeFileSync(path.join(folder,`${name}-${color}.png`),new Resvg(svg).render().asPng());
}
const appSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#0c716e"/><g transform="translate(3.5 3.5) scale(.71)" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths.bus}</g></svg>`;
fs.mkdirSync(path.join(root,'resources'),{recursive:true});fs.writeFileSync(path.join(root,'resources/icon.png'),new Resvg(appSvg).render().asPng());
console.log(`Generated ${Object.keys(paths).length*Object.keys(colors).length} faithful PNG icons and app icon.`);
