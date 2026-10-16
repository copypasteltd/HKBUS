import type { CapacitorConfig } from '@capacitor/cli';
const config:CapacitorConfig={appId:'hk.hkbusgo.app',appName:'港巴通',webDir:'dist/h5',android:{allowMixedContent:false},plugins:{SplashScreen:{launchShowDuration:0},LocalNotifications:{smallIcon:'ic_stat_hkbus',iconColor:'#B9533D'}}};
export default config;
