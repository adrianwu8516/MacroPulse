/**
 * PolymarketFetcher.js — Polymarket 預測市場資料抓取
 *
 * 主入口：fetchPolymarketData()（每小時執行）
 *
 * 追蹤邏輯：
 *   - 抓前 15 熱門市場（Gamma API，依 volume24hr 排序）
 *   - 新市場 → polyAddMarket_() → 立即 backfillMarketHistory_()（CLOB API 全量歷史）
 *   - 已追蹤但不在前 15 → 批次補查（UrlFetchApp.fetchAll()）
 *   - 所有 active 市場 → snapshotPrices_()（per-outcome long format）
 *   - resolved/closed → trackingStatus = 'completed'（軟刪除）
 *
 * PriceHistory 格式（per-outcome long format）：
 *   snapshotAt | marketId | outcomeIndex | outcomeName | price | source
 *   source = 'backfill'（CLOB 歷史補全）或 'live'（每小時快照）
 */

var PM_TOP_LIMIT   = 15;
var CLOB_BASE_URL  = 'https://clob.polymarket.com';

// ═══════════════════════════════════════════════════════
// MAIN ENTRY
// ═══════════════════════════════════════════════════════

function fetchPolymarketData() {
  polyLog_('fetchPolymarketData started');
  var now = new Date().toISOString();

  try {
    var top15 = fetchTopMarkets_();
    polyLog_('Top 15 fetched: ' + top15.length + ' markets');
    if (!top15.length) { polyLog_('No markets returned, aborting'); return; }

    var marketsSheet = getPmSheet_(CONFIG.PM_SHEET_MARKETS);
    var allData      = marketsSheet.getDataRange().getValues();

    // 首次執行（只有 header 或空）
    if (allData.length < 2) {
      var headers = allData.length > 0 ? allData[0] : PM_MARKETS_HEADERS;
      top15.forEach(function(m) {
        polyAddMarket_(marketsSheet, headers, m, now);
      });
      snapshotPrices_(top15, now);
      appendTopMarkets_(top15, now);
      polyLog_('First run complete. Added ' + top15.length + ' markets.');
      return;
    }

    var headers = allData[0];
    var midIdx  = headers.indexOf('marketId');
    var staIdx  = headers.indexOf('trackingStatus');

    // 建立 marketId → {rowIndex, status} 的 Map
    var rowMap    = {};
    var statusMap = {};
    for (var i = 1; i < allData.length; i++) {
      var mId = String(allData[i][midIdx]);
      rowMap[mId]    = i + 1;
      statusMap[mId] = String(allData[i][staIdx]);
    }

    var top15Map  = {};
    top15.forEach(function(m) { top15Map[m.id] = true; });

    // 前 15 中的新市場 → Create + Backfill
    var newlyAdded = {};
    top15.forEach(function(m) {
      if (!rowMap[m.id]) {
        polyAddMarket_(marketsSheet, headers, m, now);
        newlyAdded[m.id] = true;
        rowMap[m.id]     = marketsSheet.getLastRow();
        statusMap[m.id]  = 'active';
        polyLog_('New market: ' + m.id.substring(0, 8) + '… ' + m.question.substring(0, 50));
      }
    });

    // 不在前 15 的 active 市場 → 批次補查
    var toFetch = [];
    Object.keys(statusMap).forEach(function(id) {
      if (!top15Map[id] && statusMap[id] === 'active') toFetch.push(id);
    });
    var extraMarkets = toFetch.length > 0 ? fetchMarketsById_(toFetch) : [];
    if (extraMarkets.length) polyLog_('Extra markets fetched: ' + extraMarkets.length);

    // 重新讀取 rowMap（可能有新追加的行）
    if (Object.keys(newlyAdded).length > 0) {
      allData = marketsSheet.getDataRange().getValues();
      headers = allData[0];
      rowMap  = {};
      for (var i = 1; i < allData.length; i++) {
        rowMap[String(allData[i][headers.indexOf('marketId')])] = i + 1;
      }
    }

    // 更新所有取得資料的市場
    var allFetched = top15.concat(extraMarkets);
    allFetched.forEach(function(m) {
      if (rowMap[m.id]) polyUpdateMarket_(marketsSheet, headers, rowMap[m.id], m, now);
    });

    // 重新讀取確認 active 狀態
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

    polyLog_('Done. active=' + activeMarkets.length + ' top15=' + top15.length + ' extra=' + extraMarkets.length);

  } catch (e) {
    polyLog_('fetchPolymarketData ERROR: ' + e.message);
    Logger.log('fetchPolymarketData error: ' + e.message + '\n' + (e.stack || ''));
  }
}

