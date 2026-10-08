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

function status() {
  return {
    connected: tiktok.isConnected,
    username: tiktok.creatorUsername,
    simulating: sim.running,
    simSpeed: sim.speed,
  };
}
const pushStatus = () => io.emit('status', status());

tiktok.on('connected', () => { pushStatus(); game.log(`✅ Connected to @${tiktok.creatorUsername}`); });
tiktok.on('disconnected', () => { pushStatus(); game.log('⚠️ TikTok disconnected'); });
tiktok.on('error', err => game.log(`❌ ${err?.message || err}`));

// -------------------------------------------------------
// REST API
// -------------------------------------------------------
app.post('/api/connect', async (req, res) => {
  const { username, sessionId } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });
  try {
    await tiktok.connect(username, sessionId || process.env.SESSION_ID || null);
    pushStatus();
    res.json({ ok: true });
  } catch (err) {
    pushStatus();
    res.status(500).json({ error: err.message || 'Connection failed' });
  }
});

app.post('/api/disconnect', async (req, res) => {
  await tiktok.disconnect();
  pushStatus();
  res.json({ ok: true });
});

app.post('/api/sim/start', (req, res) => {
  sim.start(Number(req.body?.speed) || 1);
  pushStatus();
  res.json({ ok: true });
});

app.post('/api/sim/stop', (req, res) => {
  sim.stop();
  pushStatus();
  res.json({ ok: true });
});

app.post('/api/sim/showcase', (req, res) => {
  game.reset();
  const ms = sim.showcase();
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
    case 'join': sim.join(); break;
    case 'share': sim.share(); break;
    case 'follow': sim.follow(); break;
    default: return res.status(400).json({ error: 'unknown type' });
  }
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  game.reset();
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

app.get('/overlay', (req, res) => res.sendFile(path.join(__dirname, '../public/overlay.html')));

// -------------------------------------------------------
// Socket.io
// -------------------------------------------------------
io.on('connection', socket => {
  socket.emit('state', game.snapshot());
  socket.emit('status', status());
  socket.emit('settings', settings);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`\n💍 Dasma Shqiptare running at http://localhost:${PORT}`);
  console.log(`📺 OBS overlay (1080x1920): http://localhost:${PORT}/overlay\n`);
  if (process.env.TIKTOK_USERNAME) {
    try { await tiktok.connect(process.env.TIKTOK_USERNAME, process.env.SESSION_ID || null); }
    catch (err) { console.error('Auto-connect failed:', err.message); }
  }
});
