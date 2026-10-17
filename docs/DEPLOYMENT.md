# 港巴通后端与数据库部署交付 · 2026-10-17

部署对象是实际 Backend 与正式业务数据库。**公网服务端口为 `39410`，健康检查和业务请求已从服务器外部验证可达。TDAS 道路查询存在上游 403 阻塞，不能视为全部外部数据能力验收通过。**

## 1. 访问与反向代理

| 项目 | 当前交付 |
|---|---|
| 主机 | `43.160.221.28`，Ubuntu 22.04.5 LTS x86_64 |
| Backend 公网端口 | **TCP `39410`**，监听 `0.0.0.0` |
| 健康检查 | <http://43.160.221.28:39410/api/health> |
| 交互接口文档 | <http://43.160.221.28:39410/api/docs/> |
| OpenAPI | <http://43.160.221.28:39410/api/openapi.json>，53 个业务操作 |
| 真实路线查询示例 | <http://43.160.221.28:39410/api/v1/routes?q=112> |
| 宝塔反代目标 | **`http://127.0.0.1:39410`**，保留 `/api/...` 原始路径 |
| 服务管理 | `hkbusgo-backend.service`，已设置开机启动、异常自动重启 |
| 数据库管理 | 宝塔 11.8.0 → 数据库 → SQLite；已登记正式业务库与 19 张表 |

这是 API 服务；`/` 没有产品首页，正常返回 404。Admin 前端、四个移动端和域名 HTTPS 不在此次后端部署中发布。用户暂未提供反代域名，因此当前直接开放高端口供连通性检查与后续配置。

服务器已有 UFW `39000:40000/tcp` 放行范围，本次端口在该范围内；Windows 外部客户端已直接访问成功。无需另行开放数据库网络端口。

## 2. 实际部署结构

| 项目 | 位置 / 设置 |
|---|---|
| 运行时 | `/usr/local/bin/node`，v24.19.0；原生 Ubuntu 进程 |
| 应用根目录 | `/www/wwwroot/hkbusgo` |
| 当前版本 | `/www/wwwroot/hkbusgo/releases/20261016T220329Z-6fbb76e1bea3` |
| 当前入口 | `/www/wwwroot/hkbusgo/current` → 上述版本 |
| 应用源码提交 | Backend `6fbb76e1bea30c3042bf8327c6c31fead240020d` |
| 源码包 SHA-256 | `4debc653130ced05d90273400aa0656205f2542ac09a4105163237f6e1691040` |
| 环境配置 | `/www/wwwroot/hkbusgo/shared/backend.env`，root:hkbusgo `0640` |
| 正式业务库 | `/www/wwwroot/hkbusgo/shared/data/hkbusgo.db` |
| 运维脚本 | `/www/wwwroot/hkbusgo/ops/` |
| systemd 单元 | `/etc/systemd/system/hkbusgo-backend.service` |
| 应用日志 | `/www/wwwlogs/hkbusgo/backend.log` |
| 日志轮转 | `/etc/logrotate.d/hkbusgo`，每天轮转，保留 14 份，超过 20MB 可轮转，压缩旧日志 |
| 初始管理凭证 | `/www/wwwroot/hkbusgo/shared/initial-admin.json`，root `0600` |

`release` 名称采用 UTC，本文业务日期为 UTC+8，二者相差一天是时区所致。应用代码沿用已验证的源码提交；新增 systemd、备份和验收脚本作为部署运维变更独立记录于 [release.json](assets/deployment/2026-10-17/release.json)，未把文档提交误记成已重新构建的应用代码。

源码目录由 root 持有、服务账号可读；运行进程使用无交互登录的 `hkbusgo` 专用账号。单进程运行 SQLite 与后台 worker，避免多个实例竞争任务。Node 堆上限 256MiB，systemd `MemoryHigh=256MiB`、`MemoryMax=384MiB`；最终检查时进程约 170MiB，此值只是当时快照，不代表容量压测。

