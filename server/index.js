// =============================================================
// index.js — Dasma Shqiptare server
//   GET  /              → Control panel
//   GET  /overlay       → OBS Browser Source (1080x1920)
//   POST /api/connect   → Connect to TikTok LIVE { username, sessionId }
//   POST /api/disconnect
//   POST /api/sim/start → Auto demo { speed }
//   POST /api/sim/stop
//   POST /api/test      → Fire a test event { type, key, count, text }
//   POST /api/reset     → Reset the wedding
// =============================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const TikTokConnector = require('./tiktokConnector');
const Simulator = require('./simulator');
const WeddingEngine = require('./weddingEngine');

const app = express();
const server = http.createServer(app);
// long ping timeout: LIVE Studio can pause the page for a few seconds and that must not drop it
// compressed messages: the game state is sent several times per second and Render bills bandwidth
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 20000, pingTimeout: 60000, perMessageDeflate: { threshold: 512 } });

app.use(express.json());

// Optional password for the control panel actions (set ADMIN_PASSWORD on Render).
// The overlay itself stays public so OBS can load it.
app.use('/api', (req, res, next) => {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass || req.method === 'GET') return next();
  if (req.get('x-admin-key') === pass) return next();
  res.status(401).json({ error: 'Wrong password', auth: true });
});
// Overlay code must never be cached (LIVE Studio / OBS would keep running an old version)
const noCache = res => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, file) => {
    if (/\.(html|js|css)$/.test(file)) noCache(res);
    // songs never change: let LIVE Studio keep them instead of downloading them again every loop
    else if (/\.mp3$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=2592000');
  },
}));

// Bump together with OVERLAY_VERSION in public/js/overlay.js to spot overlays running old code
const CLIENT_VERSION = '2026-10-11a';

const tiktok = new TikTokConnector();
const sim = new Simulator();
const game = new WeddingEngine(io);

const settings = { volume: 0.7, music: true };

// -------------------------------------------------------
// Wire events → game (real and simulated share the same handlers)
// -------------------------------------------------------
for (const source of [tiktok, sim]) {
  source.on('comment', d => game.onComment(d));
  source.on('gift', d => game.onGift(d));
  source.on('join', d => game.onJoin(d));
  source.on('like', d => game.onLike(d));
  source.on('share', d => game.onShare(d));
  source.on('follow', d => game.onFollow(d));
}
tiktok.on('gifts:catalog', gifts => game.onGiftCatalog(gifts));

// One-line activity summary per minute while LIVE, to confirm events are flowing
const minute = { joins: 0, likes: 0, comments: 0, gifts: 0 };
let lastLiveTotal = 0;
tiktok.on('join', () => minute.joins++);
tiktok.on('like', d => { minute.likes += d.likeCount || 1; });
tiktok.on('comment', () => minute.comments++);
tiktok.on('gift', d => { minute.gifts += d.repeatCount || 1; });
setInterval(() => {
  if (!tiktok.isConnected) return;
  const top = game.topLikers(3).map(t => `${t.name} ${t.likes}`).join(', ');
  // TikTok's own like total (what viewers see) vs what reached the game this minute
  const liveDelta = lastLiveTotal ? game.liveLikes - lastLiveTotal : 0;
  lastLiveTotal = game.liveLikes;
  const coverage = liveDelta > 0 ? ` (TikTok total +${liveDelta}, ${Math.round(minute.likes / liveDelta * 100)}% counted)` : '';
  game.log(`📊 Last minute: ${minute.joins} joins · ${minute.likes} likes${coverage} · ${minute.comments} comments · ${minute.gifts} gifts${top ? ` | top likers: ${top}` : ''}`);
  Object.keys(minute).forEach(k => { minute[k] = 0; });
}, 60000);

function status() {
  return {
    connected: tiktok.isConnected,
    username: tiktok.creatorUsername,
    simulating: sim.running,
    overlays,
    simSpeed: sim.speed,
  };
}
const pushStatus = () => io.emit('status', status());

// -------------------------------------------------------
// Auto-reconnect: if TikTok drops the connection (and the streamer didn't
// press Disconnect), retry every 20s for ~5 minutes.
// -------------------------------------------------------
const RECONNECT_MS = Number(process.env.RECONNECT_MS) || 20000;
const RECONNECT_TRIES = 15;
let reconnect = null;      // { username, sessionId, attempts, timer }
let liveConnected = false; // true while we hold a working TikTok connection
let lastSessionId = null;
const lastLive = { username: null, activity: 0 }; // to tell a re-Connect from a new LIVE
for (const ev of ['like', 'gift', 'comment', 'join']) tiktok.on(ev, () => { lastLive.activity = Date.now(); });

