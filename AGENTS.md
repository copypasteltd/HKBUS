# Actual Android / H5 workspace

- 使用 Windows 原生工具。禁止本地 Docker、WSL、虚拟机和 Android 模拟器。
- 检查后关闭本次创建的浏览器、页面和上下文，保留用户已有页面。
- 2026-10-17 用户已授权后续实际前端更新自行同步生产网站。乘客 H5 为 `https://hkbus.copypaste.hk/`；宝塔域名根目录 `/www/wwwroot/hkbus.copypaste.hk`。共享 UI/业务变更须同步相关独立客户端、验证后自动更新该 H5，不能只导出 dist。
- `npm run deploy:h5` 执行类型检查、测试、H5 构建、指纹校验的 SSH 上传、版本目录切换及公网文件/API 检查。私有 SSH 访问文件或 `HKBUS_SSH_PASSWORD` 提供凭据，禁止提交或打包凭据。使用新环境前准备已验证指纹的私有 `known_hosts`。
- 每次发布必须保留回滚版本并验证实际线上页面/API。结果及截图记录在 `docs/`，详见 `docs/H5-DEPLOYMENT.md`。Admin 使用其既有 `/admin/` 路径及发布流程。
- 不部署或维护旧 `prototype/`、假数据 HTML demo 或其 Vercel 站点。实际 H5 已获授权，不能与旧原型混淆。
- 源码、构建、API、真实网站浏览器、官方 IDE、真机和平台上架分别验收。H5 发布不代表小程序上传或 Android 真机/上架已完成。
- 用户端喜好、收藏、最近查看和提醒统一保存在本机，不建立账号或匿名云端档案，不请求 `/v1/profile`。公交查询保持真实公开 API。使用版本化本机仓储，保留迁移/存储失败反馈、重设偏好与清除全部资料的区别；不得保存精确定位。
