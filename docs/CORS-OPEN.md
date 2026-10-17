# 任意来源跨域 / Any-origin CORS · 2026-10-17

本次按用户要求将实际 Backend 的跨域策略改为接受任意来源。正式 API 为 `https://hkbus-api.copypaste.hk/api/`，监听端口继续使用 **39410**。

## 生效行为

- 默认配置、`.env.example`、本机 bootstrap 和首次安装配置均为 `CORS_ORIGINS=*`；管理接口与公共接口共用相同来源判断。
- 对任意请求 Origin 回显 `Access-Control-Allow-Origin: <请求 Origin>`，同时发送 `Access-Control-Allow-Credentials: true` 和 `Vary: Origin`。这样浏览器携带凭证时也能使用跨域响应。
- OPTIONS 接受 GET、HEAD、POST、PUT、PATCH、DELETE、OPTIONS；回显任意 `Access-Control-Request-Headers`，包括 Authorization、Content-Type、X-HKBus-Admin 和自定义客户端头。
- 无 Origin 的 App、服务端请求正常处理；`null` 和原生 origin 也放行。401 等业务错误仍提供相同跨域响应头。
- 登录、会话、角色、管理 Cookie 写入标识 `X-HKBus-Admin: 1`、请求限流继续按业务要求校验。Cookie 的 Secure/HttpOnly/SameSite=Strict 属于浏览器 Cookie 策略，独立于 CORS；跨站 Admin Cookie 登录仍受浏览器限制。
- 如果未来主动指定精确 `CORS_ORIGINS` 列表，公共及管理接口会共同采用该列表；当前任意来源模式无需登记新 H5 域名。

## 更新与验证

Windows 原生环境已通过 TypeScript 类型检查、**26 项自动测试**和生产编译，其中新增四组跨域行为回归。测试使用隔离内存库，不写入正式业务库。线上部署和实际 HTTPS 验证正在执行，完成后在此记录结果。

`deploy/linux/update-cors.sh` 用于已有服务更新：上传源码归档与 release-id，先生成一致性数据库备份，再在新 release 安装锁文件依赖、运行类型检查/测试/编译并裁剪开发依赖。仅修改线上环境中的 CORS_ORIGINS，原子切换 current 并重启单个 systemd 服务。健康探测失败会恢复先前 release 和环境；旧环境备份仅 root 可读，不能提交 Git。

## English

The Backend now defaults to `CORS_ORIGINS=*`, permitting every origin for public and Admin endpoints. Responses reflect the actual Origin with credentials enabled and `Vary: Origin`. Preflights accept every implemented API method and reflect arbitrary requested headers. Requests without Origin, native schemes and the `null` origin are supported. Authentication, roles, rate limits and the Admin mutation marker remain application requirements. Cookie SameSite/Secure rules are independent browser behavior.

Native Windows type checking, 26 regression tests and the production build passed. Online deployment and HTTPS verification are in progress. The native update script creates a consistent database backup, builds/tests a new versioned release, changes only the CORS environment entry and atomically switches the service, with automatic rollback on readiness failure. No database replacement or client rebuild is needed.
