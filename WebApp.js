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
 * 回傳某指標的歷史時序數據（供 Dashboard 圖表使用）
 * @param {string} id   - 指標 ID (FEDFUNDS, VIX, T10Y2Y, ...)
 * @param {number} days - 回傳天數（預設 365）
 */
function getIndicatorHistory(id, days) {
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

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days || 365));

  var tz = Session.getScriptTimeZone();
  var points = [];

  for (var i = 1; i < data.length; i++) {
    var rawDate = data[i][dateIdx];
    var rawVal  = data[i][colIdx];
    var numVal  = parseFloat(rawVal);
    if (isNaN(numVal) || rawVal === '') continue;

    var dt = rawDate instanceof Date ? rawDate : new Date(rawDate);
    if (isNaN(dt.getTime()) || dt < cutoff) continue;

    points.push({
      d: Utilities.formatDate(dt, tz, 'yyyy-MM-dd'),
      v: numVal
    });
  }

  points.sort(function(a, b) { return a.d > b.d ? 1 : -1; });

  return {
    id:     id,
    days:   days || 365,
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
