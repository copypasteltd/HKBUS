# 数据与验证 / Data and validation

## 中文

本项目实际服务仅接受 live。路线身份由路线号、方向和 service type 组成；KMB 目录完整校验后原子替换。主数据正常按 24 小时更新，失败保留前一版；初次缺失时不注入示例。

| 数据 | 来源与规则 |
|---|---|
| 路线 / 站点 / 完整站序 | KMB 官方 `route/`、`stop`、`route-stop` |
| 实时到站 | KMB `stop-eta/{stop_id}`，保留 null、官方资料时间、方向、服务类型和站序 |
| 道路交通 | TDAS `POST /tdas/api/route`，不作为巴士候车或车程 |
| 用户数据 | 匿名装置真实 API 操作写入 SQLite，不预填客户活动 |
| 通告 | 运营人员核实、审核并发布；不宣称完整官方通告流 |

ETA 默认缓存 15 秒，60 秒后较旧，180 秒后不可作为可用预计；提醒只评估新鲜资料。Mobile 目录缓存 24 小时、首页与 ETA 180 秒，回退标为上次查询；通告、通知、提醒不读离线缓存。API 地址隔离缓存与身份，删除使在途个人响应失效。固定天气和固定地区已移除；距离为直线距离，步行分钟按 75m/min 估算。站点位置为坐标示意，没有地图导航、票价、客流或车辆追踪数据。

首次切换真实数据版本会移除旧版未按 API 隔离的匿名会话和缓存，保留语言及大字偏好；没有跨账号或跨设备恢复功能。

2026-10-17 官方目录快照为 1,611 条方向/服务类型记录、6,774 个站点、36,367 条站序关系，数量随官方更新。`KMB:112:O:1` 验证为 23 站。这不是 1,611 个独立路线号。

上述数量对应较早的真实接入基线；本次截图重新同步了官方目录，最新截图数量见 `screenshots.json` 的 catalogue 字段。两次上游快照的站点数量可能不同，不回填成固定值。

验证严格区分：源码 / 类型检查、编译、实际 HTTP、浏览器、官方 IDE、物理设备、商店审核。既有真实数据基线为 Backend 22 项回归、Mobile 7 项回归、14 项真实 API/浏览器检查；分仓后检查见 `validation.json`。三个小程序官方 IDE、物理设备定位/分享/通知、商店上架和公网正式部署尚未验收。Android 采用 Taro H5 内嵌原生容器，并未新增独立 H5 demo。

2026-10-17 部署补充：Backend 已在 `43.160.221.28:39410` 提供公网服务，业务库由宝塔 SQLite 管理；56 项服务器和 17 项公网检查通过。TDAS 从该服务器出口得到官方 403，属于未解决阻塞；域名 HTTPS、IDE、真机与上架不由此完成。以 [正式部署记录](DEPLOYMENT.md) 区分本次结果与上述历史基线。

## English

The runtime accepts live data only. Route identity includes route number, direction and service type. The official KMB catalogue is validated and replaced atomically. Normal catalogue refresh is every 24 hours; failures retain the last complete version. An empty first run never injects samples.

| Data | Source and rule |
|---|---|
| Routes, stops, complete stop sequences | Official KMB `route/`, `stop`, `route-stop` endpoints |
| Arrivals | KMB `stop-eta/{stop_id}`; preserve null estimates, provider timestamps, direction, service type and sequence |
| Road traffic | TDAS `POST /tdas/api/route`; never present as bus waiting or journey time |
| Personal data | Actual anonymous-device API writes to SQLite; no seeded customer activity |
| Notices | Operator verification, review and publication; no claim of a complete official notice feed |

ETA defaults: 15-second cache, stale after 60 seconds, unavailable after 180 seconds. Reminders require fresh ETA. Mobile caches catalogues for 24 hours and home/arrivals for 180 seconds, labels offline fallback as previous results, and does not serve notices, notifications or reminders from offline cache. API addresses partition identity and cache; deletion invalidates in-flight personal responses. Fixed weather and location have been removed. Distances are straight-line estimates, walking time uses 75m/min, and the stop diagram is not navigation. Fares, crowding and vehicle positions are not invented.

The live-data upgrade clears legacy sessions and caches that lacked API partitioning, retains reading preferences, and creates a new anonymous profile. There is no account-based cross-device recovery.

The 2026-10-17 official snapshot contained 1,611 direction/service-type records, 6,774 stops and 36,367 sequence relationships. Route `KMB:112:O:1` had 23 stops. The first count is not a count of distinct route numbers; all counts may change.

These counts describe the earlier live-integration baseline. Screenshot capture synchronised again; its newer catalogue counts are recorded in `screenshots.json`. Differences between the two upstream snapshots are preserved rather than replaced with fixed values.

Verification layers are separate: source/types, compilation, real HTTP, browser, official IDE, physical device and store review. The preceding live-data baseline passed 22 Backend tests, 7 Mobile tests and 14 real API/browser checks. See `validation.json` for checks of these standalone checkouts. Mini-program IDE acceptance, physical-device location/sharing/notifications, store publication and production hosting remain outstanding. Android embeds the Taro renderer; this is not a newly deployed H5 demo.

Deployment addendum, 2026-10-17: the Backend is publicly reachable on `43.160.221.28:39410`, with BaoTa-managed SQLite. Server acceptance passed 56 checks and public-network acceptance passed 17 checks. TDAS is blocked by the official upstream's 403 from this server. Domain TLS, IDEs, devices and stores remain separate. See the [deployment record](DEPLOYMENT.md) for current results rather than interpreting historical baselines as current production acceptance.

## 官方资料 / Official references

- [KMB / LWB dataset](https://data.gov.hk/tc-data/dataset/hk-td-tis_21-etakmb)
- [TDAS API specification](https://tdas-api.hkemobility.gov.hk/tdas/specification/TD_TDAS_API_Specifications.pdf)

## 证据 / Evidence

- [Live API and browser baseline](evidence/live-validation.json)
- [Backend regression log](evidence/backend-tests.txt)
- [Mobile regression log](evidence/mobile-tests.txt)
- [Android Lint baseline: 0 errors, 23 warnings](evidence/android-lint-summary.json)
- [Current screenshot capture record](screenshots.json)
- [Standalone checkout validation](validation.json)