启用 `NoNewPrivileges`、只读系统目录与受限可写路径。Node 在 Linux 上枚举网卡需要 `AF_NETLINK`，已加入地址族允许清单并验证持续运行。未调用 Docker、WSL、虚拟机或 Android 模拟器。

## 3. 数据库与宝塔维护

现有 Backend 基于 Node 原生 `node:sqlite`，业务事务、迁移、身份与内容工作流均使用 SQLite。本次沿用这个真实实现，在宝塔内置 SQLite 模块登记实际文件，未引入没有适配器支持的数据库引擎。

宝塔条目显示名为 **`HKBusGoproduction/港巴通正式业务库`**；宝塔对显示名去除了空格。路径为上表正式库。已通过面板原有模块执行登记，并回读数据库列表、19 张表与备份列表。没有修改宝塔核心代码，也没有覆盖其他业务的数据库或计划任务。

| 数据快照 | 数量 |
|---|---:|
| KMB/LWB 路线方向 | 1,611 |
| 官方站点 | 6,775 |
| 路线站序关系 | 36,377 |
| 管理员 | 1 |
| 个人档案 / 收藏 / 提醒 | 各 0，验收临时记录已清理 |
| 通告 | 0，未预置运营文章 |

数据库采用 WAL，迁移版本 `2`；实际 `integrity_check=ok`，`foreign_key_check` 无异常。主数据中的非 live 来源记录为 0。数量是本次同步快照，后续以官方数据为准。

### 一致性备份

| 项目 | 配置与验证 |
|---|---|
| 宝塔计划任务 | `HKBusGo SQLite Daily Consistent Backup`，任务 ID `2` |
| 周期 | 每天 `04:20`，服务器 UTC+8 |
| 任务入口 | `/bin/bash /www/wwwroot/hkbusgo/ops/backup.sh` |
| 备份目录 | `/www/backup/database/sqlite/d6ad541c23e9d6a30c484ea7ccd36fe7/` |
| 文件命名 | `YYYYMMDD_HHMMSS_hkbusgo.db`，文件名时间为 UTC |
| 保留策略 | 保留最近 14 份本任务命名格式的文件 |
| 快照方式 | SQLite `VACUUM INTO`，包括已提交的 WAL 数据；备份前后完整性与外键检查 |
| 并发保护 | `flock` 防止本任务重叠执行 |
| 最新状态 | `/www/wwwroot/hkbusgo/shared/last-backup.json` |
| 首次验收 | 已通过宝塔 `StartTask` 实际触发，快照可在宝塔备份列表看到，并重新打开读取核心表 |

宝塔本机 SQLite 的通用备份方法使用文件复制，因此每日任务采用单独的一致性快照脚本；请以此计划任务或下方手动命令备份运行中的业务库。宝塔原有备份父目录较严格，已安装 Ubuntu 原生 `acl` 小包，仅授予 `hkbusgo` 穿过相关父目录的权限；业务备份子目录保持 `0750`。没有给其他用户开放整棵备份目录。

```bash
# 手动触发同一个宝塔任务，然后查看任务日志和 last-backup.json
sudo /www/server/panel/pyenv/bin/python3 /www/wwwroot/hkbusgo/ops/start-panel-backup.py
sudo cat /www/wwwroot/hkbusgo/shared/last-backup.json

# 或直接执行同一备份入口；调用成功后才返回
sudo /bin/bash /www/wwwroot/hkbusgo/ops/backup.sh
```

本次验证包括快照完整性、外键与重新打开读取；未对正在服务的正式库执行破坏性恢复演练。现有 22 项自动化测试另行覆盖隔离库恢复与重启。

### 恢复流程

