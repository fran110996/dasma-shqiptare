// =============================================================
// simulator.js — fake TikTok LIVE events for demos / testing.
// Emits exactly the same normalized events as tiktokConnector.
// Can run at the same time as a real connection.
// =============================================================

const { EventEmitter } = require('events');
const config = require('./config');

const NAMES = [
  'Arbër', 'Elira ✨', 'Dritoni', 'Besa_ks', 'Klajdi', 'Ermal 🇦🇱', 'Jonida', 'Luli.tr', 'Sara 💃', 'Gent',
  'Rina', 'Blendi', 'Megi 🌹', 'Andi_99', 'Fjolla', 'Kristi', 'Alketa', 'Dorian', 'Endrit', 'Erza 💜',
  'Granit', 'Valbona', 'Ilir', 'Teuta', 'Agron', 'Mimoza', 'Bujar', 'Lindita', 'Shkëlqim', 'Dafina',
  'Arta', 'Liridon', 'Vjosa', 'Fatos', 'Edona', 'Besnik', 'Albana', 'Dren', 'Kaltrina', 'Florian',
];

const USERS = NAMES.map((name, i) => ({
  userId: `sim_${i + 1}`,
  username: name.toLowerCase().replace(/[^a-zë0-9_.]/g, '') || `user${i}`,
  nickname: name,
  avatar: `https://i.pravatar.cc/150?img=${(i % 70) + 1}`,
}));

const COMMENTS = [
  'hopaaa', 'Opa opa!', 'U trashëgofshin! ❤️', 'Gëzuar!', 'valle valle 💃', 'sa bukur',
  'hop', 'Për shumë vjet!', '🔥🔥🔥', 'ku jeni nga?', 'lezet', 'qejf i madh', 'bravo', 'HOP 🕺',
];

const rand = arr => arr[Math.floor(Math.random() * arr.length)];

class Simulator extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.running = false;
    this.speed = 1;
    this.ambient = false;
    this.showTimers = [];
  }

  user(index) {
    return index != null ? USERS[index % USERS.length] : rand(USERS);
  }

  // ambient = only likes / chat / joins (no random gifts)
  start(speed = 1, ambient = false) {
    this.stop();
    this.speed = Math.max(0.25, Math.min(4, speed));
    this.ambient = ambient;
    this.running = true;
    const loop = () => {
      this.randomEvent();
      this.timer = setTimeout(loop, (400 + Math.random() * 900) / this.speed);
    };
    loop();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
    this.running = false;
    this.showTimers.forEach(clearTimeout);
    this.showTimers = [];
  }

  randomEvent() {
    const r = this.ambient ? Math.random() * 0.68 : Math.random();
    if (r < 0.32) this.like();
    else if (r < 0.55) this.comment();
    else if (r < 0.68) this.join();
    else if (r < 0.71) this.share();
    else if (r < 0.73) this.follow();
    else {
      // Weighted gifts: cheap ones are much more common
      const g = Math.random();
      const key = g < 0.38 ? 'tupan' : g < 0.68 ? 'valle' : g < 0.76 ? 'bakshish' : g < 0.82 ? 'shoqja'
        : g < 0.88 ? 'shok' : g < 0.92 ? 'dolli' : g < 0.97 ? 'nusja' : 'dhendri';
      this.gift(key, key === 'tupan' ? 1 + Math.floor(Math.random() * 5) : 1);
    }
  }

  gift(key, count = 1, userIndex = null) {
    const tier = config.gifts.find(g => g.key === key) || config.gifts[0];
    this.emit('gift', { ...this.user(userIndex), giftName: tier.gift, coins: tier.coins, repeatCount: count });
  }

  comment(text = null, userIndex = null) {
    this.emit('comment', { ...this.user(userIndex), comment: text || rand(COMMENTS) });
  }

  like(count = null) {
    this.emit('like', { ...this.user(), likeCount: count || 5 + Math.floor(Math.random() * 25) });
  }

  // Scripted ~55s sequence that shows every feature (great for demo videos)
  showcase() {
    this.stop();
    const g = (key, user, count = 1) => () => this.gift(key, count, user);
    const c = (text, user) => () => this.comment(text, user);
    const steps = [
      [300, () => this.join()], [900, () => this.join()], [1500, () => this.join()],
      [2200, g('valle', 8)], [3000, g('valle', 9)], [3800, g('valle', 10)], [4600, g('valle', 12)],
      [5400, g('valle', 14)], [6200, g('valle', 17)],
      [7200, g('tupan', 3, 5)],
      [8600, c('HOP 🕺', 8)], [9000, c('hopaaa', 10)], [9400, c('Opa opa!', 14)],
      [10500, g('bakshish', 4, 2)],
      [13500, g('shok', 20)],
      [16500, g('shoqja', 13)],
      [19500, g('nusja', 1)],
      [21500, () => this.share()], [22000, c('U trashëgofshin! ❤️', 9)],
      [23500, g('dhendri', 0)],
      [27000, g('valle', 18)], [27600, g('valle', 19)], [28200, g('valle', 23)], [28800, g('valle', 24)],
      [29400, () => this.follow()], [30000, c('HOP', 18)], [30300, c('hop hop', 19)],
      [31000, g('tupan', 3, 10)],
      [32500, g('bakshish', 4, 3)],
      [34500, g('shok', 5)],
      [37000, g('shoqja', 15)],
      [40000, g('nusja', 1, 3)],
      [44000, g('dolli', 12)],
      [53000, c('Gëzuar! 🔥', 23)], [53500, c('HOP', 18)],
    ];
    this.start(1.4, true); // ambient chat & likes (start() clears timers, so it goes first)
    this.showTimers = steps.map(([t, fn]) => setTimeout(fn, t));
    this.showTimers.push(setTimeout(() => this.stop(), 56000));
    return 56000;
  }

  join() { this.emit('join', this.user()); }
  share() { this.emit('share', this.user()); }
  follow() { this.emit('follow', this.user()); }
}

module.exports = Simulator;
