# 港巴通 Backend

Node.js 22.14+、Fastify 5、TypeScript、原生 SQLite。KMB/LWB 站序、ETA 與 TDAS 道路參考分別適配，提供匿名裝置資料及營運 API。

## 本機啟動

```powershell
npm ci
npm run bootstrap
npm run dev
```

`bootstrap` 只建立本機 `.env.local`，內含隨機 JWT secret 與初始管理員密碼；請在本機開啟該檔查看。已有檔案不會被覆寫。初始管理員只在資料庫沒有管理員時建立。

- API：`http://127.0.0.1:4100/api/health`
- 互動契約：`http://127.0.0.1:4100/api/docs`
- OpenAPI：`http://127.0.0.1:4100/api/openapi.json`
- 初次 live 啟動會非同步同步主資料；同步前列表可能為空，任務失敗不會注入示例資料。

獨立演示使用另一個資料庫，方便與已交付 H5 核對：

```powershell
$env:PROVIDER_MODE='fixture'
$env:DATABASE_PATH='./data/dev-fixture.db'
npm run dev
```

生產環境拒絕 fixture。切回 live 時同時清除這兩個 shell 覆寫變數，或啟動新的終端。

## 構建、測試與運維

```powershell
npm run build
npm test
npm start
npm run smoke:live
npm run openapi
npm run backup -- ./data/backups/manual.db
```

`smoke:live` 在獨立記憶體資料庫請求真實 KMB 與 TDAS，結果寫入 `data/live-smoke.json`，不改寫正式主資料。`backup` 使用 SQLite `VACUUM INTO`，可在服務運行時建立一致性備份。備份還原時先停止服務，再以備份替換資料庫並重新啟動。

## 核心邊界

- 路線身份：`KMB:路線號:O或I:serviceType`；不把去程、回程或特別班次混用。
- ETA 空值、過時、逾時和未有主資料各自處理；上游出錯不會製造到站預測。
- 匿名裝置：30 日 access token + 365 日輪換 refresh token，伺服器僅儲存 refresh token 雜湊；刪除檔案撤銷全部會話並級聯清除個人資料。
- Admin：HttpOnly Cookie、CSRF 請求標識、Origin 白名單及 admin/operator/editor/viewer 權限。寫入帶 `X-HKBus-Admin: 1`；內容和設定使用版本鎖。
- 提醒：開啟頁面時接收，兩小時有效；按新鮮 ETA 評估，generation 唯一鍵防重複通知。
- SQLite 單一服務實例。不可讓兩個進程同時執行此服務的同步和提醒 worker。
- 全程使用原生 Windows / Node / JDK，沒有 Docker 或 WSL 依賴。

完整部署、契約、資料保留、跨端及驗證文件隨整體交付位於根目錄 `docs/`。
