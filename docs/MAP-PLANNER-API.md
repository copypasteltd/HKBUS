# 港巴通地图与行程 API 契约

日期：2026-10-20。适用实际 Backend、微信、支付宝、抖音、Android 和正式 H5。正式根地址：`https://hkbus-api.copypaste.hk/api/`。本页说明已实现契约；各层验收和发布证据见[实施报告](MAP-PLANNER.md)。

## 1. 数据与身份

所有接口沿用 `{data, meta}` 或统一错误体；客户端要求 `meta.mode = live`。线路身份包含营办商、路线号、方向和 serviceType，例如 `KMB:112:O:1`；站序身份为 `(routeId, stopId, sequence)`。同一物理站在循环线多次出现，不可用站码首次匹配代替。方向相反、服务类型不同、站序变化均须重新核对。

当前目录仅 KMB/LWB。路线几何、道路和总站时刻是已核对的官方公开参考；ETA 是现时预测。TDAS 继续提供独立道路参考，不参与生成公交车程、车辆坐标或总到达时刻。查询不需要乘客账号、会话凭据或个人档案。

## 2. GET /v1/map/stops

按真实视野发现站点；示例：`/v1/map/stops?west=114&east=114.3&south=22.2&north=22.5&limit=250`。

| 参数 | 限制 |
| --- | --- |
| west / east | 必填数字，113～115，west < east |
| south / north | 必填数字，22～23，south < north |
| limit | 整数 1～400，默认 250 |

严格拒绝未知参数；不要附加 `force=true`。刷新同一区域重新 GET 即可。坐标为 WGS84；数值范围是接入校验范围，不代表范围内一定有可用服务。

`data` 包含 `items`、`total`、`limit`、`truncated`、`bounds`、`source: live`、`catalogSyncedAt`。每项为真实 Stop，增加 `serviceCount`。total 是整个视野的现行站点数，不是本次返回数；items 按离视野中心距离排序。truncated 为真时，界面明确提示缩小范围或搜站名，列表不能冒充完整区域。移动地图只更新待搜索视野，用户按“搜索此区域”后才再次发现站点。

## 3. POST /v1/journeys

每侧恰好选择官方站 ID 或本次 WGS84 地图点：`startId XOR start`、`endId XOR end`。缺少一侧、同侧同时提供两种、同官方站或距离小于 2 米的两个地图点，均不能作为合法查询。不存在的站返回 `STOP_NOT_FOUND`，格式/范围错误返回 422。

```json
{
  "startId": "BFC406EB675EF22E",
  "endId": "44AF4BBD0B0BB3A0",
  "maxTransfers": 2,
  "transferRadius": 0,
  "accessRadius": 600,
  "maxWalkingMeters": 2000,
  "limit": 8
}
```

地图点用 `"start": {"latitude": 22.291039, "longitude": 114.205064}` 代替 startId，或用同形 end 代替 endId。示例坐标是公开站点位置，不是任何用户 GPS。

| 参数 | 服务端取值 / 默认 | 实际客户端选项 |
| --- | --- | --- |
| maxTransfers | 整数 0～2；1 | 直达、最多 1 次、最多 2 次 |
| transferRadius | 整数 0～500 米；0 | 同站、200、400、500 米 |
| accessRadius | 整数 100～1500 米；600 | 300、600、1000、1500 米 |
| maxWalkingMeters | 整数 0～5000 米；2000 | 500、1000、2000、3000 米 |
| limit | 整数 1～12；8 | 当前请求 8 条候选 |
| start/end.latitude | 数字 22～23 | WGS84；不写 URL 或本机存储 |
| start/end.longitude | 数字 113～115 | 原生地图坐标在适配边界转换 |

`start/end` 是最近候选官方站或 null；不能据此替换 `endpoints` 的实际输入点。地图点无接驳站时，候选数为零、journeys 为空，界面提示扩大接驳范围或改选官方站。官方站端点不附加接入/离开步行；点端点会返回对应 access/egress。

每条 journey 包含：

| 字段 | 语义 |
| --- | --- |
| id | 对路线与精确上下车站序等生成的候选标识；不是乘客、车辆或永久行程身份 |
| transfers / stopCount | 换乘次数 / 各程乘车站段总数，不能推导总耗时 |
| legs | 1～3 程；route、board、alight、stops、path。上下车含精确 sequence；path 含本程完整官方站序 |
| walking | kind = access / transfer / egress；from、to、distanceMeters、estimatedMinutes、basis = straight-line、pathVerified = false |
| walkingMeters / walkingMinutes | 接入、换乘与离开的直线总距离 / 各段按 75 米每分钟向上取整之和 |
| walkingVerified | 无步行段时为 true；有步行段均不代表真实道路可达 |
| pricing | 每程真实官方报价的完整/部分/不可用合计；未知不当零元，不含全部付款及转乘优惠 |

顶层 `request` 回显选项；`endpoints` 回显输入种类、坐标及候选接驳站数量；`search` 提供 algorithm、candidateCount、routeFamilies、returned、routeScans、labels、limited、exhaustive、catalogSyncedAt、generatedAt。exhaustive 始终为 false。candidateCount 是搜索实际发现的候选数，不是全网所有可行路线数；returned 也不是总可达方案数。

