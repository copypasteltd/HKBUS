import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{proxy:{'/api':{target:process.env.ADMIN_API_PROXY||'http://127.0.0.1:4100',changeOrigin:true}}},preview:{proxy:{'/api':{target:process.env.ADMIN_API_PROXY||'http://127.0.0.1:4100',changeOrigin:true}}},build:{sourcemap:false,target:'es2020'}});
