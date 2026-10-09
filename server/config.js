// =============================================================
// config.js — game rules & on-screen texts (Albanian)
// Change gift names / coins / texts here.
// =============================================================

module.exports = {
  // Gift → role mapping (client's list, 08 Oct).
  // A gift matches a tier by name (`gift` or any `aliases`), then by exact coin
  // value (±1), and otherwise falls back to the highest tier whose coins <= value.
  // Check the server logs during a LIVE: every gift is printed with its real name and coins.
  gifts: [
    { key: 'tupan',    gift: 'Rose',        aliases: ['Flower'],               coins: 1,   label: 'Tupan',             icon: '🌹', role: 'drummer' },
    { key: 'valle',    gift: 'Rosa',        aliases: [],                       coins: 10,  label: 'Futesh në valle',   icon: '💐', role: 'dancer' },
    { key: 'shoqja',   gift: 'Paper Crane', aliases: [],                       coins: 99,  label: 'Shoqja e nuses',    icon: '🕊️', role: 'bridesmaid' },
    { key: 'bakshish', gift: 'Confetti',    aliases: [],                       coins: 100, label: 'Bakshish',          icon: '🎉', role: 'money' },
    { key: 'shok',     gift: 'Hearts',      aliases: [],                       coins: 199, label: 'Shoku i dhëndrrit', icon: '💕', role: 'bestman' },
    { key: 'dolli',    gift: 'Semsemia',    aliases: ['Sem Sem', 'Semsem'],    coins: 200, label: 'Dolli për çiftin',  icon: '🪕', role: 'toast' },
    { key: 'nusja',    gift: 'Pink Cowboy', aliases: ['Cowboy'],               coins: 450, label: 'Nusja',             icon: '🤠', role: 'bride' },
    { key: 'dhendri',  gift: 'Train',       aliases: [],                       coins: 899, label: 'Dhëndri',           icon: '🚂', role: 'groom' },
  ],

  // Every N likes in the whole LIVE, the viewer who liked most since the last goal joins the dance.
  // (TikTok only sends a sample of each viewer's likes, so per-viewer counting can't reach 1000.)
  likesToJoin: 1000,

  // Gift legend: cards shown at once (it rotates pages so text stays readable on phones)
  legendPerPage: 3,
  legendPageSeconds: 5,

  // Any gift worth at least this many coins also puts the sender in the dance
  joinDanceMinCoins: 10,
  maxDancers: 16,
  maxBestMen: 2,
  maxBridesmaids: 2,

  // Toast (everyone raises a glass) duration
  toastSeconds: 8,

  // Each Rose keeps the drum playing this many seconds (stacking, capped)
  drumSecondsPerRose: 4,
  drumMaxSeconds: 60,

  // Cake meter (coins). Goal grows each level.
  cakeGoal: 3000,
  cakeGoalGrowth: 1.5,

  // "Qejfi" party meter (0-100)
  qejfPerLike: 0.12,
  qejfPerCoin: 0.035,
  qejfPerChat: 0.4,
  qejfDecayPerSec: 0.35,
  partySeconds: 20,

  // Chat words that make your character jump
  jumpWords: ['hop', 'hopa', 'opa', 'valle', 'ooo', '🔥', '💃', '🕺'],

  texts: {
    title: 'AHENGU SHQIPTARE',
    welcome: 'Mirë se erdhe në dasmë, {name}!',
    share: '{name} ftoi miqtë në dasmë!',
    follow: '{name} u bë mik i dasmës!',
    joinedDance: '{name} u fut në valle!',
    likesJoined: '{name} u fut në valle! ❤️ 1000 like',
    likesCard: 'Çdo 1000 like',
    bakshish: '{name} hodhi bakshish!',
    drummer: '{name} i bie tupanit!',
    leaderboardTitle: 'BUJARËT E DASMËS',
    kumbari: 'KUMBARI',
    qejf: 'QEJFI',
    qejfLevels: ['Dasma po fillon', 'Po ngrohet atmosfera', 'Qejf i madh!', 'Dasma u ndez! 🔥'],
    cake: 'TORTA',
    cakeDone: 'TORTA U PRE!',
    party: 'QEJF I MADH!',
    newBride: 'NUSJA E RE!',
    newGroom: 'DHËNDRI I RI!',
    newBestman: 'SHOKU I DHËNDRRIT!',
    newBridesmaid: 'SHOQJA E NUSES!',
    toast: 'DOLLI PËR ÇIFTIN!',
    toastSub: 'Gëzuar! 🥂',
    cheers: 'Gëzuar! 🥂',
    newDrummer: 'TUPANXHIU!',
    couple: 'U trashëgofshin! 💍',
    jumpHint: 'Shkruaj HOP në chat për të kërcyer!',
    kumbariHint: 'KUMBARI = më bujari, prin vallen 👑',
    giftHint: '{gift} = {label}',
  },
};