// ═══════════════════════════════════════════════════════
// GAMMA API
// ═══════════════════════════════════════════════════════

function fetchTopMarkets_() {
  var url  = CONFIG.POLYMARKET_BASE_URL +
    '/markets?order=volume24hr&ascending=false&limit=' + PM_TOP_LIMIT + '&active=true';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200)
    throw new Error('Top markets API failed: HTTP ' + resp.getResponseCode());
  var data = JSON.parse(resp.getContentText());
  if (!Array.isArray(data)) {
    if (data && Array.isArray(data.markets)) data = data.markets;
    else throw new Error('Unexpected top markets response format');
  }
  return data.map(normalizeMarket_);
}

function fetchMarketsById_(ids) {
  var results   = [];
  var batchSize = 10;
  for (var i = 0; i < ids.length; i += batchSize) {
    var batch    = ids.slice(i, i + batchSize);
    var requests = batch.map(function(id) {
      return { url: CONFIG.POLYMARKET_BASE_URL + '/markets?id=' + encodeURIComponent(id),
               muteHttpExceptions: true };
    });
    var responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function(resp) {
      if (resp.getResponseCode() !== 200) return;
      try {
        var data = JSON.parse(resp.getContentText());
        var arr  = Array.isArray(data) ? data :
                   (data && Array.isArray(data.markets) ? data.markets : [data]);
        arr.forEach(function(m) { if (m && m.id) results.push(normalizeMarket_(m)); });
      } catch (e) { polyLog_('fetchMarketsById_ parse error: ' + e.message); }
    });
    if (i + batchSize < ids.length) Utilities.sleep(200);
  }
  return results;
}

function normalizeMarket_(m) {
  var tags = [];
  if (Array.isArray(m.tags)) {
    tags = m.tags.map(function(t) {
      return typeof t === 'object' ? (t.label || t.slug || '') : String(t);
    });
  }

  function toJsonStr(v, fallback) {
    if (typeof v === 'string') return v;
    if (Array.isArray(v))     return JSON.stringify(v);
    return fallback;
  }

  // clobTokenIds: JSON string of CLOB token IDs
  var clobTokenIds = toJsonStr(m.clobTokenIds, '[]');

  return {
    id:               String(m.id || ''),
    conditionId:      String(m.conditionId || ''),
    slug:             String(m.slug || ''),
    question:         String(m.question || '').trim(),
    category:         tags.length > 0 ? tags[0] : (m.category || ''),
    tags:             tags.join(','),
    clobTokenIds:     clobTokenIds,
    outcomes:         toJsonStr(m.outcomes, '["Yes","No"]'),
    outcomePrices:    toJsonStr(m.outcomePrices, '["0.5","0.5"]'),
    startDate:        String(m.startDate || ''),
    endDate:          String(m.endDate   || ''),
    volume:           parseFloat(m.volume)     || 0,
    volume24hr:       parseFloat(m.volume24hr) || 0,
    liquidity:        parseFloat(m.liquidity)  || 0,
    active:           m.active   === true || m.active   === 'true',
    closed:           m.closed   === true || m.closed   === 'true',
    resolved:         m.resolved === true || m.resolved === 'true',
    resolvedOutcome:  String(m.resolvedOutcome || '')  // capture API field if present
  };
}

// ═══════════════════════════════════════════════════════
// CLOB HISTORY BACKFILL
// ═══════════════════════════════════════════════════════

/**
 * 對一個市場的所有 outcome 抓取完整 CLOB 歷史，寫入 PriceHistory
 * source = 'backfill'
 * 使用 interval=max&fidelity=60（每小時粒度，最遠可追溯）
 */
