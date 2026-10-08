// =============================================================
// weddingEngine.js — Dasma Shqiptare game state
// Receives normalized TikTok events, keeps the wedding state
// (dancers, bride, groom, best men, drummer, cake, qejf, leaderboard)
// and pushes `state` snapshots + one-shot `fx` events to overlays.
// =============================================================

const fs = require('fs');
const path = require('path');
const config = require('./config');

const SAVE_FILE = path.join(__dirname, '../data/state.json');

function fmt(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

class WeddingEngine {
  constructor(io) {
    this.io = io;
    this.giftImages = {}; // gift name (lowercase) -> image url
    this.resetState();
    this.load();

    this.broadcastTimer = null;
    this.saveTimer = null;
    setInterval(() => this.tick(), 1000);
  }

  resetState() {
    this.users = new Map();      // userId -> { userId, username, nickname, avatar, coins }
    this.dancers = [];           // userIds in the circle dance
    this.bride = null;
    this.groom = null;
    this.bestMen = [];
    this.drummer = null;         // userId
    this.drumUntil = 0;
    this.cake = { coins: 0, goal: config.cakeGoal, level: 1 };
    this.qejf = 0;
    this.partyUntil = 0;
    this.stats = { gifts: 0, coins: 0, likes: 0 };
  }

  // ---------------------------------------------------------
  // Persistence (leaderboard + cake survive restarts)
  // ---------------------------------------------------------
  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
      for (const u of saved.users || []) this.users.set(u.userId, u);
      if (saved.cake) this.cake = saved.cake;
      if (saved.giftImages) this.giftImages = saved.giftImages;
      console.log(`[Wedding] Restored ${this.users.size} gifters from disk`);
    } catch (_) { /* first run */ }
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const users = [...this.users.values()].filter(u => u.coins > 0);
      const data = { users, cake: this.cake, giftImages: this.giftImages };
      fs.mkdir(path.dirname(SAVE_FILE), { recursive: true }, () => {
        fs.writeFile(SAVE_FILE, JSON.stringify(data), () => {});
      });
    }, 2000);
  }

  reset() {
    const images = this.giftImages;
    this.resetState();
    this.giftImages = images;
    this.save();
    this.fx('reset', {});
    this.broadcast(true);
  }

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------
  upsertUser({ userId, username, nickname, avatar }) {
    let u = this.users.get(userId);
    if (!u) {
      u = { userId, username, nickname, avatar: avatar || null, coins: 0 };
      this.users.set(userId, u);
    } else {
      u.nickname = nickname || u.nickname;
      u.username = username || u.username;
      if (avatar) u.avatar = avatar;
    }
    return u;
  }

  publicUser(u) {
    if (!u) return null;
    return { id: u.userId, name: u.nickname, username: u.username, avatar: u.avatar, coins: u.coins };
  }

  leaderboard(n = 5) {
    return [...this.users.values()]
      .filter(u => u.coins > 0)
      .sort((a, b) => b.coins - a.coins)
      .slice(0, n);
  }

  kumbariId() {
    const top = this.leaderboard(1)[0];
    return top ? top.userId : null;
  }

  tierFor(giftName, coins) {
    const byName = config.gifts.find(g => g.gift.toLowerCase() === String(giftName).toLowerCase());
    if (byName) return byName;
    const sorted = [...config.gifts].sort((a, b) => b.coins - a.coins);
    return sorted.find(g => coins >= g.coins) || config.gifts[0];
  }

  isInScene(userId) {
    return this.dancers.includes(userId) || this.bride === userId || this.groom === userId
      || this.bestMen.includes(userId) || this.drummer === userId;
  }

  addDancer(userId) {
    if (this.bride === userId || this.groom === userId || this.bestMen.includes(userId)) return false;
    if (this.dancers.includes(userId)) return false;
    if (this.dancers.length >= config.maxDancers) {
      // Make room: drop the least generous dancer (never the newcomer)
      let worst = 0;
      this.dancers.forEach((id, i) => {
        if ((this.users.get(id)?.coins || 0) < (this.users.get(this.dancers[worst])?.coins || 0)) worst = i;
      });
      this.dancers.splice(worst, 1);
    }
    this.dancers.push(userId);
    return true;
  }

  // Remove a user from all scene slots except the one being assigned
  clearRoles(userId) {
    this.dancers = this.dancers.filter(id => id !== userId);
    this.bestMen = this.bestMen.filter(id => id !== userId);
    if (this.bride === userId) this.bride = null;
    if (this.groom === userId) this.groom = null;
  }

  addQejf(amount) {
    if (Date.now() < this.partyUntil) return;
    this.qejf = Math.min(100, this.qejf + amount);
    if (this.qejf >= 100) {
      this.partyUntil = Date.now() + config.partySeconds * 1000;
      this.qejf = 100;
      this.fx('party', { seconds: config.partySeconds });
    }
  }

  fx(type, payload) {
    this.io.emit('fx', { type, ...payload });
  }

  // Server logs only (Render → Logs), not shown in the control panel
  log(text) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${text}`);
  }

  // ---------------------------------------------------------
  // TikTok event handlers
  // ---------------------------------------------------------
  onJoin(data) {
    const u = this.upsertUser(data);
    this.fx('join', { user: this.publicUser(u), text: fmt(config.texts.welcome, { name: u.nickname }) });
  }

  onShare(data) {
    const u = this.upsertUser(data);
    this.addQejf(3);
    this.fx('share', { user: this.publicUser(u), text: fmt(config.texts.share, { name: u.nickname }) });
    this.log(`🔗 ${u.nickname} shared the LIVE`);
    this.broadcast();
  }

  onFollow(data) {
    const u = this.upsertUser(data);
    this.addQejf(2);
    this.fx('follow', { user: this.publicUser(u), text: fmt(config.texts.follow, { name: u.nickname }) });
    this.log(`➕ ${u.nickname} followed`);
    this.broadcast();
  }

  onLike(data) {
    const u = this.upsertUser(data);
    const count = data.likeCount || 1;
    this.stats.likes += count;
    this.addQejf(count * config.qejfPerLike);
    this.fx('like', { user: this.publicUser(u), count, inScene: this.isInScene(u.userId) });
    this.broadcast();
  }

  onComment(data) {
    const u = this.upsertUser(data);
    const text = String(data.comment || '').slice(0, 60);
    this.addQejf(config.qejfPerChat);
    const lower = text.toLowerCase();
    const jump = config.jumpWords.some(w => lower.includes(w));
    if (this.isInScene(u.userId)) {
      this.fx('chat', { userId: u.userId, text, jump });
    }
    this.broadcast();
  }

  onGift(data) {
    const u = this.upsertUser(data);
    const count = Math.max(1, data.repeatCount || 1);
    const coinsEach = data.coins || 0;
    const total = coinsEach * count;
    const tier = this.tierFor(data.giftName, coinsEach);

    if (data.giftImage && data.giftName) this.registerGiftImage(data.giftName, data.giftImage);

    u.coins += total;
    this.stats.gifts += count;
    this.stats.coins += total;
    this.addQejf(total * config.qejfPerCoin + 1);

    const user = () => this.publicUser(u);
    this.log(`🎁 ${u.nickname}: ${data.giftName} x${count} (${total} coins) → ${tier.label}`);

    switch (tier.role) {
      case 'drummer': {
        const now = Date.now();
        const changed = this.drummer !== u.userId;
        this.drummer = u.userId;
        this.drumUntil = Math.min(now + config.drumMaxSeconds * 1000,
          Math.max(now, this.drumUntil) + config.drumSecondsPerRose * 1000 * count);
        this.fx('drum', { user: user(), count, changed, until: this.drumUntil,
          text: fmt(config.texts.drummer, { name: u.nickname }) });
        break;
      }
      case 'dancer': {
        const added = this.addDancer(u.userId);
        this.fx('dancer', { user: user(), added, count, text: fmt(config.texts.joinedDance, { name: u.nickname }) });
        break;
      }
      case 'bestman': {
        const again = this.bestMen.includes(u.userId);
        if (!again) {
          this.clearRoles(u.userId);
          this.bestMen.push(u.userId);
          if (this.bestMen.length > config.maxBestMen) {
            const out = this.bestMen.shift();
            this.addDancer(out); // demoted best man keeps dancing
          }
        }
        this.fx('role', { role: 'bestman', user: user(), again, title: config.texts.newBestman });
        break;
      }
      case 'money': {
        this.fx('money', { user: user(), amount: count, text: fmt(config.texts.bakshish, { name: u.nickname }) });
        break;
      }
      case 'bride':
      case 'groom': {
        const prev = this[tier.role];
        const again = prev === u.userId;
        if (!again) {
          this.clearRoles(u.userId);
          this[tier.role] = u.userId;
          if (prev) this.addDancer(prev); // previous bride/groom joins the dance
        }
        this.fx('role', {
          role: tier.role, user: user(), again,
          title: tier.role === 'bride' ? config.texts.newBride : config.texts.newGroom,
          couple: !!(this.bride && this.groom),
        });
        break;
      }
    }

    // Generous gifts also get you on the dance floor
    if (tier.role !== 'dancer' && total >= config.joinDanceMinCoins && !this.isInScene(u.userId)) {
      this.addDancer(u.userId);
    }

    // Cake meter
    this.cake.coins += total;
    while (this.cake.coins >= this.cake.goal) {
      this.cake.coins -= this.cake.goal;
      this.cake.level += 1;
      this.cake.goal = Math.round(this.cake.goal * config.cakeGoalGrowth / 100) * 100;
      this.fx('cake', { level: this.cake.level - 1, title: config.texts.cakeDone, user: user() });
    }

    this.fx('gift', { user: user(), giftName: data.giftName, count, coins: total, tier: tier.key });
    this.save();
    this.broadcast();
  }

  registerGiftImage(name, url) {
    const key = name.toLowerCase();
    if (this.giftImages[key] === url) return;
    this.giftImages[key] = url;
    this.save();
    this.broadcast();
  }

  onGiftCatalog(gifts) {
    const wanted = new Set(config.gifts.map(g => g.gift.toLowerCase()));
    for (const g of gifts) {
      if (wanted.has(g.name.toLowerCase())) this.giftImages[g.name.toLowerCase()] = g.image;
    }
    this.save();
    this.broadcast();
  }

  // ---------------------------------------------------------
  // Timers & snapshots
  // ---------------------------------------------------------
  tick() {
    const now = Date.now();
    let changed = false;
    if (this.drummer && now > this.drumUntil) {
      this.drummer = null;
      changed = true;
    }
    if (now > this.partyUntil && this.qejf > 0) {
      const wasParty = this.partyUntil && now - this.partyUntil < 1500;
      this.qejf = wasParty ? 55 : Math.max(0, this.qejf - config.qejfDecayPerSec);
      changed = true;
    }
    if (changed) this.broadcast();
  }

  snapshot() {
    const get = id => this.publicUser(this.users.get(id));
    const kumbari = this.kumbariId();
    // Kumbari leads the valle (first in line)
    const dancers = [...this.dancers].sort((a, b) => (a === kumbari ? -1 : b === kumbari ? 1 : 0));
    const qejfLevel = Math.min(3, Math.floor(this.qejf / 25.01));
    return {
      config: {
        gifts: config.gifts.map(g => ({ ...g, image: this.giftImages[g.gift.toLowerCase()] || null })),
        texts: config.texts,
        maxDancers: config.maxDancers,
      },
      dancers: dancers.map(get),
      bride: get(this.bride),
      groom: get(this.groom),
      bestMen: this.bestMen.map(get),
      drummer: this.drummer ? { ...get(this.drummer), until: this.drumUntil } : null,
      kumbari,
      leaderboard: this.leaderboard(5).map(u => this.publicUser(u)),
      cake: this.cake,
      qejf: { value: this.qejf, label: config.texts.qejfLevels[qejfLevel], party: Date.now() < this.partyUntil },
      stats: this.stats,
      now: Date.now(),
    };
  }

  // Throttled state push (max ~7/s)
  broadcast(immediate = false) {
    if (immediate) {
      clearTimeout(this.broadcastTimer);
      this.broadcastTimer = null;
      this.io.emit('state', this.snapshot());
      return;
    }
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      this.io.emit('state', this.snapshot());
    }, 150);
  }
}

module.exports = WeddingEngine;
