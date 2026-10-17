# TDAS 专用数据出口 / Dedicated TDAS egress

## 中文说明

这是实际后端的数据传输组件。生产主机对 TDAS 官方 POST 收到 403，而香港区域托管函数对同一官方请求返回 200，因此正式 BFF 经带鉴权的专用函数取得官方原始响应。它只处理 TDAS 道路查询，不托管产品页面。详细故障证据与实测结果见仓库 `docs/DATA-REACHABILITY.md`。

- 官方目标固定为 `https://tdas-api.hkemobility.gov.hk/tdas/api/route`。不接受调用者提供的 URL，不引入其他数据供应商，不缓存、合成或修改成功的官方响应。
- Node.js 22、Vercel 函数区域 `hkg1`，单次上游超时 10 秒，函数上限 15 秒。仅 POST、JSON 与香港经纬度参数；起终点、时段、语言、类型及海隧值与 BFF 契约一致。
- 使用项目加密环境变量 `TDAS_EGRESS_SECRET`（随机 32 字符以上）。后端私密环境设置 `TDAS_EGRESS_URL` 与同一个 `TDAS_EGRESS_SECRET`。客户端只知道正式 BFF 地址，不能持有这个密钥。
- 函数通过常量时间 Bearer 比较鉴权；无认证 401、参数错误 422、不支持方法 405。官方无匹配道路 400、限流 429、其他上游 HTTP 失败 502，真正超时 504，连接失败 502。响应不包含密钥；不记录坐标、请求体或认证头。
- 部署平台的网页 SSO 不能挡住服务间请求；本专用项目关闭该层保护，应用 Bearer 鉴权保持启用。其他项目配置不在此脚本的作用范围。
- BFF 默认以 `TDAS_MIN_INTERVAL_MS=4000` 间隔发送不同道路请求，结合真实缓存和并发合并降低突发流量；最多排队四秒，超出为 429 / TDAS_BUSY。该值是本产品保守配置，不是官方公布的额度。维护时直接调用本函数的参考探针同样需要保持低频。

在此目录执行 `node --test test/route.test.mjs`。登录自己管理的 Vercel 账号，在项目的 production/preview 加密环境设置密钥，确认区域后运行 `vercel deploy --prod`。平台 CLI 会生成 `.vercel/`，该目录已忽略。部署完成须从实际生产主机验证未鉴权 401、鉴权 200、`X-HKBus-Region: hkg1`、`X-HKBus-Upstream-Status: 200`，再设置后端环境并发布。平台构建日志显示其他构建区域，不代表函数执行区域改变。

本组件依赖所管理的 Vercel 项目及其使用额度，不提供额外 SLA。迁移或停用项目之前先建立并验证替代的自有香港出口，再修改后端配置。轮换密钥时先在新 deployment 设置新值并验证，再原子更新后端 URL/密钥；切换前旧 deployment 仍可服务，完成后撤销旧 deployment 和旧密钥。不能只在一端替换密钥。任何密钥都不写入 README、Git、截图或交付 ZIP。

## English

This is a production backend transport component. The production host receives 403 from the official TDAS POST endpoint while the same request succeeds from an owned Hong Kong function. The BFF therefore requests official raw data through this authenticated, TDAS-only function. It does not host product pages or use a replacement data provider.

The upstream URL is fixed; only validated Hong Kong road-query parameters are forwarded. Successful official JSON is preserved without caching or synthetic results. Node.js 22 runs in `hkg1`, with a ten-second upstream deadline and fifteen-second function limit. Missing authentication returns 401; validation 422; method 405; official no-match 400; rate limit 429; upstream failure 502; timeout 504; connection failure 502.

Set a random 32+ character `TDAS_EGRESS_SECRET` as an encrypted project variable, and configure the backend's private `TDAS_EGRESS_URL` plus the matching secret. Never embed the secret in clients. Platform browser SSO must allow machine requests for this dedicated project; application Bearer authentication remains mandatory. Other projects are unaffected.

Run `node --test test/route.test.mjs`, then deploy from this folder using the managed account and `vercel deploy --prod`. `.vercel/` is ignored. Before switching the backend, verify 401 without authentication and a real 200 with authentication from the production server, including `X-HKBus-Region: hkg1` and upstream status 200. Build location and function execution region are separate.

The managed project and its account quotas are operational dependencies; no additional SLA is claimed. Verify a replacement owned Hong Kong egress before migration or removal. For key rotation, deploy and verify the new key first, atomically switch the backend URL/key, then revoke the old deployment/key. Never update only one side or publish private values. See `docs/DATA-REACHABILITY.md` for actual reachability evidence and the separate Linux update script for rollback behavior.