1. 在宝塔选择本任务生成的 `.db`，核对 `last-backup.json` 或自行计算 SHA-256；先在隔离目录以只读 SQLite 打开，检查 `PRAGMA integrity_check`、`foreign_key_check` 和关键表数量。
2. 先运行一次当前库的一致性备份，再 `sudo systemctl stop hkbusgo-backend.service`；确认服务停止且进程退出。
3. 在 `shared/data/` 下建立仅 root 可访问的回退目录，将当前 `hkbusgo.db` 和存在的 `hkbusgo.db-wal`、`hkbusgo.db-shm` 一起保留到该目录。不要把旧 WAL 与恢复库混用。
4. 将已经校验的候选备份复制为 `shared/data/hkbusgo.db`，设置 owner 为 `hkbusgo:hkbusgo`、权限 `0640`。只替换明确选定的这份业务库；不要覆盖 `backend.env` 或其他数据库。
5. 启动服务，验证健康状态、官方目录、管理登录和实际用户数据。恢复到较旧备份会回退其后的业务写入，应在维护窗口按用户确认的恢复点操作。

## 4. 真实请求与验收结果

| 验证层次 | 本次结果 | 证据 |
|---|---|---|
| Ubuntu 原生类型 / 编译 | `npm ci`、typecheck、build、生产依赖裁剪完成 | [服务器构建日志](assets/deployment/2026-10-17/server-build.log) |
| 自动化回归 | 22 项通过，0 失败；测试运行于安装阶段，未装入生产编译入口 | 同上 |
| 服务器实际 HTTP 与重启 | **56 项通过、0 项实现失败、1 项外部阻塞** | [完整结果和逐次请求](assets/deployment/2026-10-17/deployment-verification.json) |
| Windows 外网访问 | **17 项通过，20 次实际公网 HTTP 请求** | [公网请求证据](assets/deployment/2026-10-17/public-http.json) |
| 正式库与备份 | 完整性通过、无外键错误、真实来源检查通过、宝塔备份列表回读成功 | [最终服务状态](assets/deployment/2026-10-17/server-status.json)、[备份](assets/deployment/2026-10-17/last-backup.json) |
| 宝塔维护接入 | 正式库、19 张表、已启用每日任务已回读 | [面板登记](assets/deployment/2026-10-17/panel-registration.json) |
| 运维脚本与安装一致性 | Bash / Node / Python 语法检查通过，已安装服务单元与源码哈希一致，持续运行且自动重启次数为 0 | [运维检查](assets/deployment/2026-10-17/operations-validation.json) |
| 浏览器 / 官方 IDE / 真机 / 上架 | 本次未执行，不由 API、编译或服务器启动结果替代 | 保持既有独立验收边界 |

HTTP 覆盖：健康、配置、53 操作 OpenAPI 文档、品牌 favicon、路线分页/方向/站序、站点详情与附近排序、三语搜索、无定位与已选站首页、官方 ETA 与缓存/路线过滤、真实站序行程候选、空通告、404/422/401、跨端 CORS、匿名档案、收藏幂等/完整排序/删除、最近查看、提醒幂等/暂停/恢复/越权保护/删除、refresh 轮换与重放拦截、管理登录及 9 类查询、CSRF、实际目录同步、worker 调用、退出撤销、数据级联删除。

实际 `systemctl restart` 前后使用同一匿名身份读取两项收藏，内容保留，进程 PID 变化；随后删除该档案并验证旧 access / refresh 均失效。公网也单独完成身份建立、收藏写读、删除与撤销验证。管理凭证测试通过 SSH 在服务器回环 HTTP 上完成，未将管理员密码发送到公网明文地址。

本次选取的炮台山站返回真实 `fresh` 数据及 6 条记录，但其 `eta` 均为 `null`，产品保留 `no-estimate`。这验证官方空值语义，不能称为本次已经验证非空倒计时或真实到点通知送达；通知生成的确定性业务规则由自动化测试覆盖。

### TDAS 阻塞，需后续处理

部署服务器直接向官方 `https://tdas-api.hkemobility.gov.hk/tdas/api/route` POST，得到 **HTTP 403**，响应 `Server: awselb/2.0`；更换普通客户端 User-Agent 后仍相同。服务器与本机解析出的官方 IP 集合一致，未观察到 DNS 差异。

