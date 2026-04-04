/**
 * WebApp.js — doGet() Web App 路由
 *
 * 部署為 Web App 後，Mac App 透過 HTTP GET 呼叫取得 JSON 資料。
 * 認證：query parameter ?token=xxx
 */

function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || '';

  // 沒有 action → 依 page 參數路由到對應 HTML
  if (!action) {
    var page = params.page || 'dashboard';
    if (page === 'plaid-setup') {
      return HtmlService.createHtmlOutputFromFile('PlaidLink')
        .setTitle('Connect Plaid — MacroPulse')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }
    return HtmlService.createHtmlOutputFromFile('Dashboard')
      .setTitle('MacroPulse Dashboard')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // 有 action → JSON API（需要 token，供 Mac App 使用）
  var token = params.token || '';
  var expected = CONFIG.getWebAppToken();
  if (!expected || token !== expected) {
    return jsonResponse_({ error: 'unauthorized' });
  }

  switch (action) {
    case 'indicators':
      return handleIndicators_();
    case 'history':
      return handleHistory_(params);
    case 'social':
      return handleSocial_();
    case 'status':
      return handleStatus_();
    default:
      return jsonResponse_({ error: 'unknown action: ' + action });
  }
}

/**
 * 回傳 JSON response
 */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * action=indicators — 回傳 Indicators sheet 所有指標
 */
function handleIndicators_() {
  var data = readSheet_(CONFIG.SHEET_INDICATORS);
  // rawValue 和 previousValue 確保是數字
  data.forEach(function(row) {
    if (row.rawValue !== '' && row.rawValue !== undefined) {
      row.rawValue = parseFloat(row.rawValue) || null;
    } else {
      row.rawValue = null;
    }
    if (row.previousValue !== '' && row.previousValue !== undefined) {
      row.previousValue = parseFloat(row.previousValue) || null;
    } else {
      row.previousValue = null;
    }
  });
  return jsonResponse_({ indicators: data });
}

/**
 * action=history&days=30 — 回傳 History sheet 最後 N 天
 */
