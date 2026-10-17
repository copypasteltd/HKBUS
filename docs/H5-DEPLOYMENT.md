# 实际 H5 发布与维护 / Production H5 publication

## 中文说明

**当前实际站点：[港巴通](https://hkbus.copypaste.hk/)**，真实 API：`https://hkbus-api.copypaste.hk/api/`。宝塔域名根目录为 `/www/wwwroot/hkbus.copypaste.hk`；当前应用由该目录下 `.hkbusgo/current` 链接提供服务。采用根目录 hash 路由，入口 `/#/pages/home/index`。这是已部署的真实应用；先前“仅导出 dist、未部署”的说明保留于历史报告，不能用于判断当前线上状态。

[本次网站发布、版本、完整验收及截图](H5-SITE-LIVE.md) · [线路到站业务修复](ROUTE-ARRIVALS.md) · [旧 H5 导出记录](https://github.com/copypasteltd/HKBUS/blob/android/docs/H5-DIST.md)

### 后续更新约定

用户已在 2026-10-17 明确授权：后续实际前端更新完成后，自行同步对应服务器前端路径，不必再次询问网站发布许可。共享移动端 UI/业务变更须同步相关独立客户端，并使用 Android 分支构建和发布实际 H5。Admin 仍发布到 `https://hkbus-api.copypaste.hk/admin/`，沿用 Backend 分支的 `deploy/linux/deploy-admin.py`，不能覆盖乘客网站。

小程序平台上传、Android 安装包交付、官方 IDE、真机与上架另行验证。旧 `prototype/`、假数据 HTML 原型及其 Vercel demo 不在该授权范围。平台专属能力须在对应端验收，不能用网站部署代替。

### Windows 原生操作

从 [android 分支](https://github.com/copypasteltd/HKBUS/tree/android)的独立工程根目录运行：

```powershell
npm ci
python -m pip install paramiko
# 仅检查并编译实际 H5；输出 dist/h5 与 dist/h5-build.json。
npm run release:h5
# 检查、编译并发布生产网站；私有 SSH 凭据需已配置。
npm run deploy:h5
```

默认读取当前用户目录 `.codex/private/hkbusgo/ssh-session.json` 中的 `host`、`user`、`password`，或使用进程环境变量 `HKBUS_SSH_PASSWORD`。访问文件不在仓库内；密码不得写入 README、脚本、Git 或 dist。需要自定义凭据文件时，先执行构建，再执行 `python deploy/h5/publish-h5.py --access-file <私有访问文件> --known-hosts <已验证的私有known_hosts>`。已存在的空访问文件可以使用环境变量提供密码。

固定目标为 `ubuntu@43.160.221.28`，SSH 主机指纹必须为 `SHA256:RRe4A9Z+YdIUgq4l2DYxXnmuucnIVzeBbmeB2E16LqE`。脚本使用 `RejectPolicy`，维护环境须先准备经过该指纹核对的 `known_hosts`，不会自动信任未知服务器。

脚本先检查类型及测试、编译、记录 269 个相关源文件和 245 个产物的 SHA-256（数量随工程变化），拒绝构建后被修改的源码或 dist。上传和服务器发布脚本位于 [publish-h5.py](https://github.com/copypasteltd/HKBUS/blob/android/deploy/h5/publish-h5.py)、[deploy-site.py](https://github.com/copypasteltd/HKBUS/blob/android/deploy/h5/deploy-site.py)。无需本地 Docker、WSL、虚拟机或模拟器。

### 宝塔路径和回滚

| 用途 | 路径 |
|---|---|
| 宝塔域名根目录 | `/www/wwwroot/hkbus.copypaste.hk` |
| 版本目录 | `/www/wwwroot/hkbus.copypaste.hk/.hkbusgo/releases/<releaseId>` |
| 当前链接 | `/www/wwwroot/hkbus.copypaste.hk/.hkbusgo/current` |
| 所有权及当前发布记录 | `.hkbusgo/owner.json`、`.hkbusgo/deployment.json`（公网不可读） |
| Nginx 扩展 | `/www/server/panel/vhost/nginx/extension/hkbus.copypaste.hk/hkbusgo-h5.conf` |
| 首次接管备份 | `/www/backup/hkbusgo-h5/<releaseId>-before.tar.gz` |
| 本地默认结果 | `dist/h5-deployment/` |

宝塔主配置仍保留域名根目录、验证目录和日志；只使用已有扩展钩子配置应用 location。不要直接覆盖旧根目录或移动不可变 `.user.ini`。原旧站文件和前一发布目录保留。重复部署前核对所有权和扩展内容；遇到人工修改会停止，须先检查实际差异。

每次部署：校验上传包/所有文件 → 准备完整版本 → 保留旧懒加载资源 → 原子切换链接 → `nginx -t`/reload → 源站核验 → 全量公网文件核验 → 真实 API 及跨域核验。失败时脚本恢复原链接和扩展，再执行 Nginx 检查及 reload；成功报告记录 `rollbackPreviousRelease`，首次接管为 `null`。

人工回滚时先读取成功发布记录，核对旧目录属于本站 `.hkbusgo/releases/`，再原子切换 `current` 至已确认旧版本并核对线上文件。首次接管若要恢复接管前旧站，移开本应用扩展并检查/reload Nginx；原根目录文件仍保留，并有额外离线备份。人工操作后须同步当前版本记录，保留操作证据，不能把失败版本重新标为通过。

HTML 采用 `no-store, no-transform`；JS/CSS 使用内容哈希和长期缓存；固定名称图片要求重新验证。不要恢复只有 `/css/app.css` 的缓存方式，也不要省略 `no-transform`。发布器的 API 检查验证到站可获取及 CORS，业务新鲜度、页面交互、断网及移动布局仍须在实际线上浏览器检查，并将 JSON/截图同步 `docs/`。测试完成后关闭本次创建的页面、浏览器和临时代理，清理仅由本次测试创建的匿名资料。

## English

The actual passenger website is [hkbus.copypaste.hk](https://hkbus.copypaste.hk/), using the production HTTPS API. BaoTa keeps `/www/wwwroot/hkbus.copypaste.hk` as the domain root; a scoped Nginx extension serves the version selected by `.hkbusgo/current`. Previous export-only reports describe an earlier state.

Future frontend updates are authorized to publish to their corresponding production website after verification. Shared mobile changes must be synchronized to the Android/H5 source before publication. Admin keeps its existing `/admin/` destination. This authorization excludes the old mock-data prototype and demo; it does not constitute mini-program upload, physical-device or store acceptance.

Use native Windows Node/Python. `npm run release:h5` checks types, runs tests and builds the actual H5. `npm run deploy:h5` also uploads and publishes it. Supply SSH credentials through a private access file or `HKBUS_SSH_PASSWORD`; provide the trusted known-hosts file matching the fingerprint above. No passwords belong in source, documentation or output packages.

Publication validates source/build hashes, archive paths and static files, retains old lazy chunks, switches a versioned symlink atomically, validates/reloads Nginx, then verifies every public file and the actual cross-origin arrival API. Failure restores the previous pointer/configuration. The original site and an initial offline backup remain available. Review the actual published pages/API, record evidence under `docs/`, and close test browser/proxy connections. See [the release report](H5-SITE-LIVE.md) for current versions and independently scoped acceptance.