function backfillMarketHistory_(market) {
  var tokenIds = [];
  var outcomes = [];
  try { tokenIds = JSON.parse(String(market.clobTokenIds || '[]')); } catch(e) {}
  try { outcomes = JSON.parse(String(market.outcomes || '["Yes","No"]')); } catch(e) {}

  if (!tokenIds.length) {
    polyLog_('backfill skipped (no clobTokenIds): ' + market.id);
    return 0;
  }

  // 並行抓取所有 outcome 的歷史（fetchAll）
  var requests = tokenIds.map(function(tokenId) {
    return {
      url: CLOB_BASE_URL + '/prices-history?market=' +
           encodeURIComponent(String(tokenId)) + '&interval=max&fidelity=60',
      muteHttpExceptions: true
    };
  });

  var responses = UrlFetchApp.fetchAll(requests);
  var rows = [];

  responses.forEach(function(resp, i) {
    if (resp.getResponseCode() !== 200) {
      polyLog_('backfill CLOB error outcome ' + i + ': HTTP ' + resp.getResponseCode());
      return;
    }
    try {
      var data    = JSON.parse(resp.getContentText());
      var history = data.history || data || [];
      if (!Array.isArray(history)) return;

      history.forEach(function(pt) {
        // t 是 Unix timestamp（秒）
        var ts  = new Date(pt.t * 1000).toISOString();
        var p   = parseFloat(pt.p) || 0;
        rows.push([ts, market.id, i, outcomes[i] || ('Outcome ' + i), p, 'backfill']);
      });
    } catch (e) {
      polyLog_('backfill parse error outcome ' + i + ': ' + e.message);
    }
  });

  if (rows.length === 0) {
    polyLog_('backfill: no history returned for ' + market.id.substring(0, 8));
    return 0;
  }

  // 按時間排序後批量寫入
  rows.sort(function(a, b) { return a[0] > b[0] ? 1 : -1; });
  var sheet   = getPmSheet_(CONFIG.PM_SHEET_PRICE_HISTORY);
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 6).setValues(rows);

  polyLog_('backfill written: ' + rows.length + ' pts for market ' + market.id.substring(0, 8) + '…');
  return rows.length;
}

/**
 * 對 Markets sheet 中所有尚未 backfill 的 active 市場執行歷史補全
 * 供 migrateAndBackfillPolymarket() 或手動執行
 */
function backfillAllTrackedMarkets_() {
  var sheet   = getPmSheet_(CONFIG.PM_SHEET_MARKETS);
  var allData = sheet.getDataRange().getValues();
  if (allData.length < 2) { polyLog_('backfillAll: no markets found'); return; }

  var headers    = allData[0];
  var midIdx     = headers.indexOf('marketId');
  var staIdx     = headers.indexOf('trackingStatus');
  var bfIdx      = headers.indexOf('historyBackfilled');
  var clIdx      = headers.indexOf('clobTokenIds');
  var outIdx     = headers.indexOf('outcomes');
  var total      = 0;

  for (var i = 1; i < allData.length; i++) {
    var row    = allData[i];
    var status = String(row[staIdx]);
    var alreadyDone = String(row[bfIdx]).toLowerCase() === 'true';
    if (status !== 'active' || alreadyDone) continue;

    var market = {
      id:           String(row[midIdx]),
      clobTokenIds: String(row[clIdx] || '[]'),
      outcomes:     String(row[outIdx] || '["Yes","No"]')
    };

    var pts = backfillMarketHistory_(market);
    total  += pts;

    // 標記 historyBackfilled = true
    if (bfIdx !== -1) {
      sheet.getRange(i + 1, bfIdx + 1).setValue(true);
    }

    Utilities.sleep(500); // rate limiting between markets
  }

  polyLog_('backfillAll done. total pts written: ' + total);
  Logger.log('backfillAllTrackedMarkets_ done: ' + total + ' data points written');
}

// ═══════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════

function polyAddMarket_(sheet, headers, m, now) {
  var outcomeType = parseOutcomeType_(m.outcomes);
  var lead        = calcLeadOutcome_(m.outcomes, m.outcomePrices);

  var row = PM_MARKETS_HEADERS.map(function(h) {
    switch (h) {
      case 'marketId':          return m.id;
      case 'conditionId':       return m.conditionId;
      case 'slug':              return m.slug;
      case 'question':          return m.question;
      case 'category':          return m.category;
      case 'tags':              return m.tags;
      case 'clobTokenIds':      return m.clobTokenIds;
      case 'outcomeType':       return outcomeType;
      case 'outcomes':          return m.outcomes;
      case 'startDate':         return m.startDate;
      case 'endDate':           return m.endDate;
      case 'volume':            return m.volume;
      case 'volume24hr':        return m.volume24hr;
      case 'liquidity':         return m.liquidity;
      case 'outcomePrices':     return m.outcomePrices;
      case 'leadOutcome':       return lead.outcome;
      case 'leadPrice':         return lead.price;
      case 'active':            return m.active;
      case 'closed':            return m.closed;
      case 'resolved':          return m.resolved;
      case 'resolvedOutcome':   return '';
      case 'trackingStatus':    return 'active';
      case 'firstSeenAt':       return now;
      case 'lastUpdatedAt':     return now;
      case 'historyBackfilled': return false;
      default:                  return '';
    }
  });
  sheet.appendRow(row);

  // 立即 backfill 歷史資料
  try {
    var pts = backfillMarketHistory_(m);
    if (pts > 0) {
      // 標記 historyBackfilled = true
      var bfCol = PM_MARKETS_HEADERS.indexOf('historyBackfilled') + 1;
      var newRow = sheet.getLastRow();
      sheet.getRange(newRow, bfCol).setValue(true);
    }
  } catch (e) {
    polyLog_('backfill failed for ' + m.id.substring(0, 8) + ': ' + e.message);
  }
}

