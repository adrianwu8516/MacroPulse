/**
 * Setup.js — Trigger 管理與初始化
 *
 * 在 GAS editor 中手動執行 setupAllTriggers() 來設定排程。
 */

/**
 * 設定所有排程 trigger
 */
function setupAllTriggers() {
  // 先刪除所有現有 trigger
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });

  // 每日 06:00 (UTC+8) 抓取經濟 + 情緒數據
  ScriptApp.newTrigger('dailyDataFetch')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(0)
    .create();

  // 每日 06:30 (UTC+8) 記錄當日歷史快照
  ScriptApp.newTrigger('appendDailyHistory')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(30)
    .create();

  // 每 1 小時抓取 Polymarket 預測市場數據
  ScriptApp.newTrigger('fetchPolymarketData')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('All triggers set up successfully');
  log_('Setup', 'All triggers configured');
}

/**
 * 列出目前所有 trigger
 */
function listTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    Logger.log(t.getHandlerFunction() + ' — ' + t.getEventType());
  });
  return triggers.length;
}

/**
 * 每日綜合抓取：FRED + 情緒指標 + Plaid 持仓
 */
function dailyDataFetch() {
  log_('Setup', 'dailyDataFetch started');

  try {
    fetchAllFredData();
  } catch (e) {
    log_('Setup', 'fetchAllFredData failed: ' + e.message);
  }

  Utilities.sleep(2000);

  try {
    fetchSentimentData();
  } catch (e) {
    log_('Setup', 'fetchSentimentData failed: ' + e.message);
  }

  Utilities.sleep(1000);

  try {
    fetchPlaidHoldings();
  } catch (e) {
    log_('Setup', 'fetchPlaidHoldings failed: ' + e.message);
  }

  log_('Setup', 'dailyDataFetch completed');
}

/**
 * 每日記錄歷史快照：從 Indicators sheet 讀取當天數據，追加到 History sheet
 */
function appendDailyHistory() {
  var indicators = readSheet_(CONFIG.SHEET_INDICATORS);
  if (indicators.length === 0) {
    log_('Setup', 'No indicators to snapshot');
    return;
  }

  // 建立 id → rawValue 的 map
  var valMap = {};
  indicators.forEach(function(ind) {
    valMap[ind.id] = parseFloat(ind.rawValue);
  });

  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // History 欄位順序：FEDFUNDS, T10Y2Y, DGS10, CPI_annualized, UNRATE, PMI, GDP_growth, VIX, FG, SPY_price, SPY_sma200
  var values = [
    valMap['FEDFUNDS'] || '',
    valMap['T10Y2Y'] || '',
    valMap['DGS10'] || '',
    valMap['CPI'] || '',
    valMap['UNRATE'] || '',
    valMap['PMI'] || '',
    valMap['GDP'] || '',
    valMap['VIX'] || '',
    valMap['FG'] || '',
    valMap['SP500'] || '',
    // SMA200 存在 SP500 的 previousValue 裡
    ''
  ];

  // 嘗試取得 SMA200（存在 Indicators sheet 的 SP500.previousValue）
  var sp500Ind = indicators.find(function(i) { return i.id === 'SP500'; });
  if (sp500Ind && sp500Ind.previousValue) {
    values[10] = parseFloat(sp500Ind.previousValue) || '';
  }

  appendHistoryRow_(dateStr, values);
  log_('Setup', 'Daily history snapshot appended for ' + dateStr);
}

/**
 * ─────────────────────────────────────────────────────────────────
 * 一次性歷史數據補齊（在 GAS 編輯器手動執行一次即可）
 *
 * 執行後 History sheet 會填入過去 5 年的歷史數據：
 *   FEDFUNDS / T10Y2Y / DGS10 / CPI / UNRATE / PMI / GDP /
 *   VIX / Fear&Greed / SPY_price / SPY_sma200
 *
 * 之後每天 appendDailyHistory() 自動補上當天數據。
 * ─────────────────────────────────────────────────────────────────
 */
