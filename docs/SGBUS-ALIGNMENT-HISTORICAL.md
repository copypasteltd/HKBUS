# 港巴通：SG Bus 七项能力实施与验收

日期：2026-10-19。状态：七项能力已实现，实际网站与接口验证通过，四客户端已编译交付；官方 IDE、真机和平台发行尚未验收。本次落实用户指定的地图、实时到站、运营时间、收藏查车、收藏管理、搜索和个性化，覆盖实际四个 Taro 客户端、Android/H5 及所需公开后端。沿用 Logo 10、Accessible Calm Minimal、真实数据和无乘客账号的既定要求。

## 需求与完成证据

下列 27 项要求已落实到源码和构建，Web 可用行为有实际公网页面证据；小程序原生地图、定位、系统主题等仍须在官方 IDE / 真机验证。B 为本次生产网站 18 项专项检查的顺序编号，R 为 28 项回归检查的顺序编号，T 为源码业务测试，A 为真实接口检查，C 为编译及产物核验。详见文末证据索引。需求编号使用 SGALIGN 命名空间，避免与历史本机偏好专项的 PREF 编号混淆。

| 编号 | 要求 | 验收内容 | 已落实证据 / 原生待验边界 |
| --- | --- | --- | --- |
| MAP-01 | 真正街道底图 | H5/Android 使用可交互真实地图，小程序使用平台地图；可缩放、拖动、点站和恢复全线视野，有合法署名及加载失败恢复 | B9、B11～13；T 地图/坐标模型；小程序原生交互待官方 IDE/真机 |
| MAP-02 | 完整官方线路 | 全量站点及官方道路几何，不再截取前 8 站；方向、服务类型、站序和坐标系正确，未匹配时不伪造连线 | B1、B11；A 四条方向/夜线；T 原生地图边界与完整几何 |
| MAP-03 | 附近地图/列表 | 同一批真实站点，显示名称/站码/距离，按道路组织列表；本机记忆视图，可主动定位及手动选站 | B14；T 半径/分组/状态；原生定位待真机 |
| MAP-04 | 地图数据真实性 | 固定站点、官方路线几何与车辆 GPS 分开；没有经过核实的车辆位置时不绘制假车辆或把 ETA 动画称为追踪 | A reference/status 的 vehiclePositions=false；源码无车辆位置生成 |
| ETA-01 | 两班/三班 | 设置后在实时站点、收藏查车及相关聚合界面一致生效，全部来自真实预报 | B4～5、B15；T 班数与预计筛选 |
| ETA-02 | 网格/列表 | 提供 Modern 网格和 Classic 列表并本机记忆，小屏与大字仍能操作 | B4、B15；R24、R26 小屏/大字/三语 |
| ETA-03 | 即将到站与状态 | 不足一分钟显示即将；有预计与暂无预计分区；网络失败/资料过期/当前无预计不能混作确定停运 | B5；T 59/60 秒边界、空首班/后续班、旧资料 |
| ETA-04 | 更新及身份 | 前台刷新、时间新鲜度、方向/特殊服务/重复站序隔离保持正确，后台停止无用轮询 | B5、B8；R10～13、R23；T 生命周期/去重/服务身份 |
| OPS-01 | 官方运营时刻 | 接入九巴官网发布的对应方向、服务类型时刻表，展示首末班、分时班距/指定发车与来源时间 | B1、B10；A 官方时刻与来源；T 解析/匹配 |
| OPS-02 | 运行日与跨午夜 | 解释工作日、周六、周日/公众假期及其他官方日别；采用香港政府假期资料，跨午夜和分段运营正确 | A 2026-10-19 公众假期及 N182 夜线；T 跨午夜/日别/假期 |
| OPS-03 | 时间线及适用点 | 显示当天运营时间线和状态；官方总站开出时间明确标为总站，不移作中途站首末班 | B10；T 时间窗；界面明确总站及 +1 |
| OPS-04 | 缺失及变化 | 对未知运行日、未匹配服务、旧资料、来源失败给出可信状态；不从空 ETA 推断停运 | T 旧资料、未知日别、站序改变、来源异常；A 实际来源状态 |
| FAV-01 | 收藏即查车 | 收藏站点可直接展开当前真实 ETA，不要求跳转看板或逐站打开详情 | B7～8；实际站点 ETA 请求及截图 |
| FAV-02 | 收藏指定服务 | 站点下选路线/方向/服务类型及重复站序，支持全部服务或指定组合；从站点页与收藏页均能管理 | B6～7；T 精确 routeId/sequence、保存前复核 |
| FAV-03 | 聚合刷新 | 同站合并请求、手动刷新、前台更新；保留本机条目并处理停用/旧站序，不保存 ETA 为个人资料 | B8；T 同站合并/有界并发/失配；R23 旧站序拒绝 |
| SAVE-01 | 置顶及命名 | 置顶/取消置顶、重命名、排序和确认删除；明确置顶与手动/距离排序的优先关系 | B7；T 置顶组/排序/24 字命名/确认删除 |
| SAVE-02 | 距离及最近 | 主动定位后本机计算收藏距离；收藏旁独立展示最近 10 个车站及距离，一键回到到站 | B7；T 独立最近十站与距离；浏览器使用显式测试位置，不代表设备定位验收 |
| SAVE-03 | 本机事务 | 旧版本完整迁移，保存失败不丢旧值，异步清除边界和跨标签页正确；无账号、云档案或个人凭据 | B3、B17～18；R1、R20～23、R27～28；T 原子写入/迁移/清除 |
| SEARCH-01 | 真实道路检索 | 接入官方道路/站址关系，按道路查真实站点并可进入详情，移除原先空能力的道路分类 | B2、B9；A 1,050 道路实体和关联站点 |
| SEARCH-02 | 统一与归一化 | 路线/站点/道路一处检索；繁简、大小写、全半角、空格及常见英文道路简称统一；精确命中优先 | B2、B9；A 四种 Nathan Road 查询；T 归一化/排序 |
| SEARCH-03 | 道路与线路索引 | 可从道路浏览相关站点，从路线理解途经道路；同名、失效关系和部分覆盖如实处理 | B9、B12；A 道路详情；T 歧义匹配拒绝 |
| PREF-01 | 主题 | 浅色/深色/跟随系统，本机记忆；文字、输入、弹层、底栏和地图主题一致 | B4、B13、B16；R24、R26；原生系统主题事件待 IDE/真机 |
| PREF-02 | 字号 | 小/中/大三档，全页面应用；兼容原大字偏好，默认阅读感保持方案五 | B3～4、B15；T 旧大字键迁移；R24、R26 |
| PREF-03 | 显示与复用 | 到站班数、布局、附近视图、收藏显示/排序等本机保存；保留繁简英、首页站点、提醒阈值和历史开关 | B4、B8、B14～15；T 本机仓储；R28 无个人请求 |
| PREF-04 | 重设与清除 | 重设偏好保留收藏/历史/提醒/常用行程/看板；清除全部才移除集合与缓存；精确定位不持久保存 | B17；R27～28；T 清除事务/重设；B14 定位不落盘 |
| SHIP-01 | 四端和网站 | 同步四独立客户端，分别检查/测试/编译；正式 H5 自动发布、保留回滚并核验真实网站/API | C 三小程序/Android/H5；254 公网文件 SHA；B1～18、R1～28 |
| SHIP-02 | 可维护交付 | 更新需求、双语 README、真实截图与 dist/APK；提交对应独立分支，保留既有宝塔数据、后台和配置 | C 五个交付包及 SHA；七分支双语 README/截图/验收；数据库备份与回滚记录 |

