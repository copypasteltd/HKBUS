import type {FareQuote,Locale} from './types';
export function fareAmount(cents:number|null|undefined){return cents!==null&&cents!==undefined&&Number.isSafeInteger(cents)&&cents>=0?'HK$'+(cents/100).toFixed(2):'—';}
const reasonText:Record<string,[string,string,string]>={
 NOT_SYNCED:['官方收費資料尚未就緒','官方收费数据尚未就绪','Official fare data is not ready'],
 ROUTE_UNMATCHED:['此服務尚未核實收費對應','此服务尚未核实收费对应','Fare mapping for this service is unverified'],
 ROUTE_AMBIGUOUS:['多個官方服務相近，車費尚待核實','多个官方服务相近，票价有待核实','Several official services match; the fare is unverified'],
 CATALOG_CHANGED:['站序已更新，收費對應正重新核對','站序已更新，收费对应正重新核对','The stop sequence changed; fare mapping needs rechecking'],
 STOP_UNMAPPED:['所選車站未能核實分段收費','所选车站未能核实分段收费','Section fare for the selected stop is unverified'],
 PICKUP_NOT_ALLOWED:['所選上車站僅供下車','所选上车站仅供下车','The selected boarding stop is drop-off only'],
 DROPOFF_NOT_ALLOWED:['所選下車站僅供上車','所选下车站仅供上车','The selected alighting stop is pick-up only'],
 NO_FARE:['官方未提供這一段的車費','官方未提供这一段的票价','No official fare is provided for this section'],
 CONDITIONAL:['車費依適用日而定，請核對下列條件','票价依适用日而定，请核对以下条件','Fares depend on the applicable day; check the conditions below'],
 STALE_SOURCE:['收費資料較舊，請向營辦商再次確認','收费数据较旧，请向营办商再次确认','Fare data is stale; confirm with the operator']
};
export function fareReason(quote:FareQuote|undefined|null,locale:Locale){const value=reasonText[quote?.reason||'NO_FARE']||reasonText.NO_FARE;return value[locale==='tc'?0:locale==='sc'?1:2];}
const dayText:Record<number,[string,string,string]>={31:['週一至五，公眾及學校假期除外','周一至五，公众及学校假期除外','Mon–Fri, excluding public and school holidays'],63:['週一至六，公眾及學校假期除外','周一至六，公众及学校假期除外','Mon–Sat, excluding public and school holidays'],266:['週二、四，公眾假期除外','周二、四，公众假期除外','Tue and Thu, excluding public holidays'],271:['週一至四，公眾假期除外','周一至四，公众假期除外','Mon–Thu, excluding public holidays'],272:['週五，公眾假期除外','周五，公众假期除外','Fri, excluding public holidays'],287:['週一至五，公眾假期除外','周一至五，公众假期除外','Mon–Fri, excluding public holidays'],288:['週六，公眾假期除外','周六，公众假期除外','Sat, excluding public holidays'],319:['週一至六，公眾假期除外','周一至六，公众假期除外','Mon–Sat, excluding public holidays'],320:['週日，公眾假期除外','周日，公众假期除外','Sun, excluding public holidays'],415:['週一至五','周一至五','Mon–Fri'],416:['週六及公眾假期','周六及公众假期','Sat and public holidays'],447:['週一至六','周一至六','Mon–Sat'],448:['週日及公眾假期','周日及公众假期','Sun and public holidays'],480:['週六、日及公眾假期','周六、日及公众假期','Sat, Sun and public holidays'],511:['每天','每天','All days']};
export function fareDay(code:number|null,locale:Locale){const value=code===null?['官方未註明適用日','官方未注明适用日','Applicable days not specified']:dayText[code]||['適用日待核實','适用日待核实','Applicable days unverified'];return value[locale==='tc'?0:locale==='sc'?1:2];}
