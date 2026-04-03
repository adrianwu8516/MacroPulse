/**
 * PlaidFetcher.js — Plaid API 整合，抓取 Firstrade 持仓数据
 *
 * 首次使用流程：
 *   1. 在 Script Properties 設定 PLAID_CLIENT_ID、PLAID_SECRET、PLAID_ENV
 *   2. 開啟 Web App URL + ?page=plaid-setup 完成 Plaid Link OAuth
 *   3. Access Token 自動存入 Script Properties
 *   4. 之後 dailyDataFetch() 每天自動抓取持仓
 */

var PLAID_URLS_ = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com'
};

function plaidBase_() {
  var env = PROPS_.getProperty('PLAID_ENV') || 'production';
  return PLAID_URLS_[env] || PLAID_URLS_.production;
}

/**
 * 通用 Plaid POST 請求
 */
function plaidPost_(endpoint, payload) {
  var clientId = PROPS_.getProperty('PLAID_CLIENT_ID') || '';
  var secret   = PROPS_.getProperty('PLAID_SECRET')    || '';

  if (!clientId || !secret) {
    throw new Error('Plaid credentials not configured. Set PLAID_CLIENT_ID and PLAID_SECRET in Script Properties.');
  }

  payload.client_id = clientId;
  payload.secret    = secret;

  var resp = UrlFetchApp.fetch(plaidBase_() + endpoint, {
    method:          'post',
    contentType:     'application/json',
    payload:         JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var body = JSON.parse(resp.getContentText());

  if (body.error_code) {
    throw new Error('[Plaid ' + body.error_code + '] ' + (body.error_message || ''));
  }
  return body;
}

// ─────────────────────────────────────────────
// Step 1 — 產生 Link Token（前端 PlaidLink.html 呼叫）
// ─────────────────────────────────────────────
function createPlaidLinkToken() {
  var resp = plaidPost_('/link/token/create', {
    client_name:   'MacroPulse',
    country_codes: ['US'],
    language:      'en',
    user:          { client_user_id: 'macropulse-user' },
    products:      ['investments']
  });
  return resp.link_token;
}

// ─────────────────────────────────────────────
// Step 2 — 交換 public_token → access_token（前端回調後呼叫）
// ─────────────────────────────────────────────
function exchangePlaidToken(publicToken) {
  var resp = plaidPost_('/item/public_token/exchange', {
    public_token: publicToken
  });

  PROPS_.setProperty('PLAID_ACCESS_TOKEN', resp.access_token);
  PROPS_.setProperty('PLAID_ITEM_ID',      resp.item_id);

  log_('Plaid', 'Access token saved. Item ID: ' + resp.item_id);
  return { success: true, item_id: resp.item_id };
}

// ─────────────────────────────────────────────
// Step 3 — 每日抓取持仓（由 dailyDataFetch 觸發）
// ─────────────────────────────────────────────
function fetchPlaidHoldings() {
  var accessToken = PROPS_.getProperty('PLAID_ACCESS_TOKEN');
  if (!accessToken) {
    log_('Plaid', 'Skipped: no access token. Complete Plaid Link setup first.');
    return;
  }

  log_('Plaid', 'Fetching holdings...');

  var resp = plaidPost_('/investments/holdings/get', {
    access_token: accessToken
  });

  var holdings   = resp.holdings   || [];
  var securities = resp.securities || [];
  var accounts   = resp.accounts   || [];

  // Build lookup maps
  var secMap = {};
  securities.forEach(function(s) { secMap[s.security_id] = s; });

  var accMap = {};
  accounts.forEach(function(a) { accMap[a.account_id] = a; });

  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  var headers = [
    'date', 'account_id', 'account_name', 'ticker', 'security_name',
    'type', 'quantity', 'close_price', 'cost_basis',
    'market_value', 'unrealized_pnl', 'unrealized_pnl_pct', 'currency'
  ];

  var rows = holdings
    .filter(function(h) { return h.quantity !== 0; })  // 跳過空倉
    .map(function(h) {
      var sec = secMap[h.security_id] || {};
      var acc = accMap[h.account_id]  || {};

      var qty       = h.quantity || 0;
      var price     = h.institution_price || sec.close_price || 0;
      var costBasis = (h.cost_basis !== null && h.cost_basis !== undefined) ? h.cost_basis : '';
      var mktVal    = h.institution_value || (qty * price);
      var pnl       = costBasis !== '' ? round2_(mktVal - costBasis) : '';
      var pnlPct    = costBasis ? round2_((mktVal - costBasis) / costBasis * 100) : '';

      return [
        dateStr,
        h.account_id,
        acc.name || '',
        sec.ticker_symbol || '',
        sec.name || '',
        sec.type || '',
        round4_(qty),
        round4_(price),
        costBasis !== '' ? round2_(costBasis) : '',
        round2_(mktVal),
        pnl,
        pnlPct,
        sec.iso_currency_code || 'USD'
      ];
    });

  writeSheet_(CONFIG.SHEET_HOLDINGS, headers, rows);
  log_('Plaid', 'Holdings updated: ' + rows.length + ' positions across ' + accounts.length + ' account(s)');
}

// ─────────────────────────────────────────────
// Dashboard 用：google.script.run 呼叫
// ─────────────────────────────────────────────
function getHoldingsForDashboard() {
  var data = readSheet_(CONFIG.SHEET_HOLDINGS);
  var numFields = ['quantity', 'close_price', 'cost_basis', 'market_value', 'unrealized_pnl', 'unrealized_pnl_pct'];

  data.forEach(function(row) {
    numFields.forEach(function(f) {
      row[f] = (row[f] !== '' && row[f] !== undefined && row[f] !== null)
        ? (parseFloat(row[f]) || 0)
        : null;
    });
  });

  // Portfolio summary
  var totalValue = 0, totalPnl = 0, hasPnl = false;
  data.forEach(function(row) {
    if (row.market_value) totalValue += row.market_value;
    if (row.unrealized_pnl !== null) { totalPnl += row.unrealized_pnl; hasPnl = true; }
  });

  var isConnected = !!PROPS_.getProperty('PLAID_ACCESS_TOKEN');

  return {
    holdings:    data,
    totalValue:  round2_(totalValue),
    totalPnl:    hasPnl ? round2_(totalPnl) : null,
    isConnected: isConnected
  };
}

/**
 * 取消連結 Plaid（清除 access token）
 */
function disconnectPlaid() {
  var accessToken = PROPS_.getProperty('PLAID_ACCESS_TOKEN');
  if (accessToken) {
    try {
      plaidPost_('/item/remove', { access_token: accessToken });
    } catch (e) {
      Logger.log('Plaid item/remove failed (non-critical): ' + e.message);
    }
  }
  PROPS_.deleteProperty('PLAID_ACCESS_TOKEN');
  PROPS_.deleteProperty('PLAID_ITEM_ID');
  log_('Plaid', 'Disconnected and access token removed');
  return { success: true };
}

/**
 * 取得連結狀態（供前端顯示）
 */
function getPlaidStatus() {
  var token  = PROPS_.getProperty('PLAID_ACCESS_TOKEN');
  var itemId = PROPS_.getProperty('PLAID_ITEM_ID') || '';
  var env    = PROPS_.getProperty('PLAID_ENV') || 'production';
  return { isConnected: !!token, itemId: itemId, env: env };
}

// ─────────────────────────────────────────────
// 工具函數
// ─────────────────────────────────────────────
function round2_(v) { return Math.round(v * 100) / 100; }
function round4_(v) { return Math.round(v * 10000) / 10000; }