## 已确认的补充来源

- 九巴官网公开路线接口：`getstops` 返回站序、站址和 HK80 路线几何；必须与现行 KMB ETA 目录核对后使用。
- 九巴官网公开时刻表接口：`getschedule` 返回服务类别、运行日、方向发车时间与班距；这是总站发车时间，不是所有中途站的时刻表。
- 九巴官网公开全站资料：`getallstops` 可提供道路/地址关系；与当前官方站点身份匹配后建立检索索引。
- 香港政府 1823 公众假期：用于解释运行日，不能使用新加坡日历或简单把周日视为全部假期。
- 地图底图采用经过核对的地图服务及署名，小程序与 Web 的坐标系/运行能力分别验证。

实时公交 ETA 继续采用 KMB 官方开放数据，TDAS 保持独立道路参考。公开运营资料的附加接入不引入乘客账号或存储用户喜好。现有来源没有可核实的车辆 GPS，任何车辆位置能力须另行取得真实数据后启用。

来源发现的请求与摘要记录在 `docs/assets/sgbus-alignment/2026-10-19/source-probes/`。当前完成状态由下列独立证据支持，需求表本身不替代验证。

## 页面、交互与软件规则

### 地图与附近

Web/Android 采用 MapLibre GL 及 OpenFreeMap 街道底图，保留 OpenFreeMap、OpenMapTiles、OpenStreetMap 署名；微信、支付宝、抖音采用 Taro 平台 Map。显示现行全部站点，不再限制前 8 站。官方路线是分段 MultiLineString，保持原有分段，不用站点间直线补齐没有提供的道路。

