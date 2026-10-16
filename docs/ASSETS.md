# 图片与截图来源 / Visual asset provenance

中文：README 横幅、数据架构图由本项目脚本本地绘制；页面总览从实际截图排版生成。所有页面截图来自当前实际应用构建，通过真实 HTTP 访问只接官方 KMB/TDAS 的隔离 BFF，没有用示例响应替换接口。收藏和提醒仅在隔离匿名身份中通过真实 API 创建；Admin 中的流量属于文档检查请求，不能解读为客户使用量。通告没有虚构文章，因此展示空列表和不可用详情状态。

English: Banners and the architecture diagram are rendered locally by the project documentation script. The contact sheet contains actual screenshots. Screenshots use the current application builds and real HTTP to an isolated, live-only KMB/TDAS BFF; responses are not stubbed. Bookmarks and reminders were created through actual APIs only in an isolated documentation identity. Admin request metrics represent documentation activity, not customers. No notice articles were invented: empty and unavailable states are shown.

中文：移动截图来自 390×844 Chromium 中的 Taro Android 界面；三个小程序沿用同一应用体验，仅作界面参考，不是微信/支付宝/抖音官方 IDE 或手机截图。附近站点的浏览器定位输入采用官方站点坐标，不是物理 GPS 采样。Android 也尚无物理设备截图。后台与 API 截图来自 1440×1000 浏览器。截图可能反映深夜无预计、较旧资料和滚动位置，数值不是固定产品内容。

English: Mobile captures show the Taro Android renderer in a 390×844 Chromium viewport. The mini-programs share this experience, but these images are UI references, not captures from the WeChat, Alipay or Douyin IDEs or from phones. Browser geolocation uses an official stop coordinate as input, not a physical GPS sample. Android physical-device screenshots are also pending. Admin/API captures use a 1440×1000 browser viewport. Night-time no-estimate/stale states and scroll position are preserved; displayed values are not fixed product content.

中文：脚本仅启动并关闭自己的浏览器、上下文和临时服务；未操作用户已打开的页面、现有 Backend、历史原型或 Vercel。图像不包含登录密码、JWT、刷新令牌、数据库或客户资料。项目未擅自附加开源许可证；字体和图标依其上游许可使用，商业/再分发范围应由权利人确认。

English: The capture script closes its own browser, contexts and temporary servers, without touching user tabs, the existing Backend, historical prototypes or Vercel. Images contain no passwords, JWTs, refresh tokens, databases or customer records. No open-source licence is granted by this documentation. Upstream fonts/icons retain their applicable licences; the owner must determine commercial and redistribution rights.

See [screenshots.json](screenshots.json) for timestamps, entities, scope and cleanup results.


品牌更新 / Brand update — 2026-10-17：正式采用用户确认的 10 号「朱印车迹」。图形由指定 sub2-image-gen 生成稿提取矢量轮廓、统一实色后导出；README 横幅使用该正式图形。图形内无任何文字。Approved option 10 is traced from the user-selected generated concept and exported as solid-colour vectors/PNGs; documentation banners use this approved symbol. The mark contains no wordmark. See [BRAND.md](BRAND.md).


当前品牌更新与截图检查见 [BRAND-ROLLOUT.md](BRAND-ROLLOUT.md) 和 [brand-validation.json](brand-validation.json)。`validation.json` 保留首次分仓时的检查快照。本次 36 张浏览器截图包括原 29 张页面/API 图、关于页 1 张及三语/窄屏/大字/横屏 6 张检查图；布局检查图未冒充原生截图。Current brand verification supersedes the initial standalone snapshot for this change; source/build/browser evidence does not claim official IDE or physical-device acceptance.
