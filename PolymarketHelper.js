/**
 * PolymarketHelper.js — 獨立 Spreadsheet 讀寫工具
 *
 * Polymarket 資料存在獨立的 Google Spreadsheet 中（避免污染主 SS）。
 * SS ID 存在 Script Properties: POLYMARKET_SS_ID
 */

var _pmSS_ = null;

function getPolymarketSS_() {
  if (_pmSS_) return _pmSS_;
  var id = CONFIG.getPolymarketSSId();
  if (!id) throw new Error('POLYMARKET_SS_ID not set in Script Properties.');
  _pmSS_ = SpreadsheetApp.openById(id);
  return _pmSS_;
}

function getPmSheet_(name) {
  var ss    = getPolymarketSS_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function readPmSheet_(name) {
  var ss    = getPolymarketSS_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j]] = data[i][j];
    results.push(row);
  }
  return results;
}

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

function polyLog_(message) {
  try {
    var sheet = getPmSheet_(CONFIG.PM_SHEET_LOG);
    var ts    = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([ts, 'Polymarket', message]);
    var rows = sheet.getLastRow();
    if (rows > 1000) sheet.deleteRows(2, rows - 1000);
  } catch (e) { Logger.log('polyLog_ error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════
// SCHEMA DEFINITIONS
// ═══════════════════════════════════════════════════════

var PM_MARKETS_HEADERS = [
  'marketId', 'conditionId', 'slug', 'question', 'category', 'tags',
  'clobTokenIds',                          // NEW: JSON string of CLOB token IDs per outcome
  'outcomeType', 'outcomes', 'startDate', 'endDate',
  'volume', 'volume24hr', 'liquidity',
  'outcomePrices', 'leadOutcome', 'leadPrice',
  'active', 'closed', 'resolved', 'resolvedOutcome',
  'trackingStatus', 'firstSeenAt', 'lastUpdatedAt',
  'historyBackfilled'                      // NEW: boolean, whether CLOB backfill is done
];

// PriceHistory: per-outcome long format (one row per outcome per timestamp)
// Columns: snapshotAt | marketId | outcomeIndex | outcomeName | price | source
var PM_PRICE_HISTORY_HEADERS = [
  'snapshotAt', 'marketId', 'outcomeIndex', 'outcomeName', 'price', 'source'
];

var PM_TOP_MARKETS_HEADERS = ['fetchAt', 'rank', 'marketId', 'question', 'volume24hr'];

/**
 * 初始化 Polymarket Spreadsheet 的 4 個 Sheets（手動執行一次或由 setupPolymarket() 呼叫）
 */
function initPolymarketSheets() {
  var mSheet = getPmSheet_(CONFIG.PM_SHEET_MARKETS);
  if (mSheet.getLastRow() === 0) {
    mSheet.getRange(1, 1, 1, PM_MARKETS_HEADERS.length).setValues([PM_MARKETS_HEADERS]);
    mSheet.setFrozenRows(1);
  }

  var phSheet = getPmSheet_(CONFIG.PM_SHEET_PRICE_HISTORY);
  if (phSheet.getLastRow() === 0) {
    phSheet.getRange(1, 1, 1, PM_PRICE_HISTORY_HEADERS.length).setValues([PM_PRICE_HISTORY_HEADERS]);
    phSheet.setFrozenRows(1);
  }

  var topSheet = getPmSheet_(CONFIG.PM_SHEET_TOP_MARKETS);
  if (topSheet.getLastRow() === 0) {
    topSheet.getRange(1, 1, 1, PM_TOP_MARKETS_HEADERS.length).setValues([PM_TOP_MARKETS_HEADERS]);
    topSheet.setFrozenRows(1);
  }

  var logSheet = getPmSheet_(CONFIG.PM_SHEET_LOG);
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, 3).setValues([['timestamp', 'module', 'message']]);
    logSheet.setFrozenRows(1);
  }

  polyLog_('initPolymarketSheets: 4 sheets initialized');
  Logger.log('Polymarket sheets initialized successfully');
}
