// Fully procedural soundscape (Web Audio API). No recordings are used.
// Starts only after a user gesture. Birds, wind in trees, water near lakes, distant animal
// calls, faint visitor murmur near gates, and bicycle freewheel / tyre noise.
export class Soundscape {
  constructor() { this.ctx = null; this.vol = 0.7; this.muted = false; this.p = { speed: 0, water: 0, crowd: 0, forest: 0.5, near: null }; }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    window.__soundscape = this;
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.vol, c.currentTime + 2.5);
    this.rev = c.createConvolver(); this.rev.buffer = this._impulse(2.6, 3); const rg = c.createGain(); rg.gain.value = 0.35; this.rev.connect(rg).connect(this.master);
    const noise = this._noiseBuf(4);
    const loop = (filterType, freq, q, gain) => { const s = c.createBufferSource(); s.buffer = noise; s.loop = true; const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(this.master); s.start(); return { f, g }; };
    this.wind = loop('lowpass', 500, 0.5, 0.08);         // wind through trees, gusting
    this.leaves = loop('highpass', 3500, 0.3, 0.012);    // leaf rustle
    this.water = loop('bandpass', 1300, 0.7, 0);         // lapping / babbling water
    this.crowd = loop('bandpass', 420, 1.2, 0);          // distant visitor murmur
    this.tyre = loop('bandpass', 260, 0.8, 0);           // tyre on road
    const lfo = c.createOscillator(); lfo.frequency.value = 0.09; const lg = c.createGain(); lg.gain.value = 260; lfo.connect(lg).connect(this.wind.f.frequency); lfo.start();
    this._schedule('bird', 300, 2500); this._schedule('koel', 8000, 22000); this._schedule('call', 15000, 40000); this._schedule('tick', 200, 200);
  }
  _noiseBuf(sec) { const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = w * 0.5 + last * 2; } return b; }
  _impulse(sec, decay) { const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); } return b; }
  _schedule(kind, a, b) { const go = () => { try { this[kind](); } catch (e) { /* ignore */ } setTimeout(go, a + Math.random() * (b - a)); }; setTimeout(go, a + Math.random() * (b - a)); }
  _env(g, t, peak, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _pan(v) { const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain(); if (p.pan) p.pan.value = v; return p; }
  bird() {   // small songbird chirps (bulbul / sunbird-like phrases)
    if (this.p.forest < 0.1) return;
    const c = this.ctx, t = c.currentTime, n = 2 + Math.floor(Math.random() * 6), base = 2200 + Math.random() * 2600, pan = this._pan(Math.random() * 1.6 - 0.8);
    pan.connect(this.master); pan.connect(this.rev);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * (0.07 + Math.random() * 0.08), o = c.createOscillator(), g = c.createGain();
      const f0 = base * (0.85 + Math.random() * 0.4); o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.35 : 0.75), t0 + 0.06);
      this._env(g, t0, 0.025 * this.p.forest, 0.008, 0.07); o.connect(g).connect(pan); o.start(t0); o.stop(t0 + 0.1);
    }
  }
  koel() {   // the rising "ku-oo" call of the Asian koel, common around Visakhapatnam
    const c = this.ctx, t = c.currentTime, reps = 2 + Math.floor(Math.random() * 4), pan = this._pan(Math.random() * 1.4 - 0.7); pan.connect(this.master); pan.connect(this.rev);
    for (let i = 0; i < reps; i++) {
      const t0 = t + i * 0.75, f0 = 520 + i * 40;
      for (const [dt, a, b2] of [[0, f0, f0 * 1.05], [0.22, f0 * 1.12, f0 * 1.45]]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(a, t0 + dt); o.frequency.linearRampToValueAtTime(b2, t0 + dt + 0.3); this._env(g, t0 + dt, 0.035, 0.03, 0.3); o.connect(g).connect(pan); o.start(t0 + dt); o.stop(t0 + dt + 0.4); }
    }
  }
  call() {   // a distant, heavily reverberated low animal call (deliberately generic)
    const c = this.ctx, t = c.currentTime, dur = 1.2 + Math.random(), o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    const f0 = 70 + Math.random() * 60; o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.4, t + dur * 0.3); o.frequency.exponentialRampToValueAtTime(f0 * 0.7, t + dur);
    o2.type = 'sine'; o2.frequency.value = f0 / 2; f.type = 'lowpass'; f.frequency.value = 380;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.rev); o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  hyenaCackle(panX = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const pan = this._pan(Math.max(-0.9, Math.min(0.9, panX)));
    pan.connect(this.master); pan.connect(this.rev);

    // 1. Rising-falling whoop call
    const whoopO = c.createOscillator(), whoopG = c.createGain(), whoopF = c.createBiquadFilter();
    whoopO.type = 'sawtooth';
    whoopF.type = 'bandpass'; whoopF.frequency.value = 520; whoopF.Q.value = 2.4;
    whoopO.frequency.setValueAtTime(280, t);
    whoopO.frequency.exponentialRampToValueAtTime(620, t + 0.22);
    whoopO.frequency.exponentialRampToValueAtTime(310, t + 0.48);
    this._env(whoopG, t, 0.05, 0.08, 0.40);
    whoopO.connect(whoopF).connect(whoopG).connect(pan);
    whoopO.start(t); whoopO.stop(t + 0.52);

    // 2. Rapid staccato laughing cackles (4-7 chuckles)
    const bursts = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < bursts; i++) {
      const t0 = t + 0.35 + i * (0.075 + Math.random() * 0.03);
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      const baseFreq = 540 + Math.random() * 180 + (i % 2 === 0 ? 60 : -40);
      o.type = 'sawtooth';
      f.type = 'bandpass'; f.frequency.value = baseFreq * 1.2; f.Q.value = 3.0;
      o.frequency.setValueAtTime(baseFreq, t0);
      o.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, t0 + 0.025);
      o.frequency.exponentialRampToValueAtTime(baseFreq * 0.85, t0 + 0.06);
      this._env(g, t0, 0.045, 0.008, 0.055);
      o.connect(f).connect(g).connect(pan);
      o.start(t0); o.stop(t0 + 0.075);
    }
  }
  dholeWhistle(panX = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const pan = this._pan(Math.max(-0.9, Math.min(0.9, panX)));
    pan.connect(this.master); pan.connect(this.rev);

    // Dhole bird-like pure-tone whistling chirps ('whistling hunter')
    const chirps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < chirps; i++) {
      const t0 = t + i * (0.12 + Math.random() * 0.06);
      const o = c.createOscillator(), g = c.createGain();
      const f0 = 2400 + i * 180 + Math.random() * 200;
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.linearRampToValueAtTime(f0 * 1.22, t0 + 0.045);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, t0 + 0.09);
      this._env(g, t0, 0.035, 0.015, 0.075);
      o.connect(g).connect(pan);
      o.start(t0); o.stop(t0 + 0.11);
    }
  }
  lionRoar(panX = 0, dist = 1.0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime;
    const atten = Math.max(0.08, Math.min(1.0, 1.0 - (dist / 80.0)));
    const vol = this.vol * atten;
    const pan = this._pan(Math.max(-0.9, Math.min(0.9, panX)));
    pan.connect(this.master); pan.connect(this.rev);

    // 1. Infrasonic / Sub-bass chest rumble (ground-shaking 45Hz - 68Hz)
    const subO = c.createOscillator(), subG = c.createGain(), subF = c.createBiquadFilter();
    subO.type = 'sine';
    subF.type = 'lowpass'; subF.frequency.value = 115;
    subO.frequency.setValueAtTime(46, t);
    subO.frequency.linearRampToValueAtTime(64, t + 0.8);
    subO.frequency.linearRampToValueAtTime(52, t + 2.4);
    subO.frequency.exponentialRampToValueAtTime(36, t + 4.2);
    this._env(subG, t, 0.38 * vol, 0.35, 3.8);
    subO.connect(subF).connect(subG).connect(pan);
    subO.start(t); subO.stop(t + 4.5);

    // 2. Guttural open-throat rasp with AM vocal fold flutter
    const raspO = c.createOscillator(), raspG = c.createGain(), raspF = c.createBiquadFilter();
    raspO.type = 'sawtooth';
    raspF.type = 'bandpass';
    raspF.frequency.setValueAtTime(320, t);
    raspF.frequency.linearRampToValueAtTime(460, t + 1.1);
    raspF.frequency.linearRampToValueAtTime(280, t + 3.0);
    raspF.Q.value = 2.5;

    raspO.frequency.setValueAtTime(76, t);
    raspO.frequency.linearRampToValueAtTime(108, t + 0.9);
    raspO.frequency.linearRampToValueAtTime(82, t + 2.7);
    raspO.frequency.exponentialRampToValueAtTime(52, t + 4.2);

    this._env(raspG, t, 0.25 * vol, 0.45, 3.6);
    raspO.connect(raspF).connect(raspG).connect(pan);
    raspO.start(t); raspO.stop(t + 4.5);

    // 3. Rhythmic concluding guttural chuffs/groans (4 pulses)
    for (let i = 0; i < 4; i++) {
      const tp = t + 2.8 + i * 0.42;
      const chuffO = c.createOscillator(), chuffG = c.createGain(), chuffF = c.createBiquadFilter();
      chuffO.type = 'sawtooth';
      chuffO.frequency.setValueAtTime(82 - i * 9, tp);
      chuffO.frequency.exponentialRampToValueAtTime(42, tp + 0.28);
      chuffF.type = 'lowpass'; chuffF.frequency.value = 280;
      this._env(chuffG, tp, (0.18 - i * 0.035) * vol, 0.03, 0.24);
      chuffO.connect(chuffF).connect(chuffG).connect(pan);
      chuffO.start(tp); chuffO.stop(tp + 0.32);
    }
  }
  tick() {   // freewheel clicks while coasting
    const s = this.p.speed; if (!this.p.coasting || s < 1) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = 3200; this._env(g, t, 0.006, 0.001, 0.01); o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.02);
  }
  update(p) {
    Object.assign(this.p, p); if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.p.speed;
    this.wind.g.gain.setTargetAtTime(0.06 + s * 0.012 + this.p.forest * 0.03, t, 0.5);
    this.leaves.g.gain.setTargetAtTime(0.006 + this.p.forest * 0.012, t, 0.5);
    this.water.g.gain.setTargetAtTime(this.p.water * 0.05, t, 0.4);
    this.crowd.g.gain.setTargetAtTime(this.p.crowd * 0.025, t, 0.6);
    this.tyre.g.gain.setTargetAtTime(Math.min(0.05, s * 0.007), t, 0.2); this.tyre.f.frequency.setTargetAtTime(180 + s * 40, t, 0.2);
  }
  setVolume(v) { this.vol = v; if (this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }
  setMuted(m) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.2); }
}