function stopReconnect() {
  if (reconnect) clearTimeout(reconnect.timer);
  reconnect = null;
}
function scheduleReconnect() {
  if (!reconnect) return;
  if (reconnect.attempts >= RECONNECT_TRIES) {
    game.log(`⚠️ Auto-reconnect gave up after ${RECONNECT_TRIES} tries`);
    io.emit('panel:error', 'Could not reconnect to the TikTok LIVE. If you are still LIVE, click Connect again.');
    stopReconnect();
    return;
  }
  reconnect.timer = setTimeout(async () => {
    if (!reconnect || liveConnected) return;
    reconnect.attempts++;
    game.log(`🔄 Reconnecting to @${reconnect.username} (try ${reconnect.attempts}/${RECONNECT_TRIES})…`);
    try {
      await tiktok.connect(reconnect.username, reconnect.sessionId);
    } catch (err) {
      game.log(`❌ Reconnect failed: ${err.message}`);
      scheduleReconnect();
    }
  }, RECONNECT_MS);
}

tiktok.on('connected', () => {
  liveConnected = true;
  // a NEW live starts its like counters from zero; an auto-reconnect keeps them
  if (reconnect) {
    game.log(`✅ Reconnected to @${tiktok.creatorUsername}`);
    io.emit('panel:error', '');
    stopReconnect();
    pushStatus();
    return;
  }
  // pressing Connect again during the same LIVE keeps the like counters;
  // a different account or 30+ minutes without activity counts as a new LIVE
  const sameLive = lastLive.username === tiktok.creatorUsername && Date.now() - lastLive.activity < 30 * 60 * 1000;
  if (!sameLive) game.resetLikeGoal();
  lastLive.username = tiktok.creatorUsername;
  lastLive.activity = Date.now();
  pushStatus();
  game.log(`✅ Connected to @${tiktok.creatorUsername}${sameLive ? ' (same LIVE, like counters kept)' : ''}`);
});
tiktok.on('disconnected', ({ intentional } = {}) => {
  pushStatus();
  if (intentional || !liveConnected) return;
  liveConnected = false;
  game.log('⚠️ TikTok LIVE connection lost');
  if (reconnect) return; // already retrying
  io.emit('panel:error', 'The TikTok LIVE connection was lost. Reconnecting automatically…');
  reconnect = { username: tiktok.creatorUsername, sessionId: lastSessionId, attempts: 0, timer: null };
  scheduleReconnect();
});
tiktok.on('error', err => game.log(`❌ ${err?.message || err}`));

// -------------------------------------------------------
// REST API
// -------------------------------------------------------
app.post('/api/connect', async (req, res) => {
  const { username, sessionId } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  game.log(`🔌 Connecting to @${username.replace(/^@/, '')}…`);
  stopReconnect();
  liveConnected = false;
  lastSessionId = sessionId || process.env.SESSION_ID || null;
  try {
    await tiktok.connect(username, sessionId || process.env.SESSION_ID || null);
    pushStatus();
    res.json({ ok: true });
  } catch (err) {
    game.log(`❌ Connection to @${username} failed: ${err.message}`);
    pushStatus();
    res.status(500).json({ error: err.message || 'Connection failed' });
  }
});

app.post('/api/disconnect', async (req, res) => {
  stopReconnect();
  liveConnected = false;
  await tiktok.disconnect();
  game.log('🔌 Disconnected by the streamer');
  pushStatus();
  res.json({ ok: true });
});

app.post('/api/sim/start', (req, res) => {
  sim.start(Number(req.body?.speed) || 1);
  game.log(`🎭 Auto demo started (speed ${sim.speed})`);
  pushStatus();
  res.json({ ok: true });
});

app.post('/api/sim/stop', (req, res) => {
  sim.stop();
  game.log('🎭 Simulation stopped');
  pushStatus();
  res.json({ ok: true });
});

app.post('/api/sim/showcase', (req, res) => {
  game.reset();
  const ms = sim.showcase();
  game.log(`🎬 Showcase started (${ms / 1000}s)`);
  pushStatus();
  setTimeout(pushStatus, ms + 100);
  res.json({ ok: true, ms });
});

app.post('/api/test', (req, res) => {
  const { type, key, count, text } = req.body || {};
  switch (type) {
    case 'gift': sim.gift(key, Number(count) || 1); break;
    case 'comment': sim.comment(text); break;
    case 'like': sim.like(Number(count) || 50); break;
    case 'like1k': sim.like(require('./config').likesToJoin); break;
    case 'krushqit': game.triggerKrushqit('test'); break;
    case 'join': sim.join(); break;
    case 'share': sim.share(); break;
    case 'follow': sim.follow(); break;
    default: return res.status(400).json({ error: 'unknown type' });
  }
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  game.reset();
  game.log('♻ Wedding reset');
  res.json({ ok: true });
});

