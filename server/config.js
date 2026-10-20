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
    { key: 'bakshish', gift: 'Confetti',    aliases: [],                       coins: 100, label: 'Bakshish',          icon: '🎉', role: 'money' },
    { key: 'dolli',    gift: 'Semsemia',    aliases: ['Sem Sem', 'Semsem'],    coins: 200, label: 'Dolli për çiftin',  icon: '🪕', role: 'toast' },
    { key: 'nusja',    gift: 'Pink Cowboy', aliases: ['Cowboy'],               coins: 450, label: 'Nusja',             icon: '🤠', role: 'bride' },
    { key: 'dhendri',  gift: 'Train',       aliases: [],                       coins: 899, label: 'Dhëndri',           icon: '🚂', role: 'groom' },
  ],

  // KRUSHQIT event (10 Oct): every 50K likes in the LIVE (TikTok's total, the number viewers see)
  // the groom's wedding procession arrives for ~20s, led by the flag bearer, with its own song.
  // The krushqit are the viewers who sent the most likes (with their profile pictures).
  krushqit: {
    likes: 50000,
    seconds: 20,
    song: '/sfx/krushqit.mp3',
    songStart: 1.5,      // skip the quiet intro
    bpm: 156.6,          // measured from the song, the dancers step on its beat
    firstBeat: 0.279,    // seconds into the song file
    maxPeople: 10,
  },

  // The cake meter was replaced by the KRUSHQIT likes meter
  cakeEnabled: false,

  // Likes a viewer needs to join the dance. On screen it says "1000 Like".
  // TikTok only delivers part of the taps (24%-85% in real lives, less when the LIVE is busy), so the
  // game scales each viewer's likes by the share it is receiving right now (see likeCoverage).
  // A bit under 1000 because heavy tappers lose more taps than average.
  likesToJoin: 800,

  // Gift legend: cards shown at once (it rotates pages so text stays readable on phones)
  legendPerPage: 3,
  legendPageSeconds: 5,
  // false = no gift list on screen, no gift hints in the ticker, no gift names on the empty stage spots
  // (TikTok restricted the LIVE for "inorganic gift solicitation"). Gifts keep working the same.
  showGiftMenu: false,

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
  qejfPerLike: 0.06,
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
    likesJoined: '{name} u fut në valle me 1000 like!',
    likesCard: '1000 Like',
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
    krushqitTitle: 'KRUSHQIT',
    krushqitGoal: '50K LIKES',
    krushqitComing: 'KRUSHQIT PO VIJNË!',
    krushqitWelcome: 'Mirë se erdhët, krushq!',
    krushqitHint: '50K Like = vijnë KRUSHQIT!',
    couple: 'U trashëgofshin! 💍',
    jumpHint: 'Shkruaj HOP në chat për të kërcyer!',
    kumbariHint: 'KUMBARI = më bujari, prin vallen 👑',
    giftHint: '{gift} = {label}',
  },
};