算法分轮扫描所有现行有序路线，最多三程；同站默认连接，明确开启半径才加入邻站。每站每轮最多 8 个标签、单路线扫描最多 16 个活跃上车状态、全查询标签预算 1,500,000；剪枝/超预算/返回上限均以 limited 表达。候选按换乘、站数与步行代价组织并按路线组合去重。前端排序仅作用于本次返回集合，不能称“全港最快/最便宜/全网最优”。

不验证实际人行路径、道路过街、楼梯、过海、开放时间或轮椅通行；附近站可能在现实中不可互达。没有可靠乘车耗时与未来换乘候车时间，因此不提供总到达时刻、换乘成功保证或真正导航。

## 4. POST /v1/journeys/check

出发前将候选身份重新送回当前目录核对；不相信客户端旧 path、车费、几何和倒数。

```json
{
  "legs": [{
    "routeId": "KMB:112:O:1",
    "boardStopId": "BFC406EB675EF22E",
    "boardSequence": 1,
    "alightStopId": "44AF4BBD0B0BB3A0",
    "alightSequence": 23
  }],
  "transferRadius": 0
}
```

legs 长度 1～3，站序整数 1～300，transferRadius 整数 0～500，默认 0；严格拒绝未知字段。逐程核验现行 active 路线、站点、精确上下车 occurrence、顺向下车、连接半径及重复路线。结构合法但目录身份失配返回 200 和 state = changed，而不是 HTTP 成功就信任旧候选。

| 数据 | 含义及恢复 |
| --- | --- |
| state = valid / changed | 当前目录身份与连接是否符合约束；valid **不表示正营运、有预测或一定赶得上换乘** |
| legs[].state = valid / changed | 精确站序是否仍存在；失配时不返回可信本站 ETA，提示重新规划 |
| connections[].state | same-stop / walking-candidate / invalid / unverified；不同站的 walking-candidate 仍未验证步行路 |
| checkedAt / source | 本次核查时间 / live；不是官方预测或票价资料原始时间 |
| legs[].arrivals | 按真实上车物理站去重请求，再按精确路线及上车 sequence 过滤；保留来源、freshness、warning |
| legs[].fare / reference | 独立取得本程报价和官方参考；失败不影响其他程，未知不转为零元或停驶 |
| legs[].geometryScope | official-selected-segment / unavailable；只绘经过匹配的本程上下车范围 |

官方几何依据完整站序作有序投影，85 米容差，每站最多 24 个锚点，动态选择非逆序匹配。重复站会匹配实际选中 occurrence。MultiLineString 的分段保留，不跨缺口画假桥；无法可靠匹配则不画公交路径。步行参考独立虚线，不能混作官方公交线。

客户端详情前台每 30 秒核查，10 秒更新显示时钟；隐藏/离开暂停，返回恢复；同一代只保留当前请求，旧响应不覆盖新状态。核查错误或 checkedAt 超过 60 秒明确标为较旧；ETA 另外按各来源时间判断过期。没有预测与确证停运分别表达。

## 5. 本机事务、生命周期和隐私

```mermaid
flowchart LR
  A[地图或官方站选点] --> B[内存草稿与参数]
  B --> C[POST journeys]
  C --> D[有界候选与三方案比较]
  D --> E[内存行程 ID]
  E --> F[POST journeys/check]
  F --> G[精确站序与各程 ETA/票价/地图]
```

1. 地图选点、主动 GPS 与当前视野仅在内存和当次查询；不写地址栏参数、Taro 持久缓存、收藏/常用行程或乘客档案。清除旧版本坐标缓存。公开官方站坐标仍可作为站点实体保存。
2. 端点/参数变化或交换后，清空旧候选与比较；代号检查阻止迟到结果回填。地图选择返回同一草稿。重设偏好保留出行集合；清除全部移除集合、查询缓存和内存草稿，并传播同源标签页边界。
3. 最多保留 12 个本次详情，30 分钟失效；页面刷新或完整清除后给出重新规划入口，不能将随机内存 ID 当作可分享永久链接。常用行程仍只保存两个官方站，不保存精确点。
4. Fastify 日志剥离查询串且不记请求体；本站 Nginx 对 map/stops、stops、home 三个坐标查询路径关闭访问日志并抑制错误 URL。仅对自有受控日志作保证；边缘与地图提供商收到网络/区域信息，其日志未纳入本次审计。
5. H5/Android 使用 MapLibre/OpenFreeMap；小程序使用平台 Map。WGS84 为业务契约，GCJ-02 只在原生地图渲染/事件适配边界转换，不污染官方坐标。地理拒绝、底图失败、超范围和列表替代分别有恢复。

## English implementation note

Viewport discovery returns real stop counts and explicit truncation. Planning accepts either an official stop or a WGS84 point per endpoint, uses a bounded round-based search across current directed route sequences, supports up to two transfers and optional nearby-stop connections, and never claims an exhaustive, fastest or cheapest journey. All walking is an unverified straight-line reference at 75 m/min. Exact route/stop occurrences are revalidated before live boarding-stop arrivals, fares and clipped official geometry are displayed.

`valid` means current catalog identity and connection constraints match; it does not establish operation, a successful connection or the existence of a fresh forecast. Precise points stay in memory and request bodies; they are excluded from URLs and persistent passenger/cache storage. Passenger accounts and cloud profiles remain absent. Own-service log handling, public-browser tests, target builds and native device acceptance are recorded separately in the linked implementation report.
