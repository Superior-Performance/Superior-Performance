// Superior Performance — landing-page inquiry form.
//
// This endpoint has to accept requests from signed-out visitors, so it can't
// require a login. Instead it limits how much damage a script hammering the
// URL can do:
//   - fields are validated and length-capped here, not just in the browser
//   - one email per sender address every 10 minutes
//   - at most MAX_PER_HOUR / MAX_PER_DAY inquiry emails in total
//   - never spends the Google account's last RESERVE_QUOTA daily emails,
//     so booking alerts sent from the same account keep working
// Anything over a limit is still accepted (the visitor sees success) and, if
// OVERFLOW_SHEET_ID is set, appended to that spreadsheet so no real lead is
// lost — check it if the coach ever hears "I filled out your form".
//
// Script settings (Project Settings → Script properties) — optional:
//   OVERFLOW_SHEET_ID   id of a Google Sheet to log over-limit inquiries to

var NOTIFY_TO = 'superiorperformance.sp@gmail.com';
var TZ = 'America/Chicago';
var MAX_PER_HOUR = 6;
var MAX_PER_DAY = 25;
var RESERVE_QUOTA = 40;

function doGet(e) {
  try {
    var p = e.parameter || {};
    var name    = clip(p.name, 100);
    var email   = clip(p.email, 200).toLowerCase();
    var phone   = clip(p.phone, 40);
    var message = clip(p.message, 4000);

    if (!name || !email || !message) {
      return respond({ success: false, error: 'Name, email, and message are required.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return respond({ success: false, error: "That email doesn't look right." });
    }
    if (clip(p.website, 1)) return respond({ success: true }); // honeypot

    var verdict = checkLimits(email);
    if (verdict !== 'send') {
      logOverflow(verdict, name, email, phone, message);
      return respond({ success: true });
    }

    MailApp.sendEmail({
      to: NOTIFY_TO,
      replyTo: email,
      subject: 'New inquiry from ' + name,
      body:
        'New inquiry from the Superior Performance website\n\n' +
        'Name: ' + name + '\n' +
        'Email: ' + email + '\n' +
        'Phone: ' + (phone || '—') + '\n\n' +
        'Message:\n' + message,
    });
    return respond({ success: true });
  } catch (err) {
    return respond({ success: false, error: 'Could not send your request. Try again.' });
  }
}

function clip(v, max) {
  return String(v || '').trim().slice(0, max);
}

// Returns 'send', or the reason it didn't.
function checkLimits(email) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var now = new Date();
    var senderKey = 'from:' + email;
    var hourKey = 'hour:' + Utilities.formatDate(now, TZ, 'yyyyMMddHH');
    var dayKey = 'day:' + Utilities.formatDate(now, TZ, 'yyyyMMdd');

    if (cache.get(senderKey)) return 'duplicate sender';
    var hour = Number(cache.get(hourKey) || 0);
    var day = Number(cache.get(dayKey) || 0);
    if (hour >= MAX_PER_HOUR) return 'hourly cap';
    if (day >= MAX_PER_DAY) return 'daily cap';
    if (MailApp.getRemainingDailyQuota() <= RESERVE_QUOTA) return 'quota reserve';

    cache.put(senderKey, '1', 600);
    cache.put(hourKey, String(hour + 1), 3600);
    cache.put(dayKey, String(day + 1), 24 * 3600);
    return 'send';
  } finally {
    lock.releaseLock();
  }
}

function logOverflow(reason, name, email, phone, message) {
  var id = PropertiesService.getScriptProperties().getProperty('OVERFLOW_SHEET_ID');
  if (!id) return;
  try {
    SpreadsheetApp.openById(id).getSheets()[0]
      .appendRow([new Date(), reason, name, email, phone, message]);
  } catch (err) {
    // Logging is best-effort; never let it turn into an error for the visitor.
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
