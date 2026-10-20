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
    this.bridesmaids = [];
    this.toastUntil = 0;
    this.drummer = null;         // userId
    this.drumUntil = 0;
    this.cake = { coins: 0, goal: config.cakeGoal, level: 1 };
    this.qejf = 0;
    this.partyUntil = 0;
    this.stats = { gifts: 0, coins: 0, likes: 0 };
    this.resetLikeGoal();
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

  // Per-viewer like counters, restarted on every new connection / reset
  resetLikeGoal() {
    this.likesByUser = new Map(); // userId -> estimated likes sent during this LIVE (taps TikTok dropped included)
    this.liveLikes = 0;           // the LIVE's total likes (what viewers see on TikTok)
    this.likeWindow = [];         // [time, counted, tiktokDelta] of the last minute, to measure coverage
    this.krushqitMark = null;     // 50K milestones already celebrated
    this.krushqitUntil = 0;
    this.krushqitPeople = [];
  }

  krushqitProgress() {
    const goal = config.krushqit.likes;
    const done = (this.krushqitMark || 0) * goal;
    return { value: Math.max(0, Math.min(goal, this.liveLikes - done)), goal,
      until: this.krushqitUntil, people: this.krushqitPeople, seconds: config.krushqit.seconds };
  }

  // The procession: top likers first, then the most generous, then anyone recently seen
  triggerKrushqit(reason) {
    const k = config.krushqit;
    if (Date.now() < this.krushqitUntil) { this.log('🎺 Krushqit already on stage, skipped'); return; }
    const ids = [];
    const add = id => { if (id && !ids.includes(id) && this.users.has(id)) ids.push(id); };
    [...this.likesByUser.entries()].sort((a, b) => b[1] - a[1]).forEach(([id]) => add(id));
    this.leaderboard(20).forEach(u => add(u.userId));
    [...this.users.keys()].reverse().forEach(add);
    this.krushqitPeople = ids.slice(0, k.maxPeople).map(id => this.publicUser(this.users.get(id)));
    this.krushqitUntil = Date.now() + k.seconds * 1000;
    this.log(`🎺 KRUSHQIT (${reason}) → ${this.krushqitPeople.map(p => p.name).join(', ') || 'no viewers yet'}`);
    this.fx('krushqit', { people: this.krushqitPeople, seconds: k.seconds, title: config.texts.krushqitComing,
      sub: config.texts.krushqitWelcome, song: k.song, songStart: k.songStart, bpm: k.bpm, firstBeat: k.firstBeat });
    this.broadcast(true);
  }

  // Share of the LIVE's likes that actually reach us (TikTok drops taps when the LIVE is busy).
  // Measured over the last minute against TikTok's own total; 0.7 until there is enough data.
  likeCoverage() {
    const now = Date.now();
    while (this.likeWindow.length && now - this.likeWindow[0][0] > 60000) this.likeWindow.shift();
    let counted = 0, tiktok = 0;
    for (const [, c, d] of this.likeWindow) { counted += c; tiktok += d; }
    if (tiktok < 300) return 0.7;
    return Math.min(1, Math.max(0.2, counted / tiktok));
  }

  topLikers(n = 3) {
    return [...this.likesByUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([id, likes]) => ({ name: this.users.get(id)?.nickname || id, likes: Math.round(likes) }));
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
    const name = String(giftName).toLowerCase().trim();
    const byName = config.gifts.find(g => [g.gift, ...(g.aliases || [])].some(n => n.toLowerCase() === name));
    if (byName) return byName;
    const byCoins = config.gifts.find(g => Math.abs(g.coins - coins) <= 1);
    if (byCoins) return byCoins;
    const sorted = [...config.gifts].sort((a, b) => b.coins - a.coins);
    return sorted.find(g => coins >= g.coins) || config.gifts[0];
  }

  isInScene(userId) {
    return this.dancers.includes(userId) || this.bride === userId || this.groom === userId
      || this.bestMen.includes(userId) || this.bridesmaids.includes(userId) || this.drummer === userId;
  }

  addDancer(userId) {
    if (this.bride === userId || this.groom === userId || this.bestMen.includes(userId) || this.bridesmaids.includes(userId)) return false;
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
    this.bridesmaids = this.bridesmaids.filter(id => id !== userId);
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
    // KRUSHQIT: every 50K likes of the LIVE's total
    const K = config.krushqit.likes;
    const liveTotal = data.totalLikeCount > 0 ? data.totalLikeCount : this.liveLikes + count;
    if (this.krushqitMark == null) this.krushqitMark = Math.floor(liveTotal / K); // likes before we connected don't trigger it
    const delta = this.liveLikes > 0 && data.totalLikeCount > 0 ? Math.max(0, liveTotal - this.liveLikes) : count;
    this.likeWindow.push([Date.now(), count, Math.max(delta, count)]);
    this.liveLikes = Math.max(this.liveLikes, liveTotal);
    const kMark = Math.floor(this.liveLikes / K);
    if (kMark > this.krushqitMark) {
      this.krushqitMark = kMark;
      this.triggerKrushqit(`${kMark * K / 1000}K likes`);
    }

    // Per-viewer like counter: every N likes puts this viewer in the dance (again, if they were pushed out)
    const N = config.likesToJoin;
    const before = this.likesByUser.get(u.userId) || 0;
    const after = before + count / this.likeCoverage();
    this.likesByUser.set(u.userId, after);
    if (Math.floor(after / N) > Math.floor(before / N)) {
      const pct = Math.round(this.likeCoverage() * 100);
      if (this.isInScene(u.userId)) {
        this.log(`❤️ ${u.nickname} reached ~${Math.round(after)} likes (already in the wedding)`);
      } else {
        this.addDancer(u.userId);
        this.log(`❤️ ${u.nickname} reached ~${Math.round(after)} likes (TikTok delivering ${pct}%) → Futesh në valle`);
        this.fx('dancer', { user: this.publicUser(u), added: true, viaLikes: true, text: fmt(config.texts.likesJoined, { name: u.nickname }) });
      }
    }
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
      case 'bestman':
      case 'bridesmaid': {
        const isMan = tier.role === 'bestman';
        const list = isMan ? this.bestMen : this.bridesmaids;
        const again = list.includes(u.userId);
        if (!again) {
          this.clearRoles(u.userId);
          list.push(u.userId);
          if (list.length > (isMan ? config.maxBestMen : config.maxBridesmaids)) {
            const out = list.shift();
            this.addDancer(out); // the replaced one keeps dancing
          }
        }
        this.fx('role', { role: tier.role, user: user(), again,
          title: isMan ? config.texts.newBestman : config.texts.newBridesmaid });
        break;
      }
      case 'toast': {
        this.toastUntil = Math.max(Date.now(), this.toastUntil) + config.toastSeconds * 1000;
        this.fx('toast', { user: user(), title: config.texts.toast, sub: config.texts.toastSub,
          seconds: config.toastSeconds, cheers: config.texts.cheers });
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

    // Cake meter (disabled when the KRUSHQIT meter replaces it)
    if (config.cakeEnabled !== false) this.cake.coins += total;
    while (config.cakeEnabled !== false && this.cake.coins >= this.cake.goal) {
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
        likesToJoin: config.likesToJoin,
        legendPerPage: config.legendPerPage,
        legendPageSeconds: config.legendPageSeconds,
        showGiftMenu: config.showGiftMenu !== false,
      },
      dancers: dancers.map(get),
      bride: get(this.bride),
      groom: get(this.groom),
      bestMen: this.bestMen.map(get),
      bridesmaids: this.bridesmaids.map(get),
      toastUntil: this.toastUntil,
      drummer: this.drummer ? { ...get(this.drummer), until: this.drumUntil } : null,
      kumbari,
      leaderboard: this.leaderboard(5).map(u => this.publicUser(u)),
      cake: this.cake,
      krushqit: this.krushqitProgress(),
      qejf: { value: this.qejf, label: config.texts.qejfLevels[qejfLevel], party: Date.now() < this.partyUntil },
      stats: this.stats,
      topLikers: this.topLikers(),
      now: Date.now(),
    };
  }

  // Throttled state push (max ~2.5/s, it is sent to every open screen)
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
    }, 400);
  }
}

module.exports = WeddingEngine;
