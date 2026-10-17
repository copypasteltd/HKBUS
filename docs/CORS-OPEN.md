# 任意来源跨域 / Any-origin CORS · 2026-10-17

**后续更新 / Superseding update:** 本文保留此前阶段的验收事实。当前正式 TDAS 与 Admin 的状态、证据和限制见 [数据通达交付 / Current live-data handover](DATA-REACHABILITY.md)。

本次按用户要求将实际 Backend 的跨域策略改为接受任意来源。正式 API 为 `https://hkbus-api.copypaste.hk/api/`，监听端口继续使用 **39410**。

## 生效行为

- 默认配置、`.env.example`、本机 bootstrap 和首次安装配置均为 `CORS_ORIGINS=*`；管理接口与公共接口共用相同来源判断。
- 对任意请求 Origin 回显 `Access-Control-Allow-Origin: <请求 Origin>`，同时发送 `Access-Control-Allow-Credentials: true` 和 `Vary: Origin`。这样浏览器携带凭证时也能使用跨域响应。
- OPTIONS 接受 GET、HEAD、POST、PUT、PATCH、DELETE、OPTIONS；回显任意 `Access-Control-Request-Headers`，包括 Authorization、Content-Type、X-HKBus-Admin 和自定义客户端头。
- 无 Origin 的 App、服务端请求正常处理；`null` 和原生 origin 也放行。401 等业务错误仍提供相同跨域响应头。
- 登录、会话、角色、管理 Cookie 写入标识 `X-HKBus-Admin: 1`、请求限流继续按业务要求校验。Cookie 的 Secure/HttpOnly/SameSite=Strict 属于浏览器 Cookie 策略，独立于 CORS；跨站 Admin Cookie 登录仍受浏览器限制。
- 如果未来主动指定精确 `CORS_ORIGINS` 列表，公共及管理接口会共同采用该列表；当前任意来源模式无需登记新 H5 域名。

## 更新与验证

Windows 原生环境已通过 TypeScript 类型检查、**26 项自动测试**和生产编译，其中新增四组跨域行为回归。测试使用隔离内存库，不写入正式业务库。Ubuntu 原生环境同样完成类型检查、26 项测试、编译和生产依赖裁剪；线上已完成版本切换。

`deploy/linux/update-cors.sh` 用于已有服务更新：上传源码归档与 release-id，先生成一致性数据库备份，再在新 release 安装锁文件依赖、运行类型检查/测试/编译并裁剪开发依赖。仅修改线上环境中的 CORS_ORIGINS，原子切换 current 并重启单个 systemd 服务。健康探测失败会恢复先前 release 和环境；旧环境备份仅 root 可读，不能提交 Git。

## English

The Backend now defaults to `CORS_ORIGINS=*`, permitting every origin for public and Admin endpoints. Responses reflect the actual Origin with credentials enabled and `Vary: Origin`. Preflights accept every implemented API method and reflect arbitrary requested headers. Requests without Origin, native schemes and the `null` origin are supported. Authentication, roles, rate limits and the Admin mutation marker remain application requirements. Cookie SameSite/Secure rules are independent browser behavior.

Native Windows type checking, 26 regression tests and the production build passed. The new version is deployed and verified: 55 checks through the actual public HTTPS domain and 8 real Chrome cross-origin fetch checks passed. Both test browser contexts and the browser process were closed. The native update script creates a consistent database backup, builds/tests a new versioned release, changes only the CORS environment entry and atomically switches the service, with automatic rollback on readiness failure. No database replacement or client rebuild is needed.

## 线上结果 / Production evidence

| 项目 | 实测结果 |
|---|---|
| 运行 release | `20261017T074935Z-80ca4da2de2a`；应用源码 `80ca4da2de2a8a935ca1ce0d0cd391523d782c1b` |
| 正式 HTTPS | 55 项通过，服务端客户端真实经过公网域名与 Cloudflare；系统 TLS 证书校验开启 |
| 任意来源 | HTTPS、HTTP 本地端口、HTTPS 非标准端口、capacitor://localhost、null；无 Origin 的请求也正常 |
| 预检 | 五种来源 × 七种方法均 204；任意自定义请求头完整回显 |
| 实际业务 | 健康和真实 KMB 目录 200；输入错误 422、不存在 404、未登录 401 均可跨域读取 |
| 管理会话 | 未登记 Origin 的登录、身份查询和带标识的退出通过；缺标识 403 / CSRF_REJECTED；测试会话已撤销 |
| 浏览器 | Windows 原生 Chrome 在两个此前未登记的来源真实 fetch，credentials=include，8 项通过；所有新建上下文及浏览器已关闭 |
| 服务 / 数据 | systemd active + enabled，端口 39410；其余环境配置逐项比对一致；SQLite quick_check=ok、外键问题 0 |
| 主数据 | 1611 个路线方向、6775 个站点、36377 条站序关系；未创建匿名测试档案 |
| 一致性备份 | `20261017_075005_hkbusgo.db`，源/备份完整性和恢复读取校验通过；原宝塔管理及每日任务保留 |

首次 Windows Python 与部分原生命令行客户端的 TLS 握手曾超时，未取得 HTTP 响应。改用服务器原生客户端完成上述 55 项正式 HTTPS 检查；Windows Chrome 的 8 项真实跨域检查也通过。没有关闭 TLS 校验或修改 CDN 规则。该连接限制与服务端的来源策略分开记录，不将一次工具超时写成 CORS 拒绝。

[本地检查](assets/cors-open/2026-10-17/local-checks.json) · [本地回归](assets/cors-open/2026-10-17/test.txt) · [服务器构建](assets/cors-open/2026-10-17/server-build.txt) · [55 项 HTTPS](assets/cors-open/2026-10-17/https-api.json) · [浏览器记录](assets/cors-open/2026-10-17/browser.json) · [线上状态及备份](assets/cors-open/2026-10-17/server-state.json) · [部署记录](assets/cors-open/2026-10-17/deployment.json)。

在服务器以 root 执行 `python3 /www/wwwroot/hkbusgo/ops/verify-cors.py --output /tmp/hkbusgo-cors-check.json` 可重新验证。脚本只建立并退出自己的管理会话，正常请求指标与登录审计会保留；不重启服务、不写入主数据。不应公开凭证文件或环境备份。

旧 release `20261016T220329Z-6fbb76e1bea3` 与 root-only 旧环境备份仍保留，用于必要时回退；数据库本次没有结构变更。CORS 已开放不代表小程序合法请求域名、AppID、官方 IDE、真机、上架审核或 TDAS 上游问题已完成。这些平台或数据源约束独立验收。

The application release and database remain native services managed by systemd and BaoTa. No client rebuild is required for this policy change. The online environment comparison confirmed that only CORS_ORIGINS changed. Existing data, credentials, port, SQLite management and scheduled backups were preserved. Some Windows command-line TLS handshakes timed out; successful evidence consists of public HTTPS checks from the server and real cross-origin Chrome requests from Windows, without disabling certificate verification or changing CDN rules. Mini-program domain registration, cookie browser policies, physical devices and upstream TDAS access are independent of CORS.
