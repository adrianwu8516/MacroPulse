/**
 * PolymarketFetcher.js — Polymarket 預測市場資料抓取
 *
 * 主入口：fetchPolymarketData()
 * 排程：每 1 小時執行一次（由 Setup.js 設定）
 *
 * 追蹤邏輯（進得來，自然出）：
 *   - 抓取前 15 熱門市場（依 volume24hr 排序）
 *   - 新市場加入追蹤（Create）
 *   - 已追蹤但不在前 15 的市場，批次補查並持續更新（Update）
 *   - resolved/closed 的市場標記為 completed（軟刪除），資料永久保留
 *   - 所有 active 市場快照一次性批量寫入 PriceHistory
 */

var PM_TOP_LIMIT = 15;

// ═══════════════════════════════════════════════════════
// MAIN ENTRY
// ═══════════════════════════════════════════════════════

function fetchPolymarketData() {
  polyLog_('fetchPolymarketData started');
  var now = new Date().toISOString();

  try {
    // Step 1: 抓前 15 熱門市場
    var top15 = fetchTopMarkets_();
    polyLog_('Top 15 fetched: ' + top15.length + ' markets');

    if (!top15.length) {
      polyLog_('fetchPolymarketData: no top markets returned, aborting');
      return;
    }

    var marketsSheet = getPmSheet_(CONFIG.PM_SHEET_MARKETS);
    var allData = marketsSheet.getDataRange().getValues();

    // 首次執行（只有 header 或完全空的）
    if (allData.length < 2) {
      var headers = allData.length > 0 ? allData[0] : [];
      top15.forEach(function(m) { polyAddMarket_(marketsSheet, headers, m, now); });
      snapshotPrices_(top15, now);
      appendTopMarkets_(top15, now);
      polyLog_('fetchPolymarketData done (first run). Added ' + top15.length + ' markets.');
      return;
    }

    var headers = allData[0];
    var midIdx  = headers.indexOf('marketId');
    var staIdx  = headers.indexOf('trackingStatus');

    // 建立 marketId → {rowIndex, trackingStatus} 的 Map
    var rowMap    = {};
    var statusMap = {};
    for (var i = 1; i < allData.length; i++) {
      var mId = String(allData[i][midIdx]);
      rowMap[mId]    = i + 1; // 1-based sheet row index
      statusMap[mId] = String(allData[i][staIdx]);
    }

    var top15Map = {};
    top15.forEach(function(m) { top15Map[m.id] = true; });

    // Step 2: 前 15 中有新市場 → Create
    var newlyAdded = {};
    top15.forEach(function(m) {
      if (!rowMap[m.id]) {
        polyAddMarket_(marketsSheet, headers, m, now);
        newlyAdded[m.id] = true;
        rowMap[m.id]     = marketsSheet.getLastRow();
        statusMap[m.id]  = 'active';
        polyLog_('New market tracked: ' + m.id.substring(0,8) + '… ' + m.question.substring(0, 60));
      }
    });

    // Step 3: 不在前 15 的 active 市場 → 批次補查
    var toFetch = [];
    Object.keys(statusMap).forEach(function(id) {
      if (!top15Map[id] && statusMap[id] === 'active') toFetch.push(id);
    });

    var extraMarkets = [];
    if (toFetch.length > 0) {
      extraMarkets = fetchMarketsById_(toFetch);
      polyLog_('Extra markets fetched: ' + extraMarkets.length + '/' + toFetch.length);
    }

    // Step 4: 重新讀取 rowMap（因為可能追加了新行）
    if (Object.keys(newlyAdded).length > 0) {
      allData = marketsSheet.getDataRange().getValues();
      headers = allData[0];
      rowMap  = {};
      for (var i = 1; i < allData.length; i++) {
        rowMap[String(allData[i][headers.indexOf('marketId')])] = i + 1;
      }
    }

    // Step 5: 更新所有取得資料的市場
    var allFetched = top15.concat(extraMarkets);
    allFetched.forEach(function(m) {
      if (rowMap[m.id]) {
        polyUpdateMarket_(marketsSheet, headers, rowMap[m.id], m, now);
      }
    });

    // Step 6: 只快照仍為 active 的市場（更新後狀態）
    // 重新讀取以確認 trackingStatus
    allData = marketsSheet.getDataRange().getValues();
    headers = allData[0];
    var staIdx2 = headers.indexOf('trackingStatus');
    var midIdx2 = headers.indexOf('marketId');

    var activeIds = {};
    for (var i = 1; i < allData.length; i++) {
      if (String(allData[i][staIdx2]) === 'active') {
        activeIds[String(allData[i][midIdx2])] = true;
      }
    }
    var activeMarkets = allFetched.filter(function(m) { return activeIds[m.id]; });

    snapshotPrices_(activeMarkets, now);
    appendTopMarkets_(top15, now);

    polyLog_('fetchPolymarketData done. active=' + activeMarkets.length +
             ', top15=' + top15.length + ', extra=' + extraMarkets.length);

  } catch (e) {
    polyLog_('fetchPolymarketData ERROR: ' + e.message);
    Logger.log('fetchPolymarketData error: ' + e.message + '\n' + (e.stack || ''));
  }
}