点击站点联动具体站序或车站详情；缩放后可恢复全线视野。Web 命中范围至少 44 像素，重叠命中取离触点最近的车站。组件隐藏、切页或文档后台时释放 Web 地图，重新显示时恢复。底图失败给出重试及车站列表；缺道路几何只画真实站点。Web 使用 WGS84；小程序渲染时转换至平台地图坐标，目录和个人存储中的官方坐标不被改写。

附近默认 500 米，可选 1/3 公里，按道路分组，地图/列表在本机记忆。每页最多 100 个站点，可翻页。拒绝或未主动定位时允许手动选站，不显示虚构距离；直线距离和步行估算不等于步行寻路。

MapLibre 6 的独立 worker 与共享模块随 H5 一同发布；站点只在地图资源目录补充 `.mjs` 的 JavaScript MIME 类型，避免严格 MIME 校验导致空白。保留 Nginx 主站配置及回滚机制。

### 实时到站与营运时间

服务身份为 `routeId + stopSequence`，其中 routeId 已包含线路号、方向和服务类别。物理站码相同但经过站序不同的循环线不得合并。站点服务清单独立于 ETA 获取，避免没有预测时误删仍然存在的服务。

站点和收藏提供网格 Modern/列表 Classic，以及两班/三班；线路站序、首页后续班次、看板沿用同一班数偏好。分钟/香港时刻偏好继续保留。少于 60 秒显示即将到达，恰好 60 秒仍显示 1 分钟。前台约 30 秒查询、10 秒更新本机时钟；旧资料和离线缓存不显示可信倒数。

服务分为“有到站预计”和“暂无到站预计/预计待更新”；某班为空但后续班存在时仍属于有预计。空 ETA、未匹配、上游失败、旧资料均不等于停驶。服务展开可查看时刻、路线车费、候车看板和提醒。

运营时间使用九巴官网时刻表原文和班距，并与当前方向/服务类型核对。界面明确是**起点总站开出时间**，不是每个中途站的到站首末班。今日首末班、当前时间线、星期/公众假期、班距、跨午夜 `+1` 及来源时间分别表达；保留未自动解读的原文。政府日历覆盖外、未知日别或旧时刻表只显示未核实状态。

### 收藏查车、管理与本机事务

收藏上限仍为 50 个车站/路线。车站收藏默认看全部服务，或保存指定 `{routeId, sequence}` 数组；保存前从公开 API 再次核对现行服务。条目失配时提示重选，不替换成另一方向、特别班或另一次经过。

收藏页直接聚合展开站点的真实 ETA，同一站只请求一次，最多 4 个并发；收起站点停止加入下一轮查询。全局展开/收起被保存，单卡临时操作不修改其他条目。支持置顶/取消置顶、24 字命名、同置顶分组内上移/下移，以及确认删除。置顶优先，再按手动顺序或当次位置的直线距离排列；路线收藏没有站点距离，排在有距离车站之后。

最近 10 个车站独立保存，避免被综合的 20 项路线/站点历史挤掉；关闭历史或清除历史会处理两个集合。精确位置只在当次内存中使用，刷新/关闭后不恢复；持久化的站点位置是公共目录资料。

