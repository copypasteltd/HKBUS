import { names, now, type Route, type Stop, type Notice } from './domain.js';
import type { Store } from './database.js';

export const fixtureStops: Stop[] = [
  ['stop-times','銅鑼灣（時代廣場）','Causeway Bay (Times Square)',22.2784,114.1828],
  ['stop-central','中環','Central',22.2821,114.1581],
  ['stop-hennessy','軒尼詩道','Hennessy Road',22.2786,114.1802],
  ['stop-wan-chai','灣仔（北）','Wan Chai (North)',22.2833,114.1764],
  ['stop-kennedy','堅尼地城海傍','Kennedy Town Praya',22.2844,114.1284],
  ['stop-paterson','百德新街','Paterson Street',22.2807,114.1848]
].map(row => ({ id: String(row[0]), name: names(String(row[1]),String(row[2])), latitude: Number(row[3]), longitude: Number(row[4]), source: 'fixture' }));
const fixtureRouteInfo = [['112','蘇屋','So Uk','北角','North Point'],['2A','灣仔','Wan Chai','會展站','Exhibition Centre'],['6X','中環','Central','美孚','Mei Foo'],['102','筲箕灣','Shau Kei Wan','美孚','Mei Foo'],['116','慈雲山','Tsz Wan Shan','鰂魚涌','Quarry Bay']];
export const fixtureRoutes: Route[] = fixtureRouteInfo.flatMap(row => (['O','I'] as const).map(bound => ({ id: 'KMB:'+row[0]+':'+bound+':1', routeNo: row[0]!, bound, serviceType: '1', operator: 'KMB/LWB', origin: names(row[bound==='O'?1:3]!,row[bound==='O'?2:4]!), destination:names(row[bound==='O'?3:1]!,row[bound==='O'?4:2]!), source:'fixture' })));
const fixtureSequences: Record<string,string[]> = { '112':['stop-times','stop-paterson','stop-wan-chai','stop-central','stop-kennedy'], '2A':['stop-times','stop-hennessy','stop-wan-chai','stop-central'], '6X':['stop-central','stop-hennessy','stop-wan-chai'], '102':['stop-hennessy','stop-central','stop-kennedy'], '116':['stop-times','stop-paterson'] };
export function seedFixtures(store: Store) {
  if (!store.routes().length) store.saveCatalog(fixtureRoutes,fixtureStops,fixtureRoutes.flatMap(route => (route.bound==='O'?fixtureSequences[route.routeNo]!:fixtureSequences[route.routeNo]!.slice().reverse()).map((stopId,index)=>({ routeId:route.id,sequence:index+1,stopId }))));
  if (!store.notice('notice-roadwork')) {
    const notice: Notice = { id:'notice-roadwork',title:names('銅鑼灣部分路線臨時改道','Temporary diversion in Causeway Bay','铜锣湾部分路线临时改道'),body:names('因應道路工程，部分巴士路線可能改道。請留意站內告示及官方最新消息。本通告為開發演示內容。','Some routes may be diverted due to road works. Please check official updates. This notice is demonstration content.','因应道路工程，部分巴士路线可能改道。请留意站内告示及官方最新消息。本通告为开发演示内容。'),severity:'info',status:'published',validFrom:'2026-01-01T00:00:00.000Z',validUntil:'2030-01-01T00:00:00.000Z',routeIds:['KMB:112:O:1','KMB:116:O:1'],stopIds:['stop-times'],platforms:['weapp','alipay','tt','h5','android'],sourceUrl:'https://www.kmb.hk/',version:1,updatedAt:now(),updatedBy:'system'};
    store.saveNotice(notice,'system');
    store.saveNotice({...notice,id:'notice-service',title:names('出行前查閱最新到站資料','Check arrivals before travel','出行前查阅最新到站资料'),routeIds:['KMB:102:O:1'],stopIds:[],version:1},'system');
  }
}
export function seedSettings(store: Store) {
  if (!store.get('SELECT key FROM settings WHERE key=?','features')) store.setSetting('features',{reminders:true,traffic:true,planner:true,map:true});
  if (!store.get('SELECT key FROM settings WHERE key=?','freshness')) store.setSetting('freshness',{etaFreshSeconds:60,etaStaleSeconds:180,cacheSeconds:15});
  if (!store.get('SELECT key FROM settings WHERE key=?','content')) store.setSetting('content',{
    coverage:names('目前提供九巴 / 龍運到站查詢','KMB / LWB arrivals','目前提供九巴 / 龙运到站查询'),
    privacy:names('位置只用於尋找附近車站，不寫入查詢日誌。收藏和提醒屬於你的匿名裝置檔案，可在設定刪除。','Location is used only to find nearby stops and is not logged. Your anonymous device profile can be deleted in Settings.','位置只用于寻找附近车站，不写入查询日志。收藏和提醒属于你的匿名设备档案，可在设置删除。'),
    help:names('到站時間由營辦商提供；資料可能因道路及調度情況改變。拒絕定位仍可搜尋車站。','Arrival predictions come from the operator and may change. Search works without location permission.','到站时间由营办商提供；资料可能因道路及调度情况改变。拒绝定位仍可搜索车站。'),
    sourceUrl:'https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb',privacyUrl:'',supportEmail:'',maintenance:false
  });
}
