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

  // 每 4 小時抓取社群貼文
  ScriptApp.newTrigger('fetchAllSocialPosts')
    .timeBased()
    .everyHours(4)
    .create();

  // 每日 06:30 (UTC+8) 記錄當日歷史快照
  ScriptApp.newTrigger('appendDailyHistory')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .nearMinute(30)
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

  // SocialPosts
  var spSheet = getOrCreateSheet_(CONFIG.SHEET_SOCIAL_POSTS);
  if (spSheet.getLastRow() === 0) {
    spSheet.getRange(1, 1, 1, 10).setValues([
      ['id', 'platform', 'authorUsername', 'authorDisplayName', 'content', 'createdAt', 'likeCount', 'replyCount', 'repostCount', 'url']
    ]);
  }

  // SocialAccounts
  var saSheet = getOrCreateSheet_(CONFIG.SHEET_SOCIAL_ACCOUNTS);
  if (saSheet.getLastRow() === 0) {
    saSheet.getRange(1, 1, 1, 5).setValues([
      ['platform', 'username', 'displayName', 'bio', 'userId']
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

  log_('Setup', 'All sheets initialized');
  Logger.log('All sheets initialized successfully');
}
