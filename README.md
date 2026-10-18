# 港巴通 HKBusGo — 抖音小程序 / Douyin Mini Program

<!-- interactive-2026-10-18 -->
**2026-10-18 常用出行扩展 / Interactive travel extensions:** 常用行程（12 条）、精确站序候车看板（6 项）、直达/转乘和已核实票价筛选、三方案比较已上线；16 页、三语、大字、本机保存，无乘客账号。四端各 44 项测试及目标编译通过。 / Regular journeys, exact-stop live waiting board, journey filters and comparison are live. Preferences and travel collections stay on this device. Each client passed 44 tests and its target build. [需求与验收 / Requirements and acceptance](docs/INTERACTIVE-EXTENSIONS.md) · [实际网站 / Live website](https://hkbus.copypaste.hk/)。以下较早记录为历史快照 / Earlier entries are historical snapshots.

<img src="docs/assets/interactive-expansion/2026-10-18/waiting-board.png" width="220" alt="Actual website waiting board with official predictions" /> <img src="docs/assets/interactive-expansion/2026-10-18/journey-comparison.png" width="220" alt="Comparison of real journey options" />
<!-- /interactive-2026-10-18 -->

<!-- fares-2026-10-18 -->
**2026-10-18 官方收费 / Official fares:** 路线分段查价、逐站至终点金额、行程逐段/合计和管理后台收费同步已发布。金额来自运输署官方 XML，普通成人单程、未计优惠；未核实不当作零。完整/部分/未映射方向：1150/17/444。本机喜好继续无需账号。 / Official stop-specific fares, journey totals and operations sync are live. Missing prices stay unverified; preferences stay on this device. [需求及验收 / Requirements and acceptance](docs/FARES-INTEGRATION.md) · [打开网站 / Open website](https://hkbus.copypaste.hk/)。以下较早记录为历史快照 / Earlier entries are historical snapshots.

<img src="docs/assets/fares/2026-10-18/fare-route-section.png" width="220" alt="Official section fare on the actual passenger website" /> <img src="docs/assets/fares/2026-10-18/fare-unverified.png" width="220" alt="An explicitly unverified fare on a real service" />
<!-- /fares-2026-10-18 -->

<!-- design-refinement-2026-10-17 -->
**2026-10-17 页面与内容更新 / Passenger UI refinement:** 14 页保持 Accessible Calm Minimal，新增首页任务/收藏/继续查看、路线与站序筛选、收藏站行程选择和八个三语指南。本机资料无需账号；真实公交与 TDAS API 保持接入。四端各 26 项测试、类型检查与构建，实际网站 11 组功能 + 13 组本机回归通过。 / All 14 passenger pages have been refined with real transit data, local-only preferences and contextual guides. Four builds and actual website acceptance passed. [完整规格与验收 / Specification and acceptance](docs/DESIGN-REFINEMENT.md) · [打开正式网站 / Open HKBusGo](https://hkbus.copypaste.hk/)。以下同日较早发布记录保留为历史快照 / Earlier records below are historical snapshots.

<img src="docs/assets/design-refinement/2026-10-17/after-home-empty.png" width="220" alt="Refined first-visit home on the actual website" /> <img src="docs/assets/design-refinement/2026-10-17/route-hong-kong-clock.png" width="220" alt="Real route predictions on the refined actual website" />
<!-- /design-refinement-2026-10-17 -->

**2026-10-17 本机喜好更新 / On-device preferences:** 乘客端无需账号，语言、大字、分钟/香港时刻、首页车站、提醒阈值和历史开关即改即存；收藏、历史与提醒统一前端本机保存。真实公交 API 保持使用，旧匿名服务端资料仅兼容保留。 / Passenger preferences, favourites, history and reminders now stay on the current device without creating a server profile. Transit remains live. [需求、迁移与验收 / Requirements and acceptance](docs/LOCAL-PREFERENCES.md) · [打开实际网站 / Open actual website](https://hkbus.copypaste.hk/)。

<img src="docs/assets/local-preferences/2026-10-17/settings-reading-and-journeys.png" width="220" alt="On-device settings on the actual HKBusGo website" /> <img src="docs/assets/local-preferences/2026-10-17/home-saved-stop-clock.png" width="220" alt="A saved home stop with live Hong Kong arrival times" />

**2026-10-17 实际网站已更新 / Actual website updated:** [打开港巴通 / Open HKBusGo](https://hkbus.copypaste.hk/) · [正式发布与验收 / Release and acceptance](docs/H5-SITE-LIVE.md)。线路详情已显示真实逐站 ETA、未来班次和香港时刻；245 个公网文件、14 页加载及 11 组线上浏览器检查通过。后续实际前端更新将按用户授权同步对应服务器路径。 / Real route arrivals are now published; future frontend updates are authorized to deploy after verification.

<img src="docs/assets/h5-deployment/2026-10-17/h5-published-home.png" width="220" alt="Actual published HKBusGo home" /> <img src="docs/assets/h5-deployment/2026-10-17/h5-route-upcoming.png" width="220" alt="Actual public website with real station predictions" />

**2026-10-17 线路到站更新 / Live route arrivals:** [缺口检查、修复与验收 / Audit, fix and acceptance](docs/ROUTE-ARRIVALS.md)。各站 ETA、未来三班、香港时刻、官方备注、方向与站序隔离已补齐；首页/站点倒计时与前台刷新同步修复。 / Route details now show real station predictions, upcoming buses, Hong Kong times and official remarks, with direction/service/sequence isolation and foreground refresh.

共享实际页面的浏览器渲染 / Browser rendering of shared real UI；不是小程序官方 IDE 或真机截图 / These are not official mini-program IDE or physical-device screenshots.

<img src="docs/assets/route-arrivals/2026-10-17/h5-route-upcoming.png" width="240" alt="Real route arrival predictions" /> <img src="docs/assets/route-arrivals/2026-10-17/h5-route-320-en.png" width="210" alt="320px large-text layout" />


**最新数据通达 / Current data status · 2026-10-17:** [真实 TDAS 修复、正式 Admin 和完整验收 / Live-data and Admin handover](docs/DATA-REACHABILITY.md)。正式 API 与 Admin 已通过实际 HTTPS 和浏览器检查；旧部署记录保留作历史快照。Production TDAS and the published Admin passed live acceptance; earlier reports are historical snapshots.

**正式 API / Finalized API:** `https://hkbus-api.copypaste.hk/api/` · [2026-10-17 编译与交付 / Build and delivery](docs/PRODUCTION-API.md)
![HKBusGo Douyin Mini Program](docs/assets/banner-douyin.png)

[中文说明](#中文说明) · [English](#english) · [完整图册 / Gallery](docs/GALLERY.md) · [数据与验证 / Data & validation](docs/DATA-AND-VALIDATION.md)

[总览 / Index](https://github.com/copypasteltd/HKBUS/tree/main) · [Backend](https://github.com/copypasteltd/HKBUS/tree/backend) · [Admin](https://github.com/copypasteltd/HKBUS/tree/admin) · [微信 / WeChat](https://github.com/copypasteltd/HKBUS/tree/wechat) · [支付宝 / Alipay](https://github.com/copypasteltd/HKBUS/tree/alipay) · [抖音 / Douyin](https://github.com/copypasteltd/HKBUS/tree/douyin) · [Android](https://github.com/copypasteltd/HKBUS/tree/android)

> `douyin` · Taro 4.3 · React 18 · TypeScript · Live KMB/LWB + TDAS · Accessible Calm Minimal

**品牌 / Brand：已确认 10 号「朱印车迹」纯图形 Logo / Approved option 10, graphic only.** [品牌规范 / Brand guide](docs/BRAND.md) · [本次品牌验证 / Current brand checks](docs/BRAND-ROLLOUT.md)

## 中文说明

这是港巴通 **抖音小程序** 的独立 Git 工程。完整 Taro 源码、图标、测试、配置及锁文件均在本分支内；不引用其他分支的本地目录、不依赖子模块，也不需要克隆共享 Mobile 工程。独立仓库不代表离线后端：运行时仍需要 `backend` 分支的 API。

### 产品与页面

面向香港 KMB／LWB 客户，采用暖白、深蓝和青绿的 Accessible Calm Minimal 设计。支持繁体中文、简体中文、English、大字偏好和明确的数据新鲜度。

| 功能域 | 实际行为 |
|---|---|
| 发现与查询 | 首页下一班、真实路线目录、三语搜索、附近站点、方向/服务类型、完整站序、30 秒可见页面刷新 |
| 到站状态 | 官方 ETA、暂无预计、较旧、上游失败、上次查询资料；不生成天气或固定分钟 |
| 个人功能 | 本机偏好、收藏/别名/排序、最近查看开关、本机到站提醒、重设偏好/清除资料 |
| 内容与帮助 | 运营核实的通告及详情、覆盖范围、隐私、数据来源；空内容如实显示 |
| 出行参考 | 真实站序产生直达/一次同站换乘候选；TDAS 独立道路查询，不生成票价或巴士车程 |

共 14 页：Home、Routes、Search、Nearby、Arrivals、Route detail、Bookmarks、Settings、Notices、Notice detail、Help、Reminders、Planner、Traffic。

### 截图与图册

下面是实际 Taro 界面的浏览器截图，**不是 抖音小程序官方 IDE 或真机截图**。三个小程序采用共用界面作为参考；原生能力验收另记。附近定位采用官方站点坐标作为浏览器测试输入。

| 首页 / Home | 实时到站 / Arrivals | 收藏 / Bookmarks |
|---|---|---|
| <img src="docs/assets/mobile-home.png" width="230" alt="Home"> | <img src="docs/assets/mobile-arrivals.png" width="230" alt="Arrivals"> | <img src="docs/assets/mobile-bookmarks.png" width="230" alt="Bookmarks"> |

![14-page overview](docs/assets/mobile-pages.jpg)

完整的 14 页、提醒编辑器、后台截图和素材来源见 [图册](docs/GALLERY.md)与 [素材说明](docs/ASSETS.md)。通告为空、详情不可用和深夜 ETA 暂无预计均保留真实状态。

### 独立克隆与快速开始

```powershell
git clone --branch douyin --single-branch git@github.com:copypasteltd/HKBUS.git hkbusgo-douyin
cd hkbusgo-douyin
npm ci
npm run typecheck
npm test
# 默认已连接正式 HTTPS API；可在构建前显式覆盖。
$env:TARO_APP_API_BASE='https://hkbus-api.copypaste.hk/api'
npm run build
```

要求 Node.js 22.14+、npm 10 与原生 Windows 工具。构建产物：`dist/tt`。`TARO_APP_API_BASE` 在**构建前**设置，修改后重新编译；默认地址及 `.env.example` 均使用已定稿的正式 API，不包含凭证。当前正式后端已同步真实 KMB/LWB 主数据。

### 抖音小程序平台配置

使用 **抖音开发者工具 / Douyin DevTools** 导入 `dist/tt`。先在本机完成 `npm run build`，然后配置你持有的真实 AppID、HTTPS request 合法域名、定位权限/隐私说明、原生分享和平台审核。微信配置中的 `touristappid`、抖音空 AppID 都是本机编译占位，不能作为发行身份；支付宝在 IDE 中关联 AppID。

默认 API 已定稿为 `https://hkbus-api.copypaste.hk/api/`。在平台管理台登记 request 合法域名 `https://hkbus-api.copypaste.hk`，保留域名校验。编译不等于官方 IDE 或真机通过。


### 目录与命令

| 目录 / 命令 | 作用 |
|---|---|
| `src/pages/`、`src/screens/` | Taro 页面入口及业务界面 |
| `src/services/`、`src/state.tsx` | 真实 API、缓存/身份隔离、平台能力、状态 |
| `src/assets/` | 随源码交付的本地图标 |
| `config/index.ts` | 本端编译及 API 常量 |
| `test/` | 缓存、来源与会话竞态回归 |
| `docs/` | 双语数据说明、完整图册、构建/截图证据 |
| `npm run dev` | 本端开发构建/监听；不是部署 |
| `npm run build` | 本端默认编译 |
| `npm run typecheck` / `npm test` | 类型检查及 7 项客户端回归 |
| `npm run assets` | 重新生成图标 |

![Architecture](docs/assets/architecture.png)

### 数据、验收与故障定位

只接受 live envelope，拒绝 fixture 内容。公共缓存按 API 隔离，目录 24h、首页/ETA 180s；带精确定位的请求不持久缓存，通告需重新查询。偏好/收藏/历史/提醒使用版本化本机仓储，离线可编辑已有资料；没有新鲜 ETA 时不触发提醒。完整清除后在途旧操作不能恢复个人资料。详见 [完整数据与验证规则](docs/DATA-AND-VALIDATION.md)。

检查结果见 [本分支验证](docs/validation.json)。源码/类型、编译、实际 API、浏览器、官方 IDE、真机和商店审核分开记录。正式 HTTPS API 与本次编译已实测；官方 IDE、真机和商店发行仍须独立验收。

| 现象 | 排查 |
|---|---|
| 首页没有下一班 | 授权定位或收藏真实站点；无位置不任意预选车站 |
| 请求失败 | 检查 API、Backend、网络和平台域名；个人设置不依赖登录会话 |
| 无预计 / 较旧 | 对照官方 ETA 与资料时间；这可能是正常服务状态 |
| 无通告 | 当前没有经核实且有效的已发布内容；仍应查运营商消息 |
| 提醒未出现 | 页面是否开启、提醒有效期、方向、门槛、新鲜 ETA；Android 还需 OS 权限 |

独立分支包含共享代码的一份完整快照，没有自动跨分支更新。修改 API 契约/共用逻辑后，应将相关改动同步到其他移动端并分别编译；维护记录以各分支提交与验证为准。仓库不包含本机数据库、`.env.local`、密钥、keystore 或 `node_modules`。

## English

This is the self-contained **Douyin Mini Program** Git checkout for HKBusGo. Taro sources, icons, tests, configuration and the lockfile are included. There are no sibling-checkout imports or submodules. You do not need a shared Mobile checkout to build it. Runtime data still requires the API from the `backend` branch.

### Product and feature scope

HKBusGo serves Hong Kong KMB/LWB users with the Accessible Calm Minimal warm-white, navy and teal design. It supports Traditional Chinese, Simplified Chinese, English, large-text preferences and explicit freshness states.

| Area | Behaviour |
|---|---|
| Discovery | Next bus, official route catalogue, multilingual search, nearby stops, direction/service type, complete sequences, 30-second refresh while visible |
| Arrivals | Real provider ETA, null estimates, stale/upstream-failure/previous-result states; no invented weather or countdowns |
| Personal | Anonymous-device bookmarks, aliases/order, recent history, deletion, reminders and notifications |
| Content | Operator-reviewed notices/details, coverage, privacy and data attribution; honest empty states |
| Planning | Direct/one-same-stop-transfer candidates from official sequences; separate TDAS road reference, without bus fares or duration predictions |

The 14 pages are Home, Routes, Search, Nearby, Arrivals, Route detail, Bookmarks, Settings, Notices, Notice detail, Help, Reminders, Planner and Traffic.

### Screenshots

The images above and the [complete gallery](docs/GALLERY.md) show the actual Taro renderer in a browser, **not Douyin Mini Program IDE or phone captures**. Native acceptance remains separate. Browser nearby-location input is an official stop coordinate, not physical GPS. Empty/unavailable notices and genuine night-time no-estimate states are preserved. See [asset provenance](docs/ASSETS.md).

### Clone and build

Clone only branch `douyin` with the PowerShell commands above, run `npm ci`, `npm run typecheck` and `npm test`, then `npm run build`. Use Node.js 22.14+, npm 10 and native Windows tooling. The default and `.env.example` now use the finalized `https://hkbus-api.copypaste.hk/api` endpoint. You may override `TARO_APP_API_BASE` before building; endpoint changes require rebuilding. The production Backend already holds the real official catalogue. Output: `dist/tt`.

### Douyin Mini Program platform configuration

Import `dist/tt` using **抖音开发者工具 / Douyin DevTools** after `npm run build`. Configure your actual AppID, HTTPS request-domain allowlist, location/privacy declarations and native sharing, then complete platform review. The WeChat `touristappid` and empty Douyin AppID are local compilation placeholders; Alipay associates its AppID in the IDE.

The default API is `https://hkbus-api.copypaste.hk/api/`. Register `https://hkbus-api.copypaste.hk` in the platform request-domain allowlist and keep domain validation enabled. Compilation is separate from official IDE and physical-device acceptance.


### Development layout

`src/pages` and `src/screens` implement page entry points and UI. `src/services` and `src/state.tsx` implement public API transport, versioned on-device personal storage, endpoint-partitioned query cache and platform capabilities. Icons are local in `src/assets`. `config/index.ts` controls compilation. `test` contains meaningful client data-policy/transport regression cases. `docs` contains bilingual guidance, screenshots and evidence.

`npm run dev` watches this platform, `npm run build` produces its deliverable, `npm run typecheck` checks types, `npm test` runs 7 client regression cases, and `npm run assets` regenerates icons. None of these commands deploys a demo.

### Data, validation and troubleshooting

Only live envelopes are accepted; fixture entities are rejected. Public query caches are partitioned by API endpoint: catalogue 24h and home/ETA 180s. Coordinate-bearing requests are not persisted and notices are fetched again. Personal preferences, favourites, history and reminders use versioned local storage. Existing saved items can be edited offline, but reminders require fresh ETA. Clearing personal data invalidates old asynchronous writes. See [data rules](docs/DATA-AND-VALIDATION.md) and [this checkout's validation](docs/validation.json).

If home has no next bus, provide location or save an official stop; the app does not choose an arbitrary location. For network failures, check the endpoint, running Backend and platform domain policy. Personal settings do not need a login session. Null or stale ETA may reflect the actual service. No notices means no currently published verified content, not that all Hong Kong routes are unaffected. Reminders require an open foreground page, matching route/direction/service/stop/sequence/threshold and fresh ETA; Android system notifications also require OS permission.

Source/types, build, real API, browser, official IDE, physical-device and store acceptance are separate. The production HTTPS API and these builds were checked; native IDE/device acceptance and store publication remain separate. Each branch contains a full shared-code snapshot, without automatic cross-branch updates. Port common API/logic changes to the other mobile branches and validate each. Local databases, `.env.local`, credentials, signing keys and `node_modules` are excluded from Git.