本机仓储升级到 schema 3，兼容 schema 1/2 及早期单独“大字”键。写入成功后才更新可见状态和清理旧键；写入失败保留旧资料。清除全部会更换事务边界，使尚未结束的异步保存失效。跨标签页刷新继续按版本处理。重设偏好保留收藏、历史、提醒、行程和看板；清除全部才删除集合及本应用查询缓存。

### 搜索与个性化

路线、车站、道路统一检索。繁简中文、全半角、大小写、空白及常见英文道路简称归一化，精确结果优先。`Nathan Rd`、`ＮＡＴＨＡＮ　ＲＤ.`、`弥敦道`、`彌敦道` 对应同一道路身份。道路详情列真实站点，路线页提供途经道路入口。

道路索引来自九巴官方全站资料，并以现行站名和 40 米内位置核对；近邻存在歧义时不强行匹配。本次实测匹配 6,472 / 6,775 个车站，约 95.5%，形成 1,050 个道路/站址条目。未匹配车站仍可用官方站名/站码查询；这不是香港全部 POI 或所有营办商道路索引。

偏好包括浅色/深色/跟随系统，小/中/大三档字级，两班/三班，网格/列表，附近视图，收藏展开/收起、手动/距离排序，以及既有繁简英、分钟/时刻、首页站点、提醒阈值和历史开关。全部即时保存在本机。主题通过语义颜色变量覆盖文字、输入、弹层、底栏、卡片及 Web 地图；小程序底图样式由平台决定，系统主题事件仍需各平台官方 IDE/真机分别确认。

## 后端、数据库与数据边界

新增公开接口包括路线 `reference`、站点 `services`、道路详情和 `reference/status`；站点到站附加完整服务清单。维持 `{data, meta}`、真实数据标志及现有正式 API 根路径。接口详情见 Backend 分支 `docs/SGBUS-ALIGNMENT.md`。

SQLite schema 3 仅新增 `stop_places`、`roads`、`route_references` 公共元数据表。公交主目录、管理账号、既有设置和宝塔登记均保留。路线/道路资料缓存 24 小时，假期检查间隔 7 天；失败时路线旧资料最多保留 7 天并标旧，日历最多 30 天。站序签名改变即撤销旧路线几何，请求合并、4 个并发及有界队列限制上游压力。

后端已发布 `20261018T204839Z-82c900482bfd`，端口仍为 39410。发布前通过既有宝塔备份脚本备份并核验数据库，保留旧版本；未替换数据库或改动环境凭据。失败回滚会恢复旧程序及兼容的 schema 标记，新增公共表保留，不覆盖业务资料。实际部署记录见 `assets/sgbus-alignment/2026-10-19/backend-deployment.json` 与 `deployment.log`。

## 仍与 SG Bus 不同的边界

- 香港覆盖目前为 KMB/LWB；没有用新加坡铁路内容替代香港 MTR，也没有宣称覆盖城巴、小巴、渡轮或全部香港公交。
- 现有来源没有车辆 GPS、车辆轨迹、逐车拥挤度及车型。地图只展示真实站点和官方道路几何，不把逐站 ETA 包装成车辆定位。
- 官方时刻是总站发车，不足以生成可信的所有中途站首末班。
- 保留已确认的 Logo 10、Accessible Calm Minimal 和现有四入口导航，使用体验能力对标，不复制对方商标或全部信息架构。
- 保留繁简英三语；SG Bus 的更多语言、本地铁路特色、广告和统计体系未照搬。提醒继续为本机前台检查，没有新增账号、云同步或关闭后推送承诺。

以上是数据及已定产品边界，不作为伪造能力或混用新加坡数据的理由。

## 最终交付与验收层级

