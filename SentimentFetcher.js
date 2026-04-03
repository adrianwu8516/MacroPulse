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
