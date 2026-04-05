/**
 * FredFetcher.js — FRED API 資料抓取
 *
 * 抓取 8 個 FRED series，寫入 Indicators sheet。
 * 對 CPI 計算年化通膨率，GDP 計算季度年化成長率。
 */

/**
 * 從 FRED API 取得 series observations
 * @param {string} seriesId - FRED series ID
 * @param {number} limit - 回傳筆數（降序）
 * @returns {Array<{date: string, value: string}>}
 */
function fetchFredSeries_(seriesId, limit) {
  var key = CONFIG.getFredKey();
  if (!key) throw new Error('FRED_API_KEY not set');

  var url = CONFIG.FRED_BASE_URL +
    '?series_id=' + seriesId +
    '&api_key=' + key +
    '&file_type=json' +
    '&sort_order=desc' +
    '&limit=' + (limit || 10);

  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('FRED API error ' + code + ' for ' + seriesId + ': ' + res.getContentText().substring(0, 200));
  }

  var json = JSON.parse(res.getContentText());
  return json.observations || [];
}

/**
 * 取得最新有效值（跳過 "." 無效值）
 */
function fredLatestValue_(seriesId) {
  var obs = fetchFredSeries_(seriesId, 10);
  for (var i = 0; i < obs.length; i++) {
    var val = parseFloat(obs[i].value);
    if (!isNaN(val)) return val;
  }
  throw new Error('No valid data for ' + seriesId);
}

/**
 * 取得最近兩個有效值（用於計算趨勢/成長率）
 */
function fredRecentTwo_(seriesId) {
  var obs = fetchFredSeries_(seriesId, 20);
  var values = [];
  for (var i = 0; i < obs.length; i++) {
    var val = parseFloat(obs[i].value);
    if (!isNaN(val)) {
      values.push(val);
      if (values.length === 2) break;
    }
  }
  if (values.length < 2) throw new Error('Not enough data for ' + seriesId);
  return { current: values[0], previous: values[1] };
}

/**
 * 取得最近三個有效值（用於計算當期與前期成長率）
 */
function fredRecentThree_(seriesId) {
  var obs = fetchFredSeries_(seriesId, 30);
  var values = [];
  for (var i = 0; i < obs.length; i++) {
    var val = parseFloat(obs[i].value);
    if (!isNaN(val)) {
      values.push(val);
      if (values.length === 3) break;
    }
  }
  if (values.length < 3) throw new Error('Not enough data (need 3) for ' + seriesId);
  return { current: values[0], previous: values[1], prevPrev: values[2] };
}

/**
 * 主要入口：抓取所有 FRED 數據，寫入 Indicators sheet
 */
