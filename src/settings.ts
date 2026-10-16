import { names } from './domain.js';
import type { Store } from './database.js';

// Product configuration is independent of transit data. No routes, arrivals or notices are seeded.
export function seedSettings(store: Store) {
  if (!store.get('SELECT key FROM settings WHERE key=?', 'features')) store.setSetting('features', {reminders:true,traffic:true,planner:true,map:true});
  if (!store.get('SELECT key FROM settings WHERE key=?', 'freshness')) store.setSetting('freshness', {etaFreshSeconds:60,etaStaleSeconds:180,cacheSeconds:15});
  if (!store.get('SELECT key FROM settings WHERE key=?', 'content')) store.setSetting('content', {
    coverage:names('目前提供九巴 / 龍運到站查詢','KMB / LWB arrivals','目前提供九巴 / 龙运到站查询'),
    privacy:names('位置只用於尋找附近車站，不寫入查詢日誌。收藏和提醒屬於你的匿名裝置檔案，可在設定刪除。','Location is used only to find nearby stops and is not logged. Your anonymous device profile can be deleted in Settings.','位置只用于寻找附近车站，不写入查询日志。收藏和提醒属于你的匿名设备档案，可在设置删除。'),
    help:names('到站預計來自 KMB / LWB 官方 API；道路行駛參考來自 TDAS。距離為直線距離，步行分鐘屬估算。服務通告由營運人員核實及發布，並非官方通告的完整清單。','Arrivals come from the KMB / LWB API; road references come from TDAS. Distances are straight-line estimates. Notices are verified and published by our operators, not a complete official feed.','到站预计来自 KMB / LWB 官方 API；道路行驶参考来自 TDAS。距离为直线距离，步行分钟属于估算。服务通告由运营人员核实及发布，并非官方通告的完整清单。'),
    sourceUrl:'https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb',privacyUrl:'',supportEmail:'',maintenance:false
  });
}
