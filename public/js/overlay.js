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
  fetch('/api/music').then(r => r.json()).then(list => Sfx.loadMusic(list)).then(updateNowPlaying).catch(() => {});
  Sfx.onTrack = updateNowPlaying;

  // ---------- legend ----------
  let legendKey = '';
  function renderLegend(gifts) {
    const key = JSON.stringify(gifts.map(g => [g.key, g.image, g.label]));
    if (key === legendKey) return;
    legendKey = key;
    $('legend').innerHTML = gifts.map(g => `
      <div class="gcard" data-key="${g.key}">
        <div class="gi">${g.image ? `<img src="${esc(g.image)}" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode('${g.icon}'))">` : g.icon}</div>
        <div class="gn">${esc(g.gift)} <b>${g.coins}<i class="coin"></i></b></div>
        <div class="gl">${esc(g.label)}</div>
      </div>`).join('');
  }
  function hitCard(key) {
    const el = document.querySelector(`.gcard[data-key="${key}"]`);
    if (!el) return;
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
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
        <div class="nm">${first ? `<small>${esc(texts.kumbari || 'KUMBARI')}</small>` : ''}${esc(u.name)}</div>
        <div class="cs">${u.coins.toLocaleString()} <i class="coin"></i></div>`;
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

    const c = $('cake'), cv = Math.min(100, Math.floor(s.cake.coins / s.cake.goal * 100));
    c.querySelector('.fill').style.height = cv + '%';
    c.querySelector('.pc').textContent = cv + '%';
    c.querySelector('.lvl').textContent = `Nr. ${s.cake.level} · ${s.cake.coins}/${s.cake.goal}`;
  }

  // ---------- ticker ----------
  const ticker = $('ticker');
  const tickerQueue = [];
  let tickerBusyUntil = 0, hintIndex = 0;
  function hints() {
    if (!state) return [];
    const g = state.config.gifts.map(x => ({ icon: x.icon, image: x.image, html: `${esc(x.gift)} = <span class="name">${esc(x.label)}</span>` }));
    return [...g, { icon: '👑', html: esc(texts.kumbariHint) }, { icon: '💬', html: esc(texts.jumpHint) }];
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

  // ---------- socket ----------
  const socket = io();
  socket.on('connect', () => socket.emit('hello', { role: params.get('sound') === '0' ? 'preview' : 'overlay' }));

  socket.on('state', s => {
    const hadDrummer = !!state?.drummer;
    state = s;
    texts = s.config.texts;
    $('titleText').textContent = texts.title;
    $('boardTitle').textContent = texts.leaderboardTitle;
    $('qejfTitle').textContent = texts.qejf;
    $('cakeTitle').textContent = texts.cake;
    renderLegend(s.config.gifts);
    renderBoard(s.leaderboard);
    renderMeters(s);
    Scene.sync(s);
    if (s.drummer) Sfx.drum(s.drummer.until - s.now + Date.now(), s.qejf.party);
    else if (hadDrummer) Sfx.drum(0);
    Sfx.setFast(s.qejf.party);
    updateNowPlaying();
  });

  socket.on('settings', st => {
    if (params.get('vol') == null) Sfx.setVolume(st.volume);
    Sfx.setMusic(st.music);
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
          pushTicker({ avatar: u.avatar, html: fmtText(texts.joinedDance, { name: nameSpan(u.name) }) });
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