app.get('/api/state', (req, res) => res.json(game.snapshot()));

app.post('/api/settings', (req, res) => {
  const { volume, music } = req.body || {};
  if (typeof volume === 'number') settings.volume = Math.max(0, Math.min(1, volume));
  if (typeof music === 'boolean') settings.music = music;
  io.emit('settings', settings);
  res.json({ ok: true, settings });
});

// Background music: drop .mp3/.ogg files into public/music
app.get('/api/music', (req, res) => {
  const dir = path.join(__dirname, '../public/music');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /\.(mp3|ogg|m4a|wav)$/i.test(f)); } catch (_) {}
  res.json(files.map(f => ({ url: `/music/${encodeURIComponent(f)}`, title: f.replace(/\.[^.]+$/, '') })));
});

// Music remote control: the panel sends commands, the overlay plays and reports back
let musicNow = null;
app.post('/api/music/cmd', (req, res) => {
  const { cmd, url } = req.body || {};
  if (!['next', 'prev', 'toggle', 'play'].includes(cmd)) return res.status(400).json({ error: 'unknown cmd' });
  const command = { cmd, url, t: Date.now() };
  game.log(`🎵 Panel: ${cmd}${url ? ' ' + decodeURIComponent(url.split('/').pop()) : ''}`);
  if (!overlays) {
    pendingMusic = command; // applied as soon as an overlay (re)connects
    game.log('⚠️ No overlay open: the music command will be applied when it reconnects');
  } else {
    io.emit('music', command);
    setTimeout(() => { if (musicNowAt < command.t) game.log('⚠️ No overlay reacted to the music command'); }, 4000);
  }
  res.json({ ok: true });
});

app.get('/overlay', (req, res) => { noCache(res); res.sendFile(path.join(__dirname, '../public/overlay.html')); });

// -------------------------------------------------------
// Socket.io
// -------------------------------------------------------
// Count open overlays so we can tell if OBS is actually showing the game
let overlays = 0;
let pendingMusic = null, musicNowAt = 0;
function clientName(ua = '') {
  if (/OBS/i.test(ua)) return 'OBS';
  if (/TikTok|LiveStudio|Live ?Studio|bytedance|Electron/i.test(ua)) return 'LIVE Studio';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'unknown app';
}
io.on('connection', socket => {
  socket.on('hello', ({ role, v } = {}) => {
    if (role !== 'overlay' || socket.data.overlay) return;
    socket.data.overlay = true;
    overlays++;
    const app = clientName(socket.handshake.headers['user-agent']);
    socket.data.app = app;
    const outdated = v !== CLIENT_VERSION ? ` · ⚠️ OLD VERSION (${v || 'cached'}), refresh the source` : '';
    game.log(`📺 Overlay opened (${overlays} open) · ${app}${outdated}`);
    if (pendingMusic && Date.now() - pendingMusic.t < 60000) {
      socket.emit('music', pendingMusic);
      game.log('🎵 Applied the pending music command');
    }
    pendingMusic = null;
    pushStatus();
  });
  socket.on('disconnect', reason => {
    if (!socket.data.overlay) return;
    overlays--;
    game.log(`📺 Overlay closed (${overlays} open) · ${reason}`);
    pushStatus();
  });
  socket.on('music:ack', a => {
    musicNowAt = Date.now();
    const who = socket.data.app || 'overlay';
    if (a.error) game.log(`⚠️ ${who} could not play music (${a.cmd}): ${a.error}`);
    else game.log(`🎵 ${who} did "${a.cmd}" → ${a.playing ? 'playing' : 'PAUSED'} ${a.title || ''} (effects audio ${a.audio})`);
  });
  socket.on('music:now', now => {
    musicNowAt = Date.now();
    const changed = JSON.stringify(now) !== JSON.stringify(musicNow);
    if (changed) game.log(now ? `🎵 ${now.paused ? 'Paused' : 'Playing'}: ${now.title}` : '🎵 Music stopped');
    musicNow = now;
    io.emit('music:now', musicNow);
  });
  socket.emit('music:now', musicNow);
  socket.emit('state', game.snapshot());
  socket.emit('status', status());
  socket.emit('settings', settings);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`\n💍 Ahengu Shqiptare running at http://localhost:${PORT}`);
  console.log(`📺 OBS overlay (1080x1920): http://localhost:${PORT}/overlay\n`);
  if (process.env.TIKTOK_USERNAME) {
    try { await tiktok.connect(process.env.TIKTOK_USERNAME, process.env.SESSION_ID || null); }
    catch (err) { console.error('Auto-connect failed:', err.message); }
  }
});
