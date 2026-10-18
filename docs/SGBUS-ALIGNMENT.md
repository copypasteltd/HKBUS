# SG Bus 能力对齐 / Transit feature alignment

2026-10-19。真实公开公交资料，乘客喜好继续保存在客户端；不使用个人档案或令牌。 / Public transit metadata only. Passenger preferences remain on the client without profiles or tokens.

## 新增接口 / Added endpoints

所有路径以 `/api` 开头，成功响应为 `{data,meta}`。 / Paths start with `/api`; successful responses use `{data,meta}`.

| 路径 / Path | 内容 / Result |
| --- | --- |
| `GET /v1/routes/:id/reference` | 现行站序核验后的 WGS84 MultiLineString、总站发车时刻、班距、香港当天运行状态、途经道路索引 / Verified route geometry, origin departures, headways, Hong Kong service day and road index |
| `GET /v1/stops/:id/services` | 按方向、服务类型、每次经过的站序区分，空 ETA 不会删去服务 / Exact route, direction, service and repeated stop occurrence, independent of ETA |
| `GET /v1/stops/:id/arrivals` | 既有实时预报，附加上述 `services` / Existing real predictions plus the complete service list |
| `GET /v1/search?q=Nathan%20Rd&type=road` | 统一路线、车站和官方道路／站址检索，支持繁简、全半角、大小写和道路简称；精确命中优先 / Unified normalised search with exact matches ranked first |
| `GET /v1/roads/:id` | 已匹配的现行车站、途经路线及覆盖统计 / Verified current stops, routes and coverage |
| `GET /v1/reference/status` | 道路覆盖、时刻表缓存数、假期日历版本，明确 `vehiclePositions:false` / Coverage, timetable cache and calendar version; no vehicle GPS |

路线身份仍是 `KMB:线路:O或I:服务类型`；收藏具体服务使用 `{routeId,sequence}`，重复经过同一物理车站不得合并。 / Route identities remain `KMB:number:O|I:service`; selected favourites use `{routeId,sequence}` and preserve repeated occurrences.

## 来源与规则 / Sources and rules

- [九巴官网 / Official KMB website](https://search.kmb.hk/KMBWebSite/) 的公开 `getstops`、`getschedule`、`getallstops` 提供 HK80 道路几何、总站时刻和道路地址。逐站核对路线、方向、服务类型、数量、序号及坐标后才采用几何；官网末站 `Seq=999` 仅允许在最后一行。 / Official public geometry, timetables and locations are checked against every current stop. The operator's terminal sentinel is accepted only on the last row.
- 香港 HK80 → WGS84 采用已验证的地政总署七参数转换。道路地址通过站名和 40 米内位置匹配，排除歧义。未匹配资料不伪造。 / The verified LandsD transform and unambiguous name/location matching are used; absent geometry or addresses are not fabricated.
- [香港政府 1823 假期日历 / Government holiday calendar](https://www.1823.gov.hk/common/ical/en.json) 决定香港运行日。覆盖年份外、未知日别、旧时刻表均不宣布确定运营状态。跨午夜继承前一运行日。 / Calendar coverage, unknown day codes and stale timetables are explicit; overnight windows carry over from the previous service day.
- 时刻只适用于起点总站开出，不是中途站到站首末班；无实时 ETA 不能推断停运。 / Timetables describe origin departures, not intermediate-stop arrivals. Missing ETA never proves suspension.
- 原始文本保留，已识别时段才用于当天时间线；分段班距和指定发车分别表达。 / Original text is preserved; only understood time windows drive the timeline.
- 路线、道路缓存 24 小时；日历检查间隔 7 天。失败时路线缓存最多保留 7 天并标旧，日历最多 30 天；站序变化直接撤销旧路线几何。请求最多 4 个并发，等待队列有上限。 / Bounded caches and requests retain explicit stale status and invalidate changed stop sequences.

## 数据库及维护 / Database and operations

SQLite schema 3 只新增 `stop_places`、`roads`、`route_references` 公共元数据表，保留现有宝塔数据库、账号及配置。发布脚本为 `deploy/linux/update-sgbus-alignment.sh`：先备份，编译测试后切换版本，验证真实接口；失败回滚旧程序并恢复兼容的 schema 标记，保留所有既有业务数据。 / Schema 3 adds public metadata tables only. The deployment script backs up the BaoTa-managed database, verifies the release and restores the previous binary and compatible schema marker on failure without replacing business data.

自动测试包含名称归一化、方向和站序隔离、末站标记、坐标与几何核对、假日、午夜、未知日别、请求合并和失败降级。源码检查、Windows 编译、线上 API、浏览器、官方小程序 IDE 和真机验收各自记录，不互相替代。 / Tests cover matching, schedules, calendar boundaries and degraded sources. Source, builds, public API, browser, official IDE and device acceptance remain separate.
