# 港巴通 H5 正式前端 dist / HKBusGo production H5 dist

API: https://hkbus-api.copypaste.hk/api/

将 dist/ 内全部文件发布到 HTTPS 网站根目录，例如把服务器网站根目录设为 /www/wwwroot/hkbusgo-h5/dist。首页入口 /#/pages/home/index，使用 hash 路由。index.html、js/、css/、assets/ 必须一起上传；不支持直接双击 file://。本次导出不发布网站。

静态资源 publicPath 为 /，Logo/图标也使用 /assets/。如需部署到 /h5/ 子目录，须先统一调整 Taro publicPath、图标/品牌路径和 HTML 图标路径并重新构建，不能仅移动 index.html。deploy/nginx-location.conf 可合入现有 HTTPS server 块。

2026-10-17 后续服务端更新：正式 API 已使用 CORS_ORIGINS=*，接受任意 H5 origin 和请求头，无需登记新的 H5 域名。原 ZIP 包内的白名单说明保留为导出时快照；当前以 [任意来源跨域文档](https://github.com/copypasteltd/HKBUS/blob/backend/docs/CORS-OPEN.md) 为准。匿名收藏/提醒使用 Bearer 会话，不使用管理后台登录 Cookie。

本包来自实际 Taro 14 页前端，与上一轮成功构建并验证过的 App H5 renderer 逐文件一致，支持浏览器模式。使用真实 KMB/LWB 线路、站点和 ETA，沿用 10 号图形 Logo 与 Accessible Calm Minimal。TDAS 道路参考在正式服务器仍返回 502，不生成假结果。

源码：GitHub copypasteltd/HKBUS 的 android 分支，提交 f0075fe5fbbdc51be90726ade2af39755afbc6bb；该分支包含原生 Android 和 Taro H5 源码。重新构建：Windows 原生 Node 22.14+，npm ci，设置 TARO_APP_API_BASE=https://hkbus-api.copypaste.hk/api，再执行 npm run build:h5，输出 dist/h5。本次复用已通过的构建，没有重复编译或修改压缩后的代码。

HTTPS 浏览器支持定位、系统分享/剪贴板；具体授权、浏览器支持和真实设备行为须在实际网站独立验收。提醒仅在页面开启时接收，浏览器不具备 App 原生后台推送保证。浏览器检查只在本机提供静态文件，所有 API 响应来自正式 HTTPS；不会据此宣称网站已上线或真机已验收。

Serve every file inside dist/ at an HTTPS website root. The entry is /#/pages/home/index. Keep index.html, js/, css/ and assets/ together. Assets use absolute root paths; subdirectory hosting requires rebuilding with consistent public/asset paths. This export does not publish a website. The Backend was subsequently updated to CORS_ORIGINS=* and now accepts every H5 origin and arbitrary request headers; the original ZIP README describes the earlier allowlist configuration.

This is the real 14-page Taro frontend, exported byte-for-byte from the preceding verified production API build. KMB/LWB data is real; production TDAS road queries remain unavailable with 502. The source is the android branch at the commit above; use npm run build:h5 to rebuild. Native App-only capabilities are gated in browser mode. HTTPS/browser permission and physical-device acceptance remain separate. No credentials, database or native Android files are included.

文件清单和 SHA-256 见 manifest.json、SHA256SUMS.txt；本次完整验证见 docs/hkbus-h5-production-dist-2026-10-17.md。
