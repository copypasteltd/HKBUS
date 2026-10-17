# Ubuntu / BaoTa 部署脚本 · Deployment operations

这组脚本对应 `43.160.221.28:39410` 的原生 Ubuntu 部署，固定使用 `/www/wwwroot/hkbusgo`、`ubuntu` 构建账号、`hkbusgo` 运行账号和宝塔现有 Python。它们不是适配任意服务器的通用安装器。完整运维与验收见 [部署手册](../../docs/DEPLOYMENT.md)。

| 文件 | 职责 |
|---|---|
| `setup.sh` | 首次安装：解包已上传源码、依赖、类型/测试/构建、生产依赖、随机凭证、目录权限与 systemd；存在部署时拒绝运行 |
| `update-cors.sh` | 已有服务的任意来源更新：一致性备份、新 release 安装/测试/编译、仅修改 CORS 环境项、原子切换；健康失败自动恢复版本和环境 |
| `update-data.sh` | 一致性备份、新版本测试和编译、私密 TDAS 出口配置、原子切换；必须取得真实 TDAS 与 KMB 数据，否则自动回滚 |
| `hkbusgo-backend.service` | 单进程、专用账号、资源和文件权限约束、开机启动和异常重启 |
| `register-panel.py` | 用宝塔已安装模块登记 SQLite 文件和每日计划任务；需要原生 `acl` 包，保留其他任务 |
| `backup.sh` / `backup.mjs` | flock + SQLite 一致性快照、源/备份校验、14 份保留；只管理本任务命名的文件 |
| `start-panel-backup.py` | 经宝塔官方本地任务模块触发已登记的本项目备份 |
| `verify-deployment.py` | 实际 HTTP、认证/数据事务/同步与重启验收；临时个人档案在 finally 清理，报告不保存 token |
| `verify-cors.py` | 通过正式 HTTPS 校验任意来源、任意请求头、七种方法预检及管理登录/退出；不建立匿名档案，报告不记录 Cookie 或密码 |

首次安装需事先把源码包 `backend-source.tar.gz`、`release-id.txt` 和上述脚本上传到 `/home/ubuntu/.cache/hkbus-deploy-20261017/`。版本号格式为 UTC `YYYYMMDDTHHMMSSZ-<12位提交>`。安装不会建立域名、HTTPS 或前端站点。当前主机已经完成首次安装，后续请按手册更新，勿重新执行 setup。

数据库登记命令使用宝塔解释器；应用验收使用 Ubuntu Python。验收脚本要求 root，会重启本服务并触发真实同步，应在维护窗口执行，不能当成只读健康探针。当前验收强制要求 TDAS 真实结果；403 或其他查询失败均不能通过。`/api/health` 的 `status` 表示进程/数据库就绪，`dataStatus` 和 `dataServices` 另行反映最近五分钟实际请求；没有近期请求时是 unverified，不代表已证明数据通达。

`update-data.sh` 的 staging 目录为 `/home/ubuntu/.cache/hkbus-data-<UTC时间戳>`，包含源码包、release-id.txt 及权限 0600 的 `tdas-egress.json`（私密 `url`、`secret`）。该 JSON 经 SFTP 单独上传，不进入源码包或 Git，消费后删除。只新增/替换两个 TDAS_EGRESS 环境项，其他环境、数据库、宝塔登记和端口保持原配置。私密环境备份仅 root 可读，失败时恢复。出口代码与部署说明见 [TDAS 专用出口](../tdas-egress/README.md)。

## English

These scripts describe the native Ubuntu/BaoTa installation at `43.160.221.28:39410`. Paths, build account, service account, source staging directory and panel interpreter are deployment-specific. They are not a universal installer. See the [bilingual deployment handover](../../docs/DEPLOYMENT.md).

`setup.sh` performs a first installation only and refuses an existing deployment. It expects an uploaded source archive, release ID and operation files; it does not configure a domain, TLS or frontend. `register-panel.py` preserves existing panel entries and requires the native `acl` package. The backup task uses consistent SQLite snapshots rather than copying a live database file, verifies integrity and retains the latest 14 matching files.

The verification script requires root, creates/removes temporary anonymous profiles, triggers live synchronization and **restarts this service**. Its report excludes credentials. Real TDAS data is mandatory; an upstream denial fails verification. `GET /api/health` separates process readiness (`status`) from recent observed provider connectivity (`dataStatus`, `dataServices`); observations expire after five minutes and then become unverified.

`update-data.sh` expects `/home/ubuntu/.cache/hkbus-data-<UTC timestamp>` with a source archive, release ID and separately uploaded 0600 private `tdas-egress.json` containing `url` and `secret`. It consumes/removes that private upload, preserves all environment entries except the two TDAS_EGRESS settings, and keeps the existing database, BaoTa entries and port. The versioned update tests/builds before switching and requires real TDAS and KMB results; failures restore the previous release and private environment. See [the dedicated egress instructions](../tdas-egress/README.md).

`verify-cors.py --output /path/to/report.json` verifies the actual public HTTPS endpoint with 55 CORS/authentication checks, including one temporary Admin session that is logged out. It reads the initial Admin credential file privately (override with `--credentials` if necessary), creates no anonymous profiles and does not restart the service. `update-cors.sh` expects a versioned staging directory and performs a backup, isolated release build, atomic switch and readiness rollback. See [the current CORS handover](../../docs/CORS-OPEN.md).