function fetchAllFredData() {
  var key = CONFIG.getFredKey();
  if (!key) {
    log_('FredFetcher', 'No FRED_API_KEY configured');
    return;
  }

  var timestamp = new Date().toISOString();
  var results = [];

  // 1. Federal Funds Rate（需要兩個點算趨勢）
  try {
    var ff = fredRecentTwo_('FEDFUNDS');
    var trend = ff.current < ff.previous ? '↓' : (ff.current > ff.previous ? '↑' : '→');
    results.push({
      id: 'FEDFUNDS',
      name: '联邦基金利率',
      category: 'monetary',
      rawValue: ff.current,
      previousValue: ff.previous,
      displayValue: ff.current.toFixed(2) + '%',
      timestamp: timestamp
    });
    Utilities.sleep(200);
  } catch (e) {
    log_('FredFetcher', 'FEDFUNDS error: ' + e.message);
  }

  // 2. 10Y-2Y Yield Spread
  try {
    var spread = fredLatestValue_('T10Y2Y');
    results.push({
      id: 'T10Y2Y',
      name: '殖利率曲线 (10Y-2Y)',
      category: 'monetary',
      rawValue: spread,
      previousValue: '',
      displayValue: (spread >= 0 ? '+' : '') + spread.toFixed(2) + '%',
      timestamp: timestamp
    });
    Utilities.sleep(200);
  } catch (e) {
    log_('FredFetcher', 'T10Y2Y error: ' + e.message);
  }

  // 3. 10-Year Treasury Yield
  try {
    var yield10Y = fredLatestValue_('DGS10');
    results.push({
      id: 'DGS10',
      name: '10年期国债殖利率',
      category: 'monetary',
      rawValue: yield10Y,
      previousValue: '',
      displayValue: yield10Y.toFixed(2) + '%',
      timestamp: timestamp
    });
    Utilities.sleep(200);
  } catch (e) {
    log_('FredFetcher', 'DGS10 error: ' + e.message);
  }

  // 4. CPI（月度數據，計算年化通膨率）
  try {
    var cpi = fredRecentThree_('CPIAUCSL');
    var annualized     = (cpi.current  - cpi.previous) / cpi.previous  * 100 * 12;
    var prevAnnualized = (cpi.previous - cpi.prevPrev) / cpi.prevPrev  * 100 * 12;
    results.push({
      id: 'CPI',
      name: 'CPI 通胀率',
      category: 'economy',
      rawValue: annualized,
      previousValue: prevAnnualized,  // 前一個月的年化通膨率（可比較）
      displayValue: annualized.toFixed(1) + '%',
      timestamp: timestamp
    });
    Utilities.sleep(200);
  } catch (e) {
    log_('FredFetcher', 'CPI error: ' + e.message);
  }

  // 5. Unemployment Rate
  try {
    var unrate = fredLatestValue_('UNRATE');
    results.push({
      id: 'UNRATE',
      name: '失业率',
      category: 'economy',
      rawValue: unrate,
      previousValue: '',
      displayValue: unrate.toFixed(1) + '%',
      timestamp: timestamp
    });
    Utilities.sleep(200);
  } catch (e) {
    log_('FredFetcher', 'UNRATE error: ' + e.message);
  }

  // 6. ISM Manufacturing PMI
  try {
    var pmi = fredLatestValue_('NAPM');
    results.push({
      id: 'PMI',
      name: 'ISM 制造业 PMI',
      category: 'economy',
      rawValue: pmi,
      previousValue: '',
      displayValue: pmi.toFixed(1),
      timestamp: timestamp
    });
    Utilities.sleep(200);
  } catch (e) {
    log_('FredFetcher', 'PMI error: ' + e.message);
  }

  // 7. GDP（季度數據，計算季度年化成長率）
  try {
    var gdp = fredRecentThree_('GDP');
    var growth     = (gdp.current  - gdp.previous) / gdp.previous * 100 * 4;  // 季度年化
    var prevGrowth = (gdp.previous - gdp.prevPrev) / gdp.prevPrev * 100 * 4;  // 前季年化
    results.push({
      id: 'GDP',
      name: 'GDP 增长率',
      category: 'economy',
      rawValue: growth,
      previousValue: prevGrowth,  // 前一季的年化成長率（可比較）
      displayValue: growth.toFixed(1) + '%',
      timestamp: timestamp
    });
    Utilities.sleep(200);
  } catch (e) {
    log_('FredFetcher', 'GDP error: ' + e.message);
  }

  // 8. VIX
  try {
    var vix = fredLatestValue_('VIXCLS');
    results.push({
      id: 'VIX',
      name: 'VIX 恐慌指数',
      category: 'sentiment',
      rawValue: vix,
      previousValue: '',
      displayValue: vix.toFixed(1),
      timestamp: timestamp
    });
  } catch (e) {
    log_('FredFetcher', 'VIX error: ' + e.message);
  }

  // 寫入 Indicators sheet（與其他 fetcher 的結果合併）
  writeIndicators_(results);
  log_('FredFetcher', 'Fetched ' + results.length + '/8 FRED indicators');
}

/**
 * 寫入或更新 Indicators sheet 中的指標
 * 按 id 合併（不刪除其他 fetcher 寫入的行）
 */
function writeIndicators_(newRows) {
  var sheet = getOrCreateSheet_(CONFIG.SHEET_INDICATORS);
  var headers = ['id', 'name', 'category', 'rawValue', 'previousValue', 'displayValue', 'timestamp'];

  var data = sheet.getDataRange().getValues();
  // 如果 sheet 是空的，先寫入表頭
  if (data.length === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    data = [headers];
  }

  // 建立 id → row index 的對應
  var idIndex = {};
  for (var i = 1; i < data.length; i++) {
    idIndex[data[i][0]] = i + 1; // 1-based row number
  }

  for (var j = 0; j < newRows.length; j++) {
    var r = newRows[j];
    var row = [r.id, r.name, r.category, r.rawValue, r.previousValue, r.displayValue, r.timestamp];
    if (idIndex[r.id]) {
      // 更新現有行
      sheet.getRange(idIndex[r.id], 1, 1, headers.length).setValues([row]);
    } else {
      // 追加新行
      sheet.appendRow(row);
      idIndex[r.id] = sheet.getLastRow();
    }
  }
}

/**
 * 抓取 FRED 指定日期範圍的 observations（升序，無筆數限制）
 */
function fetchFredSeriesRange_(seriesId, startDate, endDate) {
  var key = CONFIG.getFredKey();
  if (!key) throw new Error('FRED_API_KEY not set');

  var url = CONFIG.FRED_BASE_URL +
    '?series_id=' + seriesId +
    '&api_key=' + key +
    '&file_type=json' +
    '&sort_order=asc' +
    '&limit=10000' +
    '&observation_start=' + startDate +
    (endDate ? '&observation_end=' + endDate : '');

  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error('FRED range error ' + res.getResponseCode() + ' for ' + seriesId);
  }
  return JSON.parse(res.getContentText()).observations || [];
}