function polyUpdateMarket_(sheet, headers, rowIndex, m, now) {
  var currentRow  = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  var lead        = calcLeadOutcome_(m.outcomes, m.outcomePrices);
  var isCompleted = m.resolved || m.closed;

  // resolvedOutcome 判斷邏輯：
  //   1. API 直接提供 → 優先使用
  //   2. 市場剛結算且 prices 非零 → 用 leadOutcome（結算前最後有效快照）
  //   3. 市場已結算但 prices 歸零 → 保留 sheet 中舊值（避免蓋掉正確歷史）
  var existingResolved = String(currentRow[headers.indexOf('resolvedOutcome')] || '');
  var resolvedOutcome;
  if (m.resolvedOutcome) {
    resolvedOutcome = m.resolvedOutcome;           // API 提供
  } else if (isCompleted && lead.price > 0) {
    resolvedOutcome = lead.outcome;                // 結算前最後有效 lead
  } else {
    resolvedOutcome = existingResolved;            // prices 已歸零，保留舊值
  }

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
    'resolvedOutcome': resolvedOutcome,
    'trackingStatus':  isCompleted ? 'completed' : 'active',
    'lastUpdatedAt':   now
  };

  Object.keys(updates).forEach(function(col) {
    var idx = headers.indexOf(col);
    if (idx !== -1) currentRow[idx] = updates[col];
  });

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([currentRow]);
}

// ═══════════════════════════════════════════════════════
// SNAPSHOT (per-outcome long format)
// ═══════════════════════════════════════════════════════

/**
 * 對所有 active 市場的每個 outcome 寫入一行快照（source = 'live'）
 */
function snapshotPrices_(markets, now) {
  if (!markets.length) return;
  var rows = [];

  markets.forEach(function(m) {
    var outcomes = [];
    var prices   = [];
    try { outcomes = JSON.parse(m.outcomes); }          catch(e) {}
    try { prices   = JSON.parse(m.outcomePrices)
                       .map(function(p) { return parseFloat(p) || 0; }); } catch(e) {}

    outcomes.forEach(function(name, i) {
      rows.push([now, m.id, i, name, prices[i] !== undefined ? prices[i] : 0, 'live']);
    });
  });

  if (!rows.length) return;
  var sheet   = getPmSheet_(CONFIG.PM_SHEET_PRICE_HISTORY);
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 6).setValues(rows);
}

function appendTopMarkets_(top15, now) {
  if (!top15.length) return;
  var sheet   = getPmSheet_(CONFIG.PM_SHEET_TOP_MARKETS);
  var rows    = top15.map(function(m, i) {
    return [now, i + 1, m.id, m.question.substring(0, 200), m.volume24hr];
  });
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 5).setValues(rows);
}

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════

function parseOutcomeType_(outcomesJson) {
  try {
    var arr = JSON.parse(outcomesJson);
    if (arr.length === 2 &&
        arr[0].toLowerCase() === 'yes' &&
        arr[1].toLowerCase() === 'no') return 'binary';
    return 'multi';
  } catch (e) { return 'binary'; }
}

function calcLeadOutcome_(outcomesJson, pricesJson) {
  try {
    var outcomes = JSON.parse(outcomesJson);
    var prices   = JSON.parse(pricesJson);
    var maxIdx = 0, maxVal = parseFloat(prices[0]) || 0;
    for (var i = 1; i < prices.length; i++) {
      var v = parseFloat(prices[i]) || 0;
      if (v > maxVal) { maxVal = v; maxIdx = i; }
    }
    return { outcome: String(outcomes[maxIdx] || ''), price: maxVal };
  } catch (e) { return { outcome: '', price: 0.5 }; }
}
