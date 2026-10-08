// =============================================================
// config.js — game rules & on-screen texts (Albanian)
// Change gift names / coins / texts here.
// =============================================================

module.exports = {
  // Gift → role mapping. `gift` is matched against the TikTok gift name.
  // Unknown gifts fall back to the highest tier whose `coins` <= gift value.
  gifts: [
    { key: 'tupan',    gift: 'Rose',                coins: 1,    label: 'Tupan',            icon: '🌹', role: 'drummer' },
    { key: 'valle',    gift: 'Friendship Necklace', coins: 10,   label: 'Hyr në valle',     icon: '📿', role: 'dancer' },
    { key: 'shok',     gift: 'Hat and Mustache',    coins: 99,   label: 'Shok i dhëndrrit', icon: '🥸', role: 'bestman' },
    { key: 'bakshish', gift: 'Hand Heart',          coins: 100,  label: 'Bakshish',         icon: '🫶', role: 'money' },
    { key: 'nusja',    gift: 'Money Gun',           coins: 500,  label: 'Nusja',            icon: '💸', role: 'bride' },
    { key: 'dhendri',  gift: 'Galaxy',              coins: 1000, label: 'Dhëndri',          icon: '🌌', role: 'groom' },
  ],

  // Any gift worth at least this many coins also puts the sender in the dance
  joinDanceMinCoins: 10,
  maxDancers: 16,
  maxBestMen: 2,

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
    title: 'DASMA SHQIPTARE',
    welcome: 'Mirë se erdhe në dasmë, {name}!',
    share: '{name} ftoi miqtë në dasmë!',
    follow: '{name} u bë mik i dasmës!',
    joinedDance: '{name} hyri në valle!',
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
    newBestman: 'SHOK I DHËNDRRIT!',
    newDrummer: 'TUPANXHIU!',
    couple: 'U trashëgofshin! 💍',
    jumpHint: 'Shkruaj HOP në chat për të kërcyer!',
    kumbariHint: 'KUMBARI = më bujari, prin vallen 👑',
    giftHint: '{gift} = {label}',
  },
};
