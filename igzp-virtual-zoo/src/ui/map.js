// 2D maps — all generated from the SAME rasterised layout as the 3D world (layers + structures +
// vegetation), so the illustrated map, the live map, the minimap, navigation and teleport agree.
//   'illustrated' : visitor-guide style, north-up, pan / zoom / select
//   'live'        : player-centred, optional heading-up, nearby exhibits with distances
import { ZONES, RESTRICTED } from '../data/zoo-layout.js';
import { SPECIES } from '../data/species.js';
import { toWorld } from '../config.js';
import { clamp, noise2, fbm2, hash2 } from '../core/util.js';

export const ICON = {
  bengal_tiger: '🐅', white_tiger: '🐅', leopard: '🐆', lion: '🦁', small_cat: '🐈', asian_elephant: '🐘', rhino: '🦏', hippopotamus: '🦛',
  giraffe: '🦒', zebra: '🦓', spotted_deer: '🦌', sambar: '🦌', swamp_deer: '🦌', hog_deer: '🦌', barking_deer: '🦌', nilgai: '🦌', blackbuck: '🦌',
  indian_gaur: '🐃', wild_boar: '🐗', himalayan_black_bear: '🐻', sun_bear: '🐻', sloth_bear: '🐻', grey_wolf: '🐺', dhole: '🐕', golden_jackal: '🐕', striped_hyena: '🐕',
  chimpanzee: '🦍', rhesus_macaque: '🐒', bonnet_macaque: '🐒', stump_tailed_macaque: '🐒', marmoset: '🐒', ring_tailed_lemur: '🐒', hamadryas_baboon: '🐒', giant_squirrel: '🐿️',
  ostrich: '🐦', emu: '🐦', pelican: '🐦', swan: '🦢', sarus_crane: '🐦', pheasant: '🦚', birds_of_prey: '🦅', african_parrot: '🦜', lovebird: '🦜',
  mugger: '🐊', saltwater_crocodile: '🐊', gharial: '🐊', bengal_monitor: '🦎', water_monitor: '🦎', green_iguana: '🦎', rat_snake: '🐍', indian_cobra: '🐍', rock_python: '🐍', star_tortoise: '🐢', terrapin: '🐢',
};

