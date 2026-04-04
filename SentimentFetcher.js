/**
 * SentimentFetcher.js — CNN Fear & Greed Index + Alpha Vantage SPY/SMA200
 */

/**
 * 抓取 CNN Fear & Greed Index
 */
function fetchFearGreed_() {
  var res = UrlFetchApp.fetch(CONFIG.FG_URL, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }
  });

  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('CNN Fear & Greed API error ' + code);
  }

  var json = JSON.parse(res.getContentText());
  var fg = json.fear_and_greed;
  if (!fg || fg.score === undefined) {
    throw new Error('Invalid Fear & Greed response');
  }

  return {
    score: fg.score,
    rating: fg.rating || '',
    previousClose: fg.previous_close || 0,
    previousOneWeek: fg.previous_1_week || 0,
    previousOneMonth: fg.previous_1_month || 0,
    previousOneYear: fg.previous_1_year || 0
  };
}

/**
 * 抓取 Alpha Vantage SPY 最新價格
 */
function fetchSPYPrice_() {
  var key = CONFIG.getAVKey();
  if (!key) throw new Error('ALPHA_VANTAGE_KEY not set');

  var url = CONFIG.AV_BASE_URL +
    '?function=GLOBAL_QUOTE' +
    '&symbol=SPY' +
    '&apikey=' + key;

  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('Alpha Vantage GLOBAL_QUOTE error ' + code);

  var json = JSON.parse(res.getContentText());
  var quote = json['Global Quote'];
  if (!quote || !quote['05. price']) {
    throw new Error('No SPY price data (may have hit rate limit)');
  }

  return parseFloat(quote['05. price']);
}

/**
 * 抓取 Alpha Vantage SPY 200-day SMA
 */
function fetchSMA200_() {
  var key = CONFIG.getAVKey();
  if (!key) throw new Error('ALPHA_VANTAGE_KEY not set');

  var url = CONFIG.AV_BASE_URL +
    '?function=SMA' +
    '&symbol=SPY' +
    '&interval=daily' +
    '&time_period=200' +
    '&series_type=close' +
    '&apikey=' + key;

  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('Alpha Vantage SMA error ' + code);

  var json = JSON.parse(res.getContentText());
  var analysis = json['Technical Analysis: SMA'];
  if (!analysis) {
    throw new Error('No SMA data (may have hit rate limit)');
  }

  // 取最新日期的 SMA
  var dates = Object.keys(analysis).sort().reverse();
  if (dates.length === 0) throw new Error('Empty SMA data');

  return parseFloat(analysis[dates[0]]['SMA']);
}

/**
 * 抓取 SPY 完整歷史日線資料（用於一次性歷史補齊）
 * 返回 { date: { price, sma200 } } map，僅包含 >= startDate 的日期
 */
function fetchSPYHistoryMap_(startDate) {
  var key = CONFIG.getAVKey();
  if (!key) throw new Error('ALPHA_VANTAGE_KEY not set');

  var url = CONFIG.AV_BASE_URL +
    '?function=TIME_SERIES_DAILY_ADJUSTED' +
    '&symbol=SPY' +
    '&outputsize=full' +
    '&apikey=' + key;

  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('AV history error ' + res.getResponseCode());

  var json = JSON.parse(res.getContentText());
  var series = json['Time Series (Daily)'];
  if (!series) throw new Error('AV: no Time Series data in response');

  // 按日期升序排列
  var dates = Object.keys(series).sort();
  var priceArr = dates.map(function(d) { return parseFloat(series[d]['5. adjusted close']); });

  // 計算滾動 200-day SMA（O(n) sliding window）
  var smaArr = new Array(dates.length).fill(null);
  if (dates.length >= 200) {
    var windowSum = 0;
    for (var i = 0; i < 200; i++) windowSum += priceArr[i];
    smaArr[199] = windowSum / 200;
    for (var i = 200; i < dates.length; i++) {
      windowSum += priceArr[i] - priceArr[i - 200];
      smaArr[i] = windowSum / 200;
    }
  }

  var result = {};
  for (var i = 0; i < dates.length; i++) {
    var d = dates[i];
    if (d >= startDate) {
      result[d] = {
        price:  Math.round(priceArr[i] * 100) / 100,
        sma200: smaArr[i] !== null ? Math.round(smaArr[i] * 100) / 100 : ''
      };
    }
  }
  return result;
}

/**
 * 抓取 CNN Fear & Greed 歷史資料（約含過去 1 年）
 * 返回 { date: score } map
 */
function fetchFGHistoryMap_() {
  var res = UrlFetchApp.fetch(CONFIG.FG_URL, {
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (res.getResponseCode() !== 200) throw new Error('CNN F&G history error');

  var json = JSON.parse(res.getContentText());
  var hist = (json.fear_and_greed_historical || {}).data || [];
  var map = {};
  hist.forEach(function(pt) {
    if (!pt.x || !pt.y) return;
    var d = Utilities.formatDate(new Date(pt.x), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    map[d] = Math.round(pt.y * 10) / 10;
  });
  return map;
}

/**
 * 主要入口：抓取情緒指標，寫入 Indicators sheet
 */
function fetchSentimentData() {
  var timestamp = new Date().toISOString();
  var results = [];

  // 1. CNN Fear & Greed
  try {
    var fg = fetchFearGreed_();
    results.push({
      id: 'FG',
      name: '恐惧与贪婪指数',
      category: 'sentiment',
      rawValue: fg.score,
      previousValue: fg.previousClose,
      displayValue: Math.round(fg.score) + ' (' + fg.rating + ')',
      timestamp: timestamp
    });
  } catch (e) {
    log_('SentimentFetcher', 'Fear & Greed error: ' + e.message);
  }

  // 2 & 3. SPY Price + SMA200
  var avKey = CONFIG.getAVKey();
  if (avKey) {
    var spyPrice = null;
    var sma200 = null;

    try {
      spyPrice = fetchSPYPrice_();
      Utilities.sleep(500); // Alpha Vantage rate limit
    } catch (e) {
      log_('SentimentFetcher', 'SPY Price error: ' + e.message);
    }

    try {
      sma200 = fetchSMA200_();
    } catch (e) {
      log_('SentimentFetcher', 'SMA200 error: ' + e.message);
    }

    if (spyPrice !== null) {
      var aboveMA = sma200 !== null && spyPrice > sma200;
      var displayParts = ['$' + Math.round(spyPrice)];
      if (sma200 !== null) {
        displayParts.push('(' + (aboveMA ? '高于' : '低于') + ' 200MA)');
      }
      results.push({
        id: 'SP500',
        name: 'S&P 500 趋势',
        category: 'sentiment',
        rawValue: spyPrice,
        previousValue: sma200 || '',
        displayValue: displayParts.join(' '),
        timestamp: timestamp
      });
    }
  } else {
    log_('SentimentFetcher', 'No ALPHA_VANTAGE_KEY configured, skipping SPY/SMA');
  }

  if (results.length > 0) {
    writeIndicators_(results);
  }
  log_('SentimentFetcher', 'Fetched ' + results.length + ' sentiment indicators');
}
