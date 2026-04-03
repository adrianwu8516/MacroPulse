/**
 * Config.js — 全局配置與 Script Properties 存取
 */

var PROPS_ = PropertiesService.getScriptProperties();
var SS_ = SpreadsheetApp.getActiveSpreadsheet();

var CONFIG = {
  // Sheet 名稱
  SHEET_INDICATORS:      'Indicators',
  SHEET_HISTORY:         'History',
  SHEET_SOCIAL_POSTS:    'SocialPosts',
  SHEET_SOCIAL_ACCOUNTS: 'SocialAccounts',
  SHEET_HOLDINGS:        'Holdings',
  SHEET_LOG:             'Log',

  // API Keys
  getFredKey:       function() { return PROPS_.getProperty('FRED_API_KEY') || ''; },
  getAVKey:         function() { return PROPS_.getProperty('ALPHA_VANTAGE_KEY') || ''; },
  getXToken:        function() { return PROPS_.getProperty('X_BEARER_TOKEN') || ''; },
  getThreadsToken:  function() { return PROPS_.getProperty('THREADS_ACCESS_TOKEN') || ''; },
  getWebAppToken:   function() { return PROPS_.getProperty('WEBAPP_TOKEN') || ''; },

  // Plaid
  getPlaidClientId: function() { return PROPS_.getProperty('PLAID_CLIENT_ID') || ''; },
  getPlaidSecret:   function() { return PROPS_.getProperty('PLAID_SECRET') || ''; },
  getPlaidEnv:      function() { return PROPS_.getProperty('PLAID_ENV') || 'production'; },

  // FRED API
  FRED_BASE_URL: 'https://api.stlouisfed.org/fred/series/observations',

  // Alpha Vantage
  AV_BASE_URL: 'https://www.alphavantage.co/query',

  // CNN Fear & Greed
  FG_URL: 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',

  // X API v2
  X_BASE_URL: 'https://api.x.com/2',

  // Threads API
  THREADS_BASE_URL: 'https://graph.threads.net/v1.0',
};
