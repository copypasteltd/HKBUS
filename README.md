# 港巴通 HKBusGo — 项目与工程导航 / Project & Repository Guide

**正式 API / Finalized API:** `https://hkbus-api.copypaste.hk/api/` · [五端编译与 HTTPS 验证 / Builds and HTTPS verification](docs/PRODUCTION-API.md)
![HKBusGo Project & Repository Guide](docs/assets/banner-main.png)

[中文说明](#中文说明) · [English](#english) · [完整图册 / Gallery](docs/GALLERY.md) · [数据与验证 / Data & validation](docs/DATA-AND-VALIDATION.md)

[总览 / Index](https://github.com/copypasteltd/HKBUS/tree/main) · [Backend](https://github.com/copypasteltd/HKBUS/tree/backend) · [Admin](https://github.com/copypasteltd/HKBUS/tree/admin) · [微信 / WeChat](https://github.com/copypasteltd/HKBUS/tree/wechat) · [支付宝 / Alipay](https://github.com/copypasteltd/HKBUS/tree/alipay) · [抖音 / Douyin](https://github.com/copypasteltd/HKBUS/tree/douyin) · [Android](https://github.com/copypasteltd/HKBUS/tree/android)

> `main` · Accessible Calm Minimal · Live data · Live KMB/LWB + TDAS · Accessible Calm Minimal

**品牌 / Brand：已确认 10 号「朱印车迹」纯图形 Logo / Approved option 10, graphic only.** [品牌规范 / Brand guide](docs/BRAND.md) · [本次品牌验证 / Current brand checks](docs/BRAND-ROLLOUT.md)

**2026-10-17 后端部署 / Backend deployment：** 公网端口 `39410`；SQLite 已登记宝塔并建立每日一致性备份。56 项服务器检查和 17 项公网检查通过，TDAS 仍受官方 403 阻塞。Native Backend and BaoTa-managed SQLite are deployed; TDAS upstream access remains unresolved. [中英运维与验收 / Deployment handover](docs/DEPLOYMENT.md) · [在线 API / Live API docs](http://43.160.221.28:39410/api/docs/)

## 中文说明

港巴通（HKBusGo）是面向香港 KMB／LWB 客户的巴士查询产品，参考 SG Bus 的信息结构，采用已确认的 **Accessible Calm Minimal** 视觉。路线、站点、站序与 ETA 使用 KMB/LWB 官方数据；道路参考使用 TDAS。没有接口支撑的天气、票价、车辆追踪、客流不会补造。

### 六个独立工程

同一 GitHub 远程存储六条独立工程分支，每条分支根目录就是可独立安装/构建的源码仓库。本地各有自己的 `.git`，不依赖子模块、符号链接或工作区外源码；它们不是要合并到 main 的功能分支。`main` 只承载总览、图册和跨端契约。

| 工程 / Project | 分支 / Branch | 单独克隆 / Independent clone |
|---|---|---|
| 后端服务 / Backend API | [`backend`](https://github.com/copypasteltd/HKBUS/tree/backend) | `git clone --branch backend --single-branch git@github.com:copypasteltd/HKBUS.git hkbusgo-backend` |
| 运营管理后台 / Operations Admin | [`admin`](https://github.com/copypasteltd/HKBUS/tree/admin) | `git clone --branch admin --single-branch git@github.com:copypasteltd/HKBUS.git hkbusgo-admin` |
| 微信小程序 / WeChat Mini Program | [`wechat`](https://github.com/copypasteltd/HKBUS/tree/wechat) | `git clone --branch wechat --single-branch git@github.com:copypasteltd/HKBUS.git hkbusgo-wechat` |
| 支付宝小程序 / Alipay Mini Program | [`alipay`](https://github.com/copypasteltd/HKBUS/tree/alipay) | `git clone --branch alipay --single-branch git@github.com:copypasteltd/HKBUS.git hkbusgo-alipay` |
| 抖音小程序 / Douyin Mini Program | [`douyin`](https://github.com/copypasteltd/HKBUS/tree/douyin) | `git clone --branch douyin --single-branch git@github.com:copypasteltd/HKBUS.git hkbusgo-douyin` |
| Android 应用 / Android App | [`android`](https://github.com/copypasteltd/HKBUS/tree/android) | `git clone --branch android --single-branch git@github.com:copypasteltd/HKBUS.git hkbusgo-android` |

先启动 Backend，再运行 Admin 或一个移动端。移动端四个分支各自包含完整 Taro 共用代码快照和锁文件；Android 额外包含原生工程。共用逻辑/API 变更应跨四端同步并分别验证，没有自动跨分支合并机制。

在 main 克隆目录可执行 `pwsh -NoProfile -File scripts/clone-all.ps1 -Destination ../hkbusgo-workspace` 建立六个并列克隆；配置好 SDK/API 后，以 `pwsh -NoProfile -File scripts/build-all.ps1 -Workspace ../hkbusgo-workspace` 依序安装、检查和构建。脚本拒绝覆盖已有克隆，不负责部署。

### 产品截图

| 首页 / Home | 到站 / Arrivals | 道路 / Traffic |
|---|---|---|
| <img src="docs/assets/mobile-home.png" width="230" alt="Home"> | <img src="docs/assets/mobile-arrivals.png" width="230" alt="Arrivals"> | <img src="docs/assets/mobile-traffic.png" width="230" alt="TDAS"> |

![Mobile page overview](docs/assets/mobile-pages.jpg)

![Admin overview](docs/assets/admin-overview.png)

![Architecture](docs/assets/architecture.png)

截图为实际应用与真实 API 的浏览器结果；**不是小程序官方 IDE 或手机截图**。附近定位使用官方站点坐标作浏览器输入，后台流量仅为隔离文档检查请求。没有生成虚构通告或隐藏真实无预计状态。查看 [全部 14 页与后台图册](docs/GALLERY.md)、[图片来源](docs/ASSETS.md)。

### 功能与交付边界

四端包含首页、路线、搜索、附近、到站、完整站序、收藏、设置、通告、通知详情、帮助、提醒、行程、道路 14 页；支持繁中、简中、英文、大字、位置拒绝恢复、明确时效与匿名数据删除。Admin 提供真实目录、运营内容审核发布、功能配置、数据源、同步任务、审计和账号。Backend 提供事务持久化、官方适配、缓存隔离、身份和权限。

提醒仅在页面开启时接收，Android 可产生本地通知；不承诺关 App 后推送。行程为官方站序候选，步行为直线估算，地图为坐标示意；TDAS 不替代巴士 ETA。覆盖仅为 KMB/LWB。数据规则见 [Data & validation](docs/DATA-AND-VALIDATION.md)。

### 开始与验证

所有工程使用 Node.js 22.14+、npm 10、Windows 原生工具；Android 还需 JDK 21 和 SDK 36。各分支 README 提供安装、配置、构建、联调、故障定位和发行说明。默认接口为本机 4100，网络使用需要真实 HTTPS BFF；三个小程序需要各自 AppID/合法域名，Android 需要发行签名。

既有真实数据基线通过 29 项回归及 14 项真实 API/浏览器检查。分仓后 `npm ci`、类型、测试与各自构建结果见 [分仓验证](docs/validation.json)。编译、接口、浏览器、官方 IDE、真机、商店验收彼此不能替代；后三者仍未完成。Backend 高端口与宝塔数据库已部署，TDAS 上游和域名 HTTPS 等边界见 [本次部署记录](docs/DEPLOYMENT.md)。历史 demo、纯假数据原型及 Vercel 未修改或部署。

各工程固定提交与素材核查清单见 [repositories.json](docs/repositories.json)。

仓库不含本机环境、数据库、客户记录、令牌、keystore、node_modules 或构建缓存。文档不授予未经权利人确认的开源许可。

## English

HKBusGo is a Hong Kong KMB/LWB bus information product with a SG Bus-inspired information structure and the approved **Accessible Calm Minimal** visual direction. Official KMB/LWB data provides routes, stops, sequences and ETA; TDAS provides a separate road reference. Unsupported weather, fares, vehicle positions and crowding are not invented.

### Six independent projects

One GitHub remote stores six independent project branches. Each branch root is a complete installable/buildable project with its own local `.git`, without submodules, symlinks or external sibling source dependencies. These are project branches, not feature branches to merge into main. `main` contains the index, gallery and cross-platform contracts.

Use the branch table above to clone only the project you need. Start Backend first, then Admin or a mobile client. Each mobile branch includes its own complete Taro shared-code snapshot and lockfile; Android additionally includes the native project. Common logic/API changes must be ported and validated across all four; there is no automatic cross-branch merge.

From the main checkout, `pwsh -NoProfile -File scripts/clone-all.ps1 -Destination ../hkbusgo-workspace` creates six sibling clones. After configuring SDK/API values, `pwsh -NoProfile -File scripts/build-all.ps1 -Workspace ../hkbusgo-workspace` installs, checks and builds them sequentially. Existing clones are never overwritten. Neither script deploys services.

### Product, images and scope

The 14 mobile pages cover Home, Routes, Search, Nearby, Arrivals, Route detail, Bookmarks, Settings, Notices, Notice detail, Help, Reminders, Planner and Traffic. They support Traditional/Simplified Chinese and English, large text, location-denial recovery, freshness and anonymous-data deletion. Admin manages the real catalogue, reviewed content, configuration, providers, jobs, audit and accounts. Backend provides persistence, real adapters, partitioned caching, identity and permissions.

The screenshots above and [gallery](docs/GALLERY.md) show actual browser UI and real APIs, **not mini-program IDE or physical-device captures**. Browser location uses official stop coordinates as input. Admin metrics are isolated documentation traffic. Genuine empty notices and no-estimate states are preserved. See [provenance](docs/ASSETS.md).

Reminders are received while open; Android can issue local notifications, without promised closed-app push. Journey candidates derive from official sequences. Walking is a straight-line estimate, the stop diagram is not navigation, and TDAS is not bus ETA. Coverage remains KMB/LWB. See [data and validation](docs/DATA-AND-VALIDATION.md).

### Development and acceptance

Use Node.js 22.14+, npm 10 and native Windows tooling; Android also needs JDK 21 and SDK 36. Each branch README documents setup, configuration, build, integration, troubleshooting and release. The default endpoint is local port 4100; network use requires a real HTTPS BFF. Mini-programs need their own AppIDs/domain configuration, and Android needs release signing.

The preceding real-data baseline passed 29 regression and 14 real API/browser checks. Standalone installation, types, tests and builds are recorded in [validation.json](docs/validation.json). Source, build, API, browser, official IDE, physical-device and store acceptance are separate. Backend hosting and BaoTa SQLite are now deployed; TDAS access and domain TLS remain unresolved as documented in the [deployment handover](docs/DEPLOYMENT.md). IDE/device/store acceptance remains outstanding. Historical demos/prototypes/Vercel were not changed or deployed.

Pinned project commits and documentation checks are listed in [repositories.json](docs/repositories.json).

No local environments, databases, customer records, tokens, keystores, node_modules or build caches are committed. This documentation does not grant an unconfirmed open-source licence.