// ═══════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════

/**
 * 抓取前 15 熱門市場（依 volume24hr 降序）
 */
function fetchTopMarkets_() {
  var url = CONFIG.POLYMARKET_BASE_URL +
    '/markets?order=volume24hr&ascending=false&limit=' + PM_TOP_LIMIT + '&active=true';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Top markets API failed: HTTP ' + resp.getResponseCode() +
                    ' — ' + resp.getContentText().substring(0, 200));
  }
  var data = JSON.parse(resp.getContentText());
  if (!Array.isArray(data)) {
    // 有些端點回傳 { markets: [...] }
    if (data && Array.isArray(data.markets)) data = data.markets;
    else throw new Error('Unexpected top markets response format');
  }
  return data.map(normalizeMarket_);
}

/**
 * 批次查詢多個 market IDs（使用 fetchAll 並行，每批 10 個）
 */
function fetchMarketsById_(ids) {
  var results = [];
  var batchSize = 10;

  for (var i = 0; i < ids.length; i += batchSize) {
    var batch = ids.slice(i, i + batchSize);
    var requests = batch.map(function(id) {
      return {
        url: CONFIG.POLYMARKET_BASE_URL + '/markets?id=' + encodeURIComponent(id),
        muteHttpExceptions: true
      };
    });

    var responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function(resp, idx) {
      if (resp.getResponseCode() !== 200) return;
      try {
        var data = JSON.parse(resp.getContentText());
        var arr  = Array.isArray(data) ? data :
                   (data && Array.isArray(data.markets) ? data.markets : [data]);
        arr.forEach(function(m) {
          if (m && m.id) results.push(normalizeMarket_(m));
        });
      } catch (e) {
        polyLog_('fetchMarketsById_: parse error for id=' + batch[idx] + ': ' + e.message);
      }
    });

    if (i + batchSize < ids.length) Utilities.sleep(200);
  }
  return results;
}

/**
 * 標準化 API 回傳的 market 物件（統一欄位命名與型別）
 */
function normalizeMarket_(m) {
  var tags = [];
  if (Array.isArray(m.tags)) {
    tags = m.tags.map(function(t) {
      return typeof t === 'object' ? (t.label || t.slug || '') : String(t);
    });
  }

  // outcomePrices 和 outcomes 可能是 JSON string 或 array
  var outcomesStr = '';
  if (typeof m.outcomes === 'string') outcomesStr = m.outcomes;
  else if (Array.isArray(m.outcomes)) outcomesStr = JSON.stringify(m.outcomes);
  else outcomesStr = '["Yes","No"]';

  var pricesStr = '';
  if (typeof m.outcomePrices === 'string') pricesStr = m.outcomePrices;
  else if (Array.isArray(m.outcomePrices)) pricesStr = JSON.stringify(m.outcomePrices);
  else pricesStr = '["0.5","0.5"]';

  return {
    id:           String(m.id || ''),
    conditionId:  String(m.conditionId || ''),
    slug:         String(m.slug || ''),
    question:     String(m.question || '').trim(),
    category:     tags.length > 0 ? tags[0] : '',
    tags:         tags.join(','),
    outcomes:     outcomesStr,
    outcomePrices:pricesStr,
    startDate:    String(m.startDate || ''),
    endDate:      String(m.endDate || ''),
    volume:       parseFloat(m.volume)     || 0,
    volume24hr:   parseFloat(m.volume24hr) || 0,
    liquidity:    parseFloat(m.liquidity)  || 0,
    active:       m.active   === true || m.active   === 'true',
    closed:       m.closed   === true || m.closed   === 'true',
    resolved:     m.resolved === true || m.resolved === 'true'
  };
}

// ═══════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════

/**
 * Create: 新增市場到 Markets Sheet（appendRow）
 */
