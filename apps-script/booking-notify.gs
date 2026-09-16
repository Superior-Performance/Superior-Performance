// Superior Performance — facility booking alerts.
//
// The app POSTs { type: 'book' | 'cancel', slotId, idToken } here after an
// athlete books or cancels. Nothing in the request is trusted as content:
// the script reads Firestore *as that athlete* (their Firebase ID token is
// the bearer credential, so Firestore's own security rules apply) and takes
// the athlete's name and the slot's time from there. A stranger who finds
// this URL has no valid token, so they get an error and no email is sent.
//
// Checks before any email goes out:
//   book   — the athlete's booking doc for that slot exists.
//   cancel — it no longer exists, and the session starts within 24 hours.
//   both   — at most one email per athlete + slot + type every 6 hours,
//            and at most MAX_PER_ATHLETE_PER_DAY per athlete.
//
// Script settings (Project Settings → Script properties) — optional:
//   FIREBASE_PROJECT_ID   defaults to superior-performance-ba102

var NOTIFY_TO = 'superiorperformance.sp@gmail.com';
var DEFAULT_PROJECT_ID = 'superior-performance-ba102';
var FACILITY_TZ = 'America/Chicago';
var LATE_CANCEL_HOURS = 24;
var MAX_PER_ATHLETE_PER_DAY = 6;

function doPost(e) {
  try {
    var req = JSON.parse((e.postData && e.postData.contents) || '{}');
    var type = req.type === 'cancel' ? 'cancel' : 'book';
    var slotId = String(req.slotId || '');
    var idToken = String(req.idToken || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(slotId) || !idToken) {
      return respond({ success: false, error: 'Bad request.' });
    }

    // Firestore validates the token's signature on every read below. The
    // uid decoded here is only used to build paths; a forged token fails the
    // first read and a uid that doesn't match the token fails the rules.
    var uid = uidFromToken(idToken);
    if (!uid) return respond({ success: false, error: 'Bad token.' });

    var slot = firestoreGet('facilitySlots/' + slotId, idToken);
    if (slot.status !== 200) return respond({ success: false, error: 'Not authorized.' });
    var user = firestoreGet('users/' + uid, idToken);
    if (user.status !== 200) return respond({ success: false, error: 'Not authorized.' });
    var booking = firestoreGet('facilitySlots/' + slotId + '/bookings/' + uid, idToken);
    if (booking.status !== 200 && booking.status !== 404) {
      return respond({ success: false, error: 'Not authorized.' });
    }

    var s = fields(slot.doc);
    var athlete = fields(user.doc).name || 'An athlete';

    if (type === 'book' && booking.status !== 200) {
      return respond({ success: false, error: 'No such booking.' });
    }
    if (type === 'cancel') {
      if (booking.status === 200) return respond({ success: false, error: 'Booking still active.' });
      if (hoursUntil(s.date, s.startTime) > LATE_CANCEL_HOURS) {
        return respond({ success: true, skipped: 'not a late cancel' });
      }
    }

    if (!allowSend(uid, slotId, type)) return respond({ success: true, skipped: 'rate limited' });

    var when = formatWhen(s.date, s.startTime, s.endTime);
    var fill = (s.capacity != null) ? ((s.bookedCount || 0) + ' of ' + s.capacity + ' booked') : '';
    var isCancel = type === 'cancel';

    MailApp.sendEmail({
      to: NOTIFY_TO,
      subject: (isCancel ? 'Late cancellation - ' : 'Facility booking - ') + athlete + ' - ' + when,
      body:
        (isCancel
          ? athlete + ' cancelled a booking less than 24 hours before the session.'
          : athlete + ' just booked a facility slot.') + '\n\n' +
        'When:  ' + when + '\n' +
        (fill ? (isCancel ? 'Now:   ' : 'Fill:  ') + fill + '\n' : '') +
        (s.notes ? 'Slot notes:  ' + s.notes + '\n' : '') +
        '\nSent automatically by the Superior Performance app.',
    });
    return respond({ success: true });
  } catch (err) {
    return respond({ success: false, error: 'Server error.' });
  }
}

// The old GET entry point. Kept only so a stale cached copy of the app gets
// a clear refusal instead of a Google error page — it never sends mail.
function doGet() {
  return respond({ success: false, error: 'Update the app — this endpoint now needs a signed-in request.' });
}

function uidFromToken(idToken) {
  try {
    var part = idToken.split('.')[1];
    var json = Utilities.newBlob(Utilities.base64DecodeWebSafe(part)).getDataAsString();
    var uid = JSON.parse(json).user_id;
    return /^[A-Za-z0-9]{1,128}$/.test(uid || '') ? uid : '';
  } catch (err) {
    return '';
  }
}

function firestoreGet(path, idToken) {
  var projectId = PropertiesService.getScriptProperties().getProperty('FIREBASE_PROJECT_ID') || DEFAULT_PROJECT_ID;
  var base = PropertiesService.getScriptProperties().getProperty('FIRESTORE_BASE') ||
    'https://firestore.googleapis.com';
  var res = UrlFetchApp.fetch(
    base + '/v1/projects/' + projectId + '/databases/(default)/documents/' + path,
    { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true }
  );
  var status = res.getResponseCode();
  return { status: status, doc: status === 200 ? JSON.parse(res.getContentText()) : null };
}

// Firestore REST wraps every value in its type ({ stringValue: 'x' }); flatten
// the handful of scalar types these docs actually use.
function fields(doc) {
  var out = {};
  var f = (doc && doc.fields) || {};
  Object.keys(f).forEach(function (k) {
    var v = f[k];
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('doubleValue' in v) out[k] = v.doubleValue;
    else if ('booleanValue' in v) out[k] = v.booleanValue;
  });
  return out;
}

function allowSend(uid, slotId, type) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var cache = CacheService.getScriptCache();
    var onceKey = 'once:' + uid + ':' + slotId + ':' + type;
    if (cache.get(onceKey)) return false;
    var dayKey = 'day:' + uid + ':' + Utilities.formatDate(new Date(), FACILITY_TZ, 'yyyyMMdd');
    var count = Number(cache.get(dayKey) || 0);
    if (count >= MAX_PER_ATHLETE_PER_DAY) return false;
    cache.put(onceKey, '1', 6 * 3600);
    cache.put(dayKey, String(count + 1), 24 * 3600);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// Slot date/time are facility wall-clock (Central). Utilities.parseDate reads
// them in that zone, so the result is a real instant regardless of where the
// script or the athlete happens to be.
function hoursUntil(date, startTime) {
  if (!date || !startTime) return Infinity;
  var start = Utilities.parseDate(date + ' ' + startTime, FACILITY_TZ, 'yyyy-MM-dd HH:mm');
  return (start.getTime() - Date.now()) / 3600000;
}

// 'YYYY-MM-DD' + 'HH:MM' 24h  ->  'Mon, Sep 15 · 3:00–4:00 PM'
function formatWhen(date, startTime, endTime) {
  var d = String(date || '').split('-');
  var dt = new Date(Number(d[0]), Number(d[1]) - 1, Number(d[2]));
  var day = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  var range = to12h(startTime) + (endTime ? '–' + to12h(endTime) : '');
  return day + ' · ' + range;
}

function to12h(hhmm) {
  var q = String(hhmm || '').split(':');
  var h = Number(q[0]);
  var m = q[1] || '00';
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return h12 + ':' + m + ' ' + ampm;
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run once from the editor to grant the mail + external-request scopes.
function authorize() {
  UrlFetchApp.fetch('https://firestore.googleapis.com', { muteHttpExceptions: true });
  MailApp.getRemainingDailyQuota();
}
