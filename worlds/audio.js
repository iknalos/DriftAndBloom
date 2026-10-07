// Drift & Bloom — sound. One Web Audio graph shared by the pond and the side worlds.
//
//   DABAudio.play('swing', { vol, rate, pan })   one-shot effect (a random variant, a
//                                                 touch of pitch jitter so repeats don't drone)
//   DABAudio.preload(['cut', 'hurt', ...])        decode ahead (worlds do this on enter)
//   DABAudio.music('music_animal')                crossfade to a looping track (null = silence)
//   DABAudio.loop('lava_loop', 0.3) -> {stop()}   an ambient bed
//   DABAudio.duck(on)                             music down while paused
//   DABAudio.muted() / setMuted(b) / toggle()     saved in localStorage 'dab_sound'
//
// Browsers (iOS above all) only allow audio after a user gesture, so the context is
// created / resumed on the first touch, click or key. Files: assets/worlds/audio/*.mp3,
// built by tools/assets/audio_build.py from CC0 sources (credits in CREDITS.json).
(function () {
  const BASE = 'assets/worlds/audio/';
  const VARIANTS = {
    swing: ['swing1', 'swing2', 'swing3'], cut: ['cut1', 'cut2'], hurt: ['hurt', 'hurt2'], jump: ['jump', 'jump2'],
    land: ['land', 'land2'], growl: ['growl1', 'growl2', 'growl3'], laser: ['laser', 'laser2'], explode: ['explode', 'explode2'],
    hop: ['hop', 'hop2'], bow_draw: ['bow_draw', 'bow_draw2']
  };
  const MIN_GAP = 0.035;                 // the same sound can't restart faster than this
  const MAX_VOICES = 20;
  const MUSIC_VOL = 0.5, SFX_VOL = 0.9, XF = 2.5;

  let ctx = null, master = null, sfxBus = null, musicBus = null, voices = 0;
  const buffers = {}, loading = {}, lastAt = {};
  let isMuted = false;
  try { isMuted = localStorage.getItem('dab_sound') === 'off'; } catch (e) { }
  let want = null, cur = null, ducked = false;
  const stats = { played: {}, music: null };              // for tests: what actually sounded

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended' && !isMuted && !document.hidden) ctx.resume().catch(() => { }); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = isMuted ? 0 : 1; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(master);
    if (want) startTrack(want, 1.2);
    return ctx;
  }
  const unlock = () => { ensure(); };
  for (const ev of ['pointerdown', 'touchend', 'keydown', 'click']) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => { }); else if (!isMuted) ctx.resume().catch(() => { });
  });

  function load(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    if (loading[name]) return loading[name];
    if (!ensure()) return Promise.resolve(null);
    loading[name] = fetch(BASE + name + '.mp3').then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then(ab => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))   // callback form: old Safari
      .then(b => (buffers[name] = b)).catch(() => null);
    return loading[name];
  }
  function preload(names) {
    for (const n of names || []) for (const v of VARIANTS[n] || [n]) load(v);
  }

  function play(name, o) {
    if (isMuted || !ensure() || ctx.state !== 'running') { if (ctx) preload([name]); return; }
    o = o || {};
    const vs = VARIANTS[name] || [name], v = vs[(Math.random() * vs.length) | 0];
    const b = buffers[v];
    if (!b) { load(v); return; }
    const now = ctx.currentTime;
    if (now - (lastAt[name] || -1) < (o.gap || MIN_GAP) || voices >= MAX_VOICES) return;
    lastAt[name] = now;
    const s = ctx.createBufferSource(); s.buffer = b;
    s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.jitter === undefined ? 0.08 : o.jitter));
    const g = ctx.createGain(); g.gain.value = o.vol === undefined ? 1 : o.vol;
    let out = g;
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); out = p; }
    s.connect(g); out.connect(sfxBus);
    voices++; s.onended = () => { voices--; };
    s.start(now);
    stats.played[name] = (stats.played[name] || 0) + 1;
  }

  function loop(name, vol) {
    const h = { src: null, g: null, stopped: false, stop(fade) {
      this.stopped = true;
      if (this.g && ctx) { const t = ctx.currentTime; this.g.gain.cancelScheduledValues(t); this.g.gain.setValueAtTime(this.g.gain.value, t); this.g.gain.linearRampToValueAtTime(0, t + (fade || 0.6)); }
      if (this.src) try { this.src.stop(ctx.currentTime + (fade || 0.6) + 0.05); } catch (e) { }
    } };
    load(name).then(b => {
      if (!b || h.stopped || !ctx) return;
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(vol || 0.4, ctx.currentTime + 1.2);
      s.connect(g); g.connect(sfxBus); s.start();
      h.src = s; h.g = g;
    });
    return h;
  }

  // music: one track at a time, looped by crossfading into a fresh copy before it ends
  // our own composed tracks (tools/assets/music_gen.py) are exact loops: sample-accurate looping, no crossfade
  const EXACT = new Set(['music_frost', 'music_moonbeat', 'music_stream', 'music_thief', 'music_bombs', 'music_duel']);
  function startTrack(name, fadeIn) {
    if (!ctx) return;
    const b = buffers[name];
    if (!b) { load(name).then(() => { if (want === name && (!cur || cur.name !== name)) startTrack(name, fadeIn); }); return; }
    const t = ctx.currentTime;
    if (cur) fadeOut(cur, Math.max(0.4, fadeIn));
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + Math.max(0.01, fadeIn));
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(g); g.connect(musicBus);
    const exact = EXACT.has(name), off = Math.max(0, Math.min(b.duration - 0.05, startOffset || 0));
    startOffset = 0;
    if (exact) s.loop = true;
    s.start(t, off);
    cur = { name, s, g, start: t - off, dur: b.duration, exact }; stats.music = name;
  }
  let startOffset = 0;
  function fadeOut(tr, d) {
    const t = ctx.currentTime;
    tr.g.gain.cancelScheduledValues(t); tr.g.gain.setValueAtTime(tr.g.gain.value, t); tr.g.gain.linearRampToValueAtTime(0, t + d);
    try { tr.s.stop(t + d + 0.05); } catch (e) { }
  }
  setInterval(() => {
    if (!ctx || !cur || ctx.state !== 'running') return;
    if (!cur.exact && ctx.currentTime > cur.start + cur.dur - XF - 0.1) startTrack(cur.name, XF);   // seamless-ish loop
  }, 250);
  // music(name, { restart: true (from the top even if playing), xf: fade-in seconds })
  function music(name, o) {
    o = o || {};
    if (want === name && !o.restart) return;
    want = name;
    if (!ctx) return;                                   // starts on the first gesture
    if (!name) { if (cur) { fadeOut(cur, 1.2); cur = null; } return; }
    startOffset = o.offset || 0;                       // start part-way in (resync after a pause)
    startTrack(name, o.xf === undefined ? 1.2 : o.xf);
  }
  // seconds into the current track (looping), or null when nothing is playing yet
  function musicTime() {
    if (!ctx || !cur || cur.name !== want || ctx.state !== 'running') return null;
    const e = ctx.currentTime - cur.start;
    return e < 0 ? null : (cur.exact ? e % cur.dur : e);
  }
  function duck(on) {
    if (!musicBus || ducked === !!on) return;
    ducked = !!on;
    const t = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(on ? MUSIC_VOL * 0.3 : MUSIC_VOL, t + 0.3);
  }
  function setMuted(m) {
    isMuted = !!m;
    try { localStorage.setItem('dab_sound', isMuted ? 'off' : 'on'); } catch (e) { }
    if (ensure()) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(isMuted ? 0 : 1, t + 0.15);
      if (!isMuted) ctx.resume().catch(() => { });
    }
    return isMuted;
  }

  window.DABAudio = { play, preload, load, music, musicTime, loop, duck, muted: () => isMuted, setMuted, toggle: () => setMuted(!isMuted), ensure, stats };
})();
