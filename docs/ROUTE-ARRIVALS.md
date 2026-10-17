# 港巴通 · 线路实时到站检查与补齐 / Route arrival audit

检查日期：2026-10-17。范围为实际 Backend、微信、支付宝、抖音和 Android 中的 Taro 页面与 H5 构建产物。沿用 Accessible Calm Minimal 和 10 号图形 Logo。

用户反馈属实：原线路详情只有路线方向、站序、路线示意和跳转车站的入口，没有在线路详情内请求或展示实时到站。真实站点 ETA 接口与独立站点页已经存在；不能据此认定线路详情的实时到站功能已经完成。

## 源码检查发现

| 页面 / 功能 | 检查时的实际状态 | 本次处理 |
| --- | --- | --- |
| 线路列表、搜索 | 真实路线主数据；不展示 ETA | 保留列表定位，进入详情查看实时预测 |
| 线路详情 | 只获取 `/v1/routes/:id`，站点点击直接跳转；没有线路 ETA | 新增整线 ETA 接口，全部站点显示预测，单站展开查看未来班次 |
| 独立站点到站 | 已调用真实 `/v1/stops/:id/arrivals`，30 秒轮询 | 后续班次从 ETA 重新计算；同一物理站重复经过时按站序分组 |
| 首页下一班 | 有位置或选定收藏站时使用真实 ETA；每 30 秒更新 | 与站点页共用前台刷新和过期处理，后续分钟数不再使用固定的服务端快照 |
| 附近站点 | 真实站点坐标、途经路线与直线距离估算 | 不把距离估算或路线目录当作实时到站 |
| 乘车规划 | 路线关系查询；不保证包含实时候车时间 | 本次不改变规划语义 |
| TDAS 道路参考 | 独立真实道路接口 | 不参与巴士到站分钟数计算 |
| 实时车辆位置、车牌、车型、客流 | 已选数据源没有相应车辆定位或这些属性字段 | 不生成移动巴士图标、假位置或假车辆信息 |
| 到站提醒 | 既有后端评估与页面开启时接收 | 普通站点可由线路详情打开既有提醒表单；不承诺 App 关闭后的系统推送 |

涉及的实际客户端采用相同业务修复；`implementation/mobile` 的既有未提交内容保留，demo 和 `prototype/` 未调整或部署。

## 接口及数据关系

新增公开接口：`GET /api/v1/routes/:id/arrivals?force=true|false`。例如：

`https://hkbus-api.copypaste.hk/api/v1/routes/KMB%3A112%3AO%3A1/arrivals`

数据源为官方 `GET https://data.etabus.gov.hk/v1/transport/kmb/route-eta/{route}/{service_type}`。官方返回两种方向的 ETA，不包含站点 ID；后端必须按 `routeNo + bound + serviceType` 过滤，再用该方向的 `seq` 关联真实路线站序。循环线重复经过同一站点时，`stopId + stopSequence` 共同确定展示的站点，不合并不同站序。

响应 `data` 包括 `route`、带 `sequence` 的 `stops`、`arrivals`、`freshness` 和可选 `warning`。每条预测保留完整路线 ID、方向、服务类型、站点 ID、站序、官方班次顺序、ETA、三语目的地、官方备注和生成时刻。客户端不直接访问官方域名或携带任何服务端私钥。

| 规则 | 实现要求 |
| --- | --- |
| 请求量 | 一个页面一次整线请求；不对沿途每个站分别轮询 |
| 缓存 | 后端默认 15 秒共享缓存、相同请求合并；按官方源地址和完整路线身份隔离。上游 GET 使用所有用户共用的 15 秒时间段参数，约束官方 CDN 的长缓存 |
| 强制刷新 | `force=true` 绕过正常缓存，客户端以同一规范路径保存新结果；不重复发起两次刷新 |
| 失败降级 | 只允许最近的真实缓存，标记 stale 和 warning；超期返回明确错误 |
| 过期处理 | 默认超过 60 秒的数据不显示可用分钟预测，最近真实本机缓存最多 180 秒；不将旧数据持续标为实时 |
| 过站 | ETA 比当前时间早超过 60 秒的记录不再展示 |
| 空值 | 官方 `eta=null`、空集合、接口失败、初始加载分别表达；无预测不等于停驶 |
| 参数错误 | 未知路线 404，非法 `force` 422；没有站序时明确不可用 |
| 时间 | 分钟从 ETA 与当前时钟重新计算；绝对时刻固定为香港 HKT，不随用户设备时区改变 |

