/**
 * PolymarketHelper.js — 獨立 Spreadsheet 讀寫工具
 *
 * Polymarket 資料存在獨立的 Google Spreadsheet 中（避免污染主 SS）。
 * SS ID 存在 Script Properties: POLYMARKET_SS_ID
 *
 * 首次使用：
 *   1. 手動建立一個新的 Google Spreadsheet，複製其 ID
 *   2. 在 GAS Script Properties 加入 POLYMARKET_SS_ID = <id>
 *   3. 執行一次 initPolymarketSheets() 建立 4 個 Sheets + headers
 */

// 同一次執行的 SS 物件快取（避免重複 openById）
var _pmSS_ = null;

function getPolymarketSS_() {
  if (_pmSS_) return _pmSS_;
  var id = CONFIG.getPolymarketSSId();
  if (!id) throw new Error('POLYMARKET_SS_ID not set in Script Properties. Create a Google Spreadsheet and add its ID.');
  _pmSS_ = SpreadsheetApp.openById(id);
  return _pmSS_;
}

function getPmSheet_(name) {
  var ss = getPolymarketSS_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * 讀取指定 Sheet 全部資料（回傳 object array，以第一行為 key）
 */
function readPmSheet_(name) {
  var ss = getPolymarketSS_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = data[i][j];
    }
    results.push(row);
  }
  return results;
}

/**
 * 全量覆寫 Sheet（含表頭）
 */
function writePmSheet_(name, headers, rows) {
  var sheet = getPmSheet_(name);
  sheet.clearContents();
  if (rows.length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  var data = [headers].concat(rows);
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
}

/**
 * 追加單列到指定 Sheet
 */
function appendPmRow_(sheetName, row) {
  var sheet = getPmSheet_(sheetName);
  sheet.appendRow(row);
}

/**
 * 寫入 Polymarket 模組日誌
 */
function polyLog_(message) {
  try {
    var sheet = getPmSheet_(CONFIG.PM_SHEET_LOG);
    var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([ts, 'Polymarket', message]);
    // 保持 Log 不超過 1000 行
    var rows = sheet.getLastRow();
    if (rows > 1000) {
      sheet.deleteRows(2, rows - 1000);
    }
  } catch (e) {
    Logger.log('polyLog_ error: ' + e.message);
  }
}

/**
 * 初始化 Polymarket Spreadsheet 的 4 個 Sheets（手動執行一次即可）
 */
function initPolymarketSheets() {
  var marketsHeaders = [
    'marketId', 'conditionId', 'slug', 'question', 'category', 'tags',
    'outcomeType', 'outcomes', 'startDate', 'endDate',
    'volume', 'volume24hr', 'liquidity',
    'outcomePrices', 'leadOutcome', 'leadPrice',
    'active', 'closed', 'resolved', 'resolvedOutcome',
    'trackingStatus', 'firstSeenAt', 'lastUpdatedAt'
  ];
  var marketsSheet = getPmSheet_(CONFIG.PM_SHEET_MARKETS);
  if (marketsSheet.getLastRow() === 0) {
    marketsSheet.getRange(1, 1, 1, marketsHeaders.length).setValues([marketsHeaders]);
  }

  var priceHistHeaders = [
    'snapshotAt', 'marketId', 'volume', 'volume24hr', 'liquidity',
    'outcomePrices', 'leadPrice'
  ];
  var priceSheet = getPmSheet_(CONFIG.PM_SHEET_PRICE_HISTORY);
  if (priceSheet.getLastRow() === 0) {
    priceSheet.getRange(1, 1, 1, priceHistHeaders.length).setValues([priceHistHeaders]);
  }

  var topHeaders = ['fetchAt', 'rank', 'marketId', 'question', 'volume24hr'];
  var topSheet = getPmSheet_(CONFIG.PM_SHEET_TOP_MARKETS);
  if (topSheet.getLastRow() === 0) {
    topSheet.getRange(1, 1, 1, topHeaders.length).setValues([topHeaders]);
  }

  var logSheet = getPmSheet_(CONFIG.PM_SHEET_LOG);
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, 3).setValues([['timestamp', 'module', 'message']]);
  }

  polyLog_('initPolymarketSheets: all 4 sheets initialized');
  Logger.log('Polymarket sheets initialized successfully');
}