function fetchHistoricalData() {
  var YEARS = 5;
  var tz    = Session.getScriptTimeZone();

  var endD   = new Date();
  var startD = new Date(); startD.setFullYear(startD.getFullYear() - YEARS);
  // CPI/GDP 需要多抓 1 年以計算成長率
  var extD   = new Date(); extD.setFullYear(extD.getFullYear() - YEARS - 1);

  var endDate   = Utilities.formatDate(endD,   tz, 'yyyy-MM-dd');
  var startDate = Utilities.formatDate(startD, tz, 'yyyy-MM-dd');
  var extDate   = Utilities.formatDate(extD,   tz, 'yyyy-MM-dd');

  log_('Setup', '=== fetchHistoricalData start: ' + startDate + ' ~ ' + endDate + ' ===');

  // histMap[date][col] = value
  var histMap = {};
  function put(date, col, val) {
    if (!histMap[date]) histMap[date] = {};
    histMap[date][col] = val;
  }

  // ── FRED: 日線 ──────────────────────────────────────────────────
  var dailySeries = [
    { col: 'T10Y2Y', id: 'T10Y2Y'  },
    { col: 'DGS10',  id: 'DGS10'   },
    { col: 'VIX',    id: 'VIXCLS'  },
  ];
  dailySeries.forEach(function(s) {
    try {
      var obs = fetchFredSeriesRange_(s.id, startDate, endDate);
      obs.forEach(function(o) {
        var v = parseFloat(o.value);
        if (!isNaN(v)) put(o.date, s.col, v);
      });
      log_('Setup', s.id + ': ' + obs.length + ' obs');
    } catch(e) { log_('Setup', 'Hist ' + s.id + ': ' + e.message); }
    Utilities.sleep(250);
  });

  // ── FRED: 月線 ──────────────────────────────────────────────────
  var monthlySeries = [
    { col: 'FEDFUNDS', id: 'FEDFUNDS' },
    { col: 'UNRATE',   id: 'UNRATE'   },
    { col: 'PMI',      id: 'NAPM'     },
  ];
  monthlySeries.forEach(function(s) {
    try {
      var obs = fetchFredSeriesRange_(s.id, startDate, endDate);
      obs.forEach(function(o) {
        var v = parseFloat(o.value);
        if (!isNaN(v)) put(o.date, s.col, v);
      });
      log_('Setup', s.id + ': ' + obs.length + ' obs');
    } catch(e) { log_('Setup', 'Hist ' + s.id + ': ' + e.message); }
    Utilities.sleep(250);
  });

  // ── CPI → 年化月度通膨率 ────────────────────────────────────────
  try {
    var cpiObs = fetchFredSeriesRange_('CPIAUCSL', extDate, endDate);
    var prevCPI = null;
    cpiObs.forEach(function(o) {
      var v = parseFloat(o.value);
      if (isNaN(v)) return;
      if (prevCPI !== null && o.date >= startDate) {
        put(o.date, 'CPI_annualized', Math.round((v - prevCPI) / prevCPI * 1200 * 100) / 100);
      }
      prevCPI = v;
    });
    log_('Setup', 'CPI: processed ' + cpiObs.length + ' obs');
  } catch(e) { log_('Setup', 'Hist CPI: ' + e.message); }
  Utilities.sleep(250);

  // ── GDP → 季度年化成長率 ────────────────────────────────────────
  try {
    var gdpObs = fetchFredSeriesRange_('GDP', extDate, endDate);
    var prevGDP = null;
    gdpObs.forEach(function(o) {
      var v = parseFloat(o.value);
      if (isNaN(v)) return;
      if (prevGDP !== null && o.date >= startDate) {
        put(o.date, 'GDP_growth', Math.round((v - prevGDP) / prevGDP * 400 * 100) / 100);
      }
      prevGDP = v;
    });
    log_('Setup', 'GDP: processed ' + gdpObs.length + ' obs');
  } catch(e) { log_('Setup', 'Hist GDP: ' + e.message); }
  Utilities.sleep(250);

  // ── SPY 歷史日線 + SMA200（Alpha Vantage） ──────────────────────
  var avKey = CONFIG.getAVKey();
  if (avKey) {
    try {
      var spyMap = fetchSPYHistoryMap_(startDate);
      Object.keys(spyMap).forEach(function(d) {
        put(d, 'SPY_price',  spyMap[d].price);
        if (spyMap[d].sma200 !== '') put(d, 'SPY_sma200', spyMap[d].sma200);
      });
      log_('Setup', 'SPY: ' + Object.keys(spyMap).length + ' days');
      Utilities.sleep(500);
    } catch(e) { log_('Setup', 'Hist SPY: ' + e.message); }
  }

  // ── Fear & Greed 歷史（CNN，約 1 年） ───────────────────────────
  try {
    var fgMap = fetchFGHistoryMap_();
    Object.keys(fgMap).forEach(function(d) {
      if (d >= startDate) put(d, 'FG', fgMap[d]);
    });
    log_('Setup', 'F&G: ' + Object.keys(fgMap).length + ' days');
  } catch(e) { log_('Setup', 'Hist F&G: ' + e.message); }

  // ── 與現有 Sheet 合併，避免覆蓋已有數據 ─────────────────────────
  var existing = readSheet_(CONFIG.SHEET_HISTORY);
  existing.forEach(function(row) {
    var d = row.date instanceof Date
      ? Utilities.formatDate(row.date, tz, 'yyyy-MM-dd')
      : String(row.date);
    if (!d || d < startDate) return;
    if (!histMap[d]) histMap[d] = {};
    // 只補空缺，不覆蓋剛抓的新數據
    var cols = ['FEDFUNDS','T10Y2Y','DGS10','CPI_annualized','UNRATE','PMI','GDP_growth','VIX','FG','SPY_price','SPY_sma200'];
    cols.forEach(function(c) {
      if (histMap[d][c] === undefined && row[c] !== '' && row[c] !== undefined) {
        histMap[d][c] = row[c];
      }
    });
  });

  // ── 寫入 History sheet ──────────────────────────────────────────
  var headers = ['date','FEDFUNDS','T10Y2Y','DGS10','CPI_annualized','UNRATE','PMI','GDP_growth','VIX','FG','SPY_price','SPY_sma200'];
  var sortedDates = Object.keys(histMap).filter(function(d){ return d >= startDate; }).sort();

  var rows = sortedDates.map(function(d) {
    var m = histMap[d];
    return [
      d,
      m.FEDFUNDS      !== undefined ? m.FEDFUNDS      : '',
      m.T10Y2Y        !== undefined ? m.T10Y2Y        : '',
      m.DGS10         !== undefined ? m.DGS10         : '',
      m.CPI_annualized!== undefined ? m.CPI_annualized: '',
      m.UNRATE        !== undefined ? m.UNRATE        : '',
      m.PMI           !== undefined ? m.PMI           : '',
      m.GDP_growth    !== undefined ? m.GDP_growth    : '',
      m.VIX           !== undefined ? m.VIX           : '',
      m.FG            !== undefined ? m.FG            : '',
      m.SPY_price     !== undefined ? m.SPY_price     : '',
      m.SPY_sma200    !== undefined ? m.SPY_sma200    : ''
    ];
  });

  writeSheet_(CONFIG.SHEET_HISTORY, headers, rows);
  log_('Setup', '=== fetchHistoricalData done: ' + rows.length + ' dates written ===');
}

