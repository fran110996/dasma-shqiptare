// =============================================================
// overlay.js — glue: socket events → DOM UI + Scene + Sfx
// =============================================================

(() => {
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const params = new URLSearchParams(location.search);
  const isOBS = !!window.obsstudio;
  let state = null;
  let texts = {};

  // ---------- fit 1080x1920 into any window ----------
  function fit() {
    // CSS zoom instead of transform: scale. Zoom lays text out on whole pixels, while a scaled
    // layer leaves it on half pixels and it visibly jumps 1px whenever the canvas repaints.
    const k = Math.min(innerWidth / 1080, innerHeight / 1920);
    stage.style.zoom = k;
    stage.style.left = `${(innerWidth - 1080 * k) / 2 / k}px`;
    stage.style.top = `${(innerHeight - 1920 * k) / 2 / k}px`;
  }
  addEventListener('resize', fit); fit();

  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmtText = (tpl, vars) => esc(tpl).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const nameSpan = n => `<span class="name">${esc(n)}</span>`;
  const imgTag = (src, cls = '') => src ? `<img class="${cls}" src="${esc(src)}" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'">` : '';

  // ---------- sound ----------
  const soundBtn = $('sound');
  Sfx.setVolume(Number(params.get('vol') ?? 0.7));
  function tryUnlock() { if (Sfx.unlock()) soundBtn.style.display = 'none'; }
  soundBtn.onclick = tryUnlock;
  addEventListener('pointerdown', tryUnlock);
  setTimeout(() => {
    tryUnlock();
    setTimeout(() => { if (!Sfx.isRunning() && !isOBS && params.get('sound') !== '0') soundBtn.style.display = 'block'; }, 400);
  }, 300);

  // ---------- music ----------
  const np = $('np'), npText = $('npText');
  function updateNowPlaying() {
    const drum = state?.drummer;
    const tr = Sfx.currentTrack();
    if (drum) { npText.textContent = '🥁 ' + (texts.drummer || '{name}').replace('{name}', drum.name); np.classList.add('on'); }
    else if (tr) { npText.textContent = tr.title; np.classList.add('on'); }
    else np.classList.remove('on');
  }
  // the panel's preview (?sound=0) stays silent: no music at all
  const muted = params.get('sound') === '0';
  if (muted) Sfx.setMusic(false);
  fetch('/api/music').then(r => r.json()).then(list => Sfx.loadMusic(list)).then(onTrackChange).catch(() => {});
  Sfx.onTrack = onTrackChange;
  // the real overlay (not the panel's muted preview) tells the panel what's playing
  function onTrackChange() {
    updateNowPlaying();
    if (params.get('sound') === '0') return;
    const tr = Sfx.currentTrack();
    socket.emit('music:now', tr ? { title: tr.title, url: tr.url, paused: Sfx.isPaused() } : null);
  }

  // ---------- legend ----------
  // Gift legend: shows a few big cards at a time and rotates pages
  let legendKey = '', legendCards = [], legendPage = 0, legendTimer = null, perPage = 3, pageMs = 5000;
  function cardHtml(g) {
    const icon = g.image ? `<img src="${esc(g.image)}" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${g.icon}'))">` : g.icon;
    // no coin prices on screen: TikTok flags price lists as gift solicitation
    return `<div class="gcard" data-key="${g.key}"><div class="gi">${icon}</div>
      <div class="gt"><div class="gl">${esc(g.label)}</div><div class="gn">${esc(g.gift)}</div></div></div>`;
  }
  function paintLikes() {}
  function showLegendPage(page, animate = true) {
    const pages = Math.max(1, Math.ceil(legendCards.length / perPage));
    legendPage = ((page % pages) + pages) % pages;
    const html = legendCards.slice(legendPage * perPage, legendPage * perPage + perPage).map(cardHtml).join('');
    const el = $('legend');
    if (!animate) { el.innerHTML = html; paintLikes(); return; }
    el.classList.add('fade');
    setTimeout(() => { el.innerHTML = html; paintLikes(); el.classList.remove('fade'); }, 350);
  }
  function startLegendTimer() {
    clearInterval(legendTimer);
    legendTimer = setInterval(() => showLegendPage(legendPage + 1), pageMs);
  }
  function renderLegend(cfg) {
    $('legend').hidden = !cfg.showGiftMenu;
    if (!cfg.showGiftMenu) { clearInterval(legendTimer); legendCards = []; legendKey = ''; return; }
    const cards = [...cfg.gifts];
    if (cfg.likesToJoin) {
      const dance = cfg.gifts.find(g => g.role === 'dancer');
      cards.splice(2, 0, { key: 'likes', icon: '❤️', gift: cfg.texts.likesCard || `${cfg.likesToJoin} Like`, coins: null, label: dance ? dance.label : 'Valle' });
    }
    const key = JSON.stringify(cards.map(g => [g.key, g.image, g.label, g.gift]));
    perPage = cfg.legendPerPage || 3;
    pageMs = (cfg.legendPageSeconds || 5) * 1000;
    if (key === legendKey) return;
    legendKey = key;
    legendCards = cards;
    showLegendPage(legendPage, false);
    startLegendTimer();
  }
  // a gift arrived: jump to the page that shows it and flash the card
  function hitCard(key) {
    const i = legendCards.findIndex(g => g.key === key);
    if (i < 0) return;
    const page = Math.floor(i / perPage);
    const flash = () => {
      const el = document.querySelector(`.gcard[data-key="${key}"]`);
      if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
    };
    if (page !== legendPage) { showLegendPage(page); setTimeout(flash, 380); } else flash();
    startLegendTimer();
  }

  // ---------- leaderboard ----------
  const rowsEl = $('rows');
  const rowEls = new Map();
  const prevCoins = new Map();
  function renderBoard(list) {
    if (!list.length) {
      rowsEl.innerHTML = `<div class="empty">🎁 Dërgo një dhuratë<br>për t'u bërë KUMBAR!</div>`;
      rowEls.clear();
      return;
    }
    rowsEl.querySelector('.empty')?.remove();
    const seen = new Set();
    let top = 0;
    list.forEach((u, i) => {
      seen.add(u.id);
      let el = rowEls.get(u.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'row';
        el.style.top = (i * 50 + 60) + 'px';
        rowsEl.appendChild(el);
        rowEls.set(u.id, el);
      }
      const first = i === 0;
      el.classList.toggle('first', first);
      el.innerHTML = `
        <div class="rk">${first ? '👑' : i + 1}</div>
        ${u.avatar ? imgTag(u.avatar) : `<div class="ph"></div>`}
        <div class="nm">${first ? `<small>${esc(texts.kumbari || 'KUMBARI')}</small>` : ''}${esc(u.name)}</div>`;
      el.style.top = top + 'px';
      top += first ? 62 : 49;
      if (prevCoins.has(u.id) && prevCoins.get(u.id) !== u.coins) {
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      }
      prevCoins.set(u.id, u.coins);
    });
    for (const [id, el] of rowEls) if (!seen.has(id)) { el.remove(); rowEls.delete(id); }
  }

  // ---------- meters ----------
  function renderMeters(s) {
    const q = $('qejf'), qv = Math.round(s.qejf.value);
    q.querySelector('.fill').style.height = qv + '%';
    q.querySelector('.pc').textContent = qv + '%';
    q.querySelector('.st').textContent = s.qejf.party ? (texts.party || '') : s.qejf.label;
    q.classList.toggle('party', s.qejf.party);

    if (s.krushqit) {
      const k = $('krushqit'), kp = Math.min(100, Math.floor(s.krushqit.value / s.krushqit.goal * 100));
      const fmtK = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(n);
      k.querySelector('.fill').style.height = kp + '%';
      k.querySelector('.pc').textContent = kp + '%';
      k.querySelector('.lvl').textContent = `${fmtK(s.krushqit.value)} / ${fmtK(s.krushqit.goal)}`;
      k.classList.toggle('on', Date.now() < s.krushqit.until - s.now + Date.now() && s.krushqit.until > s.now);
    }
  }

  // ---------- ticker ----------
  const ticker = $('ticker');
  const tickerQueue = [];
  let tickerBusyUntil = 0, hintIndex = 0;
  function hints() {
    if (!state) return [];
    const menu = state.config.showGiftMenu;
    const g = menu ? state.config.gifts.map(x => ({ icon: x.icon, image: x.image, html: `${esc(x.gift)} = <span class="name">${esc(x.label)}</span>` })) : [];
    if (texts.krushqitHint) g.push({ icon: '🎺', html: `<span class="name">${esc(texts.krushqitHint)}</span>` });
    if (state.config.likesToJoin) {
      const dance = state.config.gifts.find(x => x.role === 'dancer');
      g.splice(menu ? 2 : 0, 0, { icon: '❤️', html: `${esc(texts.likesCard)} = <span class="name">${esc(dance ? dance.label : '')}</span>` });
    }
    return [...g, ...(menu ? [{ icon: '👑', html: esc(texts.kumbariHint) }] : []), { icon: '💬', html: esc(texts.jumpHint) }];
  }
  function showTicker(item) {
    const icon = item.avatar ? imgTag(item.avatar, 'av') : item.image ? imgTag(item.image, 'av emoji') : `<span class="av emoji">${item.icon || '💍'}</span>`;
    ticker.innerHTML = `${icon}<span class="txt">${item.html}</span>`;
    ticker.classList.remove('swap'); void ticker.offsetWidth; ticker.classList.add('swap');
  }
  function pushTicker(item) {
    tickerQueue.push(item);
    // keep it snappy during join floods
    while (tickerQueue.length > 3) tickerQueue.splice(tickerQueue.findIndex(x => x.low) >= 0 ? tickerQueue.findIndex(x => x.low) : 0, 1);
  }
  setInterval(() => {
    const now = Date.now();
    if (now < tickerBusyUntil) return;
    const next = tickerQueue.shift();
    if (next) { showTicker(next); tickerBusyUntil = now + (next.low ? 1800 : 2600); return; }
    const h = hints();
    if (h.length) { showTicker(h[hintIndex++ % h.length]); tickerBusyUntil = now + 3200; }
  }, 200);

  // ---------- feed (small pills) ----------
  const feed = $('feed');
  function pushFeed(user, html) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.innerHTML = `${user?.avatar ? imgTag(user.avatar) : ''}<span>${html}</span>`;
    feed.prepend(el);
    while (feed.children.length > 2) feed.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3800);
  }

  // ---------- big alerts ----------
  const alertEl = $('alert');
  const alertQueue = [];
  let alertBusy = false;
  function queueAlert(a) {
    // replace a pending alert for the same role so floods don't pile up
    const i = alertQueue.findIndex(x => x.role && x.role === a.role);
    if (i >= 0) alertQueue[i] = a; else alertQueue.push(a);
    if (alertQueue.length > 4) alertQueue.shift();
    nextAlert();
  }
  function nextAlert() {
    if (alertBusy || !alertQueue.length) return;
    alertBusy = true;
    const a = alertQueue.shift();
    alertEl.innerHTML = `
      <div class="rays"></div>
      ${a.user?.avatar ? `<img class="big-av" src="${esc(a.user.avatar)}" referrerpolicy="no-referrer">` : `<div class="big-av">${a.icon || '🎉'}</div>`}
      <div class="big-title">${esc(a.title)}</div>
      ${a.user ? `<div class="big-name">${esc(a.user.name)}</div>` : ''}
      ${a.sub ? `<div class="big-sub">${esc(a.sub)}</div>` : ''}`;
    alertEl.className = 'show';
    a.onShow && a.onShow();
    setTimeout(() => {
      alertEl.className = 'hide';
      setTimeout(() => { alertEl.className = ''; alertBusy = false; nextAlert(); }, 450);
    }, a.duration || 2600);
  }

  // ---------- KRUSHQIT event ----------
  let krushqitRunning = false;
  function startKrushqit(ev, elapsed, announce) {
    krushqitRunning = true;
    const seconds = ev.seconds || 20;
    const cfg = state?.config || {};
    Scene.krushqit(ev.people || [], seconds, elapsed, { bpm: ev.bpm, firstBeat: ev.firstBeat, songStart: ev.songStart });
    if (!muted && (ev.song || cfg.krushqit)) {
      const song = ev.song || '/sfx/krushqit.mp3';
      Sfx.playEvent(song, (ev.songStart ?? 1.5) + elapsed, seconds - elapsed);
    }
    if (announce) {
      // shown right away (not queued): it has to match the music and the procession
      alertQueue.unshift({ title: ev.title, sub: ev.sub, icon: '🎺', duration: 2800,
        onShow() { Scene.confetti(160); Scene.hearts(561, 860, 16, 80); } });
      nextAlert();
    }
    setTimeout(() => { krushqitRunning = false; }, (seconds - elapsed) * 1000);
  }

  // ---------- socket ----------
  const socket = io();
  const OVERLAY_VERSION = '2026-10-20b'; // keep in sync with CLIENT_VERSION in server/index.js
  socket.on('connect', () => socket.emit('hello', { role: params.get('sound') === '0' ? 'preview' : 'overlay', v: OVERLAY_VERSION }));

  // self-heal: if the connection to the server stays down, force a reconnect and then reload the page,
  // so the game never stays frozen in LIVE Studio without anyone noticing
  let downSince = 0;
  setInterval(() => {
    if (socket.connected) { downSince = 0; return; }
    if (!downSince) { downSince = Date.now(); return; }
    const down = Date.now() - downSince;
    if (down > 8000 && !socket.active) socket.connect();
    // only reload when the server answers, otherwise LIVE Studio would be left on an error page
    if (down > 25000) fetch('/overlay', { method: 'HEAD', cache: 'no-store' }).then(r => { if (r.ok) location.reload(); }).catch(() => {});
  }, 3000);
  // the page was paused (e.g. LIVE Studio in the background): check the connection as soon as it comes back
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !socket.connected) socket.connect(); });

  socket.on('state', s => {
    const hadDrummer = !!state?.drummer;
    state = s;
    texts = s.config.texts;
    $('titleText').textContent = texts.title;
    $('boardTitle').textContent = texts.leaderboardTitle;
    $('qejfTitle').textContent = texts.qejf;
    if (texts.krushqitTitle) $('kTitle').textContent = texts.krushqitTitle;
    if (texts.krushqitGoal) $('kGoal').textContent = texts.krushqitGoal;
    // overlay (re)loaded in the middle of a krushqit event: join it where it is
    if (s.krushqit && s.krushqit.until > s.now + 1500 && !krushqitRunning) {
      const left = (s.krushqit.until - s.now) / 1000;
      startKrushqit({ people: s.krushqit.people, seconds: s.krushqit.seconds }, s.krushqit.seconds - left, false);
    }
    renderLegend(s.config);

    renderBoard(s.leaderboard);
    renderMeters(s);
    Scene.sync(s);
    if (s.drummer) Sfx.drum(s.drummer.until - s.now + Date.now(), s.qejf.party);
    else if (hadDrummer) Sfx.drum(0);
    Sfx.setFast(s.qejf.party);
    updateNowPlaying();
  });

  socket.on('music', m => {
    if (params.get('sound') === '0') return; // the panel's muted preview doesn't play music
    try {
      if (m.cmd === 'next') Sfx.nextTrack();
      else if (m.cmd === 'prev') Sfx.prevTrack();
      else if (m.cmd === 'toggle') Sfx.togglePause();
      else if (m.cmd === 'play' && m.url) Sfx.playUrl(m.url);
      // report back after the browser had a moment to start playing
      setTimeout(() => socket.emit('music:ack', { cmd: m.cmd, playing: !Sfx.isPaused(), title: Sfx.currentTrack()?.title,
        audio: Sfx.isRunning() ? 'unlocked' : 'locked' }), 700);
    } catch (err) {
      socket.emit('music:ack', { cmd: m.cmd, error: err.message });
    }
  });
  if (!muted) Sfx.onError = msg => socket.emit('music:ack', { cmd: 'play', error: msg });

  socket.on('settings', st => {
    if (params.get('vol') == null) Sfx.setVolume(st.volume);
    if (!muted) Sfx.setMusic(st.music);
    updateNowPlaying();
  });

  socket.on('fx', ev => {
    const u = ev.user;
    switch (ev.type) {
      case 'join':
        pushTicker({ avatar: u.avatar, icon: '👋', html: fmtText(texts.welcome, { name: nameSpan(u.name) }), low: true });
        break;
      case 'share':
        pushFeed(u, fmtText(texts.share, { name: `<b>${esc(u.name)}</b>` }));
        Sfx.join();
        break;
      case 'follow':
        pushFeed(u, fmtText(texts.follow, { name: `<b>${esc(u.name)}</b>` }));
        Sfx.join();
        break;
      case 'like':
        Scene.likes(Math.ceil(ev.count / 5));
        break;
      case 'chat':
        Scene.chat(ev.userId, ev.text, ev.jump);
        break;
      case 'gift':
        hitCard(ev.tier);
        break;
      case 'drum':
        if (ev.changed) pushFeed(u, `🥁 ${fmtText(texts.drummer, { name: `<b>${esc(u.name)}</b>` })}`);
        break;
      case 'dancer':
        if (ev.added) {
          pushTicker({ avatar: u.avatar, html: fmtText(ev.viaLikes ? texts.likesJoined : texts.joinedDance, { name: nameSpan(u.name) }) });
          if (ev.viaLikes) { hitCard('likes'); Scene.hearts(560, 900, 14, 120); }
          Sfx.pop();
        } else Scene.sparkleUser(u.id);
        break;
      case 'money':
        pushTicker({ avatar: u.avatar, html: `💸 ${fmtText(texts.bakshish, { name: nameSpan(u.name) })}` });
        Scene.money(Math.min(160, 40 * ev.amount), u);
        Sfx.cash(); setTimeout(Sfx.cash, 350);
        break;
      case 'role':
        if (ev.again) { Scene.sparkleUser(u.id); Scene.money(30, u); Sfx.cash(); break; }
        queueAlert({
          role: ev.role, user: u, title: ev.title,
          sub: ev.role === 'bride' || ev.role === 'groom' ? (ev.couple ? texts.couple : '') : '',
          onShow() {
            Sfx.whoosh(); Sfx.fanfare();
            Scene.sparkleUser(u.id);
            if (ev.role === 'bride' || ev.role === 'groom') { Scene.confetti(120); Scene.money(30); if (ev.couple) { Sfx.chime(); Scene.hearts(561, 860, 18, 60); } }
            else Scene.confetti(40);
          },
        });
        break;
      case 'krushqit':
        startKrushqit(ev, 0, true);
        break;
      case 'toast':
        queueAlert({
          title: ev.title, user: u, sub: ev.sub, duration: 2600,
          onShow() { Sfx.chime(); Sfx.applause(2.2); Scene.toast(ev.seconds, ev.cheers); Scene.confetti(70); },
        });
        break;
      case 'cake':
        queueAlert({
          title: ev.title, icon: '🎂', sub: `🎂 Nr. ${ev.level}`, duration: 3400,
          onShow() { Sfx.fanfare(); Sfx.applause(2.8); Scene.fireworks(8); Scene.confetti(160); Scene.money(80); },
        });
        break;
      case 'party':
        queueAlert({
          title: texts.party, icon: '🔥', duration: 2600,
          onShow() { Sfx.fanfare(); Sfx.applause(2); Scene.confetti(140); Scene.fireworks(4); },
        });
        break;
      case 'reset':
        Scene.clearPile();
        rowsEl.innerHTML = ''; rowEls.clear(); prevCoins.clear();
        break;
    }
  });

  document.fonts.ready.then(() => Scene.init());
})();