export class ZooMap {
  constructor(layers, structures, veg, onSelect) {
    this.L = layers; this.S = structures; this.V = veg; this.onSelect = onSelect;
    this.el = document.getElementById('map'); this.cv = document.getElementById('mapCanvas'); this.ctx = this.cv.getContext('2d');
    this.K = 1.6;                     // illustrated base: pixels per metre
    this.base = this._illustrate();
    this.mode = 'illustrated'; this.headingUp = false;
    this.scale = 1; this.cx = 0; this.cz = 30; this.route = null; this.dest = null; this.player = { x: 0, z: 0, yaw: 0 }; this.sel = null;
    this._bind();
  }
  // ------------------------------------------------------------- illustrated base (rendered once)
  _illustrate() {
    const L = this.L, K = this.K, Wm = L.W * L.R, Hm = L.H * L.R, cv = document.createElement('canvas');
    cv.width = Math.round(Wm * K); cv.height = Math.round(Hm * K);
    const g = cv.getContext('2d'), X = x => (x - L.x0) * K, Z = z => (z - L.z0) * K;
    // 1. ground: paper + grassland + forest tint, from the world's own height / forest fields
    const lw = L.W, lh = L.H, img = g.createImageData(lw, lh), d = img.data;
    for (let v = 0; v < lh; v++) for (let u = 0; u < lw; u++) {
      const i = v * lw + u, x = L.x0 + (u + 0.5) * L.R, z = L.z0 + (v + 0.5) * L.R, h = L.heightAt(x, z), fo = Math.min(1, L.forestness(x, z) + Math.max(0, (h - 7) / 12));
      const n = noise2(x * 0.02, z * 0.02) * 0.1 + noise2(x * 0.15, z * 0.15) * 0.04;
      let r = 205 - 20 * n * 10, gg = 214 - 10 * n * 10, b = 160;                              // light meadow green
      r = r * (1 - fo) + 78 * fo; gg = gg * (1 - fo) + 128 * fo; b = b * (1 - fo) + 70 * fo;    // forest green
      const m = L.mask[i * 4 + 2]; if (m > 40) { r = 232; gg = 196; b = 140; }                   // enclosure sand
      d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    }
    const tmp = document.createElement('canvas'); tmp.width = lw; tmp.height = lh; tmp.getContext('2d').putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, cv.width, cv.height);
    // paper vignette
    const vg = g.createRadialGradient(cv.width / 2, cv.height / 2, cv.height * 0.3, cv.width / 2, cv.height / 2, cv.width * 0.75);
    vg.addColorStop(0, 'rgba(255,248,225,0)'); vg.addColorStop(1, 'rgba(236,224,190,0.85)'); g.fillStyle = vg; g.fillRect(0, 0, cv.width, cv.height);
    // 2. enclosure outlines
    for (const en of L.enclosures) { g.beginPath(); en.poly.forEach(([x, z], k) => (k ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.closePath(); g.fillStyle = 'rgba(232,190,128,0.85)'; g.fill(); g.strokeStyle = 'rgba(150,105,55,0.7)'; g.lineWidth = 1.5; g.stroke(); }
    // 3. water: soft blue with lighter ripple strokes and a darker bank line
    const wimg = g.createImageData(lw, lh), wd = wimg.data;
    for (let i = 0; i < lw * lh; i++) { const w = L.waterRaw[i]; if (w > 0.4) { const x = L.x0 + (i % lw + 0.5) * L.R, z = L.z0 + (((i / lw) | 0) + 0.5) * L.R, k = 0.85 + 0.15 * noise2(x * 0.05, z * 0.05); wd[i * 4] = 70 * k; wd[i * 4 + 1] = 168 * k; wd[i * 4 + 2] = 196 * k; wd[i * 4 + 3] = 255; } }
    const wt = document.createElement('canvas'); wt.width = lw; wt.height = lh; wt.getContext('2d').putImageData(wimg, 0, 0);
    g.save(); g.shadowColor = 'rgba(30,80,110,0.8)'; g.shadowBlur = 4; g.drawImage(wt, 0, 0, cv.width, cv.height); g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    for (let k = 0; k < 900; k++) { const x = L.x0 + hash2(k, 1) * Wm, z = L.z0 + hash2(k, 2) * Hm; if (L.sample(L.waterRaw, x, z) > 0.7) { g.beginPath(); g.moveTo(X(x) - 5, Z(z)); g.quadraticCurveTo(X(x), Z(z) - 3, X(x) + 5, Z(z)); g.stroke(); } }
    // 4. trees: illustrated round canopies, sampled from the real vegetation (forest = dense scallops)
    const trees = []; for (const grp of this.V.groups) for (let i = 0; i < grp.items.length; i += (grp.type.startsWith('bush') || grp.type === 'shrub') ? 9 : 3) trees.push([grp.items[i], grp.type]);
    trees.sort((a, b) => a[0].z - b[0].z);
    for (const [it, type] of trees) {
      const x = X(it.x), y = Z(it.z), r = (type === 'rain' ? 7 : type.startsWith('bush') || type === 'shrub' ? 3.2 : 5) * (0.8 + hash2(it.x | 0, it.z | 0) * 0.4);
      const col = type === 'gulmohar' ? ['#b8452c', '#d9643a'] : type === 'palm' ? ['#5c8a34', '#7fae48'] : ['#3f6e2c', '#5f9a3c'];
      g.fillStyle = 'rgba(40,60,25,0.28)'; g.beginPath(); g.ellipse(x + 1.5, y + 2, r, r * 0.8, 0, 0, 6.28); g.fill();
      g.fillStyle = col[0]; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
      g.fillStyle = col[1]; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.6, 0, 6.28); g.fill();
    }
    // 5. roads (grey with light casing) and walking paths (orange), drawn from the walkable mask
    const road = g.createImageData(lw, lh), rd = road.data, path = g.createImageData(lw, lh), pd = path.data;
    for (let i = 0; i < lw * lh; i++) { const R = L.mask[i * 4], G = L.mask[i * 4 + 1]; if (R > 110) { rd[i * 4] = 110; rd[i * 4 + 1] = 110; rd[i * 4 + 2] = 108; rd[i * 4 + 3] = 255; } else if (G > 110) { pd[i * 4] = 232; pd[i * 4 + 1] = 158; pd[i * 4 + 2] = 70; pd[i * 4 + 3] = 255; } }
    for (const [im, sh] of [[path, 'rgba(120,70,20,0.9)'], [road, 'rgba(255,255,255,0.9)']]) { const t = document.createElement('canvas'); t.width = lw; t.height = lh; t.getContext('2d').putImageData(im, 0, 0); g.save(); g.shadowColor = sh; g.shadowBlur = 3; g.drawImage(t, 0, 0, cv.width, cv.height); g.restore(); }
    // 6. bridges (wooden planks)
    g.strokeStyle = '#7a5434'; g.lineWidth = 2;
    for (const b of this.S.bridgeRuns || []) { g.beginPath(); g.moveTo(X(b.from[0]), Z(b.from[1])); g.lineTo(X(b.to[0]), Z(b.to[1])); g.stroke(); }
    return cv;
  }
  // ------------------------------------------------------------- view control
  open(mode = this.mode) { this.el.hidden = false; this.mode = mode; if (mode === 'illustrated') { this.cx = this.cx || 0; } this._resize(); this.draw(); }
  close() { this.el.hidden = true; document.getElementById('mapCard').hidden = true; }
  get isOpen() { return !this.el.hidden; }
  _resize() { const pr = Math.min(devicePixelRatio, 2); this.cv.width = innerWidth * pr; this.cv.height = innerHeight * pr; this.pr = pr; this.fit = Math.min(innerWidth / 1250, innerHeight / 830); }
  _k() { return this.mode === 'live' ? this.fit * 4.2 * this.scale : this.fit * this.scale; }
  _rot() { return this.mode === 'live' && this.headingUp ? this.player.yaw : 0; }
  w2s(x, z) {
    const k = this._k(), c = this.mode === 'live' ? this.player : { x: this.cx, z: this.cz }, a = this._rot();
    let dx = (x - c.x) * k, dz = (z - c.z) * k; const ca = Math.cos(a), sa = Math.sin(a);
    return [dx * ca - dz * sa + innerWidth / 2, dx * sa + dz * ca + innerHeight / 2];
  }
  s2w(sx, sy) {
    const k = this._k(), c = this.mode === 'live' ? this.player : { x: this.cx, z: this.cz }, a = -this._rot();
    const dx = sx - innerWidth / 2, dy = sy - innerHeight / 2, ca = Math.cos(a), sa = Math.sin(a);
    return [(dx * ca - dy * sa) / k + c.x, (dx * sa + dy * ca) / k + c.z];
  }
  draw() {
    if (!this.isOpen) return;
    this._paint(this.ctx, innerWidth, innerHeight, this.pr, true);
  }
  /** Shared painter (full map and HUD minimap). */
  _paint(g, w, h, pr, full) {
    const L = this.L, k = this._k(), a = this._rot();
    g.setTransform(pr, 0, 0, pr, 0, 0);
    g.fillStyle = '#e9dfc4'; g.fillRect(0, 0, w, h);
    // base image, rotated around the view centre in live heading-up mode
    const c = this.mode === 'live' ? this.player : { x: this.cx, z: this.cz };
    g.save(); g.translate(w / 2, h / 2); g.rotate(a); g.scale(k / this.K, k / this.K);
    g.drawImage(this.base, (L.x0 - c.x) * this.K, (L.z0 - c.z) * this.K);
    g.restore();
    const S = (x, z) => { const ca = Math.cos(a), sa = Math.sin(a), dx = (x - c.x) * k, dz = (z - c.z) * k; return [dx * ca - dz * sa + w / 2, dx * sa + dz * ca + h / 2]; };
    // restricted areas
    for (const r of RESTRICTED) { const [x, z] = toWorld(...r.at), [sx, sy] = S(x, z); g.strokeStyle = '#c0574a'; g.setLineDash([5, 4]); g.lineWidth = 2; g.beginPath(); g.ellipse(sx, sy, r.r * 1.3 * k, r.r * k, a, 0, 6.28); g.stroke(); g.setLineDash([]); if (full) this._label(g, r.name + ' · restricted', sx, sy - r.r * k - 8, 11, '#8a3a30'); }
    // active route
    if (this.route && this.route.length) { g.strokeStyle = '#1f6fd0'; g.lineWidth = full ? 5 : 3; g.lineCap = g.lineJoin = 'round'; g.beginPath(); [[this.player.x, this.player.z], ...this.route].forEach(([x, z], i) => { const [sx, sy] = S(x, z); i ? g.lineTo(sx, sy) : g.moveTo(sx, sy); }); g.stroke(); }
    // facilities
    const icon = { toilet: ['WC', '#2f6fa0'], ro: ['💧', '#2f6fa0'], pagoda: ['⛩', '#8f3b2b'], icecream: ['🍦', '#c2456e'], souvenir: ['🛍', '#8a6a2a'] };
    if (k > 1.1 || this.mode === 'live') for (const am of this.S.amenities) { const [sx, sy] = S(am.x, am.z), [t, col] = icon[am.kind] || ['•', '#333']; g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(sx, sy, 8, 0, 6.28); g.fill(); g.strokeStyle = col; g.lineWidth = 1.2; g.stroke(); g.fillStyle = col; g.font = 'bold 9px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, sx, sy + 0.5); }
    for (const b of this.S.buildings) { const [sx, sy] = S(b.x, b.z); this._house(g, sx, sy, b.kind === 'gate' ? '#8a2a2a' : '#a8432e'); if (full && (k > 1.2 || b.kind === 'gate')) this._label(g, b.name, sx, sy - 13, b.kind === 'gate' ? 12 : 10, '#4a2a1e', b.kind === 'gate'); }
    // exhibits: animal icon + name
    const fontPx = clamp(14 * Math.sqrt(k), 11, 30);
    for (const en of L.enclosures) {
      const [sx, sy] = S(en.cx, en.cz), sp = SPECIES[en.species];
      if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue;
      if (this.sel === en) { g.strokeStyle = '#1f6fd0'; g.lineWidth = 3; g.beginPath(); g.arc(sx, sy, fontPx * 0.95, 0, 6.28); g.stroke(); }
      g.font = `${fontPx}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ICON[en.species] || '•', sx, sy);
      if (full && (k > 1.5 || en.r > 17 || this.mode === 'live')) this._label(g, (sp ? sp.name : en.id).toUpperCase(), sx, sy + fontPx * 0.85, clamp(8 * Math.sqrt(k), 8.5, 13), '#3a2410', true);
      if (full && this.mode === 'live') { const d = Math.hypot(en.view.x - this.player.x, en.view.z - this.player.z); if (d < 120) this._label(g, Math.round(d) + ' m', sx, sy + fontPx * 0.85 + 13, 10, '#1f4f90'); }
    }
    // zone signboards (wooden boards like the printed guide)
    if (full && this.mode === 'illustrated' && k < 2.6) for (const z of ZONES) { const [x, zz] = toWorld(...(z.sign || z.at)), [sx, sy] = S(x, zz); this._board(g, z.name.toUpperCase(), sx, sy - 22); }
    if (this.dest) { const [sx, sy] = S(this.dest.x, this.dest.z); g.fillStyle = '#1f6fd0'; g.beginPath(); g.arc(sx, sy, 7, 0, 6.28); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    // player (position + facing)
    const p = this.player, [px, py] = S(p.x, p.z);
    g.save(); g.translate(px, py); g.rotate(a - p.yaw);
    g.fillStyle = 'rgba(210,58,42,0.18)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, full ? 46 : 26, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
    g.fillStyle = '#d23a2a'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    if (full) this._label(g, 'You are here', px, py + 22, 11, '#a02a1e', true);
    if (!full || this.mode === 'live') {   // north indicator
      g.save(); g.translate(full ? w - 40 : w - 16, full ? 120 : 16); g.rotate(a); g.fillStyle = '#c23a2a'; g.font = 'bold 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 0, full ? -14 : -1); g.restore();
    }
  }
  _house(g, x, y, col) { g.fillStyle = '#f3ead8'; g.fillRect(x - 5, y - 3, 10, 7); g.fillStyle = col; g.beginPath(); g.moveTo(x - 7, y - 3); g.lineTo(x, y - 9); g.lineTo(x + 7, y - 3); g.closePath(); g.fill(); g.strokeStyle = 'rgba(60,30,20,.6)'; g.lineWidth = 0.8; g.strokeRect(x - 5, y - 3, 10, 7); }
  _board(g, t, x, y) { g.font = 'bold 11px Georgia, serif'; const w = g.measureText(t).width + 14; g.fillStyle = '#7a4a26'; g.strokeStyle = '#3e2410'; g.lineWidth = 1.5; g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - 10, w, 20, 4) : g.rect(x - w / 2, y - 10, w, 20); g.fill(); g.stroke(); g.fillStyle = '#f6e8c8'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y + 0.5); }
  _label(g, t, x, y, size, col, bold) { g.font = `${bold ? 'bold ' : ''}${size}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,250,235,.9)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); }
  /** HUD minimap: live, player-centred, heading-up, drawn into its own small canvas. */
  drawMini(cv, player, route) {
    const pr = Math.min(devicePixelRatio, 2), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== w * pr) { cv.width = w * pr; cv.height = h * pr; }
    const save = [this.mode, this.headingUp, this.scale, this.player, this.route];
    this.mode = 'live'; this.headingUp = true; this.scale = 0.42 * Math.max(w, 140) / 160; this.player = player; this.route = route;
    const g = cv.getContext('2d'); this._paint(g, w, h, pr, false);
    [this.mode, this.headingUp, this.scale, this.player, this.route] = save;
  }
  _bind() {
    const cv = this.cv, ptrs = new Map(); let pinch = 0, moved = 0;
    cv.addEventListener('pointerdown', e => { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; });
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch); pinch = d; return; }
      moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]);
      if (this.mode === 'illustrated') { const k = this._k(); this.cx -= (e.clientX - prev[0]) / k; this.cz -= (e.clientY - prev[1]) / k; this.draw(); }
    });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (moved < 6 && e.type === 'pointerup') this._click(e.clientX, e.clientY); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    document.getElementById('mapIn').onclick = () => this.zoomAt(innerWidth / 2, innerHeight / 2, 1.4);
    document.getElementById('mapOut').onclick = () => this.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.4);
    document.getElementById('mapMe').onclick = () => { this.cx = this.player.x; this.cz = this.player.z; this.scale = Math.max(this.scale, 2.5); this.draw(); };
    addEventListener('resize', () => { if (this.isOpen) { this._resize(); this.draw(); } });
  }
  zoomAt(sx, sy, f) {
    if (this.mode === 'live') { this.scale = clamp(this.scale * f, 0.4, 3); this.draw(); return; }
    const [wx, wz] = this.s2w(sx, sy); this.scale = clamp(this.scale * f, 0.6, 9); const [nx, nz] = this.s2w(sx, sy); this.cx += wx - nx; this.cz += wz - nz; this.draw();
  }
  _click(sx, sy) {
    let best = null, bd = 26;
    for (const en of this.L.enclosures) { const [x, y] = this.w2s(en.cx, en.cz); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = en; } }
    this.sel = best; this.draw();
    if (best) this.onSelect(best); else document.getElementById('mapCard').hidden = true;
  }
}
