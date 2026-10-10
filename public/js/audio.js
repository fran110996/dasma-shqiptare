// =============================================================
// audio.js — synthesized SFX (no audio files needed) + tupan
// drum loop in Balkan 7/8 + optional background music playlist.
// =============================================================

const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let volume = 0.7;
  let drumUntil = 0, drumFast = false, nextStep = 0, step = 0, drumTimer = null;
  const music = new Audio();
  let playlist = [], track = 0, musicOn = true;
  const eventAudio = new Audio();
  let eventUntil = 0, eventFade = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  const ready = () => ctx && ctx.state === 'running';

  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(t, freq, dur, type = 'sine', peak = 0.3, freqEnd = null, dest = master) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    env(g, t, 0.005, peak, dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(t, dur, peak, filterType, freq, q = 1, freqEnd = null) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    env(g, t, 0.003, peak, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // Tupan: deep mallet "DUM" + thin switch "tak"
  function dum(t, accent = 1) {
    tone(t, 150, 0.45, 'sine', 0.9 * accent, 48);
    noise(t, 0.05, 0.25 * accent, 'lowpass', 900);
  }
  function tak(t, accent = 1) {
    noise(t, 0.045, 0.32 * accent, 'highpass', 2500);
    tone(t, 420, 0.04, 'triangle', 0.08 * accent, 300);
  }

  // 7/8 (3+2+2): DUM tak tak | DUM tak | DUM tak
  const PATTERN = [['D', 1], ['t', .7], ['t', .9], ['D', .8], ['t', .8], ['D', .8], ['t', .9]];

  function scheduler() {
    if (!ready()) return;
    const now = ctx.currentTime;
    if (Date.now() > drumUntil) { nextStep = 0; return; }
    if (nextStep < now) { nextStep = now + 0.05; step = 0; }
    const stepDur = drumFast ? 0.165 : 0.2;
    while (nextStep < now + 0.15) {
      const [kind, acc] = PATTERN[step % PATTERN.length];
      if (kind === 'D') dum(nextStep, acc); else tak(nextStep, acc);
      if (step % 2 === 1 && Math.random() < 0.35) tak(nextStep + stepDur / 2, 0.45); // ghost notes
      nextStep += stepDur;
      step++;
    }
  }

  const api = {
    unlock() {
      ensure();
      if (ctx.state !== 'running') ctx.resume();
      if (musicOn && playlist.length && music.paused) music.play().catch(() => {});
      if (!drumTimer) drumTimer = setInterval(scheduler, 25);
      return ctx.state === 'running';
    },
    isRunning: () => ready(),
    setVolume(v) {
      volume = v;
      if (master) master.gain.value = v;
      music.volume = Math.min(1, v * 0.55);
    },
    drum(untilMs, fast = false) { drumUntil = eventUntil > Date.now() ? 0 : untilMs; drumFast = fast; },

    // Event song (KRUSHQIT): starts at `start` seconds, fades out at the end, then the playlist resumes
    playEvent(url, start, seconds) {
      const now = Date.now();
      eventUntil = now + seconds * 1000;
      drumUntil = 0;
      const resumeMusic = !music.paused;
      music.pause();
      eventAudio.src = url;
      eventAudio.currentTime = 0;
      const go = () => {
        try { eventAudio.currentTime = start; } catch (_) {}
        eventAudio.volume = Math.min(1, volume * 0.9);
        if (ready()) eventAudio.play().catch(() => {});
      };
      if (eventAudio.readyState >= 1) go(); else eventAudio.addEventListener('loadedmetadata', go, { once: true });
      clearInterval(eventFade);
      eventFade = setInterval(() => {
        const left = eventUntil - Date.now();
        if (left <= 0) {
          clearInterval(eventFade);
          eventAudio.pause();
          if (resumeMusic && musicOn) music.play().catch(() => {});
        } else if (left < 2000) {
          eventAudio.volume = Math.max(0, Math.min(1, volume * 0.9) * (left / 2000));
        }
      }, 100);
    },
    // current position in the event song (null when none is playing) → used to dance on the beat
    eventSongTime: () => (Date.now() < eventUntil && !eventAudio.paused ? eventAudio.currentTime : null),
    setFast(fast) { drumFast = fast; },
    drumBeatPhase() {
      // 0..1 position within current drum step (for the drummer animation)
      if (!ready() || Date.now() > drumUntil) return null;
      const stepDur = drumFast ? 0.165 : 0.2;
      return { step, frac: 1 - Math.max(0, Math.min(1, (nextStep - ctx.currentTime) / stepDur)) };
    },

    pop() { if (!ready()) return; const t = ctx.currentTime; tone(t, 520, 0.12, 'sine', 0.25, 1100); },
    join() { if (!ready()) return; const t = ctx.currentTime; tone(t, 880, 0.18, 'triangle', 0.12); tone(t + 0.07, 1320, 0.22, 'triangle', 0.1); },
    jump() { if (!ready()) return; const t = ctx.currentTime; tone(t, 260, 0.22, 'sine', 0.25, 620); },
    cash() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [2093, 2637, 3136, 2637, 3520].forEach((f, i) => tone(t + i * 0.045, f, 0.25, 'triangle', 0.12));
      noise(t, 0.35, 0.1, 'highpass', 6000);
      tone(t, 110, 0.15, 'square', 0.08, 70);
    },
    whoosh() { if (!ready()) return; noise(ctx.currentTime, 0.5, 0.35, 'bandpass', 300, 1.2, 3500); },
    fanfare() {
      if (!ready()) return;
      const t = ctx.currentTime;
      const brass = (time, f, d, p = 0.16) => {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, time); lp.frequency.linearRampToValueAtTime(3200, time + 0.08);
        lp.connect(master);
        tone(time, f, d, 'sawtooth', p, null, lp);
        tone(time, f * 1.005, d, 'sawtooth', p * 0.6, null, lp);
      };
      [523.25, 659.25, 783.99].forEach((f, i) => brass(t + i * 0.12, f, 0.18));
      [523.25, 659.25, 783.99, 1046.5].forEach(f => brass(t + 0.38, f, 0.9, 0.11));
      dum(t + 0.38, 1);
    },
    // glasses clinking: a few quick bright "tings"
    clink() {
      if (!ready()) return;
      const t = ctx.currentTime;
      for (const [dt, base] of [[0, 2960], [0.05, 3340], [0.11, 2790]]) {
        tone(t + dt, base, 0.7, 'sine', 0.09);
        tone(t + dt, base * 2.71, 0.35, 'sine', 0.03);
      }
    },
    chime() {
      if (!ready()) return;
      const t = ctx.currentTime;
      [1318.5, 1760, 2093, 2637].forEach((f, i) => tone(t + i * 0.09, f, 0.8, 'sine', 0.12));
    },
    applause(dur = 2.2) {
      if (!ready()) return;
      const t = ctx.currentTime;
      for (let i = 0; i < dur * 70; i++) {
        const at = t + Math.random() * dur, fade = 1 - (at - t) / dur;
        noise(at, 0.03 + Math.random() * 0.03, 0.12 * fade + 0.02, 'bandpass', 1200 + Math.random() * 1800, 0.9);
      }
      noise(t, dur, 0.06, 'bandpass', 900, 0.5);
    },

    // Background music: files from /public/music (optional)
    async loadMusic(list) {
      // random order so every LIVE doesn't start with the same song
      playlist = [...(list || [])].sort(() => Math.random() - 0.5);
      track = 0;
      if (!playlist.length) return null;
      music.src = playlist[0].url;
      music.volume = Math.min(1, volume * 0.55);
      music.onended = () => api.nextTrack();
      music.onplay = music.onpause = () => api.onTrack && api.onTrack(playlist[track]);
      return playlist[0];
    },
    setMusic(on) {
      musicOn = on;
      if (!on) music.pause();
      else if (playlist.length && ready()) music.play().catch(() => {});
    },
    // controls (driven from the control panel)
    playIndex(i) {
      if (!playlist.length) return;
      track = ((i % playlist.length) + playlist.length) % playlist.length;
      music.src = playlist[track].url;
      musicOn = true;
      if (ready()) music.play().catch(() => {});
      api.onTrack && api.onTrack(playlist[track]);
    },
    nextTrack() { api.playIndex(track + 1); },
    prevTrack() { api.playIndex(track - 1); },
    playUrl(url) { const i = playlist.findIndex(t => t.url === url); if (i >= 0) api.playIndex(i); },
    togglePause() {
      if (!playlist.length) return;
      if (music.paused) { musicOn = true; if (ready()) music.play().catch(() => {}); }
      else music.pause();
    },
    isPaused: () => music.paused,
    currentTrack: () => (playlist.length && musicOn ? playlist[track] : null),
    onTrack: null,
  };
  return api;
})();