| 层级 | 本次结果 | 证据与限制 |
| --- | --- | --- |
| 源码 | 四客户端共享 src/test 共用文件逐字节 SHA 一致，平台配置保持独立；Backend 新公开元数据适配 | [一致性报告](assets/sgbus-alignment/2026-10-19/source-consistency.json)；源码一致不等于各平台运行行为相同 |
| 类型/业务测试 | 四客户端各 55 项；Backend 主业务 57 项、出口代理 3 项，类型与构建通过 | 各端 test/typecheck/build 日志；合成数据仅用于隔离业务规则测试，不是运行服务数据 |
| 小程序编译 | 微信 278 文件、支付宝 275 文件、抖音 275 文件；均 17 页 | [三个小程序构建](assets/sgbus-alignment/2026-10-19/mini-builds.json)；不等于官方 IDE / 真机 / 上传平台通过 |
| Android 编译 | 原生 Windows JDK 21、SDK 36，生成 Debug APK；APK 内 254 个 H5 文件逐项核对 | [Android 构建](assets/sgbus-alignment/2026-10-19/android-builds.json)；没有运行模拟器，不含商店发行签名或真机结果 |
| H5 发布 | 17 页、254 个文件上传并逐项核对公网 SHA，Nginx 检查通过，保留旧版本 | [发布记录](assets/sgbus-alignment/2026-10-19/h5-deployment.json)，实际网站 [港巴通](https://hkbus.copypaste.hk/) |
| 真实公开 API（A） | 112 去/回、N182 夜线、48X 均返回当前官方完整站点、道路几何、时刻及 ETA；四种道路写法同一结果 | [API 实测](assets/sgbus-alignment/2026-10-19/public-api.json)；不是全 1,611 个路线方向逐条人工验收 |
| 正式网站专项（B） | 18/18 通过，含地图真实底图/覆盖层/点站/缩放/主题/隐藏恢复、运营时间和七项交互 | [完整 18 项记录](assets/sgbus-alignment/2026-10-19/browser.json) |
| 正式网站回归（R） | 28/28 通过，含旧数据迁移、看板轮询暂停、离线、行程、车费、跨页、跨标签、失败写入、四尺寸及全 17 页 | [完整 28 项记录](assets/sgbus-alignment/2026-10-19/regression-browser.json) |
| 官方 IDE / 真机 / 平台发行 | 未执行 | 需用户自己的平台 AppID、域名与用途配置；小程序地图/定位/主题、Android 真机、签名/上架须独立验收 |

专项及回归均访问实际 HTTPS 网站和真实公交 API，地图请求来自真实 OpenFreeMap。由于本地直连出口存在访问策略差异，采用已授权香港服务器网络出口建立临时测试通道，浏览器仍验证端到端 TLS；未关闭证书验证、替换接口响应或改动系统网络设置。定位检查使用明确的测试坐标，只证明拒绝/选择/距离/不持久化逻辑，不证明手机定位精度。存储失败、断网和旧站序是显式测试条件。所有本次创建的浏览器、页面、监听器与 SSH 通道已在 finally 清理，保留用户原有页面。网络清理与访问边界见同目录 browser-network.json、regression-network.json。

### 版本、备份及回滚

- H5 发布号：`20261018T212503Z-8edd4cf71378`；源码提交：`8edd4cf71378787699d9d439231c04091c03b57c`。
- H5 旧版本：`/www/wwwroot/hkbus.copypaste.hk/.hkbusgo/releases/20261018T101200Z-d253bc593d49`。主站 vhost 未覆盖，仅维护本应用扩展及地图模块 MIME。
- Backend 发布号：`20261018T204839Z-82c900482bfd`；源码提交：`82c900482bfd11f7d06f36138ae9fd1b14178627`；端口 **39410**；API：`https://hkbus-api.copypaste.hk/api/`。
- 宝塔 SQLite 备份：`/www/backup/database/sqlite/d6ad541c23e9d6a30c484ea7ccd36fe7/20261018_204928_hkbusgo.db`。完整性、外键与恢复读取检查通过；现行库未替换，既有管理用户和业务记录保留。
- Backend 上一发布 `20261017T202836Z-a1ec760d8bed` 保留。回滚只调整兼容 schema 标记及程序版本，新增公共元数据表不删，不能拿旧备份覆盖现行业务写入。
- Admin 本次仅同步文档/截图，不改运行代码或重新发布。旧 mobile、prototype、假数据 demo 与 Vercel 不在本次工作范围。

### 编译包与源码

本机完整交付目录为 `output/sgbus-alignment-2026-10-19/delivery/`。下表大小为实际产物字节数；完整 SHA-256、编译时源码提交与验证层级见 [产物清单](assets/sgbus-alignment/2026-10-19/build-artifacts.json)。

| 目标 | 文件 | 字节数 | 用法 |
| --- | --- | ---: | --- |
| 微信 | hkbusgo-wechat-dist.zip | 491,308 | 解压后在微信开发者工具导入，自行配置 AppID/域名 |
| 支付宝 | hkbusgo-alipay-dist.zip | 487,868 | 解压后在支付宝开发者工具导入 |
| 抖音 | hkbusgo-douyin-dist.zip | 486,467 | 解压后在抖音开发者工具导入 |
| 实际 H5 | hkbusgo-h5-dist.zip | 1,765,707 | 本次已部署的根目录 hash 路由静态文件 |
| Android | hkbusgo-android-debug.apk | 7,226,639 | Debug 安装验证包，非商店发行包 |

源码分别提交到 [wechat](https://github.com/copypasteltd/HKBUS/tree/wechat)、[alipay](https://github.com/copypasteltd/HKBUS/tree/alipay)、[douyin](https://github.com/copypasteltd/HKBUS/tree/douyin)、[android](https://github.com/copypasteltd/HKBUS/tree/android)、[backend](https://github.com/copypasteltd/HKBUS/tree/backend) 独立分支；[admin](https://github.com/copypasteltd/HKBUS/tree/admin) 与 [main](https://github.com/copypasteltd/HKBUS/tree/main) 同步交付说明。最终文档提交与发布时源码提交分别登记，不把文档提交误称为线上二进制源版本。

地图按需加载，MapLibre 包和 worker 会增加首次打开地图的传输量；当前编译成功和浏览器交互通过不能替代真机弱网性能、内存与长时间运行测试。三端使用平台 Map，不把 Web 的地图依赖装入小程序主包。

## 本次生产网站截图

以下为正式网站的移动浏览器实拍，不是原型渲染，也不是官方小程序 IDE 或 Android 真机截图。ETA 与来源状态随实测时刻变化。

| 全线路街道地图 | 收藏直接查车 | 官方总站时刻 | 深色大字 |
| --- | --- | --- | --- |
| <img src="assets/sgbus-alignment/2026-10-19/route-map.png" width="220" alt="真实线路和完整站点" /> | <img src="assets/sgbus-alignment/2026-10-19/favourite-arrivals.png" width="220" alt="收藏站点内当前真实到站" /> | <img src="assets/sgbus-alignment/2026-10-19/operating-hours.png" width="220" alt="起点总站时间线和跨日时刻" /> | <img src="assets/sgbus-alignment/2026-10-19/settings-dark-large.png" width="220" alt="深色主题与大字设置" /> |

## English acceptance summary

All seven requested areas are implemented: actual street maps, configurable live arrivals, verified origin timetables, selected-service favourites with inline ETA, pinning/ordering/recent-stop management, normalised road search, and local theme/text/display preferences. Four self-contained Taro projects share identical business/UI source while retaining platform configuration. KMB ETA remains the live source; verified public KMB website metadata and the Hong Kong government holiday calendar provide geometry, roads and operating schedules.

Each client passed type checks and 55 tests. Backend passed 57 business and three egress tests. WeChat, Alipay, Douyin, H5 and the Android debug APK were built with native Windows tools. The production H5 passed all 18 feature and 28 regression groups; all 254 public build files were hash-verified. No transit API responses were substituted. Test browsers, tabs and temporary network connections were closed.

Passenger data remains local without accounts or credentials. Existing data migrates to schema 3; failed writes preserve prior values; reset preferences keeps collections while clear all removes them. Location is explicitly requested and held in memory only. The BaoTa-managed database was backed up and retained. Admin runtime, the historical demo and Vercel were not changed.

This is not native-device or store acceptance. Official mini-program IDEs, native map/location/theme behaviour, real phones, platform upload and store signing/submission remain separate. Remaining product differences include the approved brand/navigation, KMB/LWB-only coverage, no rail integration, no verified vehicle GPS/type/occupancy, origin-only timetables, three languages and foreground-only reminders.
