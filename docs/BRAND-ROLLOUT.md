# 10 号品牌实施与验证 / Approved Logo Rollout

2026-10-17 · Logo 资产 / assets v1.0.0 · 产品需求 / product requirements v1.6.0

正式采用 **10 号「朱印车迹」**。SVG 母版、朱红/深蓝/反白、多尺寸透明 PNG、平台头像、Android adaptive/monochrome/notification/splash 资源、四端首页/关于页、Admin 与 API 文档已同步。图形内部无任何文字。详见 [品牌规范](BRAND.md)。

Option 10, Contemporary Seal, is approved. All applications and this checkout's documentation use the same graphic-only identity. The existing Accessible Calm Minimal interface palette and live API behaviour are retained.

![Approved logo variants](assets/brand/brand-overview.png)

| 验证 / Check | 结果 / Result |
|---|---|
| Backend / Admin / WeChat / Alipay / Douyin / Android | 六项目类型检查与各自构建通过 / All six checked and built |
| 现有回归 / Existing regressions | Backend 22 + shared Mobile 7 passed |
| Taro 源码 / Shared sources | 四独立移动工程与保留集成快照一致 / Four standalone snapshots match; 254 files |
| Android Debug APK | 编译通过，245 renderer files match; native launcher / notification resources packaged |
| 浏览器 / Browser | 36 captures; three served brand-asset comparisons; six responsive cases passed; no page errors |
| 图标遮罩 / Icon masks | Circle, rounded square, squircle: no foreground clipping (static calculation) |
| 清理 / Cleanup | Own browser and temporary services closed; existing user tabs preserved |
| 本机常驻 API / Local runtime | Existing Backend restarted against the same business database; health, API docs, brand script and favicon HTTP 200 |

本次浏览器检查发现并修复了 320 px 窄屏下品牌区阅读模式按钮被缩至约 36 px 的问题；现固定最小触控高度 44 CSS px、Logo 框最小 48 CSS px，四移动工程已重新构建。The narrow-screen brand header now preserves its minimum logo and control sizes through Taro viewport scaling.

证据 / Evidence：[brand-validation.json](brand-validation.json) · [screenshots.json](screenshots.json) · [图册 / Gallery](GALLERY.md)。初次分仓 `validation.json` 为历史快照，本次变更以本页为准。The initial standalone validation is historical; use this report for the brand update.

当前六端构建文件和校验值见 [品牌编译产物清单 / Build artifact hashes](brand-artifacts.json)。历史 ZIP 保留原快照；最新源码以相应 GitHub 分支为准。The new artifact manifest records the branded builds; earlier ZIPs remain historical snapshots.

浏览器使用实际 Taro Android 渲染器及真实 KMB/TDAS HTTP；附近坐标为浏览器测试输入。官方小程序 IDE、平台后台头像上传、Android 真机桌面/启动/通知、商店发布尚待验收。No official IDE, physical-device, store or platform-avatar-upload acceptance is claimed. No demo or Vercel deployment is included.

浏览器保持 APK 内嵌界面文件不变，仅将编译时本机 API 地址转发到隔离的真实 BFF；未替换响应或上游数据。The unmodified APK renderer's development API origin is forwarded to the isolated live BFF; no responses or provider data are mocked. 本机常驻服务另行加载新品牌资源，未替换业务库；见 [运行核查 / Local runtime](runtime-brand.json)。

GitHub：[main](https://github.com/copypasteltd/HKBUS/tree/main) · [Backend](https://github.com/copypasteltd/HKBUS/tree/backend) · [Admin](https://github.com/copypasteltd/HKBUS/tree/admin) · [WeChat](https://github.com/copypasteltd/HKBUS/tree/wechat) · [Alipay](https://github.com/copypasteltd/HKBUS/tree/alipay) · [Douyin](https://github.com/copypasteltd/HKBUS/tree/douyin) · [Android](https://github.com/copypasteltd/HKBUS/tree/android)
