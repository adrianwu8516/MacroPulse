/**
 * SheetHelper.js — Google Sheet 讀寫工具函數
 */

/**
 * 取得指定 sheet（不存在則建立）
 */
function getOrCreateSheet_(name) {
  var sheet = SS_.getSheetByName(name);
  if (!sheet) {
    sheet = SS_.insertSheet(name);
  }
  return sheet;
}

/**
 * 將二維陣列寫入 sheet（含表頭），清除舊資料後覆寫
 */
function writeSheet_(sheetName, headers, rows) {
  var sheet = getOrCreateSheet_(sheetName);
  sheet.clearContents();
  if (rows.length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  var data = [headers].concat(rows);
  sheet.getRange(1, 1, data.length, headers.length).setValues(data);
}

/**
 * 讀取 sheet 全部資料（回傳 object array，以第一行為 key）
 */
function readSheet_(sheetName) {
  var sheet = SS_.getSheetByName(sheetName);
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
 * 在 History sheet 追加一行（如果當天已有則跳過）
 */
function appendHistoryRow_(dateStr, values) {
  var sheet = getOrCreateSheet_(CONFIG.SHEET_HISTORY);
  var data = sheet.getDataRange().getValues();

  // 檢查是否已有這個日期
  for (var i = 1; i < data.length; i++) {
    var existing = data[i][0];
    if (existing instanceof Date) {
      existing = Utilities.formatDate(existing, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (String(existing) === dateStr) {
      // 更新現有行
      var row = [dateStr].concat(values);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }

  // 追加新行
  var headers;
  if (data.length === 0) {
    headers = ['date', 'FEDFUNDS', 'T10Y2Y', 'DGS10', 'CPI_annualized', 'UNRATE', 'PMI', 'GDP_growth', 'VIX', 'FG', 'SPY_price', 'SPY_sma200'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  var row = [dateStr].concat(values);
  sheet.appendRow(row);
}

/**
 * 讀取 History sheet 最後 N 天
 */
function readHistoryRows_(days) {
  var all = readSheet_(CONFIG.SHEET_HISTORY);
  if (!days || days <= 0) return all;
  // 按 date 降序排序後取前 N 筆
  all.sort(function(a, b) {
    return String(b.date) > String(a.date) ? 1 : -1;
  });
  return all.slice(0, days);
}

/**
 * 寫入執行日誌
 */
function log_(module, message) {
  try {
    var sheet = getOrCreateSheet_(CONFIG.SHEET_LOG);
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    sheet.appendRow([timestamp, module, message]);
    // 保持 Log sheet 不超過 500 行
    var rows = sheet.getLastRow();
    if (rows > 500) {
      sheet.deleteRows(2, rows - 500);
    }
  } catch (e) {
    Logger.log('log_ error: ' + e.message);
  }
}
