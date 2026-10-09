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
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());

// Optional password for the control panel actions (set ADMIN_PASSWORD on Render).
// The overlay itself stays public so OBS can load it.
app.use('/api', (req, res, next) => {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass || req.method === 'GET') return next();
  if (req.get('x-admin-key') === pass) return next();
  res.status(401).json({ error: 'Wrong password', auth: true });
});
app.use(express.static(path.join(__dirname, '../public')));

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
tiktok.on('join', () => minute.joins++);
tiktok.on('like', d => { minute.likes += d.likeCount || 1; });
tiktok.on('comment', () => minute.comments++);
tiktok.on('gift', d => { minute.gifts += d.repeatCount || 1; });
setInterval(() => {
  if (!tiktok.isConnected) return;
  const top = game.topLikers(3).map(t => `${t.name} ${t.likes}`).join(', ');
  game.log(`📊 Last minute: ${minute.joins} joins · ${minute.likes} likes · ${minute.comments} comments · ${minute.gifts} gifts${top ? ` | top likers: ${top}` : ''}`);
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
  game.resetLikeGoal();
  pushStatus();
  game.log(`✅ Connected to @${tiktok.creatorUsername}`);
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
  io.emit('music', { cmd, url });
  game.log(`🎵 Panel: ${cmd}${url ? ' ' + decodeURIComponent(url.split('/').pop()) : ''}`);
  res.json({ ok: true });
});

app.get('/overlay', (req, res) => res.sendFile(path.join(__dirname, '../public/overlay.html')));

// -------------------------------------------------------
// Socket.io
// -------------------------------------------------------
// Count open overlays so we can tell if OBS is actually showing the game
let overlays = 0;
io.on('connection', socket => {
  socket.on('hello', ({ role } = {}) => {
    if (role !== 'overlay' || socket.data.overlay) return;
    socket.data.overlay = true;
    overlays++;
    game.log(`📺 Overlay opened (${overlays} open)`);
    pushStatus();
  });
  socket.on('disconnect', () => {
    if (!socket.data.overlay) return;
    overlays--;
    game.log(`📺 Overlay closed (${overlays} open)`);
    pushStatus();
  });
  socket.on('music:now', now => {
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
