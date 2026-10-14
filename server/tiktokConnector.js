// =============================================================
// tiktokConnector.js
// TikTok Live Connector wrapper (tiktok-live-connector v2.x)
// Based on tiktok-game-poc. Emits normalized events:
//   comment, gift, join, like, share, follow, gifts:catalog
// Every event carries a normalized `user` with avatar URL.
// =============================================================

const { TikTokLiveConnection } = require('tiktok-live-connector');
const { EventEmitter } = require('events');

function firstUrl(img) {
  if (!img) return null;
  const list = (img.url || img.urlList || img.url_list || []).filter(u => typeof u === 'string' && u.startsWith('http'));
  // Browsers / OBS can't render .heic — prefer jpeg/webp variants
  return list.find(u => /\.(jpe?g|webp|png)/i.test(u)) || list.find(u => !/\.heic/i.test(u)) || null;
}

// Library errors are objects like { info, exception } — turn them into one readable line
function errorText(err) {
  const msg = err?.exception?.message || err?.info || err?.message || String(err);
  if (/Room ID|user_not_found|not found/i.test(msg)) return 'User not found or not LIVE right now';
  if (/retry-after|rate limit|429/i.test(msg)) return 'TikTok rate limit, wait 1-2 minutes and try again';
  return msg;
}

// "⚖️: gifted the host 1 Rose" / "sent Rose" → "Rose"
function nameFromDescribe(text) {
  const t = String(text || '');
  const m = t.match(/(?:gifted the host|sent)\s+(?:\d+\s*x?\s*)?(.+?)\s*$/i);
  return m ? m[1].trim() : '';
}

function normalizeUser(user = {}) {
  const userId = String(user.userId || user.id || user.idStr || user.uniqueId || 'unknown');
  const username = user.uniqueId || user.displayId || user.nickname || userId;
  const nickname = user.nickname || user.displayId || username;
  // Medium is sharp enough for the big announcements; the default one is only ~72px
  const avatar = firstUrl(user.profilePictureMedium) || firstUrl(user.profilePicture) || firstUrl(user.profilePictureLarge)
    || firstUrl(user.avatarThumb) || user.profilePictureUrl || null;
  return { userId, username, nickname, avatar };
}

class TikTokConnector extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.isConnected = false;
    this.creatorUsername = null;
    // groupId -> last processed repeatCount, so gift streaks are counted live
    this.streaks = new Map();
  }

  async connect(tiktokUsername, sessionId = null) {
    if (this.connection) await this.disconnect();

    this.creatorUsername = tiktokUsername.trim().replace(/^@/, '').toLowerCase();
    this.streaks.clear();

    this.connection = new TikTokLiveConnection(this.creatorUsername, {
      processInitialData: false,
      sessionId: sessionId || undefined,
    });

    this.connection.on('connected', (state) => {
      this.isConnected = true;
      this.emit('connected', { username: this.creatorUsername, state });
    });

    const conn = this.connection;
    conn.on('disconnected', () => {
      if (this.connection === conn) this.isConnected = false;
      this.emit('disconnected', { intentional: !!conn.intentionalClose });
    });

    // Errors while connecting are reported once by connect() below
    this.connection.on('error', (err) => {
      if (!this.isConnected) return;
      this.emit('error', new Error(errorText(err)));
    });

    // COMMENT
    this.connection.on('chat', (data) => {
      const user = normalizeUser(data.user);
      const comment = data.comment || data.content || data.text || '';
      this.emit('comment', { ...user, comment });
    });

    // GIFT
    // TikTok now often sends gift events with an empty giftDetails (no name, no giftType).
    // The name is then only in common.describe: "⚖️: gifted the host 1 Rose".
    // Every send also arrives as several events (in progress… then repeatEnd), so we
    // always count the DELTA of repeatCount per streak, whatever the gift type.
    this.connection.on('gift', (data) => {
      const details = data.giftDetails || data.gift || {};
      const user = normalizeUser(data.user);
      const giftName = details.giftName || data.giftName
        || nameFromDescribe(data.common?.describe) || nameFromDescribe(details.describe)
        || `Gift #${data.giftId || '?'}`;
      const coins = details.diamondCount || data.diamondCount || 0;
      const repeatCount = data.repeatCount || 1;
      const giftImage = firstUrl(details.giftImage) || firstUrl(details.icon) || data.giftPictureUrl || null;

      const now = Date.now();
      const key = `${user.userId}:${data.giftId}:${data.groupId || ''}`;
      const prev = this.streaks.get(key);
      // a streak not updated for a while is over (in case its repeatEnd never arrived)
      const prevCount = prev && now - prev.t < 15000 ? prev.count : 0;
      const count = Math.max(0, repeatCount - prevCount);
      if (data.repeatEnd) this.streaks.delete(key);
      else this.streaks.set(key, { count: Math.max(repeatCount, prevCount), t: now });
      if (count === 0) return;

      this.emit('gift', { ...user, giftName, coins, repeatCount: count, giftImage });
    });

    // JOIN
    this.connection.on('member', (data) => {
      const user = normalizeUser(data.user);
      if (user.userId !== 'unknown') this.emit('join', user);
    });

    // LIKE
    this.connection.on('like', (data) => {
      // v2 events use `count` (likes in this event, up to ~15) and `total` (the LIVE's total, as a string)
      const likeCount = Number(data.count ?? data.likeCount ?? 1) || 1;
      const totalLikeCount = Number(data.total ?? data.totalLikeCount ?? 0) || 0;
      this.emit('like', { ...normalizeUser(data.user), likeCount, totalLikeCount });
    });

    // SHARE / FOLLOW
    this.connection.on('share', (data) => this.emit('share', normalizeUser(data.user)));
    this.connection.on('follow', (data) => this.emit('follow', normalizeUser(data.user)));

    try {
      // Gift icons are captured from incoming gifts (the full gift catalog
      // endpoint needs a paid EulerStream plan, see fetchGiftCatalog)
      return await this.connection.connect();
    } catch (err) {
      if (/retry-after|Cannot read properties of undefined/.test(err?.message || '')) {
        throw new Error('TikTok connection rate limit / cooldown. Make sure the LIVE is broadcasting and wait 1-2 minutes before connecting again.');
      }
      throw new Error(errorText(err));
    }
  }

  // Real gift icons for the on-screen gift legend
  async fetchGiftCatalog() {
    try {
      const list = await this.connection.fetchAvailableGifts();
      const gifts = (Array.isArray(list) ? list : list?.gifts || [])
        .map(g => ({ name: g.name, coins: g.diamond_count, image: firstUrl(g.image) }))
        .filter(g => g.name && g.image);
      if (gifts.length) this.emit('gifts:catalog', gifts);
    } catch (err) {
      console.warn('[TikTokConnector] Could not fetch gift catalog:', err.message);
    }
  }

  async disconnect() {
    if (this.connection) {
      this.connection.intentionalClose = true;
      try { this.connection.disconnect(); } catch (_) {}
      this.connection = null;
      this.isConnected = false;
    }
  }
}

module.exports = TikTokConnector;