function polyAddMarket_(sheet, headers, m, now) {
  var outcomeType = parseOutcomeType_(m.outcomes);
  var lead = calcLeadOutcome_(m.outcomes, m.outcomePrices);

  var row = headers.map(function(h) {
    switch (h) {
      case 'marketId':       return m.id;
      case 'conditionId':    return m.conditionId;
      case 'slug':           return m.slug;
      case 'question':       return m.question;
      case 'category':       return m.category;
      case 'tags':           return m.tags;
      case 'outcomeType':    return outcomeType;
      case 'outcomes':       return m.outcomes;
      case 'startDate':      return m.startDate;
      case 'endDate':        return m.endDate;
      case 'volume':         return m.volume;
      case 'volume24hr':     return m.volume24hr;
      case 'liquidity':      return m.liquidity;
      case 'outcomePrices':  return m.outcomePrices;
      case 'leadOutcome':    return lead.outcome;
      case 'leadPrice':      return lead.price;
      case 'active':         return m.active;
      case 'closed':         return m.closed;
      case 'resolved':       return m.resolved;
      case 'resolvedOutcome':return '';
      case 'trackingStatus': return 'active';
      case 'firstSeenAt':    return now;
      case 'lastUpdatedAt':  return now;
      default:               return '';
    }
  });
  sheet.appendRow(row);
}

/**
 * Update: 更新已有市場的動態欄位（一次 read + 一次 write）
 */
function polyUpdateMarket_(sheet, headers, rowIndex, m, now) {
  var currentRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var lead        = calcLeadOutcome_(m.outcomes, m.outcomePrices);
  var isCompleted = m.resolved || m.closed;

  var updates = {
    'volume':          m.volume,
    'volume24hr':      m.volume24hr,
    'liquidity':       m.liquidity,
    'outcomePrices':   m.outcomePrices,
    'leadOutcome':     lead.outcome,
    'leadPrice':       lead.price,
    'active':          m.active,
    'closed':          m.closed,
    'resolved':        m.resolved,
    'resolvedOutcome': isCompleted ? lead.outcome : currentRow[headers.indexOf('resolvedOutcome')] || '',
    'trackingStatus':  isCompleted ? 'completed' : 'active',
    'lastUpdatedAt':   now
  };

  Object.keys(updates).forEach(function(colName) {
    var idx = headers.indexOf(colName);
    if (idx !== -1) currentRow[idx] = updates[colName];
  });

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([currentRow]);
}

/**
 * 軟刪除：將 7 天前已 completed 的市場記錄（資料保留，僅記 log）
 * 建議每週手動或定期執行一次
 */
function polyArchiveCompleted_() {
  var rows = readPmSheet_(CONFIG.PM_SHEET_MARKETS);
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  var count = 0;
  rows.forEach(function(r) {
    if (r.trackingStatus === 'completed' &&
        r.lastUpdatedAt && new Date(String(r.lastUpdatedAt)) < cutoff) {
      count++;
    }
  });
  polyLog_('polyArchiveCompleted_: ' + count + ' markets older than 7 days are completed (data retained in PriceHistory)');
}

// ═══════════════════════════════════════════════════════
// SNAPSHOT
// ═══════════════════════════════════════════════════════

/**
 * 批量追加 active 市場的快照到 PriceHistory（一次 setValues）
 */
function snapshotPrices_(markets, now) {
  if (!markets.length) return;
  var sheet = getPmSheet_(CONFIG.PM_SHEET_PRICE_HISTORY);

  var rows = markets.map(function(m) {
    var lead = calcLeadOutcome_(m.outcomes, m.outcomePrices);
    return [now, m.id, m.volume, m.volume24hr, m.liquidity, m.outcomePrices, lead.price];
  });

  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
  polyLog_('Snapshot written: ' + markets.length + ' markets at ' + now);
}

/**
 * 追加本次前 15 排名記錄到 TopMarkets
 */
function appendTopMarkets_(top15, now) {
  if (!top15.length) return;
  var sheet = getPmSheet_(CONFIG.PM_SHEET_TOP_MARKETS);
  var rows = top15.map(function(m, i) {
    return [now, i + 1, m.id, m.question.substring(0, 200), m.volume24hr];
  });
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 5).setValues(rows);
}

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════

/**
 * 判斷市場類型：binary（Yes/No）或 multi（多結果）
 */
function parseOutcomeType_(outcomesJson) {
  try {
    var arr = JSON.parse(outcomesJson);
    if (arr.length === 2 &&
        arr[0].toLowerCase() === 'yes' &&
        arr[1].toLowerCase() === 'no') return 'binary';
    return 'multi';
  } catch (e) { return 'binary'; }
}

/**
 * 計算最高機率的 outcome 名稱和機率值
 */
function calcLeadOutcome_(outcomesJson, pricesJson) {
  try {
    var outcomes = JSON.parse(outcomesJson);
    var prices   = JSON.parse(pricesJson);
    var maxIdx = 0;
    var maxVal = parseFloat(prices[0]) || 0;
    for (var i = 1; i < prices.length; i++) {
      var v = parseFloat(prices[i]) || 0;
      if (v > maxVal) { maxVal = v; maxIdx = i; }
    }
    return { outcome: String(outcomes[maxIdx] || ''), price: maxVal };
  } catch (e) {
    return { outcome: '', price: 0.5 };
  }
}