function handleHistory_(params) {
  var days = parseInt(params.days) || 30;
  var rows = readHistoryRows_(days);
  // 轉換成 { date, values: { id: rawValue } } 格式
  var result = rows.map(function(row) {
    var values = {};
    for (var key in row) {
      if (key !== 'date') {
        var val = parseFloat(row[key]);
        values[key] = isNaN(val) ? null : val;
      }
    }
    var dateStr = row.date;
    if (dateStr instanceof Date) {
      dateStr = Utilities.formatDate(dateStr, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return { date: String(dateStr), values: values };
  });
  return jsonResponse_({ history: result });
}

/**
 * action=social — 回傳社群貼文 + 帳號列表
 */
function handleSocial_() {
  var posts = readSheet_(CONFIG.SHEET_SOCIAL_POSTS);
  var accounts = readSheet_(CONFIG.SHEET_SOCIAL_ACCOUNTS);

  // 數字欄位轉型
  posts.forEach(function(p) {
    p.likeCount = parseInt(p.likeCount) || 0;
    p.replyCount = parseInt(p.replyCount) || 0;
    p.repostCount = parseInt(p.repostCount) || 0;
  });

  return jsonResponse_({ posts: posts, accounts: accounts });
}

/**
 * action=status — 回傳系統狀態
 */
function handleStatus_() {
  var indicators = readSheet_(CONFIG.SHEET_INDICATORS);
  var lastFetch = null;
  if (indicators.length > 0 && indicators[0].timestamp) {
    lastFetch = indicators[0].timestamp;
  }

  // 讀最近幾筆 log
  var logs = readSheet_(CONFIG.SHEET_LOG);
  var recentLogs = logs.slice(-10);

  return jsonResponse_({
    status: 'ok',
    lastFetch: lastFetch,
    indicatorCount: indicators.length,
    recentLogs: recentLogs
  });
}

/**
 * Dashboard 專用：透過 google.script.run 呼叫，不需要 token
 */
function getIndicatorsForDashboard() {
  var data = readSheet_(CONFIG.SHEET_INDICATORS);
  data.forEach(function(row) {
    row.rawValue      = row.rawValue      !== '' ? parseFloat(row.rawValue)      || null : null;
    row.previousValue = row.previousValue !== '' ? parseFloat(row.previousValue) || null : null;
  });
  return { indicators: data };
}

function getStatusForDashboard() {
  var indicators = readSheet_(CONFIG.SHEET_INDICATORS);
  var lastFetch = indicators.length > 0 && indicators[0].timestamp ? indicators[0].timestamp : null;
  var logs = readSheet_(CONFIG.SHEET_LOG);
  return {
    status: 'ok',
    lastFetch: lastFetch,
    indicatorCount: indicators.length,
    recentLogs: logs.slice(-10)
  };
}

/**
 * 回傳某指標的完整歷史時序數據（供 Dashboard 圖表使用）
 * 不做時間範圍過濾，讓前端依 range 按鈕自行切片。
 * @param {string} id - 指標 ID (FEDFUNDS, VIX, T10Y2Y, ...)
 */
function getIndicatorHistory(id) {
  var colMap = {
    'FEDFUNDS': 'FEDFUNDS',
    'T10Y2Y':   'T10Y2Y',
    'DGS10':    'DGS10',
    'CPI':      'CPI_annualized',
    'UNRATE':   'UNRATE',
    'PMI':      'PMI',
    'GDP':      'GDP_growth',
    'VIX':      'VIX',
    'FG':       'FG',
    'SP500':    'SPY_price'
  };

  var colName = colMap[id];
  if (!colName) return { dates: [], values: [], id: id };

  var sheet = SS_.getSheetByName(CONFIG.SHEET_HISTORY);
  if (!sheet) return { dates: [], values: [], id: id };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { dates: [], values: [], id: id };

  var headers = data[0].map(String);
  var dateIdx = headers.indexOf('date');
  var colIdx  = headers.indexOf(colName);
  if (colIdx === -1) return { dates: [], values: [], id: id };

  var tz = Session.getScriptTimeZone();
  var points = [];

  for (var i = 1; i < data.length; i++) {
    var rawDate = data[i][dateIdx];
    var rawVal  = data[i][colIdx];
    var numVal  = parseFloat(rawVal);
    if (isNaN(numVal) || rawVal === '' || rawVal === null) continue;

    var dt = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(dt.getTime())) continue;

    points.push({
      d: Utilities.formatDate(dt, tz, 'yyyy-MM-dd'),
      v: numVal
    });
  }

  points.sort(function(a, b) { return a.d > b.d ? 1 : -1; });

  return {
    id:     id,
    dates:  points.map(function(p) { return p.d; }),
    values: points.map(function(p) { return p.v; })
  };
}

/**
 * 回傳 Web App 自身 URL（供前端 PlaidLink.html 用來導回 Dashboard）
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Polymarket 儀表板資料端點（google.script.run，無需 token）
 *
 * PriceHistory 現為 per-outcome long format：
 *   snapshotAt | marketId | outcomeIndex | outcomeName | price | source
 *
 * recentSnapshots 格式（已 group by timestamp）：
 *   [{ snapshotAt: string, prices: { outcomeName: price } }]
 */
function getPolymarketsForDashboard() {
  try {
    var ss = getPolymarketSS_();

    // ── 讀取 Markets sheet ───────────────────────────
    var mSheet = ss.getSheetByName(CONFIG.PM_SHEET_MARKETS);
    if (!mSheet) return { markets: [], fetchedAt: new Date().toISOString() };

    var mData = mSheet.getDataRange().getValues();
    if (mData.length < 2) return { markets: [], fetchedAt: new Date().toISOString() };

    var mHeaders = mData[0];
    var activeMarkets = [];
    for (var i = 1; i < mData.length; i++) {
      var row = {};
      mHeaders.forEach(function(h, j) { row[h] = mData[i][j]; });
      if (String(row.trackingStatus) === 'active') activeMarkets.push(row);
    }
    activeMarkets.sort(function(a, b) {
      return (parseFloat(b.volume24hr) || 0) - (parseFloat(a.volume24hr) || 0);
    });

    var activeIdSet = {};
    activeMarkets.forEach(function(m) { activeIdSet[String(m.marketId)] = true; });

    // ── 讀取 PriceHistory tail（per-outcome long format）────
    // snapshotAt[0] | marketId[1] | outcomeIndex[2] | outcomeName[3] | price[4] | source[5]
    // 只讀最後 N 行（tail read），按 marketId+snapshotAt group
    var snapshotsMap = {}; // marketId → { snapshotAt → { outcomeName: price } }
    var phSheet = ss.getSheetByName(CONFIG.PM_SHEET_PRICE_HISTORY);
    if (phSheet) {
      var totalRows  = phSheet.getLastRow();
      // 每個 active 市場保留 60 個時間點 × 平均 2.5 outcomes ≈ 150 行/市場
      var maxToRead  = Math.max(activeMarkets.length * 150, 1000);
      var startRow   = Math.max(2, totalRows - maxToRead + 1);
      var numRows    = totalRows - startRow + 1;

      if (numRows > 0) {
        var phData = phSheet.getRange(startRow, 1, numRows, 6).getValues();
        phData.forEach(function(r) {
          var ts   = String(r[0]);
          var mId  = String(r[1]);
          var name = String(r[3]);
          var p    = parseFloat(r[4]) || 0;
          if (!activeIdSet[mId]) return; // 只保留 active 市場的資料
          if (!snapshotsMap[mId]) snapshotsMap[mId] = {};
          if (!snapshotsMap[mId][ts]) snapshotsMap[mId][ts] = {};
          snapshotsMap[mId][ts][name] = p;
        });
      }
    }

    // 將 snapshotsMap 轉為排序的 array，每個市場保留最後 60 個時間點
    function buildSnapshots(mId) {
      var tsMap = snapshotsMap[mId] || {};
      var sorted = Object.keys(tsMap).sort();
      if (sorted.length > 60) sorted = sorted.slice(-60);
      return sorted.map(function(ts) { return { snapshotAt: ts, prices: tsMap[ts] }; });
    }

    // ── 組裝回傳資料 ─────────────────────────────────
    var result = activeMarkets.map(function(m) {
      var outcomesArr = [];
      var pricesArr   = [];
      try { outcomesArr = JSON.parse(String(m.outcomes)); }   catch(e) {}
      try { pricesArr   = JSON.parse(String(m.outcomePrices))
                            .map(function(p) { return parseFloat(p) || 0; }); } catch(e) {}

      return {
        marketId:        String(m.marketId),
        question:        String(m.question),
        category:        String(m.category || ''),
        tags:            String(m.tags || ''),
        slug:            String(m.slug || ''),
        outcomeType:     String(m.outcomeType || 'binary'),
        outcomes:        outcomesArr,
        outcomePrices:   pricesArr,
        leadOutcome:     String(m.leadOutcome || ''),
        leadPrice:       parseFloat(m.leadPrice) || 0,
        volume:          parseFloat(m.volume)     || 0,
        volume24hr:      parseFloat(m.volume24hr) || 0,
        liquidity:       parseFloat(m.liquidity)  || 0,
        endDate:         String(m.endDate || ''),
        trackingStatus:  String(m.trackingStatus || ''),
        resolvedOutcome: String(m.resolvedOutcome || ''),
        recentSnapshots: buildSnapshots(String(m.marketId))
      };
    });

    return { markets: result, fetchedAt: new Date().toISOString() };

  } catch (e) {
    Logger.log('getPolymarketsForDashboard error: ' + e.message);
    throw new Error('Polymarket data unavailable: ' + e.message);
  }
}

/**
 * Modal 專用：直接打 CLOB API 取得完整歷史（不掃大表）
 * 回傳：{ marketId, outcomes: { "Yes": [{t,p},...], "No": [...] }, fetchedAt }
 */
function getPolymarketHistory(marketId) {
  try {
    // 1. 從 Markets sheet 找到此市場的 clobTokenIds 和 outcomes
    var ss      = getPolymarketSS_();
    var mSheet  = ss.getSheetByName(CONFIG.PM_SHEET_MARKETS);
    if (!mSheet) throw new Error('Markets sheet not found');

    var mData   = mSheet.getDataRange().getValues();
    var headers = mData[0];
    var midIdx  = headers.indexOf('marketId');
    var clIdx   = headers.indexOf('clobTokenIds');
    var outIdx  = headers.indexOf('outcomes');

    var targetRow = null;
    for (var i = 1; i < mData.length; i++) {
      if (String(mData[i][midIdx]) === String(marketId)) { targetRow = mData[i]; break; }
    }
    if (!targetRow) return { marketId: marketId, outcomes: {}, fetchedAt: new Date().toISOString() };

    var outcomes = [];
    var tokenIds = [];
    try { outcomes = JSON.parse(String(targetRow[outIdx] || '[]')); } catch(e) {}
    try { tokenIds = JSON.parse(String(targetRow[clIdx]  || '[]')); } catch(e) {}

    if (!tokenIds.length) {
      return { marketId: marketId, outcomes: {}, fetchedAt: new Date().toISOString(),
               error: 'No clobTokenIds found. Run migrateAndBackfillPolymarket() first.' };
    }

    // 2. 並行打 CLOB prices-history（interval=max, fidelity=60 → 每小時粒度）
    var requests = tokenIds.map(function(tokenId) {
      return {
        url: 'https://clob.polymarket.com/prices-history?market=' +
             encodeURIComponent(String(tokenId)) + '&interval=max&fidelity=60',
        muteHttpExceptions: true
      };
    });
    var responses = UrlFetchApp.fetchAll(requests);

    var outcomeData = {};
    responses.forEach(function(resp, i) {
      var name = outcomes[i] || ('Outcome ' + i);
      if (resp.getResponseCode() !== 200) { outcomeData[name] = []; return; }
      try {
        var data    = JSON.parse(resp.getContentText());
        var history = data.history || data || [];
        if (!Array.isArray(history)) { outcomeData[name] = []; return; }
        outcomeData[name] = history.map(function(pt) {
          return { t: new Date(pt.t * 1000).toISOString(), p: parseFloat(pt.p) || 0 };
        });
      } catch (e) { outcomeData[name] = []; }
    });

    return { marketId: marketId, outcomes: outcomeData, fetchedAt: new Date().toISOString() };

  } catch (e) {
    Logger.log('getPolymarketHistory error: ' + e.message);
    throw new Error('History unavailable: ' + e.message);
  }
}
