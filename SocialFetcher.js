/**
 * SocialFetcher.js — X (Twitter) API v2 + Threads (Meta Graph API)
 *
 * 從 SocialAccounts sheet 讀取追蹤帳號清單，抓取貼文寫入 SocialPosts sheet。
 */

/**
 * X API: 查找用戶（取得 userId）
 */
function xLookupUser_(username) {
  var token = CONFIG.getXToken();
  if (!token) throw new Error('X_BEARER_TOKEN not set');

  var url = CONFIG.X_BASE_URL + '/users/by/username/' + username +
    '?user.fields=name,username,description,profile_image_url,public_metrics';

  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'Authorization': 'Bearer ' + token }
  });

  var code = res.getResponseCode();
  if (code === 401) throw new Error('X API unauthorized');
  if (code === 429) throw new Error('X API rate limited');
  if (code !== 200) throw new Error('X API error ' + code);

  var json = JSON.parse(res.getContentText());
  if (!json.data) throw new Error('X user not found: ' + username);
  return json.data;
}

/**
 * X API: 抓取用戶推文
 */
function xFetchTweets_(userId, username, maxResults) {
  var token = CONFIG.getXToken();
  if (!token) throw new Error('X_BEARER_TOKEN not set');

  var url = CONFIG.X_BASE_URL + '/users/' + userId + '/tweets' +
    '?max_results=' + Math.min(maxResults || 10, 100) +
    '&tweet.fields=created_at,public_metrics,text' +
    '&expansions=author_id' +
    '&user.fields=name,username';

  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { 'Authorization': 'Bearer ' + token }
  });

  var code = res.getResponseCode();
  if (code === 401) throw new Error('X API unauthorized');
  if (code === 429) throw new Error('X API rate limited');
  if (code !== 200) throw new Error('X API error ' + code);

  var json = JSON.parse(res.getContentText());
  var tweets = json.data || [];
  var author = (json.includes && json.includes.users && json.includes.users[0]) || {};

  return tweets.map(function(tweet) {
    return {
      id: tweet.id,
      platform: 'x',
      authorUsername: author.username || username,
      authorDisplayName: author.name || '',
      content: tweet.text || '',
      createdAt: tweet.created_at || '',
      likeCount: (tweet.public_metrics || {}).like_count || 0,
      replyCount: (tweet.public_metrics || {}).reply_count || 0,
      repostCount: (tweet.public_metrics || {}).retweet_count || 0,
      url: 'https://x.com/' + (author.username || username) + '/status/' + tweet.id
    };
  });
}

/**
 * 主要入口：抓取所有追蹤帳號的貼文
 */
function fetchAllSocialPosts() {
  var accounts = readSheet_(CONFIG.SHEET_SOCIAL_ACCOUNTS);
  if (accounts.length === 0) {
    log_('SocialFetcher', 'No tracked accounts in SocialAccounts sheet');
    return;
  }

  var allPosts = [];
  var xToken = CONFIG.getXToken();

  // 處理 X 帳號
  var xAccounts = accounts.filter(function(a) { return a.platform === 'x'; });
  if (xToken && xAccounts.length > 0) {
    for (var i = 0; i < xAccounts.length; i++) {
      var acct = xAccounts[i];
      try {
        // 如果沒有 userId，先查找
        var userId = acct.userId;
        if (!userId) {
          var user = xLookupUser_(acct.username);
          userId = user.id;
          // 更新 Sheet 中的 userId、displayName、bio
          updateSocialAccount_(acct.username, 'x', {
            userId: userId,
            displayName: user.name || '',
            bio: user.description || ''
          });
          Utilities.sleep(500);
        }

        var tweets = xFetchTweets_(userId, acct.username, 10);
        allPosts = allPosts.concat(tweets);
        Utilities.sleep(1000); // X rate limit
      } catch (e) {
        log_('SocialFetcher', 'X @' + acct.username + ' error: ' + e.message);
      }
    }
  }

  // 寫入 SocialPosts sheet（覆寫）
  if (allPosts.length > 0) {
    var headers = ['id', 'platform', 'authorUsername', 'authorDisplayName', 'content', 'createdAt', 'likeCount', 'replyCount', 'repostCount', 'url'];
    var rows = allPosts.map(function(p) {
      return [p.id, p.platform, p.authorUsername, p.authorDisplayName, p.content, p.createdAt, p.likeCount, p.replyCount, p.repostCount, p.url];
    });
    writeSheet_(CONFIG.SHEET_SOCIAL_POSTS, headers, rows);
  }

  log_('SocialFetcher', 'Fetched ' + allPosts.length + ' posts from ' + accounts.length + ' accounts');
}

/**
 * 更新 SocialAccounts sheet 中的帳號資訊
 */
function updateSocialAccount_(username, platform, updates) {
  var sheet = SS_.getSheetByName(CONFIG.SHEET_SOCIAL_ACCOUNTS);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var userIdx = headers.indexOf('username');
  var platIdx = headers.indexOf('platform');

  for (var i = 1; i < data.length; i++) {
    if (data[i][userIdx] === username && data[i][platIdx] === platform) {
      for (var key in updates) {
        var colIdx = headers.indexOf(key);
        if (colIdx >= 0 && updates[key]) {
          sheet.getRange(i + 1, colIdx + 1).setValue(updates[key]);
        }
      }
      return;
    }
  }
}