/**
 * Polymarket 一次性初始化（首次使用執行一次）
 * 自動設定 POLYMARKET_SS_ID 並建立 4 個 Sheets
 */
function setupPolymarket() {
  // 設定獨立 Spreadsheet ID
  PROPS_.setProperty('POLYMARKET_SS_ID', '1aiw0OVTP86AgxQp9ckQqflVdvEugcqIE-B7dlQhdLEk');
  Logger.log('POLYMARKET_SS_ID set: 1aiw0OVTP86AgxQp9ckQqflVdvEugcqIE-B7dlQhdLEk');

  // 初始化 4 個 Sheets（Markets, PriceHistory, TopMarkets, Log）
  initPolymarketSheets();

  // 立即抓取第一批資料
  fetchPolymarketData();

  Logger.log('Polymarket setup complete. Check the Polymarket Spreadsheet for data.');
  log_('Setup', 'Polymarket initialized with SS ID and first fetch done');
}

/**
 * 初始化 Sheet 結構（首次使用時執行一次）
 */
function initializeSheets() {
  // Indicators
  var indSheet = getOrCreateSheet_(CONFIG.SHEET_INDICATORS);
  if (indSheet.getLastRow() === 0) {
    indSheet.getRange(1, 1, 1, 7).setValues([
      ['id', 'name', 'category', 'rawValue', 'previousValue', 'displayValue', 'timestamp']
    ]);
  }

  // History
  var histSheet = getOrCreateSheet_(CONFIG.SHEET_HISTORY);
  if (histSheet.getLastRow() === 0) {
    histSheet.getRange(1, 1, 1, 12).setValues([
      ['date', 'FEDFUNDS', 'T10Y2Y', 'DGS10', 'CPI_annualized', 'UNRATE', 'PMI', 'GDP_growth', 'VIX', 'FG', 'SPY_price', 'SPY_sma200']
    ]);
  }

  // Holdings
  var holdSheet = getOrCreateSheet_(CONFIG.SHEET_HOLDINGS);
  if (holdSheet.getLastRow() === 0) {
    holdSheet.getRange(1, 1, 1, 13).setValues([[
      'date', 'account_id', 'account_name', 'ticker', 'security_name',
      'type', 'quantity', 'close_price', 'cost_basis',
      'market_value', 'unrealized_pnl', 'unrealized_pnl_pct', 'currency'
    ]]);
  }

  // Log
  var logSheet = getOrCreateSheet_(CONFIG.SHEET_LOG);
  if (logSheet.getLastRow() === 0) {
    logSheet.getRange(1, 1, 1, 3).setValues([
      ['timestamp', 'module', 'message']
    ]);
  }

  // Polymarket sheets（需先在 Script Properties 設定 POLYMARKET_SS_ID）
  try {
    initPolymarketSheets();
  } catch (e) {
    log_('Setup', 'initPolymarketSheets skipped: ' + e.message);
    Logger.log('initPolymarketSheets skipped: ' + e.message);
  }

  log_('Setup', 'All sheets initialized');
  Logger.log('All sheets initialized successfully');
}
