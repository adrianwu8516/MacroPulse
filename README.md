# MacroPulse

總體經濟儀表板，以 Google Apps Script 為後端，搭配 macOS App 使用。整合 FRED、Alpha Vantage、CNN Fear & Greed 及 Plaid，讓你一眼掌握當前市場環境。

---

## 功能

- **總體評分**：綜合 10 項指標計算 0–100 分，對應 Risk On / Bullish / Neutral / Bearish / Risk Off 五個信號
- **指標追蹤**：Fed Rate、殖利率曲線、CPI、失業率、PMI、GDP、VIX、Fear & Greed、SPY/SMA200
- **歷史圖表**：點擊任意指標卡片，查看最長 5 年的歷史走勢（支援月度/季度資料）
- **持倉追蹤**：透過 Plaid 連接 Firstrade，即時顯示持倉、成本與未實現損益
- **自動更新**：每日 06:00 抓取最新數據，06:30 寫入歷史快照

---

## 技術架構

| 層級 | 技術 |
|------|------|
| 後端 | Google Apps Script (GAS) |
| 資料庫 | Google Sheets |
| 前端 | HTML / CSS / JavaScript（單頁，由 GAS Web App 提供） |
| 圖表 | Chart.js v4 |
| 部署 | `clasp` CLI |

### 資料來源

| 指標 | 來源 | 頻率 |
|------|------|------|
| FEDFUNDS、T10Y2Y、DGS10、CPI、UNRATE、PMI、GDP、VIX | FRED API | 日/月/季 |
| SPY 價格、200 日均線 | Alpha Vantage | 每日 |
| Fear & Greed Index | CNN Dataviz API | 每日 |
| 券商持倉 | Plaid API | 每日 |

---

## 檔案結構

```
MacroPulse-GAS/
├── appsscript.json       # GAS manifest
├── Config.js             # 全局設定、API Keys 存取
├── WebApp.js             # doGet() 路由、Dashboard 資料函數
├── FredFetcher.js        # FRED API 抓取
├── SentimentFetcher.js   # Alpha Vantage / CNN Fear & Greed
├── PlaidFetcher.js       # Plaid 持倉整合
├── Setup.js              # Trigger 設定、歷史資料補齊
├── SheetHelper.js        # Google Sheets 讀寫工具
├── Dashboard.html        # 前端儀表板
└── PlaidLink.html        # Plaid OAuth 設定頁
```

---

## 初始設定

### 1. 設定 API Keys

在 GAS 編輯器 → **Project Settings → Script Properties** 新增以下屬性：

| Key | 說明 |
|-----|------|
| `FRED_API_KEY` | [FRED API](https://fred.stlouisfed.org/docs/api/api_key.html) |
| `ALPHA_VANTAGE_KEY` | [Alpha Vantage](https://www.alphavantage.co/support/#api-key) |
| `PLAID_CLIENT_ID` | Plaid Dashboard |
| `PLAID_SECRET` | Plaid Dashboard |
| `PLAID_ENV` | `sandbox` 或 `production` |
| `WEBAPP_TOKEN` | 自訂隨機字串，供 Mac App 呼叫 API 用 |

### 2. 初始化 Sheets

在 GAS 編輯器執行：
```javascript
initializeSheets()
```

### 3. 補齊歷史資料（一次性）

```javascript
fetchHistoricalData()   // 抓取過去 5 年歷史數據
```

### 4. 設定每日排程

```javascript
setupAllTriggers()   // 每日 06:00 抓取 + 06:30 快照
```

### 5. 部署 Web App

```bash
clasp push --force
clasp deploy --deploymentId <YOUR_DEPLOYMENT_ID> --description "initial deploy"
```

---

## Google Sheets 結構

| Sheet | 說明 |
|-------|------|
| `Indicators` | 最新指標值（每日覆寫） |
| `History` | 歷史快照（每日追加一行） |
| `Holdings` | Plaid 持倉資料 |
| `Log` | 執行日誌（保留最近 500 筆） |
