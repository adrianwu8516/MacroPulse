/**
 * WebApp.js — doGet() Web App 路由
 *
 * 部署為 Web App 後，Mac App 透過 HTTP GET 呼叫取得 JSON 資料。
 * 認證：query parameter ?token=xxx
 */

function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || '';

  // 沒有 action → 回傳 HTML Dashboard（瀏覽器直接開）
  if (!action) {
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

function getSocialForDashboard() {
  var posts = readSheet_(CONFIG.SHEET_SOCIAL_POSTS);
  var accounts = readSheet_(CONFIG.SHEET_SOCIAL_ACCOUNTS);
  posts.forEach(function(p) {
    p.likeCount   = parseInt(p.likeCount)   || 0;
    p.replyCount  = parseInt(p.replyCount)  || 0;
    p.repostCount = parseInt(p.repostCount) || 0;
  });
  return { posts: posts, accounts: accounts };
}
