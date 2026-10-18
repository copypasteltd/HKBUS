import { defineConfig } from '@tarojs/cli';
const target=process.env.TARO_ENV||'h5';
const apiBase=(process.env.TARO_APP_API_BASE||'https://hkbus-api.copypaste.hk/api').replace(/\/+$/,'');
export default defineConfig<'webpack5'>({
  projectName:'hkbusgo-alipay',date:'2026-10-16',designWidth:390,deviceRatio:{390:750/390,375:2,750:1},
  sourceRoot:'src',outputRoot:'dist/'+target,framework:'react',compiler:'webpack5',cache:{enable:false},
  defineConstants:{__API_BASE__:JSON.stringify(apiBase)},
  plugins:[],
  copy:{patterns:[{from:'src/assets',to:'dist/'+target+'/assets'},...(target==='h5'?['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs'].map(name=>({from:'node_modules/maplibre-gl/dist/'+name,to:'dist/h5/assets/maplibre/v6.15.0/'+name})).concat([{from:'node_modules/maplibre-gl/LICENSE.txt',to:'dist/h5/assets/maplibre/v6.15.0/LICENSE.txt'}]):[])],options:{}},
  mini:{postcss:{pxtransform:{enable:true,config:{}},cssModules:{enable:false}},miniCssExtractPluginOption:{ignoreOrder:true}},
  h5:{publicPath:'/',staticDirectory:'static',router:{mode:'hash'},devServer:{host:'127.0.0.1',port:10086,proxy:[{context:['/api'],target:'http://127.0.0.1:4100',changeOrigin:true}]},postcss:{pxtransform:{enable:true,config:{baseFontSize:20,minRootSize:1,maxRootSize:520/390*(20/(750/390)*2)}}},output:{filename:'js/[name].[contenthash:8].js',chunkFilename:'js/[name].[contenthash:8].js'},miniCssExtractPluginOption:{ignoreOrder:true}},
  terser:{enable:true,config:{compress:{drop_console:true}}}
});
