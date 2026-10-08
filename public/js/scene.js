// =============================================================
// scene.js — canvas world for Dasma Shqiptare (1080x1920)
//   bg canvas    : static stage (curtains, floor, bunting)
//   scene canvas : lights, waving flag, characters, money pile
//   fx canvas    : particles above the UI (money rain, confetti...)
// =============================================================

const Scene = (() => {
  const W = 1080, H = 1920, TAU = Math.PI * 2;
  const bgCanvas = document.getElementById('bg'), bg = bgCanvas.getContext('2d');
  const sceneCanvas = document.getElementById('scene'), ctx = sceneCanvas.getContext('2d');
  const fxCanvas = document.getElementById('fx'), fx = fxCanvas.getContext('2d');

  const FONT = "'Baloo 2', system-ui, sans-serif";
  const STAGE = { cx: 560, cy: 1000, rx: 350, ry: 84 };
  const SPACING = 0.40;               // radians between dancers in the valle chain
  const PILE_BASE = 1240;
  const POS = {
    groom: { x: 512, y: 1004, s: 1.12 },
    bride: { x: 610, y: 1004, s: 1.12 },
    bestman: [{ x: 428, y: 990, s: 0.97 }, { x: 348, y: 976, s: 0.93 }],      // groom's side
    bridesmaid: [{ x: 694, y: 990, s: 0.97 }, { x: 774, y: 976, s: 0.93 }],   // bride's side
    drummer: { x: 992, y: 1120, s: 0.86 },
    flag: { x: 424, y: 618, w: 270, h: 168 },
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOutBack = k => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
  function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return Math.abs(h); }
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function shortName(name, max = 12) {
    const chars = Array.from(String(name || ''));
    return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join('');
  }

  // -----------------------------------------------------------
  // Avatars (profile pictures with initials fallback)
  // -----------------------------------------------------------
  const avatars = new Map();
  function initials(user) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), h = hash(user.id) % 360;
    const grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, `hsl(${h},70%,58%)`); grad.addColorStop(1, `hsl(${(h + 50) % 360},70%,34%)`);
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff'; g.font = `800 70px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((Array.from(user.name || '?').find(ch => /\p{L}|\p{N}/u.test(ch)) || '?').toUpperCase(), 64, 70);
    return c;
  }
  function avatarFor(user) {
    const key = user.id + '|' + (user.avatar || '');
    let a = avatars.get(key);
    if (a) return a;
    a = { img: null, fb: initials(user) };
    if (user.avatar) {
      const im = new Image();
      im.referrerPolicy = 'no-referrer';
      im.onload = () => { a.img = im; };
      im.src = user.avatar;
    }
    avatars.set(key, a);
    return a;
  }
  function drawHead(c, user, x, y, r, ring) {
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.closePath();
    c.fillStyle = '#ccc'; c.fill(); c.clip();
    const a = avatarFor(user);
    c.drawImage(a.img || a.fb, x - r, y - r, r * 2, r * 2);
    c.restore();
    c.lineWidth = Math.max(2.5, r * 0.15); c.strokeStyle = ring;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  }

  // -----------------------------------------------------------
  // Static background
  // -----------------------------------------------------------
  function catenary(x1, y1, x2, y2, sag, t) {
    return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t + Math.sin(t * Math.PI) * sag };
  }

  function drawBackground() {
    const c = bg;
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0204'); g.addColorStop(0.45, '#3c050a'); g.addColorStop(0.65, '#1d0305'); g.addColorStop(1, '#070001');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // Curtain wall with folds
    const top = 110, bottom = 960;
    for (let x = -10; x < W; x += 44) {
      const fg = c.createLinearGradient(x, 0, x + 44, 0);
      fg.addColorStop(0, '#3e050a'); fg.addColorStop(0.35, '#9e121b'); fg.addColorStop(0.55, '#b81c24'); fg.addColorStop(1, '#3e050a');
      c.fillStyle = fg; c.fillRect(x, top, 44, bottom - top);
    }
    g = c.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(0.3, 'rgba(0,0,0,.05)'); g.addColorStop(0.8, 'rgba(0,0,0,.15)'); g.addColorStop(1, 'rgba(0,0,0,.75)');
    c.fillStyle = g; c.fillRect(0, top, W, bottom - top);

    // Warm glow behind the couple
    g = c.createRadialGradient(560, 760, 20, 560, 760, 520);
    g.addColorStop(0, 'rgba(255,170,90,.38)'); g.addColorStop(1, 'rgba(255,120,60,0)');
    c.fillStyle = g; c.fillRect(0, 200, W, 900);

    // Side drapes with gold tie-backs
    for (const side of [0, 1]) {
      c.save();
      if (side) { c.translate(W, 0); c.scale(-1, 1); }
      c.beginPath();
      c.moveTo(0, top); c.lineTo(250, top);
      c.bezierCurveTo(200, 360, 90, 560, 70, 760);
      c.bezierCurveTo(60, 820, 40, 900, 0, 960);
      c.closePath();
      g = c.createLinearGradient(0, 0, 250, 0);
      g.addColorStop(0, '#5a070d'); g.addColorStop(0.5, '#c0222b'); g.addColorStop(0.8, '#7a0a11'); g.addColorStop(1, '#4a050a');
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 3;
      for (let i = 1; i < 6; i++) {
        c.beginPath(); c.moveTo(i * 40, top); c.bezierCurveTo(i * 34, 400, i * 14, 600, 30 + i * 6, 760); c.stroke();
      }
      c.restore();
    }

    // Valance swags with gold fringe
    for (let i = 0; i < 7; i++) {
      const x0 = i * (W / 7) - 10, w = W / 7 + 20;
      c.beginPath(); c.moveTo(x0, top - 10); c.quadraticCurveTo(x0 + w / 2, top + 95, x0 + w, top - 10); c.closePath();
      g = c.createLinearGradient(0, top - 10, 0, top + 60);
      g.addColorStop(0, '#5c060c'); g.addColorStop(1, '#c41f28');
      c.fillStyle = g; c.fill();
      c.strokeStyle = '#e8b33c'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(x0, top - 10); c.quadraticCurveTo(x0 + w / 2, top + 95, x0 + w, top - 10); c.stroke();
      for (let k = 1; k < 12; k++) {
        const p = k / 12, px = x0 + w * p, py = top - 10 + (1 - Math.pow(2 * p - 1, 2)) * 52;
        c.fillStyle = '#e8b33c'; c.fillRect(px - 1.5, py, 3, 12);
        c.beginPath(); c.arc(px, py + 14, 3.5, 0, TAU); c.fill();
      }
    }
    c.fillStyle = '#2a0306'; c.fillRect(0, 0, W, top - 8);

    // Bunting (red / black flags)
    for (let s = 0; s < 2; s++) {
      const x1 = s * 540, x2 = x1 + 540;
      c.strokeStyle = '#d9b46a'; c.lineWidth = 2;
      c.beginPath();
      for (let t = 0; t <= 1.001; t += 0.02) { const p = catenary(x1, 36, x2, 36, 46, t); t === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y); }
      c.stroke();
      for (let k = 0; k < 11; k++) {
        const t = (k + 0.5) / 11, p = catenary(x1, 36, x2, 36, 46, t);
        c.fillStyle = k % 2 ? '#111' : '#e41e20';
        c.beginPath(); c.moveTo(p.x - 18, p.y); c.lineTo(p.x + 18, p.y); c.lineTo(p.x, p.y + 44); c.closePath(); c.fill();
      }
    }

    // Stage platform
    c.save();
    c.beginPath(); c.ellipse(STAGE.cx, STAGE.cy + 30, 600, 190, 0, 0, TAU); c.clip();
    g = c.createLinearGradient(0, 860, 0, 1230);
    g.addColorStop(0, '#2c1309'); g.addColorStop(1, '#6a3417');
    c.fillStyle = g; c.fillRect(0, 820, W, 440);
    c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 2;
    for (let y = 850; y < 1240; y += 22 + (y - 850) * 0.04) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.restore();
    c.strokeStyle = '#c8901a'; c.lineWidth = 6;
    c.beginPath(); c.ellipse(STAGE.cx, STAGE.cy + 30, 600, 190, 0, 0.05, Math.PI - 0.05); c.stroke();

    // Dance carpet with Albanian ornament ring
    c.beginPath(); c.ellipse(STAGE.cx, STAGE.cy + 8, 430, 122, 0, 0, TAU);
    g = c.createRadialGradient(STAGE.cx, STAGE.cy, 30, STAGE.cx, STAGE.cy, 430);
    g.addColorStop(0, '#c0161f'); g.addColorStop(0.75, '#7c0a10'); g.addColorStop(1, '#4a0509');
    c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#e8b33c'; c.stroke();
    c.beginPath(); c.ellipse(STAGE.cx, STAGE.cy + 8, 395, 108, 0, 0, TAU);
    c.setLineDash([10, 8]); c.lineWidth = 2.5; c.stroke(); c.setLineDash([]);
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU, x = STAGE.cx + Math.cos(a) * 412, y = STAGE.cy + 8 + Math.sin(a) * 115;
      c.save(); c.translate(x, y); c.scale(1, 0.5 + 0.2 * Math.sin(a)); c.rotate(Math.PI / 4);
      c.fillStyle = i % 2 ? '#111' : '#f0c04a'; c.fillRect(-6, -6, 12, 12);
      c.restore();
    }
    // Bottom floor fade (covered by TikTok chat anyway)
    g = c.createLinearGradient(0, 1180, 0, H);
    g.addColorStop(0, 'rgba(10,1,2,0)'); g.addColorStop(0.2, 'rgba(10,1,2,.85)'); g.addColorStop(1, '#050001');
    c.fillStyle = g; c.fillRect(0, 1180, W, H - 1180);
  }

  // -----------------------------------------------------------
  // Albanian flag (double-headed eagle), drawn once then waved
  // -----------------------------------------------------------
  const flagCanvas = document.createElement('canvas');
  flagCanvas.width = POS.flag.w; flagCanvas.height = POS.flag.h;

  function eagleHalf(c) {
    // wing
    c.beginPath();
    c.moveTo(104, 86);
    c.bezierCurveTo(118, 66, 142, 50, 188, 32);
    c.lineTo(175, 56); c.lineTo(192, 58); c.lineTo(172, 76); c.lineTo(186, 82); c.lineTo(164, 95);
    c.lineTo(175, 105); c.lineTo(152, 109); c.lineTo(157, 122); c.lineTo(135, 117); c.lineTo(134, 129); c.lineTo(110, 118);
    c.closePath(); c.fill();
    // neck + head
    c.beginPath();
    c.moveTo(97, 84); c.quadraticCurveTo(102, 60, 115, 50); c.lineTo(125, 55); c.quadraticCurveTo(111, 66, 108, 88);
    c.closePath(); c.fill();
    c.beginPath(); c.arc(120, 44, 10.5, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(127, 37); c.lineTo(143, 45); c.lineTo(129, 51); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(113, 38); c.lineTo(103, 27); c.lineTo(117, 34); c.closePath(); c.fill();
    // leg + talons
    c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(106, 138); c.lineTo(118, 152); c.lineTo(128, 149); c.moveTo(118, 152); c.lineTo(124, 160); c.stroke();
  }

  function drawFlagTexture() {
    const c = flagCanvas.getContext('2d'), { w, h } = POS.flag;
    c.fillStyle = '#e41e20'; c.fillRect(0, 0, w, h);
    c.save();
    const k = (h * 0.86) / 200;
    c.translate(w / 2 - 100 * k, h / 2 - 100 * k - 2); c.scale(k, k);
    c.fillStyle = c.strokeStyle = '#111';
    for (const side of [1, -1]) {
      c.save();
      if (side < 0) { c.translate(200, 0); c.scale(-1, 1); }
      eagleHalf(c);
      c.restore();
    }
    c.beginPath(); c.ellipse(100, 106, 14, 40, 0, 0, TAU); c.fill();
    c.beginPath();
    c.moveTo(89, 136); c.lineTo(76, 178); c.lineTo(88, 171); c.lineTo(93, 188); c.lineTo(100, 175);
    c.lineTo(107, 188); c.lineTo(112, 171); c.lineTo(124, 178); c.lineTo(111, 136); c.closePath(); c.fill();
    c.fillStyle = '#e41e20';
    for (const ex of [78, 122]) { c.beginPath(); c.arc(ex, 42, 2, 0, TAU); c.fill(); }
    c.restore();
  }

  function drawFlag(c, t) {
    const { x, y, w, h } = POS.flag, strip = 3;
    c.save();
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 24; c.shadowOffsetY = 10;
    c.fillStyle = '#000'; c.fillRect(x + 4, y, w - 8, h - 10);
    c.restore();
    for (let sx = 0; sx < w; sx += strip) {
      const ph = sx * 0.045 - t * 2.4;
      const stretch = Math.sin(ph) * 5 * (0.4 + sx / w);
      c.drawImage(flagCanvas, sx, 0, strip, h, x + sx, y, strip + 0.6, h + stretch);
      const shade = Math.cos(ph);
      c.fillStyle = shade > 0 ? `rgba(255,255,255,${shade * 0.10})` : `rgba(0,0,0,${-shade * 0.22})`;
      c.fillRect(x + sx, y, strip + 0.6, h + stretch);
    }
    // gold rod with finials
    const g = c.createLinearGradient(0, y - 12, 0, y + 2);
    g.addColorStop(0, '#fff1b0'); g.addColorStop(0.5, '#e0a930'); g.addColorStop(1, '#8a5c0c');
    c.fillStyle = g;
    rrect(c, x - 16, y - 10, w + 32, 11, 5); c.fill();
    for (const fxp of [x - 20, x + w + 20]) { c.beginPath(); c.arc(fxp, y - 4, 9, 0, TAU); c.fill(); }
  }

  // -----------------------------------------------------------
  // Lights
  // -----------------------------------------------------------
  const glow = document.createElement('canvas'); glow.width = glow.height = 64;
  (() => {
    const g = glow.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  })();
  const tintedGlows = {};
  function glowOf(color) {
    if (tintedGlows[color]) return tintedGlows[color];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.drawImage(glow, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, 64, 64);
    return (tintedGlows[color] = c);
  }

  const bulbs = [];
  (() => {
    for (let i = 0; i <= 30; i++) { const t = i / 30; bulbs.push({ ...catenary(-10, 486, 1090, 486, 64, t), i }); }
    for (let i = 0; i <= 18; i++) { const t = i / 18; bulbs.push({ ...catenary(-10, 70, 540, 70, 46, t), i: i + 40, small: true }); }
    for (let i = 0; i <= 18; i++) { const t = i / 18; bulbs.push({ ...catenary(540, 70, 1090, 70, 46, t), i: i + 70, small: true }); }
  })();
  const rimLights = [];
  for (let i = 0; i <= 22; i++) {
    const a = 0.12 + (i / 22) * (Math.PI - 0.24);
    rimLights.push({ x: STAGE.cx + Math.cos(a) * 598, y: STAGE.cy + 30 + Math.sin(a) * 188, i });
  }

  function drawLights(c, t, party) {
    // wires
    c.strokeStyle = 'rgba(30,20,10,.9)'; c.lineWidth = 2;
    c.beginPath();
    for (let k = 0; k <= 60; k++) { const p = catenary(-10, 486, 1090, 486, 64, k / 60); k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
    c.stroke();
    c.globalCompositeOperation = 'lighter';
    for (const b of bulbs) {
      const tw = 0.65 + 0.35 * Math.sin(t * (party ? 9 : 2.2) + b.i * 1.7);
      const col = party ? `hsl(${(b.i * 40 + t * 200) % 360},100%,60%)` : (b.i % 5 === 0 ? '#ff6a4a' : '#ffcf73');
      const size = (b.small ? 34 : 46) * tw;
      c.globalAlpha = 0.9 * tw;
      c.drawImage(glowOf(col), b.x - size / 2, b.y + 6 - size / 2, size, size);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    for (const b of bulbs) {
      c.fillStyle = b.i % 5 === 0 ? '#ffb39e' : '#fff3c9';
      c.beginPath(); c.arc(b.x, b.y + 6, b.small ? 3.5 : 5, 0, TAU); c.fill();
    }
    // chasing rim lights
    const chase = Math.floor(t * (party ? 14 : 5));
    for (const r of rimLights) {
      const on = (r.i + chase) % 3 === 0;
      c.save(); c.translate(r.x, r.y); c.rotate(Math.PI / 4);
      c.fillStyle = on ? '#fff0a8' : (r.i % 2 ? '#e41e20' : '#c8901a');
      c.fillRect(-6, -6, 12, 12);
      c.restore();
      if (on) { c.globalCompositeOperation = 'lighter'; c.drawImage(glowOf('#ffcf73'), r.x - 22, r.y - 22, 44, 44); c.globalCompositeOperation = 'source-over'; }
    }
  }

  function drawSpotlights(c, t, party) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const beams = party
      ? [0, 1, 2, 3].map(i => ({ x: 140 + i * 270, tx: 560 + Math.sin(t * 1.7 + i * 1.9) * 380, col: `hsla(${(i * 90 + t * 120) % 360},100%,60%,` }))
      : [{ x: 260, tx: 540 + Math.sin(t * 0.5) * 30, col: 'rgba(255,220,160,' }, { x: 860, tx: 580 + Math.cos(t * 0.45) * 30, col: 'rgba(255,220,160,' }];
    for (const b of beams) {
      const g = c.createLinearGradient(b.x, 120, b.tx, 1060);
      g.addColorStop(0, b.col + (party ? '0.32)' : '0.20)')); g.addColorStop(1, b.col + '0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(b.x - 12, 120); c.lineTo(b.x + 12, 120); c.lineTo(b.tx + 150, 1060); c.lineTo(b.tx - 150, 1060); c.closePath(); c.fill();
    }
    const pool = c.createRadialGradient(560, 1010, 10, 560, 1010, 260);
    pool.addColorStop(0, party ? 'rgba(255,200,120,.22)' : 'rgba(255,220,170,.18)'); pool.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = pool; c.beginPath(); c.ellipse(560, 1010, 300, 90, 0, 0, TAU); c.fill();
    c.restore();
  }

  // -----------------------------------------------------------
  // Characters
  // -----------------------------------------------------------
  const PAL = {
    man:    { shirt: '#f7f3ea', vest: '#161616', trim: '#e7b53e', sash: '#d4161e', skirt: '#ffffff', skirt2: '#d9d1c3', legs: '#f2ede2', shoe: '#151515', skin: '#efc6a0' },
    woman:  { shirt: '#fbf7ef', vest: '#c4141b', trim: '#f1c24a', apron: '#a80f16', skirt: '#ffffff', skirt2: '#ddd4c6', shoe: '#b0121a', skin: '#efc6a0' },
    groom:  { suit: '#141418', suit2: '#2b2b33', shirt: '#ffffff', tie: '#e41e20', shoe: '#0c0c0c', skin: '#efc6a0' },
    bride:  { dress: '#ffffff', dress2: '#efe4ee', trim: '#f1c24a', skin: '#efc6a0' },
    bestman:{ suit: '#1d2542', suit2: '#33406b', shirt: '#ffffff', tie: '#e41e20', shoe: '#0c0c0c', skin: '#efc6a0' },
    bridesmaid: { shirt: '#fff7fa', vest: '#e0457b', trim: '#f1c24a', apron: '#f7b3cc', skirt: '#ffe3ee', skirt2: '#f5b5cd', shoe: '#c2185b', skin: '#efc6a0' },
  };
  const GHOST_COLOR = 'rgba(255,236,210,0.95)';
  function ghostPal(p) { const g = {}; for (const k in p) g[k] = GHOST_COLOR; return g; }

  function limb(c, x1, y1, x2, y2, width, color, bend = 8) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + bend;
    c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx, my, x2, y2); c.stroke();
  }

  function shadow(c, rx) {
    c.fillStyle = 'rgba(0,0,0,.38)';
    c.beginPath(); c.ellipse(0, 2, rx, rx * 0.26, 0, 0, TAU); c.fill();
  }

  // pose: { bob, lf:{x,y}, rf:{x,y}, hands:[{x,y}], sway, hanky }
  function drawMan(c, p, pose, extra = {}) {
    const b = pose.bob, sw = pose.sway;
    shadow(c, 30);
    limb(c, -7, -72 + b, pose.lf.x, pose.lf.y - 4, 10, p.legs, 0);
    limb(c, 7, -72 + b, pose.rf.x, pose.rf.y - 4, 10, p.legs, 0);
    for (const f of [pose.lf, pose.rf]) {
      c.fillStyle = p.shoe; c.beginPath(); c.ellipse(f.x, f.y - 3, 10, 5, 0, 0, TAU); c.fill();
      c.beginPath(); c.arc(f.x + 9, f.y - 6, 3.5, 0, TAU); c.fill();
    }
    // fustanella
    c.beginPath();
    c.moveTo(-17, -84 + b); c.lineTo(17, -84 + b); c.lineTo(35 + sw, -38 + b);
    for (let i = 0; i <= 8; i++) c.lineTo(35 + sw - i * 70 / 8, -38 + b + (i % 2 ? 3 : 0));
    c.closePath();
    const g = c.createLinearGradient(0, -84 + b, 0, -38 + b);
    g.addColorStop(0, p.skirt); g.addColorStop(1, p.skirt2);
    c.fillStyle = g; c.fill();
    if (p.skirt !== GHOST_COLOR) {
      c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = 1.5;
      for (let i = 1; i < 8; i++) { const tx = -17 + i * 34 / 8, bx = -35 + sw + i * 70 / 8; c.beginPath(); c.moveTo(tx, -82 + b); c.lineTo(bx, -40 + b); c.stroke(); }
    }
    // shirt + vest (xhamadan)
    c.fillStyle = p.shirt; rrect(c, -18, -130 + b, 36, 50, 9); c.fill();
    c.fillStyle = p.vest;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 18, -129 + b); c.lineTo(s * 5, -129 + b); c.lineTo(s * 3, -92 + b); c.lineTo(s * 18, -86 + b); c.closePath(); c.fill();
      c.strokeStyle = p.trim; c.lineWidth = 2.5; c.stroke();
    }
    c.fillStyle = p.sash; rrect(c, -19, -92 + b, 38, 11, 3); c.fill();
    if (p.sash !== GHOST_COLOR) { c.fillStyle = p.trim; c.fillRect(-19, -88 + b, 38, 2); }
    if (extra.drum) extra.drum();
    drawArms(c, p, pose, p.shirt, 11, -128 + b);
    c.fillStyle = p.skin; c.fillRect(-5, -138 + b, 10, 10);
  }

  function drawWoman(c, p, pose) {
    const b = pose.bob, sw = pose.sway;
    shadow(c, 30);
    for (const f of [pose.lf, pose.rf]) { c.fillStyle = p.shoe; c.beginPath(); c.ellipse(f.x, f.y - 3, 9, 5, 0, 0, TAU); c.fill(); }
    c.beginPath();
    c.moveTo(-16, -84 + b); c.lineTo(16, -84 + b); c.lineTo(31 + sw, -6);
    c.quadraticCurveTo(sw, 0, -31 + sw, -6); c.closePath();
    const g = c.createLinearGradient(0, -84, 0, 0); g.addColorStop(0, p.skirt); g.addColorStop(1, p.skirt2);
    c.fillStyle = g; c.fill();
    // apron
    c.beginPath(); c.moveTo(-11, -82 + b); c.lineTo(11, -82 + b); c.lineTo(15 + sw * 0.7, -12); c.lineTo(-15 + sw * 0.7, -12); c.closePath();
    c.fillStyle = p.apron; c.fill();
    if (p.apron !== GHOST_COLOR) {
      c.fillStyle = p.trim;
      for (const yy of [-60, -40, -22]) c.fillRect(-13 + sw * 0.4, yy + b * 0.3, 26 + Math.abs(sw) * 0.2, 3);
    }
    c.fillStyle = p.shirt; rrect(c, -16, -130 + b, 32, 50, 9); c.fill();
    c.fillStyle = p.vest;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(s * 16, -129 + b); c.lineTo(s * 5, -129 + b); c.lineTo(s * 4, -88 + b); c.lineTo(s * 16, -84 + b); c.closePath(); c.fill();
      c.strokeStyle = p.trim; c.lineWidth = 2.5; c.stroke();
    }
    if (p.trim !== GHOST_COLOR) {
      c.fillStyle = p.trim;
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.arc(i * 4.5, -121 + b + Math.abs(i) * -0.8, 2.4, 0, TAU); c.fill(); }
    }
    drawArms(c, p, pose, p.shirt, 10, -128 + b);
    c.fillStyle = p.skin; c.fillRect(-5, -138 + b, 10, 10);
  }

  function drawSuit(c, p, pose) {
    const b = pose.bob;
    shadow(c, 32);
    limb(c, -8, -74 + b, pose.lf.x, pose.lf.y - 4, 13, p.suit, 0);
    limb(c, 8, -74 + b, pose.rf.x, pose.rf.y - 4, 13, p.suit, 0);
    for (const f of [pose.lf, pose.rf]) { c.fillStyle = p.shoe; c.beginPath(); c.ellipse(f.x + 3, f.y - 3, 11, 5, 0, 0, TAU); c.fill(); }
    c.beginPath(); c.moveTo(-20, -130 + b); c.lineTo(20, -130 + b); c.lineTo(23, -66 + b); c.lineTo(-23, -66 + b); c.closePath();
    const g = c.createLinearGradient(-20, 0, 20, 0); g.addColorStop(0, p.suit); g.addColorStop(0.5, p.suit2); g.addColorStop(1, p.suit);
    c.fillStyle = g; c.fill();
    c.fillStyle = p.shirt; c.beginPath(); c.moveTo(-8, -130 + b); c.lineTo(8, -130 + b); c.lineTo(0, -98 + b); c.closePath(); c.fill();
    c.fillStyle = p.tie;
    c.beginPath(); c.moveTo(0, -126 + b); c.lineTo(-8, -131 + b); c.lineTo(-8, -121 + b); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0, -126 + b); c.lineTo(8, -131 + b); c.lineTo(8, -121 + b); c.closePath(); c.fill();
    if (p.tie !== GHOST_COLOR) { c.beginPath(); c.arc(-12, -112 + b, 4.5, 0, TAU); c.fill(); }
    drawArms(c, p, pose, p.suit, 12, -128 + b);
    c.fillStyle = p.skin; c.fillRect(-5, -138 + b, 10, 10);
  }

  function drawBride(c, p, pose, ghost) {
    const b = pose.bob, sw = pose.sway;
    // veil behind
    if (!ghost) {
      c.fillStyle = 'rgba(255,255,255,.42)';
      c.beginPath(); c.moveTo(-20, -186 + b); c.bezierCurveTo(-60, -150, -62, -70, -46 + sw, -24); c.lineTo(38 + sw, -24);
      c.bezierCurveTo(54, -80, 52, -150, 20, -186 + b); c.closePath(); c.fill();
    }
    shadow(c, 46);
    c.beginPath();
    c.moveTo(-15, -86 + b); c.lineTo(15, -86 + b);
    c.bezierCurveTo(30, -60, 50 + sw, -30, 54 + sw, -4);
    for (let i = 0; i < 10; i++) c.quadraticCurveTo(54 + sw - (i + 0.5) * 10.8, 4, 54 + sw - (i + 1) * 10.8, -4);
    c.bezierCurveTo(-50 + sw, -30, -30, -60, -15, -86 + b);
    c.closePath();
    const g = c.createLinearGradient(0, -86, 0, 0); g.addColorStop(0, p.dress); g.addColorStop(1, p.dress2);
    c.fillStyle = g; c.fill();
    if (!ghost) {
      c.fillStyle = 'rgba(214,170,60,.55)';
      for (let i = 0; i < 18; i++) { const sx = ((i * 37) % 80) - 40, sy = -70 + ((i * 23) % 62); c.beginPath(); c.arc(sx * (1 + (sy + 70) / 120), sy, 1.6, 0, TAU); c.fill(); }
    }
    c.fillStyle = p.dress; rrect(c, -15, -130 + b, 30, 48, 10); c.fill();
    c.fillStyle = p.trim; c.fillRect(-15, -90 + b, 30, 4);
    drawArms(c, p, pose, ghost ? p.dress : p.skin, 8, -128 + b);
    c.fillStyle = p.skin; c.fillRect(-5, -138 + b, 10, 10);
  }

  function drawBouquet(c, x, y) {
    c.fillStyle = '#2f7d32';
    for (const a of [-0.8, 0, 0.8]) { c.beginPath(); c.ellipse(x + Math.sin(a) * 9, y + 6, 4, 9, a, 0, TAU); c.fill(); }
    const cols = ['#e41e20', '#ff4d6d', '#c2101a', '#ff7b95', '#e41e20'];
    [[0, 0], [-7, -3], [7, -3], [-4, -9], [4, -9]].forEach(([dx, dy], i) => {
      c.fillStyle = cols[i]; c.beginPath(); c.arc(x + dx, y + dy, 5.5, 0, TAU); c.fill();
    });
  }

  function drawArms(c, p, pose, color, width, shoulderY) {
    for (const h of pose.hands) {
      const sx = h.x < 0 ? -16 : 16;
      limb(c, sx, shoulderY + 4, h.x, h.y, width, color, h.bend ?? 8);
      if (h.glass) drawGlass(c, h.x, h.y, h.glass);
      c.fillStyle = p.skin; c.beginPath(); c.arc(h.x, h.y, 5, 0, TAU); c.fill();
      if (h.hanky) {
        c.fillStyle = '#e41e20';
        const wv = Math.sin(h.hanky * 9) * 6;
        c.beginPath(); c.moveTo(h.x, h.y); c.quadraticCurveTo(h.x + 14 + wv, h.y - 10, h.x + 26, h.y - 2 + wv);
        c.quadraticCurveTo(h.x + 16, h.y + 8, h.x, h.y + 4); c.closePath(); c.fill();
      }
      if (h.bouquet) drawBouquet(c, h.x, h.y - 4);
    }
  }

  // champagne flute held by the stem at (x, y)
  function drawGlass(c, x, y, a) {
    c.save();
    c.globalAlpha *= Math.min(1, a * 1.6);
    c.translate(x, y); c.scale(1.6, 1.6); x = 0; y = 0;
    c.shadowColor = 'rgba(255,220,120,.8)'; c.shadowBlur = 6;
    c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x, y - 12); c.stroke();
    c.beginPath(); c.ellipse(x, y + 6, 5, 1.6, 0, 0, TAU); c.stroke();
    c.beginPath(); c.moveTo(x - 6.2, y - 32); c.lineTo(x - 4, y - 12); c.lineTo(x + 4, y - 12); c.lineTo(x + 6.2, y - 32); c.closePath();
    const g = c.createLinearGradient(0, y - 32, 0, y - 12);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(1, '#f0b429');
    c.fillStyle = g; c.fill();
    c.beginPath(); c.moveTo(x - 7, y - 40); c.lineTo(x - 4, y - 12); c.lineTo(x + 4, y - 12); c.lineTo(x + 7, y - 40);
    c.lineWidth = 1.6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.9)';
    for (const [bx, by] of [[-1.5, -17], [1.8, -22], [-0.5, -27]]) { c.beginPath(); c.arc(x + bx, y + by, 1, 0, TAU); c.fill(); }
    c.restore();
  }

  function drawFlowerCrown(c, y) {
    const cols = ['#ff7eb0', '#ffffff', '#ffd166', '#ff7eb0', '#ffffff', '#ffd166', '#ff7eb0'];
    cols.forEach((col, i) => {
      const a = Math.PI + (i + 0.5) * Math.PI / cols.length;
      c.fillStyle = col; c.beginPath(); c.arc(Math.cos(a) * 24, y + 22 + Math.sin(a) * 24, 4.2, 0, TAU); c.fill();
    });
  }

  function drawQeleshe(c, y, ghost) {
    c.fillStyle = ghost ? GHOST_COLOR : '#fbfaf5';
    c.beginPath(); c.ellipse(0, y, 17, 11, 0, Math.PI, TAU); c.closePath(); c.fill();
    if (!ghost) { c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1.5; c.stroke(); }
  }
  function drawCoinBand(c, y, r) {
    c.fillStyle = '#f1c24a';
    for (let i = -4; i <= 4; i++) {
      const a = -Math.PI / 2 + i * 0.28;
      c.beginPath(); c.arc(Math.cos(a) * (r + 1), y + Math.sin(a) * (r + 1) + r, 3, 0, TAU); c.fill();
    }
  }
  function drawTiara(c, y) {
    c.fillStyle = '#f1c24a'; c.strokeStyle = '#b07a10'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-14, y); c.lineTo(-10, y - 9); c.lineTo(-5, y - 3); c.lineTo(0, y - 13); c.lineTo(5, y - 3); c.lineTo(10, y - 9); c.lineTo(14, y); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(0, y - 6, 2.5, 0, TAU); c.fill();
  }
  function drawMustache(c, y, r) {
    c.fillStyle = '#1b120c';
    c.beginPath();
    c.moveTo(0, y + r * 0.28);
    c.bezierCurveTo(-r * 0.25, y + r * 0.08, -r * 0.65, y + r * 0.18, -r * 0.88, y - r * 0.05);
    c.bezierCurveTo(-r * 0.78, y + r * 0.4, -r * 0.35, y + r * 0.5, 0, y + r * 0.38);
    c.bezierCurveTo(r * 0.35, y + r * 0.5, r * 0.78, y + r * 0.4, r * 0.88, y - r * 0.05);
    c.bezierCurveTo(r * 0.65, y + r * 0.18, r * 0.25, y + r * 0.08, 0, y + r * 0.28);
    c.closePath(); c.fill();
  }
  function drawCrown(c, x, y, size) {
    c.save(); c.translate(x, y); c.scale(size / 30, size / 30);
    c.fillStyle = '#f6c544'; c.strokeStyle = '#8a5c0c'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-15, 8); c.lineTo(-17, -8); c.lineTo(-8, 0); c.lineTo(0, -12); c.lineTo(8, 0); c.lineTo(17, -8); c.lineTo(15, 8); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#e41e20'; c.beginPath(); c.arc(0, 2, 3, 0, TAU); c.fill();
    c.restore();
  }

  function drawDrum(c, pose, hit) {
    // tupan on a strap, played with mallet (right) and switch (left)
    c.strokeStyle = '#5a3a1a'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-14, -128 + pose.bob); c.lineTo(10, -86 + pose.bob); c.stroke();
    const y = -98 + pose.bob;
    c.fillStyle = '#b5121b'; rrect(c, -30, y, 60, 40, 6); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.8;
    c.beginPath();
    for (let i = 0; i <= 8; i++) c.lineTo(-30 + i * 7.5, i % 2 ? y + 36 : y + 4);
    c.stroke();
    c.fillStyle = '#f3e3c0';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 30, y + 20, 5, 20, 0, 0, TAU); c.fill(); }
    // sticks
    const r = pose.hands[1], l = pose.hands[0];
    c.strokeStyle = '#6b3d16'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(r.x, r.y); c.lineTo(r.x + 4, r.y - 24); c.stroke();
    c.fillStyle = '#e9d7b0'; c.beginPath(); c.arc(r.x + 4, r.y - 26, 6, 0, TAU); c.fill();
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(l.x - 6, l.y - 26); c.stroke();
    if (hit > 0.6) {
      c.strokeStyle = `rgba(255,240,180,${hit - 0.4})`; c.lineWidth = 3;
      c.beginPath(); c.arc(32, y + 20, 12 + (1 - hit) * 20, -1, 1); c.stroke();
    }
  }

  function nameTag(c, text, y, s, gold) {
    c.font = `800 ${Math.round(19 * s)}px ${FONT}`;
    const t = shortName(text, 13), w = c.measureText(t).width + 16 * s, h = 26 * s;
    c.fillStyle = gold ? 'rgba(246,197,68,.95)' : 'rgba(10,2,3,.68)';
    rrect(c, -w / 2, y - h, w, h, h / 2); c.fill();
    c.fillStyle = gold ? '#2a0a0c' : '#fff';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(t, 0, y - h / 2 + 1);
    return y - h;
  }

  function bubble(c, text, y, s, alpha) {
    c.globalAlpha *= alpha;
    c.font = `700 ${Math.round(22 * s)}px ${FONT}`;
    const t = shortName(text, 24), w = Math.min(320, c.measureText(t).width + 24 * s), h = 34 * s;
    c.fillStyle = '#fff';
    rrect(c, -w / 2, y - h - 8 * s, w, h, 12 * s); c.fill();
    c.beginPath(); c.moveTo(-7 * s, y - 8.5 * s); c.lineTo(7 * s, y - 8.5 * s); c.lineTo(0, y); c.closePath(); c.fill();
    c.fillStyle = '#2a0a0c'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(t, 0, y - h / 2 - 8 * s + 1);
  }

  // -----------------------------------------------------------
  // Entities
  // -----------------------------------------------------------
  const ents = new Map();
  let state = null;
  let base = 0;               // valle rotation
  let party = false;
  let drumUntil = 0;
  let coupleSince = 0;
  let toastStart = 0, toastEnd = 0, lastClinkCycle = -1;
  const CLINK_PERIOD = 1.8;

  function startToast(seconds) {
    const now = performance.now();
    if (now > toastEnd) { toastStart = now; lastClinkCycle = -1; }
    toastEnd = Math.max(toastEnd, now) + seconds * 1000;
  }
  function toastK(now) {
    if (!toastEnd) return 0;
    if (now < toastEnd) return clamp((now - toastStart) / 450, 0, 1);
    return clamp(1 - (now - toastEnd) / 450, 0, 1);
  }
  // Raise the glass with the hand facing the couple, clink every CLINK_PERIOD seconds
  function raiseGlass(it, k, el, clinkNow) {
    const e = it.e, pose = it.pose;
    const side = e.kind === 'groom' ? 1 : e.kind === 'bride' ? -1 : (Math.sign(STAGE.cx - e.x) || 1);
    const pulse = Math.pow(Math.max(0, Math.sin(((el - 0.45) / CLINK_PERIOD + 0.25) * TAU)), 6);
    const raised = { x: side * (42 + pulse * 10), y: -150 + pulse * 6 + pose.bob, bend: 8 };
    const rest = { x: -side * 22, y: -92 + pose.bob, bend: 4 };
    while (pose.hands.length < 2) pose.hands.push({ x: pose.hands.length ? 22 : -22, y: -90, bend: 4 });
    let raisedOne = false;
    pose.hands = pose.hands.map(h => {
      const up = !raisedOne && (Math.sign(h.x) || 1) === side;
      if (up) raisedOne = true;
      if (!up && h.bouquet) return h;
      const tg = up ? raised : rest;
      return { x: h.x + (tg.x - h.x) * k, y: h.y + (tg.y - h.y) * k, bend: tg.bend, glass: up ? k : 0, hanky: k < 0.5 ? h.hanky : 0 };
    });
    if (!raisedOne) pose.hands[0] = { ...raised, glass: k };
    if (clinkNow && Math.random() < 0.6) sparks(e.x + side * 26 * e.s, e.y - 220 * e.s, 6, ['#fff3c4', '#fff']);
  }

  function want(key, kind, user, extra) {
    let e = ents.get(key);
    if (!e || e.leaving) {
      e = { key, kind, user, born: performance.now(), leaving: 0, slot: extra.slot || 0, slotSmooth: extra.slot || 0,
        gender: hash(user.id) % 2, bubble: null, jumpT: 0, x: 0, y: 0, s: 1 };
      ents.set(key, e);
      burstAt(e, kind);
    }
    e.user = user;
    Object.assign(e, extra);
    return e;
  }

  function sync(s) {
    state = s;
    drumUntil = s.drummer ? s.drummer.until - s.now + Date.now() : 0;
    const keep = new Set();
    s.dancers.forEach((u, i) => { if (u) keep.add(want('d:' + u.id, 'dancer', u, { slot: i }).key); });
    if (s.groom) keep.add(want('groom:' + s.groom.id, 'groom', s.groom, {}).key);
    if (s.bride) keep.add(want('bride:' + s.bride.id, 'bride', s.bride, {}).key);
    s.bestMen.forEach((u, i) => { if (u) keep.add(want('bm:' + u.id, 'bestman', u, { slot: i }).key); });
    (s.bridesmaids || []).forEach((u, i) => { if (u) keep.add(want('bs:' + u.id, 'bridesmaid', u, { slot: i }).key); });
    // pick up a toast already running (e.g. the overlay was reloaded mid-toast)
    const toastLeft = (s.toastUntil || 0) - s.now;
    if (toastLeft > 500 && performance.now() > toastEnd) startToast(toastLeft / 1000);
    if (s.drummer) keep.add(want('drum:' + s.drummer.id, 'drummer', s.drummer, {}).key);
    for (const e of ents.values()) if (!keep.has(e.key) && !e.leaving) e.leaving = performance.now();
    const coupled = !!(s.bride && s.groom);
    if (coupled && !coupleSince) coupleSince = performance.now();
    if (!coupled) coupleSince = 0;
    party = !!s.qejf?.party;
  }

  function entsOf(userId) { return [...ents.values()].filter(e => e.user.id === userId && !e.leaving); }

  function computeDancerPose(e, t, beat, i, n) {
    const p = beat * Math.PI;           // one step per beat
    const kick = Math.floor(beat) % 8 === 6;
    const lStep = Math.sin(p), rStep = Math.sin(p + Math.PI);
    return {
      bob: -Math.abs(Math.sin(p)) * 4,
      sway: Math.sin(p) * 5,
      lf: { x: -9 + lStep * 6, y: -Math.max(0, lStep) * 10 },
      rf: kick ? { x: 20, y: -30 * Math.sin((beat % 1) * Math.PI) } : { x: 9 + rStep * 6, y: -Math.max(0, rStep) * 10 },
      hands: [],
    };
  }

  function layoutDancers(dt, t) {
    const list = [...ents.values()].filter(e => e.kind === 'dancer');
    base += dt * (party ? 0.24 : 0.11);
    for (const e of list) {
      e.slotSmooth += (e.slot - e.slotSmooth) * Math.min(1, dt * 2.5);
      const a = base - e.slotSmooth * SPACING;
      const depth = (Math.sin(a) + 1) / 2;
      e.angle = a;
      e.x = STAGE.cx + Math.cos(a) * STAGE.rx;
      e.y = STAGE.cy + Math.sin(a) * STAGE.ry;
      e.s = 0.8 + 0.2 * depth;
    }
    return list.filter(e => !e.leaving).sort((a, b) => a.slot - b.slot);
  }

  function burstAt(e, kind) {
    setTimeout(() => {
      const big = kind === 'bride' || kind === 'groom';
      sparks(e.x || 560, (e.y || 1000) - 120 * (e.s || 1), big ? 50 : 22, big ? ['#fff', '#ffe58a', '#ff9cc8'] : ['#ffe58a', '#fff']);
    }, 30);
  }

  // -----------------------------------------------------------
  // Particles (fx canvas)
  // -----------------------------------------------------------
  const particles = [];
  const billSprites = [];
  (() => {
    const cols = [['#5fae5a', '#2f6e2c'], ['#4f8fd6', '#24518a'], ['#b06ad6', '#6a2d8f'], ['#f0a240', '#a8601a'], ['#e86b8a', '#9c2c4a'], ['#9aa3ad', '#5c646d'], ['#e4c94a', '#9a8318']];
    for (const [a, b] of cols) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = a; rrect(g, 1, 1, 62, 30, 3); g.fill();
      g.strokeStyle = b; g.lineWidth = 2; rrect(g, 4, 4, 56, 24, 2); g.stroke();
      g.fillStyle = b; g.beginPath(); g.arc(32, 16, 7, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(8, 7, 12, 4); g.fillRect(44, 21, 12, 4);
      billSprites.push(c);
    }
  })();

  // money pile (persistent, below UI)
  const pileCanvas = document.createElement('canvas'); pileCanvas.width = W; pileCanvas.height = 300;
  const pileTop = PILE_BASE - 230; // pileCanvas y=0 maps to this
  const BUCKET = 12, heights = new Float32Array(Math.ceil(W / BUCKET));
  function landingY(x) { return PILE_BASE - heights[clamp(Math.floor(x / BUCKET), 0, heights.length - 1)] - rand(0, 6); }
  function stampBill(p) {
    const pc = pileCanvas.getContext('2d');
    pc.save(); pc.translate(p.x, p.y - pileTop); pc.rotate(p.rot);
    pc.shadowColor = 'rgba(0,0,0,.35)'; pc.shadowBlur = 3;
    pc.drawImage(billSprites[p.sp], -26, -13, 52, 26);
    pc.restore();
    const b0 = Math.floor((p.x - 22) / BUCKET), b1 = Math.floor((p.x + 22) / BUCKET);
    for (let b = b0; b <= b1; b++) if (b >= 0 && b < heights.length) heights[b] = Math.min(120, heights[b] + 2.4);
  }

  function money(n, cx = 560, spread = 420) {
    for (let i = 0; i < n; i++) {
      particles.push({ type: 'bill', x: cx + rand(-spread, spread), y: rand(-400, -30), vx: rand(-0.6, 0.6), vy: rand(1, 3),
        rot: rand(0, TAU), vr: rand(-0.06, 0.06), flip: rand(0, TAU), vf: rand(0.06, 0.16), sp: Math.floor(rand(0, billSprites.length)), ph: rand(0, TAU) });
    }
  }
  function moneyBurst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.9, -Math.PI * 0.1), v = rand(6, 14);
      particles.push({ type: 'bill', x, y, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v, rot: rand(0, TAU), vr: rand(-0.12, 0.12),
        flip: rand(0, TAU), vf: rand(0.08, 0.2), sp: Math.floor(rand(0, billSprites.length)), ph: rand(0, TAU) });
    }
  }
  function confetti(n, cx = 540, spread = 560) {
    const cols = ['#e41e20', '#111111', '#f6c544', '#ffffff', '#ff7b95'];
    for (let i = 0; i < n; i++) {
      particles.push({ type: 'conf', x: cx + rand(-spread, spread), y: rand(-300, -10), vx: rand(-1, 1), vy: rand(2, 4.5),
        rot: rand(0, TAU), vr: rand(-0.2, 0.2), w: rand(8, 15), h: rand(5, 9), col: cols[i % cols.length], ph: rand(0, TAU), life: 1 });
    }
  }
  function hearts(x, y, n, spread = 30) {
    for (let i = 0; i < n; i++) {
      particles.push({ type: 'heart', x: x + rand(-spread, spread), y: y + rand(-10, 10), vx: rand(-0.5, 0.5), vy: rand(-2.6, -1.4),
        size: rand(14, 26), ph: rand(0, TAU), life: 1, decay: rand(0.006, 0.011), col: Math.random() < 0.8 ? '#ff3d6e' : '#ffd1dc' });
    }
  }
  function sparks(x, y, n, cols = ['#ffe58a', '#fff']) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), v = rand(2, 8);
      particles.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 1, decay: rand(0.015, 0.03), size: rand(3, 7), col: cols[i % cols.length] });
    }
  }
  function notes(x, y) {
    particles.push({ type: 'note', x, y, vx: rand(-0.6, 0.2), vy: rand(-1.6, -1), life: 1, decay: 0.012, ch: Math.random() < 0.5 ? '♪' : '♫', ph: rand(0, TAU) });
  }
  function fireworks(n = 6) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        particles.push({ type: 'rocket', x: rand(160, 920), y: 1300, vx: rand(-1, 1), vy: rand(-17, -14), life: 1,
          col: ['#ffe58a', '#ff4d6d', '#ffffff', '#e41e20', '#7bd5ff'][i % 5] });
      }, i * 260);
    }
  }
  function likeHearts(n) {
    for (let i = 0; i < Math.min(n, 6); i++) {
      particles.push({ type: 'heart', x: 1023 + rand(-8, 8), y: 900 + rand(0, 30), vx: rand(-0.4, 0.4), vy: rand(-3.2, -2.2),
        size: rand(12, 18), ph: rand(0, TAU), life: 1, decay: 0.014, col: '#ff3d6e' });
    }
  }

  function drawHeart(c, x, y, size, col) {
    c.fillStyle = col;
    c.beginPath();
    const s = size / 2;
    c.moveTo(x, y + s * 0.9);
    c.bezierCurveTo(x - s * 1.6, y - s * 0.2, x - s * 0.7, y - s * 1.4, x, y - s * 0.5);
    c.bezierCurveTo(x + s * 0.7, y - s * 1.4, x + s * 1.6, y - s * 0.2, x, y + s * 0.9);
    c.fill();
  }

  function updateParticles(dt, t) {
    const k = dt * 60;
    fx.clearRect(0, 0, W, H);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      let dead = false;
      switch (p.type) {
        case 'bill': {
          p.vy = Math.min(p.vy + 0.22 * k, 4.2);
          p.vx *= 0.985;
          p.x += (p.vx + Math.sin(t * 2.4 + p.ph) * 0.9) * k;
          p.y += p.vy * k;
          p.rot += p.vr * k; p.flip += p.vf * k;
          const ly = p.vy > 0 ? landingY(p.x) : Infinity;
          if (p.y >= ly) { p.y = ly; stampBill(p); dead = true; break; }
          fx.save(); fx.translate(p.x, p.y); fx.rotate(p.rot); fx.scale(1, Math.max(0.15, Math.abs(Math.cos(p.flip))));
          fx.drawImage(billSprites[p.sp], -26, -13, 52, 26); fx.restore();
          break;
        }
        case 'conf': {
          p.x += (p.vx + Math.sin(t * 3 + p.ph) * 1.2) * k; p.y += p.vy * k; p.rot += p.vr * k;
          if (p.y > 1250) { p.life -= 0.04 * k; }
          if (p.life <= 0) { dead = true; break; }
          fx.save(); fx.globalAlpha = clamp(p.life, 0, 1); fx.translate(p.x, p.y); fx.rotate(p.rot);
          fx.scale(1, Math.abs(Math.cos(t * 5 + p.ph)));
          fx.fillStyle = p.col; fx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); fx.restore();
          break;
        }
        case 'heart': {
          p.x += (p.vx + Math.sin(t * 3 + p.ph) * 0.6) * k; p.y += p.vy * k; p.life -= p.decay * k;
          if (p.life <= 0) { dead = true; break; }
          fx.globalAlpha = clamp(p.life * 1.4, 0, 1);
          drawHeart(fx, p.x, p.y, p.size, p.col);
          fx.globalAlpha = 1;
          break;
        }
        case 'spark': {
          p.vy += 0.18 * k; p.x += p.vx * k; p.y += p.vy * k; p.vx *= 0.97; p.life -= p.decay * k;
          if (p.life <= 0) { dead = true; break; }
          fx.globalAlpha = p.life; fx.fillStyle = p.col;
          fx.save(); fx.translate(p.x, p.y); fx.rotate(t * 4);
          const s = p.size * (0.5 + p.life * 0.5);
          fx.beginPath(); for (let j = 0; j < 8; j++) { const r = j % 2 ? s * 0.4 : s; fx.lineTo(Math.cos(j * Math.PI / 4) * r, Math.sin(j * Math.PI / 4) * r); }
          fx.closePath(); fx.fill(); fx.restore(); fx.globalAlpha = 1;
          break;
        }
        case 'note': {
          p.x += (p.vx + Math.sin(t * 4 + p.ph) * 0.5) * k; p.y += p.vy * k; p.life -= p.decay * k;
          if (p.life <= 0) { dead = true; break; }
          fx.globalAlpha = p.life; fx.fillStyle = '#ffe58a'; fx.font = `800 30px ${FONT}`; fx.textAlign = 'center';
          fx.fillText(p.ch, p.x, p.y); fx.globalAlpha = 1;
          break;
        }
        case 'rocket': {
          p.vy += 0.3 * k; p.x += p.vx * k; p.y += p.vy * k;
          fx.fillStyle = p.col; fx.beginPath(); fx.arc(p.x, p.y, 4, 0, TAU); fx.fill();
          if (p.vy >= -2) {
            dead = true;
            for (let j = 0; j < 60; j++) {
              const a = (j / 60) * TAU, v = rand(4, 9);
              particles.push({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: rand(0.012, 0.02), size: rand(3, 6), col: j % 3 ? p.col : '#fff' });
            }
            Sfx.pop();
          }
          break;
        }
      }
      if (dead) particles.splice(i, 1);
    }
    if (particles.length > 1400) particles.splice(0, particles.length - 1400);
  }

  // -----------------------------------------------------------
  // Main render
  // -----------------------------------------------------------
  let last = performance.now();
  const startT = performance.now();
  let lastNote = 0, lastHeart = 0, lastConf = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - startT) / 1000;
    const bpm = party ? 150 : 118;
    const beat = t * bpm / 60;

    ctx.clearRect(0, 0, W, H);
    drawLights(ctx, t, party);
    drawFlag(ctx, t);
    drawSpotlights(ctx, t, party);

    // remove faded-out entities
    for (const e of [...ents.values()]) if (e.leaving && now - e.leaving > 450) ents.delete(e.key);

    const dancers = layoutDancers(dt, t);
    const items = [];

    // ---- dancers + hand holding in the chain ----
    const poses = new Map();
    dancers.forEach((e, i) => poses.set(e, computeDancerPose(e, t, beat, i, dancers.length)));
    for (const e of ents.values()) if (e.kind === 'dancer' && e.leaving && !poses.has(e)) poses.set(e, computeDancerPose(e, t, beat, 0, 1));
    for (let i = 0; i < dancers.length - 1; i++) {
      const a = dancers[i], b = dancers[i + 1];
      const pa = poses.get(a), pb = poses.get(b);
      const dir = Math.sign(b.x - a.x) || 1;
      const sa = { x: a.x + dir * 17 * a.s, y: a.y + (-124 + pa.bob) * a.s };
      const sb = { x: b.x - dir * 17 * b.s, y: b.y + (-124 + pb.bob) * b.s };
      if (Math.hypot(sa.x - sb.x, sa.y - sb.y) < 150 * (a.s + b.s) / 2) {
        const m = { x: (sa.x + sb.x) / 2, y: (sa.y + sb.y) / 2 - 8 };
        pa.hands.push({ x: (m.x - a.x) / a.s, y: (m.y - a.y) / a.s, bend: 6 });
        pb.hands.push({ x: (m.x - b.x) / b.s, y: (m.y - b.y) / b.s, bend: 6 });
      }
    }
    dancers.forEach((e, i) => {
      const p = poses.get(e);
      if (p.hands.length < 2) {
        const used = p.hands.length ? Math.sign(p.hands[0].x) : 0;
        const free = used ? -used : null;
        for (const side of free ? [free] : [-1, 1]) {
          if (i === 0 && (free ? true : side === (dancers.length > 1 ? 1 : -1))) {
            p.hands.push({ x: side * 30 + Math.sin(t * 6) * 5, y: -178, bend: -4, hanky: t }); // leader waves the handkerchief
          } else {
            p.hands.push({ x: side * 24 + Math.sin(beat * Math.PI) * 3, y: -88 + p.bob, bend: 2 });
          }
        }
      }
      items.push({ e, pose: p });
    });
    for (const e of ents.values()) if (e.kind === 'dancer' && e.leaving) {
      const p = poses.get(e); p.hands = [{ x: -24, y: -88, bend: 2 }, { x: 24, y: -88, bend: 2 }];
      items.push({ e, pose: p });
    }

    // ---- couple ----
    const sway = Math.sin(t * 1.7) * 4;
    const coupleBeat = Math.sin(beat * Math.PI * 0.5);
    for (const role of ['groom', 'bride']) {
      const e = [...ents.values()].find(x => x.kind === role && !x.leaving) || [...ents.values()].find(x => x.kind === role);
      const P = POS[role];
      const other = POS[role === 'groom' ? 'bride' : 'groom'];
      const handX = ((other.x - P.x) / 2) / P.s;
      const pose = {
        bob: -Math.abs(coupleBeat) * 2, sway: coupleBeat * 3,
        lf: { x: -9, y: 0 }, rf: { x: 9, y: 0 },
        hands: role === 'groom'
          ? [{ x: -22, y: -84, bend: 2 }, { x: handX, y: -96, bend: 10 }]
          : [{ x: handX, y: -96, bend: 10 }, { x: 16, y: -100, bend: 6, bouquet: true }],
      };
      if (e) { e.x = P.x + sway; e.y = P.y; e.s = P.s; items.push({ e, pose }); }
      else items.push({ ghost: role, x: P.x, y: P.y, s: P.s, pose });
    }
    // ---- best men (groom's side) & bridesmaids (bride's side) ----
    for (const role of ['bestman', 'bridesmaid']) {
      const list = [...ents.values()].filter(e => e.kind === role);
      for (let i = 0; i < 2; i++) {
        const P = POS[role][i];
        const e = list.find(x => !x.leaving && x.slot === i) || list.find(x => x.leaving && x.slot === i);
        const clap = Math.abs(Math.sin(beat * Math.PI));
        const pose = { bob: -clap * 2, sway: 0, lf: { x: -9, y: 0 }, rf: { x: 9, y: 0 },
          hands: [{ x: -4 - clap * 10, y: -104, bend: 10 }, { x: 4 + clap * 10, y: -104, bend: 10 }] };
        if (e) { e.x = P.x; e.y = P.y; e.s = P.s; items.push({ e, pose }); }
        else items.push({ ghost: role, x: P.x, y: P.y, s: P.s, pose });
      }
    }
    // ---- drummer ----
    {
      const P = POS.drummer;
      const e = [...ents.values()].find(x => x.kind === 'drummer' && !x.leaving) || [...ents.values()].find(x => x.kind === 'drummer');
      const ph = Sfx.drumBeatPhase();
      const active = !!e && !e.leaving;
      let hit = 0, rightUp = 0, leftUp = 0;
      if (active) {
        const step = ph ? ph.step : Math.floor(t * 5), frac = ph ? ph.frac : (t * 5) % 1;
        const isDum = [0, 3, 5].includes(((step - 1) % 7 + 7) % 7);
        hit = 1 - frac;
        if (isDum) rightUp = frac; else leftUp = frac;
        if (now - lastNote > 420) { lastNote = now; notes(P.x - 30, P.y - 190); }
      }
      const pose = { bob: active ? -hit * 2 : 0, sway: 0, lf: { x: -9, y: 0 }, rf: { x: 9, y: 0 },
        hands: [{ x: -26, y: -92 - leftUp * 26, bend: 6 }, { x: 24, y: -96 - rightUp * 30, bend: 6 }] };
      if (e) { e.x = P.x; e.y = P.y; e.s = P.s; items.push({ e, pose, hit }); }
      else items.push({ ghost: 'drummer', x: P.x, y: P.y, s: P.s, pose, hit: 0 });
    }

    // toast: everyone (except the busy drummer) raises a glass
    const tk = toastK(now);
    if (tk > 0) {
      const el = (now - toastStart) / 1000;
      const cycle = Math.floor((el - 0.45) / CLINK_PERIOD);
      const clinkNow = el > 0.45 && cycle !== lastClinkCycle && now < toastEnd;
      if (clinkNow) { lastClinkCycle = cycle; Sfx.clink(); }
      for (const it of items) if (!it.ghost && it.e.kind !== 'drummer') raiseGlass(it, tk, el, clinkNow);
    }

    // hearts for the happy couple
    if (coupleSince && now - lastHeart > 900) { lastHeart = now; hearts(561, 830, 2, 16); }
    if (party && now - lastConf > 300) { lastConf = now; confetti(6); }

    // depth sort & draw
    items.sort((a, b) => (a.e ? a.e.y : a.y) - (b.e ? b.e.y : b.y));
    for (const it of items) drawItem(ctx, it, now, t);

    // money pile in front of the dancers' feet
    ctx.drawImage(pileCanvas, 0, pileTop);

    updateParticles(dt, t);
    requestAnimationFrame(frame);
  }

  const GHOST_INFO = { bride: 'nusja', groom: 'dhendri', bestman: 'shok', bridesmaid: 'shoqja', drummer: 'tupan' };

  function drawItem(c, it, now, t) {
    const ghost = !!it.ghost;
    const e = it.e;
    const kind = ghost ? it.ghost : e.kind;
    const x = ghost ? it.x : e.x, y = ghost ? it.y : e.y;
    let s = ghost ? it.s : e.s;
    let alpha = 1, jump = 0;
    if (!ghost) {
      const age = now - e.born;
      const k = clamp(age / 450, 0, 1);
      s *= age < 450 ? Math.max(0.01, easeOutBack(k)) : 1;
      alpha = k;
      if (e.leaving) alpha = clamp(1 - (now - e.leaving) / 450, 0, 1);
      if (e.jumpT) {
        const jk = (now - e.jumpT) / 650;
        if (jk < 1) jump = Math.sin(jk * Math.PI) * 70; else e.jumpT = 0;
      }
    } else {
      alpha = 0.26 + 0.08 * Math.sin(t * 2.5);
    }

    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y - jump);
    c.scale(s, s);

    const pose = it.pose;
    let headY = -167 + pose.bob, R = 29;
    if (kind === 'groom' || kind === 'bride') R = 31;

    if (kind === 'dancer') {
      if (e.gender) drawWoman(c, PAL.woman, pose); else drawMan(c, PAL.man, pose);
    } else if (kind === 'groom') drawSuit(c, ghost ? ghostPal(PAL.groom) : PAL.groom, pose);
    else if (kind === 'bride') drawBride(c, ghost ? ghostPal(PAL.bride) : PAL.bride, pose, ghost);
    else if (kind === 'bestman') drawSuit(c, ghost ? ghostPal(PAL.bestman) : PAL.bestman, pose);
    else if (kind === 'bridesmaid') drawWoman(c, ghost ? ghostPal(PAL.bridesmaid) : PAL.bridesmaid, pose);
    else if (kind === 'drummer') {
      const pal = ghost ? ghostPal(PAL.man) : PAL.man;
      drawMan(c, pal, pose, { drum: ghost ? null : () => drawDrum(c, pose, it.hit) });
    }

    let topY;
    if (ghost) {
      c.setLineDash([6, 5]); c.lineWidth = 3; c.strokeStyle = GHOST_COLOR;
      c.beginPath(); c.arc(0, headY, R, 0, TAU); c.stroke(); c.setLineDash([]);
      c.globalAlpha = 0.85;
      const g = state?.config.gifts.find(x => x.key === GHOST_INFO[kind]);
      c.font = `${R * 1.15}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#fff';
      c.fillText(g ? g.icon : '?', 0, headY + 2);
      if (g) {
        c.globalAlpha = 0.95;
        c.font = `800 18px ${FONT}`;
        const label = `${g.gift}`, w = c.measureText(label).width + 18;
        c.fillStyle = 'rgba(10,2,3,.75)'; rrect(c, -w / 2, 10, w, 26, 13); c.fill();
        c.fillStyle = '#f6c544'; c.fillText(label, 0, 24);
      }
      c.restore();
      return;
    }

    const isKumbari = state && e.user.id === state.kumbari;
    const ring = kind === 'bride' ? '#ffd1e3' : kind === 'groom' ? '#f6c544' : isKumbari ? '#f6c544' : kind === 'bestman' ? '#7bd5ff' : kind === 'bridesmaid' ? '#ff9cc8' : '#ffffff';
    drawHead(c, e.user, 0, headY, R, ring);
    if (kind === 'dancer' && !e.gender) drawQeleshe(c, headY - R + 5, false);
    if (kind === 'dancer' && e.gender) drawCoinBand(c, headY - R - 2, R);
    if (kind === 'drummer') drawQeleshe(c, headY - R + 5, false);
    if (kind === 'bestman') { drawQeleshe(c, headY - R + 5, false); drawMustache(c, headY + R * 0.2, R); }
    if (kind === 'bride') drawTiara(c, headY - R + 3);
    if (kind === 'bridesmaid') drawFlowerCrown(c, headY - R + 2);

    topY = headY - R - (kind === 'bride' ? 14 : 10);
    topY = nameTag(c, e.user.name, topY, 1, isKumbari) - 4;
    if (isKumbari) { drawCrown(c, 0, topY - 12, 30); topY -= 28; }
    if (e.bubble) {
      const age = now - e.bubble.t;
      if (age > 4000) e.bubble = null;
      else bubble(c, e.bubble.text, topY, 1, clamp((4000 - age) / 400, 0, 1) * clamp(age / 150, 0, 1));
    }
    c.restore();
  }

  // -----------------------------------------------------------
  // Public API
  // -----------------------------------------------------------
  function init() {
    drawBackground();
    drawFlagTexture();
    requestAnimationFrame(frame);
  }

  return {
    init,
    sync,
    chat(userId, text, jump) {
      for (const e of entsOf(userId)) {
        e.bubble = { text, t: performance.now() };
        if (jump) { e.jumpT = performance.now(); Sfx.jump(); }
      }
    },
    money(n, user) {
      money(n, 560, 380);
      const e = user && entsOf(user.id)[0];
      if (e) moneyBurst(e.x, e.y - 160 * e.s, Math.min(20, n));
    },
    confetti,
    fireworks,
    likes: likeHearts,
    hearts,
    sparkleUser(userId) { for (const e of entsOf(userId)) sparks(e.x, e.y - 160 * e.s, 30); },
    clearPile() { pileCanvas.getContext('2d').clearRect(0, 0, W, 300); heights.fill(0); },
    isParty: () => party,
    toast(seconds, text) {
      startToast(seconds);
      const people = [...ents.values()].filter(e => !e.leaving && e.kind !== 'drummer');
      people.sort(() => Math.random() - 0.5).slice(0, 6).forEach((e, i) => {
        setTimeout(() => { e.bubble = { text, t: performance.now() }; }, 400 + i * 450);
      });
    },
  };
})();