官方说明 ETA 大约每分钟更新；应用每 30 秒查询并不表示官方每 30 秒产生新预测。参见 [DATA.GOV.HK 官方数据集](https://data.gov.hk/en-data/dataset/hk-td-tis_21-etakmb) 和 [官方 API 规格](https://data.etabus.gov.hk/datagovhk/kmb_eta_api_specification.pdf)。

线上联调额外确认官方响应含 `Cache-Control: max-age=300`，请求端 `no-cache` 仍命中旧缓存；相同官方路径增加共享时间段参数后取得较新的原始响应。修复同时应用于线路 ETA 与既有站点 ETA，保留官方 `data_timestamp`，不改写时间来制造“实时”状态。即使请求成功，官方预测超过新鲜度阈值仍显示较旧。诊断原始记录见本次证据目录中的 `kmb-cache-diagnostic.jsonl`。

## 页面与交互

线路页保留路线号、目的地、服务类型和方向切换，在站序上方加入来源、最近更新时间和手动刷新。每个站显示下一班、其后预测摘要；点按展开未来最多三班的分钟数、HKT 时刻和官方备注，可进入本站全部路线或设置既有到站提醒。

首次展开起始站；切换方向重置选中站、示意图和提醒弹窗，避免展示上一个方向的预测。页面前台每 30 秒刷新一次，显示时钟每 10 秒更新；隐藏、卸载、H5 标签页隐藏或原生 App 退后台时暂停，恢复时重新查询。服务端返回较旧结果或网络失败时提供明显说明，失效的数字不继续倒数。

繁体、简体、英文共用逻辑；长站名换行，展开按钮与操作入口保留移动触控尺寸，小屏和大字模式单独验收。路线示意图表示站点关系，不表示车辆 GPS 位置。

## 验证与交付

| 验收层级 | 结果与证据 |
| --- | --- |
| 源码审查 | 原线路页缺少 ETA 调用和展示；线上旧接口实测 404，见 [修复前接口](assets/route-arrivals/2026-10-17/before-api.json) |
| Windows 原生测试和编译 | Backend 38 项测试加 3 项出口测试通过；四个客户端各 10 项测试、类型检查和平台编译通过，见 [构建记录](assets/route-arrivals/2026-10-17/builds.json) |
| 线上实际 API | 27 项通过：112、48X、A31 双向，11 回程服务类型 2，缓存、CORS、404/422、旧站点接口；60 条记录的 ETA、生成时刻、目的地、备注与当前官方响应逐项一致，见 [真实 HTTP 检查](assets/route-arrivals/2026-10-17/http.json) |
| 浏览器渲染与交互 | 14 项分组检查通过：H5 和 Android 渲染层各核对 112 全线 23 个站；班次展开、方向替换、30 秒自动刷新、离页停止轮询、模拟断网后的真实缓存降级与联网恢复、320px 大字简体/英文；无脚本错误或资源缺失，见 [浏览器检查](assets/route-arrivals/2026-10-17/browser.json) |
| 浏览器网络及清理 | 真正的公网 HTTPS API，TLS 校验开启，无 API 结果替换；为解决本机 CDN 路由问题，仅本次测试通过自有香港服务器转送加密连接，未改系统代理或 DNS。测试浏览器、所有检查页面、临时监听及 SSH 均关闭，两条测试用户记录删除，见 [网络与清理](assets/route-arrivals/2026-10-17/browser-network.json) |
| Android 包体 | Debug 签名验证通过；APK 内 245 个渲染文件与受测 H5 构建逐个 SHA-256 相同，见 [产物验证](assets/route-arrivals/2026-10-17/artifacts.json) |
| 官方 IDE / 真机 / 上架 | 本次未执行；不能用上述编译或浏览器结果替代。小程序需实际 AppID 与 request 合法域名，Android 交付 Debug 签名；iOS 未构建 |

正式后端运行版本为 `eabd6a04f0f84dbaebe584b2220d630851747fe4`，发布到 `20261017T112442Z-eabd6a04f0f8`，端口 **39410**。数据库与私密环境未替换；发布前宝塔管理的既有一致性备份完成，完整性和恢复读取正常。最终回读服务已启动并启用开机运行，SQLite 完整性正常、外键错误为零，仍为 1611 条路线方向/服务身份、6775 个站点、36377 条站序关系，原有两条用户资料保留。真实 TDAS 道路查询和 Admin 网站亦正常，最终健康为 healthy。见 [发布](assets/route-arrivals/2026-10-17/deployment.json) 与 [最终运维回读](assets/route-arrivals/2026-10-17/final-audit.json)。

实际网络边界：自有服务器上 Python 默认 urllib 请求曾被 CDN 以 1010 拒绝；HTTP 验证使用正常 TLS 的 curl，页面验证使用 Chrome。未修改 CDN 规则。小程序 IDE / 真机网络访问仍须单独验证。`*-initial.json`、`*-selector-initial.json` 和诊断日志保留前期失败：最初上游缓存过旧、Python 请求被拒，以及测试脚本错误地匹配 Taro 保留的隐藏页面；不作为最终通过记录。

### 页面截图

以下是新编译实际页面使用线上真实数据的浏览器截图；Android 图为其打包渲染层，非真机截图。

| 线路班次细节 | 320px 英文大字 |
| --- | --- |
| ![真实班次与备注](assets/route-arrivals/2026-10-17/h5-route-upcoming.png) | ![小屏英文大字](assets/route-arrivals/2026-10-17/android-renderer-route-320-en.png) |

[离线降级截图](assets/route-arrivals/2026-10-17/h5-route-offline.png) · [完整截图与交互记录](assets/route-arrivals/2026-10-17/browser.json)。

### 新编译产物与使用

产物目录为 `output/route-arrivals-2026-10-17/`，完整交付包名为 `hkbusgo-route-arrivals-handover.zip`。旧编译包不包含这次新增页面；需要替换对应产物。

| 目标 | 新文件 | 使用方式 |
| --- | --- | --- |
| 微信 | `hkbusgo-wechat-dist.zip` | 解压，在微信官方 IDE 导入 app.json 所在目录 |
| 支付宝 | `hkbusgo-alipay-dist.zip` | 解压，在支付宝官方 IDE 关联实际 AppID |
| 抖音 | `hkbusgo-douyin-dist.zip` | 解压，在抖音官方 IDE 导入 |
| H5 | `hkbusgo-h5-dist.zip`、`h5/dist/` | 全部文件交给 HTTP(S) 静态服务，根入口 `/#/pages/home/index`；本次导出，不发布网站 |
| Android | `hkbusgo-android-debug.apk` | 使用 Android 真机安装验证；Debug APK 不等同正式签名上架包 |

所有新包使用 `https://hkbus-api.copypaste.hk/api/`。小程序 request 域名为 `https://hkbus-api.copypaste.hk`，保留合法域名校验。各包文件哈希见 [产物清单](assets/route-arrivals/2026-10-17/artifacts.json)。Backend 发布脚本与只读 HTTPS 验证脚本位于独立 Backend 的 `deploy/linux/`；离线 OpenAPI 已重新生成，共 54 个操作，含整线 ETA 查询。

实际独立仓库对应 [wechat](https://github.com/copypasteltd/HKBUS/tree/wechat)、[alipay](https://github.com/copypasteltd/HKBUS/tree/alipay)、[douyin](https://github.com/copypasteltd/HKBUS/tree/douyin)、[android](https://github.com/copypasteltd/HKBUS/tree/android)、[backend](https://github.com/copypasteltd/HKBUS/tree/backend)；后台与主导航分支同步文档。运行源码版本与最终文档提交分别记录，不混作一个版本。

## English

The reported gap was real: route details previously displayed directions and the stop sequence, then navigated to the existing live stop-arrivals page. The route page itself did not request or display ETA.

The implementation adds `GET /api/v1/routes/:id/arrivals`, backed by the official KMB route-ETA endpoint. Filtering uses the complete route/direction/service identity and joins the official sequence to the live catalogue. Repeated visits to one physical stop remain separate. A single whole-route request serves the page, with server caching and request coalescing.

Each stop shows its next prediction and can expand to three upcoming predictions, Hong Kong times and official remarks. The page supports manual refresh, visible-page polling, stale/error/empty states and three languages. Home and stop pages now recalculate subsequent minutes from ETA and use the same foreground refresh lifecycle. No vehicle GPS locations or unsupported attributes are invented.

Compilation, public HTTPS tests and browser checks are recorded separately from official mini-program IDE, physical-device and store acceptance. The independent projects are the source of the shipped builds; existing integration-workspace edits and demo content remain untouched.


The completed checks comprise 41 backend/egress tests, 10 tests per client, native platform builds, 27 public HTTPS checks and 14 browser groups. Sixty normalized ETA records match the current official payload field by field. Browser tests use real public API traffic with validated TLS and verify direction changes, station predictions, polling, offline recovery and 320px large-text layouts. Both owned test profiles, all created browser contexts and the temporary network listener were removed or closed.

The official ETA CDN advertises a five-minute cache and was observed ignoring request `no-cache`. Upstream ETA URLs now use a shared 15-second time slot while preserving the original provider timestamps and stale rules. This applies to both route and stop ETA. The original stale result and test-harness failures remain in the evidence history.

Production runs commit `eabd6a04f0f84dbaebe584b2220d630851747fe4` on port 39410. Existing database and credentials remain in place; the final database integrity check, real TDAS smoke and Admin availability passed. The newly exported files cover WeChat, Alipay, Douyin, real H5 and Android Debug. Existing old client packages must be replaced. No H5 website was published, and official IDE/device/store acceptance remains outstanding. Python urllib's default request was rejected by the CDN; public HTTP checks used curl and UI checks used Chrome without changing CDN rules.
