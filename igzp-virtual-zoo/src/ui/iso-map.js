// 3D isometric map: the real 3D world seen through an orthographic orbit camera, with zone and
// exhibit labels projected from the same layout data. Drag = rotate, Shift/right-drag or two
// fingers = pan, wheel/pinch = zoom, click an exhibit label = select (Navigate / Info / Camera / Teleport).
import * as THREE from 'three';
import { ZONES } from '../data/zoo-layout.js';
import { SPECIES } from '../data/species.js';
import { toWorld } from '../config.js';
import { ICON } from './map.js';
import { clamp, lerp } from '../core/util.js';

export class IsoMap {
  constructor(layers, scene, onSelect) {
    this.L = layers; this.scene = scene; this.onSelect = onSelect; this.active = false;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -3000, 3000);
    this.target = new THREE.Vector3(60, 0, 40); this.az = -0.7; this.el = 0.62; this.half = 380;
    this.root = document.getElementById('isoUI'); this.labels = document.getElementById('isoLabels');
    // player marker (visible only in this view)
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(4.5, 12, 4).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#e0392a' }));
    this.marker.visible = false; scene.add(this.marker);
    this._makeLabels(); this._bind();
  }
  _makeLabels() {
    this.items = [];
    for (const z of ZONES) { const [x, zz] = toWorld(...z.at); const el = document.createElement('div'); el.className = 'isoZone'; el.textContent = z.name; this.labels.appendChild(el); this.items.push({ el, p: new THREE.Vector3(x, 25, zz), zone: true }); }
    for (const en of this.L.enclosures) {
      const sp = SPECIES[en.species], el = document.createElement('button'); el.className = 'isoEx'; el.innerHTML = `<span>${ICON[en.species] || '•'}</span>${sp ? sp.name : en.id}`;
      el.onclick = e => { e.stopPropagation(); this.sel = en; this.onSelect(en); };
      this.labels.appendChild(el); this.items.push({ el, p: new THREE.Vector3(en.cx, this.L.heightAt(en.cx, en.cz) + 6, en.cz), en });
    }
  }
  open(player) {
    this.active = true; this.root.hidden = false; this.marker.visible = true;
    this.target.set(player.x * 0.4 + 30, 0, player.z * 0.4 + 20);
    this._savedFog = this.scene.fog.density; this.scene.fog.density = 0.00035;
  }
  close() { this.active = false; this.root.hidden = true; this.marker.visible = false; if (this._savedFog) this.scene.fog.density = this._savedFog; }
  update(player) {
    const asp = innerWidth / innerHeight, c = this.cam;
    c.left = -this.half * asp; c.right = this.half * asp; c.top = this.half; c.bottom = -this.half; c.updateProjectionMatrix();
    const d = 900, ce = Math.cos(this.el);
    c.position.set(this.target.x + Math.sin(this.az) * ce * d, this.target.y + Math.sin(this.el) * d, this.target.z + Math.cos(this.az) * ce * d);
    c.lookAt(this.target); c.updateMatrixWorld();
    this.marker.position.set(player.x, this.L.walkHeight(player.x, player.z) + 9, player.z); this.marker.rotation.set(0, player.yaw + Math.PI, 0);
    this.marker.scale.setScalar(clamp(this.half / 300, 0.5, 2.5));
    // labels
    const v = new THREE.Vector3(), W = innerWidth, H = innerHeight, showEx = this.half < 420;
    for (const it of this.items) {
      v.copy(it.p).project(c);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, on = x > -50 && x < W + 50 && y > -30 && y < H + 30 && (it.zone ? this.half > 160 : showEx);
      it.el.style.display = on ? '' : 'none';
      if (on) { it.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; it.el.classList.toggle('sel', it.en && it.en === this.sel); }
    }
    return c;
  }
  /** A stand-in "camera position" for LOD systems (trees/animals detail around the look target). */
  focus() { return this.target; }
  _bind() {
    const cv = document.getElementById('view'), ptrs = new Map(); let pinch = 0, mode = null;
    this._down = e => { if (!this.active) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]); mode = e.shiftKey || e.button === 2 ? 'pan' : 'rot'; };
    this._move = e => {
      if (!this.active || !ptrs.has(e.pointerId)) return;
      const prev = ptrs.get(e.pointerId), dx = e.clientX - prev[0], dy = e.clientY - prev[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) this.half = clamp(this.half * pinch / d, 60, 800); pinch = d; this._pan(dx * 0.5, dy * 0.5); return; }
      if (mode === 'pan') this._pan(dx, dy); else { this.az -= dx * 0.006; this.el = clamp(this.el + dy * 0.004, 0.35, 1.35); }
    };
    this._up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; };
    cv.addEventListener('pointerdown', this._down); cv.addEventListener('pointermove', this._move); cv.addEventListener('pointerup', this._up); cv.addEventListener('pointercancel', this._up);
    cv.addEventListener('contextmenu', e => { if (this.active) e.preventDefault(); });
    cv.addEventListener('wheel', e => { if (!this.active) return; this.half = clamp(this.half * (e.deltaY > 0 ? 1.12 : 1 / 1.12), 60, 800); }, { passive: true });
    document.getElementById('isoIn').onclick = () => (this.half = clamp(this.half / 1.3, 60, 800));
    document.getElementById('isoOut').onclick = () => (this.half = clamp(this.half * 1.3, 60, 800));
    document.getElementById('isoRotL').onclick = () => (this.az += 0.5);
    document.getElementById('isoRotR').onclick = () => (this.az -= 0.5);
  }
  _pan(dx, dy) {
    const k = this.half * 2 / innerHeight, ca = Math.cos(this.az), sa = Math.sin(this.az);
    this.target.x -= (dx * ca + dy * sa / Math.sin(this.el)) * k; this.target.z -= (-dx * sa + dy * ca / Math.sin(this.el)) * k;
    this.target.x = clamp(this.target.x, -700, 700); this.target.z = clamp(this.target.z, -500, 500);
  }
}
