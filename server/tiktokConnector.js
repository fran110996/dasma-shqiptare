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

    this.creatorUsername = tiktokUsername.replace(/^@/, '');
    this.streaks.clear();

    this.connection = new TikTokLiveConnection(this.creatorUsername, {
      processInitialData: false,
      sessionId: sessionId || undefined,
    });

    this.connection.on('connected', (state) => {
      this.isConnected = true;
      this.emit('connected', { username: this.creatorUsername, state });
    });

    this.connection.on('disconnected', () => {
      this.isConnected = false;
      this.emit('disconnected');
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

    // GIFT — streakable gifts (giftType 1) fire on every combo step.
    // We process the delta each time so the screen reacts instantly.
    this.connection.on('gift', (data) => {
      const details = data.giftDetails || data.gift || {};
      const user = normalizeUser(data.user);
      const giftName = details.giftName || data.giftName || 'Gift';
      const coins = details.diamondCount || data.diamondCount || 0;
      const giftType = details.giftType ?? data.giftType;
      const repeatCount = data.repeatCount || 1;
      const giftImage = firstUrl(details.giftImage) || firstUrl(details.icon) || data.giftPictureUrl || null;

      let count = repeatCount;
      if (giftType === 1) {
        const key = `${user.userId}:${data.groupId || data.giftId}`;
        const prev = this.streaks.get(key) || 0;
        count = Math.max(0, repeatCount - prev);
        if (data.repeatEnd) this.streaks.delete(key);
        else this.streaks.set(key, repeatCount);
        if (count === 0) return;
      }

      this.emit('gift', { ...user, giftName, coins, repeatCount: count, giftImage });
    });

    // JOIN
    this.connection.on('member', (data) => {
      const user = normalizeUser(data.user);
      if (user.userId !== 'unknown') this.emit('join', user);
    });

    // LIKE
    this.connection.on('like', (data) => {
      this.emit('like', { ...normalizeUser(data.user), likeCount: data.likeCount || 1 });
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
      try { this.connection.disconnect(); } catch (_) {}
      this.connection = null;
      this.isConnected = false;
    }
  }
}

module.exports = TikTokConnector;