同一坐标和参数在 Windows 出口返回 **HTTP 200**，本次比较得到道路距离 `3953m`、时长 `00:06`（360 秒）。[两个出口的实际响应与解析证据](assets/deployment/2026-10-17/tdas-egress.json)。因此已确认请求格式和现有适配器曾可用，当前部署出口被上游拒绝；具体限流、来源网络或访问策略仍需官方确认，不能把推测写成已确认原因。

Backend 保持官方接口和 live-only 模式；该功能当前返回 `UPSTREAM_HTTP`（通常 502，熔断窗口内可能 503），不会使用假道路数据替代。**道路功能未达到正常可用验收。** 后续需让 TDAS 官方检查该服务器出口的访问权限，或由用户提供经授权且能稳定访问官方服务的生产出口；恢复后应从服务器重新执行实际道路请求。没有配置临时依赖本机的转发、第三方公共代理或修改历史 demo。

## 5. 后续宝塔反代与域名

在宝塔目标域名站点建立 HTTPS 反向代理，目标 `http://127.0.0.1:39410`，转发 `/api/...`，不去掉 `/api` 前缀。Nginx 关键设置示例：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:39410;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 40s;
}
```

使用真实 HTTPS 访问来源更新 `backend.env` 的 `CORS_ORIGINS`；若 Admin 和 API 分属不同子域，使用同一站点关系并验证 SameSite Cookie、凭证模式与 CSRF。保留实际 Android origin。`TRUSTED_PROXIES` 当前仅信任 `127.0.0.1,::1`，宝塔本机反代无需放宽为任意来源。

`PUBLIC_APP_URL` 当前临时为 API 地址，尚不是移动端分享落地页；有正式分享域名后必须改为真实入口。更新环境后执行 `sudo systemctl restart hkbusgo-backend.service`，再验证健康、CORS、管理登录/写入和移动端请求。生产管理 Cookie 保持 `Secure; HttpOnly; SameSite=Strict`，直接公网 HTTP 不作为浏览器管理入口。

三个小程序的合法请求域名与 AppID、Android 发行配置需另行完成；不能仅把此 HTTP 地址写入后就宣称完成各平台发行。

## 6. 日常运维与版本更新

```bash
sudo systemctl status hkbusgo-backend.service --no-pager
sudo systemctl restart hkbusgo-backend.service
sudo systemctl is-enabled hkbusgo-backend.service
curl --fail http://127.0.0.1:39410/api/health
sudo tail -n 80 /www/wwwlogs/hkbusgo/backend.log
sudo cat /www/wwwroot/hkbusgo/shared/last-backup.json
```

API 进程日志在上述独立文件；systemd 启动错误另看 `journalctl -u hkbusgo-backend.service`。每日任务日志可在宝塔查看，原始文件为 `/www/server/cron/2dab577ba6e3e2b1ea0aa7282a394028.log`。服务器剩余空间约 4.3GiB，更新前检查空间与备份，避免长期积累 release 和临时源码包。

版本更新采用新 release 目录：在新目录安装锁文件依赖，执行类型检查、22 项回归和构建，再裁剪开发依赖；代码设为 root 所有、`hkbusgo` 可读。先做一致性备份，再把 `current` 原子切换到新版本，重启并检查 `data.status=ok`。环境与数据库固定在 `shared`，不随 release 被覆盖。仅凭 curl 200 不足以判断目录已就绪，要读取健康返回状态。

应用回退应先确认数据库迁移兼容性，再切回前一 release；代码回退与数据库恢复是不同操作。本次为首次部署，没有早先业务版本可回退。`deploy/linux/setup.sh` 是这台主机的首次安装脚本，存在当前部署时会拒绝执行，不能用它覆盖线上库或重新生成凭证。

可重复验收脚本为 Backend 分支 `deploy/linux/verify-deployment.py`，服务器也保留在 `ops`。它需要 root，会创建并清理两个临时匿名档案，触发真实同步并重启本服务，应在合适维护时段执行；它不是无副作用的在线探针。

管理员初始资料仅保存在服务器私密文件和交付给用户的本机私密文件中；文档、截图、Git 与日志不包含密码、JWT secret 或会话 token。服务启动后修改管理员密码以数据库为准，`ADMIN_PASSWORD` 只用于无管理员时的首次初始化，不是重设密码命令。

## English handover

The real Backend and its production SQLite database are deployed on **43.160.221.28, TCP port 39410**. Health, OpenAPI and interactive documentation are available through the links above. BaoTa's reverse-proxy upstream is **http://127.0.0.1:39410**, preserving the `/api` prefix. The API root `/` intentionally has no product page.

The native Node 24.19.0 service runs as a dedicated `hkbusgo` account, with one SQLite worker process, systemd boot enablement, failure restart, bounded memory and log rotation. The release points to application commit `6fbb76e1bea30c3042bf8327c6c31fead240020d`; later operational scripts are separately fingerprinted. No containers, virtualization, historical demo or Vercel deployment were used.

The actual database `/www/wwwroot/hkbusgo/shared/data/hkbusgo.db` is registered in BaoTa 11.8.0's SQLite manager, under `HKBusGoproduction/港巴通正式业务库`. All 19 tables were read back. The live snapshot contains 1,611 route directions, 6,775 stops and 36,377 relations, one administrator, no seeded notices and no remaining verification profiles. SQLite integrity and foreign-key checks passed.

BaoTa task **HKBusGo SQLite Daily Consistent Backup**, ID **2**, runs at **04:20 UTC+8** and retains **14** consistent snapshots in the panel's SQLite backup directory. It uses `VACUUM INTO`, checks source/backup integrity, and reopens the resulting database. Actual panel-triggered execution and backup-list visibility passed. Only traversal ACLs were added for the dedicated account on restrictive backup parents. Stop the service before restoring; preserve the previous DB and its WAL/SHM together, restore a verified snapshot with the correct owner, then validate the restarted service. A destructive restore was not performed on the production database.

On-server installation, type checking, compilation and **22 regression tests passed**. Real server HTTP acceptance passed **56 checks**, with **one externally blocked TDAS check**. A Windows client independently passed **17 public-network checks across 20 HTTP requests**. Tests covered personal-data transactions, authentication, CSRF/CORS, real catalogue sync, actual process restart and persistent bookmarks. Temporary test records were removed. Browser, official mini-program IDE, physical-device, capacity and store acceptance are separate and were not claimed.

**TDAS road routing is currently unavailable from this server:** the official AWS load balancer returns 403, whereas the same request from Windows returns 200. Matching DNS results and different ordinary User-Agents do not resolve the rejection. Its exact upstream access policy requires confirmation. The Backend returns an explicit upstream error and never fabricates a route. Obtain approved upstream access or an authorized stable production egress, then rerun the server-side TDAS acceptance. No temporary desktop relay or public proxy was installed.

Configure the actual HTTPS domain in BaoTa later, update exact CORS origins and the real sharing URL, keep only trusted local proxies, then restart and retest. Production administrator cookies remain Secure/HttpOnly/SameSite=Strict; administrator credentials were verified over SSH loopback and are supplied only in a private handoff file. Current delivery is the Backend/database, without publishing Admin UI, mobile applications or an HTTPS domain.

## 正式域名补充 / Finalized HTTPS API

2026-10-17：API 已定稿为 `https://hkbus-api.copypaste.hk/api/`。健康接口 200，正式 origin 已加入 CORS，安全 Cookie 登录/退出及原生 origin 预检通过；监听端口仍为 39410。原账号、宝塔业务库及备份继续使用。TDAS 目前仍返回 502。五端构建和具体边界见 [本次交付](./PRODUCTION-API.md)。

The finalized HTTPS API is live; health, production-origin CORS and secure Admin sessions were verified. Port 39410, credentials, BaoTa SQLite and backups remain in place. TDAS still returns 502. See the current build handover for evidence and limitations.
