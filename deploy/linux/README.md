# Ubuntu / BaoTa 部署脚本 · Deployment operations

这组脚本对应 `43.160.221.28:39410` 的原生 Ubuntu 部署，固定使用 `/www/wwwroot/hkbusgo`、`ubuntu` 构建账号、`hkbusgo` 运行账号和宝塔现有 Python。它们不是适配任意服务器的通用安装器。完整运维与验收见 [部署手册](../../docs/DEPLOYMENT.md)。

| 文件 | 职责 |
|---|---|
| `setup.sh` | 首次安装：解包已上传源码、依赖、类型/测试/构建、生产依赖、随机凭证、目录权限与 systemd；存在部署时拒绝运行 |
| `update-cors.sh` | 已有服务的任意来源更新：一致性备份、新 release 安装/测试/编译、仅修改 CORS 环境项、原子切换；健康失败自动恢复版本和环境 |
| `hkbusgo-backend.service` | 单进程、专用账号、资源和文件权限约束、开机启动和异常重启 |
| `register-panel.py` | 用宝塔已安装模块登记 SQLite 文件和每日计划任务；需要原生 `acl` 包，保留其他任务 |
| `backup.sh` / `backup.mjs` | flock + SQLite 一致性快照、源/备份校验、14 份保留；只管理本任务命名的文件 |
| `start-panel-backup.py` | 经宝塔官方本地任务模块触发已登记的本项目备份 |
| `verify-deployment.py` | 实际 HTTP、认证/数据事务/同步与重启验收；临时个人档案在 finally 清理，报告不保存 token |
| `verify-cors.py` | 通过正式 HTTPS 校验任意来源、任意请求头、七种方法预检及管理登录/退出；不建立匿名档案，报告不记录 Cookie 或密码 |

首次安装需事先把源码包 `backend-source.tar.gz`、`release-id.txt` 和上述脚本上传到 `/home/ubuntu/.cache/hkbus-deploy-20261017/`。版本号格式为 UTC `YYYYMMDDTHHMMSSZ-<12位提交>`。安装不会建立域名、HTTPS 或前端站点。当前主机已经完成首次安装，后续请按手册更新，勿重新执行 setup。

数据库登记命令使用宝塔解释器；应用验收使用 Ubuntu Python。验收脚本要求 root，会重启本服务并触发真实同步，应在维护窗口执行，不能当成只读健康探针。`TDAS` 上游 403 单独报告为 blocked；程序退出 0 只表示没有其余失败，仍需检查报告的 blocked 数量。

## English

These scripts describe the native Ubuntu/BaoTa installation at `43.160.221.28:39410`. Paths, build account, service account, source staging directory and panel interpreter are deployment-specific. They are not a universal installer. See the [bilingual deployment handover](../../docs/DEPLOYMENT.md).

`setup.sh` performs a first installation only and refuses an existing deployment. It expects an uploaded source archive, release ID and operation files; it does not configure a domain, TLS or frontend. `register-panel.py` preserves existing panel entries and requires the native `acl` package. The backup task uses consistent SQLite snapshots rather than copying a live database file, verifies integrity and retains the latest 14 matching files.

The verification script requires root, creates/removes temporary anonymous profiles, triggers live synchronization and **restarts this service**. Use an appropriate maintenance window. Its report excludes credentials. A TDAS upstream 403 is marked blocked, so exit status 0 does not mean every upstream dependency passed. Ordinary health checks should use `GET /api/health` and inspect `data.status`.

`verify-cors.py --output /path/to/report.json` verifies the actual public HTTPS endpoint with 55 CORS/authentication checks, including one temporary Admin session that is logged out. It reads the initial Admin credential file privately (override with `--credentials` if necessary), creates no anonymous profiles and does not restart the service. `update-cors.sh` expects a versioned staging directory and performs a backup, isolated release build, atomic switch and readiness rollback. See [the current CORS handover](../../docs/CORS-OPEN.md).
