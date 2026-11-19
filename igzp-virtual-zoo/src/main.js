// IGZP Virtual Zoo — application entry point.
import * as THREE from 'three';
import { QUALITY, pickQuality, IS_TOUCH, toWorld, PLAYER } from './config.js';
import { ZONES, GUIDED_TOUR } from './data/zoo-layout.js';
import { SPECIES, FACILITY_INFO } from './data/species.js';
import { V3, clamp, lerp, damp, wrapAngle } from './core/util.js';
import { Layers } from './world/layers.js';
import { buildTerrain } from './world/terrain.js';
import { buildSky } from './world/sky.js';
import { buildWater, buildLotus } from './world/water.js';
import { Vegetation } from './world/vegetation.js';
import { Structures } from './zoo/structures.js';
import { People } from './zoo/people.js';
import { Safari } from './zoo/safari.js';
import { Animals } from './animals/animals.js';
import { attachLionGLB } from './animals/glb-lion.js';
import { attachChimpanzeeGLB } from './animals/glb-chimpanzee.js';
import { attachWhiteTigerGLB } from './animals/tiger.js';
import { Player } from './player/player.js';
import { findPath, pathLength } from './player/navigation.js';
import { ZooMap } from './ui/map.js';
import { IsoMap } from './ui/iso-map.js';
import { Gallery } from './photography/gallery-store.js';
import { Soundscape } from './audio/audio.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const QK = pickQuality(), Q = QUALITY[QK];
if (IS_TOUCH) document.body.classList.add('touch');

// ------------------------------------------------------------------ renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: Q.aa, powerPreference: 'high-performance' });
} catch (e) { $('err').hidden = false; $('err').textContent = 'This virtual tour needs WebGL. Please use a recent Chrome, Edge, Safari or Firefox.'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2400);
camera.rotation.order = 'YXZ';
scene.add(camera);
const U = { uTime: { value: 0 } };
const W = {};   // world references

const tick = () => new Promise(r => setTimeout(r, 0));
async function stage(label, pct, fn) { $('loadtext').textContent = label; $('loadfill').style.width = pct + '%'; await tick(); const t0 = performance.now(); const r = fn(); console.info(`[igzp] ${label} ${Math.round(performance.now() - t0)} ms`); return r; }

// ------------------------------------------------------------------ state
const state = { mode: 'intro', started: false, photo: false, sens: 5, autoNarr: false, dest: null, route: null, mapView: 'illustrated', prev: null, hasTicket: false, ticketType: null, ticketModalOpen: false };
const START = { x: 0, z: 0, heading: 0 };
const titleCam = { t: 0 };

// ------------------------------------------------------------------ build
async function build() {
  const t0 = performance.now();
  W.layers = await stage('Tracing roads, paths and lakes from the visitor map…', 5, () => new Layers());
  W.sky = await stage('Lighting the sky…', 12, () => buildSky(renderer, scene, Q));
  W.terrain = await stage('Shaping the terrain and moats…', 22, () => { const t = buildTerrain(W.layers, Q, U); scene.add(t.mesh); return t; });
  W.water = await stage('Filling the lakes…', 30, () => { const w = buildWater(W.layers, W.terrain.shared, U); scene.add(w); buildLotus(scene); return w; });
  W.structures = await stage('Placing buildings and enclosures…', 38, () => new Structures(W.layers));
  W.veg = await stage('Growing the forest…', 50, () => { const v = new Vegetation(scene, W.layers, Q, U, W.layers.enclosures); v.attachGrass(scene, W.terrain); return v; });
  await stage('Building the entrance, enclosures and bridges…', 62, () => W.structures.build(scene, U));
  W.animals = await stage('Bringing the animals…', 72, () => new Animals(scene, W.layers, W.layers.enclosures, Q));
  W.lionGLB = attachLionGLB(W.animals).catch(e => console.warn('Lion GLB not loaded:', e.message));   // background, non-blocking
  W.chimpGLB = attachChimpanzeeGLB(W.animals).catch(e => console.warn('Chimpanzee GLB not loaded:', e.message));   // background, non-blocking
  W.tigerGLB = attachWhiteTigerGLB(W.animals).catch(e => console.warn('White Tiger GLB not loaded:', e.message));   // background, non-blocking
  W.people = await stage('Opening the gates to visitors…', 80, () => new People(scene, W.layers, W.structures, Q));
  W.safari = await stage('Charging the safari cart…', 86, () => new Safari(scene, W.layers, W.structures));
  W.player = new Player(camera, W.layers);
  W.map = await stage('Drawing the visitor map…', 92, () => new ZooMap(W.layers, W.structures, W.veg, en => openMapCard(en)));
  W.iso = new IsoMap(W.layers, scene, en => openMapCard(en));
  W.sound = new Soundscape();
  // visitors start on the forecourt OUTSIDE the main gate, facing the nameboard wall and the gate
  const ent = W.structures.entrance, o = ent.outward;
  Object.assign(START, { x: ent.gate.x + o.x * 11 + o.z * 3, z: ent.gate.z + o.z * 11 - o.x * 3, heading: Math.atan2(o.x, o.z) });
  await stage('Almost there…', 97, () => { W.veg.update(camera, true); renderer.compile(scene, camera); });
  W.buildMs = Math.round(performance.now() - t0);
  console.info(`[igzp] world built in ${W.buildMs} ms — ${W.veg.count} trees, ${W.animals.list.length} animals, ${W.people.list.length} people, quality ${QK}`);
  $('loadbar').hidden = true; $('loadtext').hidden = true; $('cta').hidden = false;
}

// ------------------------------------------------------------------ input
const keys = new Set(), joy = { x: 0, y: 0 }, touch = { brake: false };
const input = { fwd: 0, steer: 0, strafe: 0, brake: false, boost: false, looking: false };
const MOVE_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (state.ticketModalOpen) {
    if (e.code === 'Escape') { closeTicketModal(); return; }
    if (e.code === 'Digit1' || e.code === 'Numpad1') { selectTicketMode('walk'); return; }
    if (e.code === 'Digit2' || e.code === 'Numpad2') { selectTicketMode('bike'); return; }
    if (e.code === 'Digit3' || e.code === 'Numpad3') { selectTicketMode('safari'); return; }
    return;
  }
  if (state.photo) { if (e.code === 'Escape' || e.code === 'KeyP') exitPhoto(); if (e.code === 'Enter') capture(); return; }
  if (state.mode === 'camera') { if (e.code === 'Escape') exitCamera(); if (e.code === 'Equal' || e.code === 'NumpadAdd') camZoom(10); if (e.code === 'Minus' || e.code === 'NumpadSubtract') camZoom(-10); if (e.code === 'Enter') capture(); return; }
  if (e.code === 'Escape') { if (W.iso?.active) closeIso(); else closeAll(); }
  if (!state.started || state.mode === 'cinematic') { if (state.mode === 'cinematic' && e.code === 'Escape') skipCinematic(); return; }
  if (e.code === 'KeyM') toggleMap();
  if (state.mode === 'safari') { if (e.code === 'KeyP') enterPhoto(); return; }
  if (e.code === 'KeyP') enterPhoto();
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyB') toggleMode();
  if (tourS.on && MOVE_KEYS.includes(e.code)) endGuided('You’re in control — guided tour ended');
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function readInput() {
  if (state.ticketModalOpen) { input.fwd = 0; input.steer = 0; input.strafe = 0; input.brake = true; return; }
  const k = c => (keys.has(c) ? 1 : 0), bike = W.player.mode === 'bike';
  input.fwd = clamp(k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') + joy.y, -1, 1);
  if (bike) { input.steer = clamp(k('KeyA') + k('ArrowLeft') - k('KeyD') - k('ArrowRight') - joy.x, -1, 1); input.strafe = 0; }
  else { input.strafe = clamp(k('KeyD') - k('KeyA') + joy.x, -1, 1); input.steer = k('ArrowLeft') - k('ArrowRight'); }
  input.brake = keys.has('Space') || touch.brake; input.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
}
// drag to look (player / camera mode / safari passenger)
const view = $('view'), look = { id: null, x: 0, y: 0 };
view.addEventListener('pointerdown', e => { if (!state.started || state.mode === 'cinematic' || W.iso?.active || state.ticketModalOpen || look.id !== null) return; look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } input.looking = true; });
view.addEventListener('pointermove', e => {
  if (e.pointerId !== look.id) return;
  const k = 0.0007 * state.sens * (e.pointerType === 'touch' ? 1.4 : 1), dx = (e.clientX - look.x) * k, dy = (e.clientY - look.y) * k;
  look.x = e.clientX; look.y = e.clientY;
  if (state.mode === 'safari') { W.safari.lookYaw -= dx; W.safari.lookPitch = clamp(W.safari.lookPitch - dy, -1.0, 0.9); return; }
  if (state.mode === 'camera') { cam.userYaw -= dx; cam.userPitch = clamp(cam.userPitch - dy, -0.5, 0.5); return; }
  const P = W.player;
  P.lookYaw -= dx; P.lookPitch = clamp(P.lookPitch - dy, -1.2, 1.1);
  if (P.mode === 'bike') P.lookYaw = clamp(P.lookYaw, -2.6, 2.6);
});
const endLook = e => { if (e.pointerId === look.id) { look.id = null; input.looking = false; } };
view.addEventListener('pointerup', endLook); view.addEventListener('pointercancel', endLook);
view.addEventListener('wheel', e => {
  if (state.photo) { const z = $('phZoom'); z.value = clamp(+z.value + Math.sign(e.deltaY) * 3, 18, 75); }
  else if (state.mode === 'camera') camZoom(-Math.sign(e.deltaY) * 6);
  else if (state.mode === 'safari') W.safari.fov = clamp(W.safari.fov + Math.sign(e.deltaY) * 4, 22, 70);
}, { passive: true });
// touch joystick + buttons
{ const jo = $('joy'), kn = $('knob'); let id = null;
  const mv = e => { const r = jo.getBoundingClientRect(), R = r.width / 2; let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R; const l = Math.hypot(dx, dy); if (l > R * 0.8) { dx *= R * 0.8 / l; dy *= R * 0.8 / l; } kn.style.transform = `translate(${dx}px,${dy}px)`; joy.x = dx / (R * 0.8); joy.y = -dy / (R * 0.8); };
  jo.addEventListener('pointerdown', e => { id = e.pointerId; try { jo.setPointerCapture(id); } catch (err) { /* synthetic or stale pointer */ } mv(e); if (tourS.on) endGuided('You’re in control — guided tour ended'); });
  jo.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
  const end = e => { if (e.pointerId !== id) return; id = null; joy.x = joy.y = 0; kn.style.transform = ''; };
  jo.addEventListener('pointerup', end); jo.addEventListener('pointercancel', end);
  $('tBrake').addEventListener('pointerdown', () => (touch.brake = true)); $('tBrake').addEventListener('pointerup', () => (touch.brake = false)); $('tBrake').addEventListener('pointercancel', () => (touch.brake = false));
  $('tAct').onclick = () => interact(); $('tPhoto').onclick = () => enterPhoto();
}

// ------------------------------------------------------------------ UI helpers
let toastT = 0;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function caption(title, sub, ms = 0) { const c = $('caption'); c.innerHTML = `<div class="c1">${title}</div>${sub ? `<div class="c2">${sub}</div>` : ''}`; c.classList.add('on'); clearTimeout(caption.t); if (ms) caption.t = setTimeout(() => c.classList.remove('on'), ms); }
function closeAll() { for (const id of ['panel', 'settings', 'mapCard', 'ticketModal']) $(id) && ($(id).hidden = true); state.ticketModalOpen = false; if (W.map?.isOpen) W.map.close(); if (!$('gallery').hidden) closeGallery(); }
document.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => { const id = b.dataset.close; if (id === 'map') W.map.close(); else if (id === 'gallery') closeGallery(); else $(id).hidden = true; }));
$('mcClose').onclick = () => ($('mapCard').hidden = true);
$('tmClose') && ($('tmClose').onclick = closeTicketModal);
$('tmBtnWalk') && ($('tmBtnWalk').onclick = () => selectTicketMode('walk'));
$('tmBtnBike') && ($('tmBtnBike').onclick = () => selectTicketMode('bike'));
$('tmBtnSafari') && ($('tmBtnSafari').onclick = () => selectTicketMode('safari'));
$('tmOptWalk') && ($('tmOptWalk').onclick = e => { if (e.target !== $('tmBtnWalk')) selectTicketMode('walk'); });
$('tmOptBike') && ($('tmOptBike').onclick = e => { if (e.target !== $('tmBtnBike')) selectTicketMode('bike'); });
$('tmOptSafari') && ($('tmOptSafari').onclick = e => { if (e.target !== $('tmBtnSafari')) selectTicketMode('safari'); });
function modeLabel() { return state.mode === 'safari' ? 'Safari passenger' : state.mode === 'camera' ? 'Animal camera' : W.player.mode === 'bike' ? 'Bicycle' : 'Walking'; }
function setHelp() {
  $('help').innerHTML = W.player.mode === 'bike'
    ? '<b>W/S</b> pedal · brake &nbsp; <b>A/D</b> steer &nbsp; <b>Space</b> stop &nbsp; <b>Shift</b> faster<br><b>Drag</b> look &nbsp; <b>E</b> observe &nbsp; <b>P</b> photo &nbsp; <b>M</b> map &nbsp; <b>B</b> walk'
    : '<b>WASD</b> walk &nbsp; <b>Shift</b> hurry &nbsp; <b>Drag</b> look<br><b>E</b> observe &nbsp; <b>P</b> photo &nbsp; <b>M</b> map &nbsp; <b>B</b> bicycle';
  $('help').classList.remove('fade'); clearTimeout(setHelp.t); setHelp.t = setTimeout(() => $('help').classList.add('fade'), 12000);
  $('modeName').textContent = modeLabel();
  $('btnMode').textContent = W.player.mode === 'bike' ? 'Walk' : 'Bicycle';
}
function toggleMode() { if (state.mode !== 'free') return; W.player.setMode(W.player.mode === 'bike' ? 'walk' : 'bike'); setHelp(); toast(W.player.mode === 'bike' ? 'Back on the bicycle' : 'Walking mode — same visitor routes'); }
$('btnMode').onclick = toggleMode;
$('btnMap').onclick = () => toggleMap();
$('btnSafari').onclick = () => (state.mode === 'safari' ? exitSafari() : startSafari());
$('btnPhoto').onclick = () => enterPhoto();
$('btnGallery').onclick = () => openGallery();
$('btnIntroGallery').onclick = () => openGallery();
$('btnSettings').onclick = $('btnIntroSettings').onclick = () => { $('settings').hidden = !$('settings').hidden; };
$('btnSound').onclick = () => { W.sound.setMuted(!W.sound.muted); $('btnSound').textContent = W.sound.muted ? 'Muted' : 'Sound'; };
$('mini').onclick = () => openMapView('live');
$('sQuality').value = QK;
$('sQuality').onchange = e => { try { localStorage.setItem('igzp.quality', e.target.value); } catch (err) { /* ignore */ } const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.toString(); };
$('sVolume').oninput = e => W.sound?.setVolume(e.target.value / 100);
$('sSens').oninput = e => (state.sens = +e.target.value);
$('sFps').onchange = e => ($('stats').hidden = !e.target.checked);
$('sNarr').onchange = e => (state.autoNarr = e.target.checked);
if (params.has('debug')) { $('stats').hidden = false; $('sFps').checked = true; }

// ------------------------------------------------------------------ zones & exhibits
function zoneAt(x, z) { let best = ZONES[0], bd = 1e9; for (const zn of ZONES) { const [zx, zz] = toWorld(...zn.at); const d = Math.hypot(x - zx, z - zz) / zn.r; if (d < bd) { bd = d; best = zn; } } return best; }
function nearestExhibit(x, z, maxD = 20) {
  let best = null, bd = maxD;
  for (const en of W.layers.enclosures) { let d = 1e9; for (const [px, pz] of en.poly) d = Math.min(d, Math.hypot(px - x, pz - z)); if (d < bd) { bd = d; best = en; } }
  return best ? { en: best, d: bd } : null;
}
function nearestFacility(x, z, maxD = 16) { let best = null, bd = maxD; for (const b of W.structures.buildings) { if (!FACILITY_INFO[b.id]) continue; const d = Math.hypot(b.x - x, b.z - z) - (b.size || 4); if (d < bd) { bd = d; best = b; } } return best; }
let near = null, nearFac = null, nearTicketCounter = false;

function isNearTicketCounter(px, pz) {
  const tc = W.structures?.ticketCounter || W.structures?.entrance?.ticketCounter;
  if (tc) {
    const d = Math.hypot(px - tc.x, pz - tc.z);
    if (d < (tc.r || 6.5)) return true;
  }
  const tcB = W.structures?.buildings?.find(b => b.id === 'ticket-counter');
  if (tcB) {
    const d = Math.hypot(px - tcB.x, pz - tcB.z);
    if (d < (tcB.size || 4) + 5.0) return true;
  }
  if (!state.hasTicket && W.structures?.entrance) {
    const g = W.structures.entrance.gate;
    const d = Math.hypot(px - g.x, pz - g.z);
    if (d < 6.5) return true;
  }
  return false;
}

function openTicketModal() {
  const tm = $('ticketModal');
  if (!tm) return;
  closeAll();
  tm.hidden = false;
  state.ticketModalOpen = true;
  if (state.mode === 'free') {
    W.player.active = false;
    W.player.speed = 0;
  }
}

function closeTicketModal() {
  const tm = $('ticketModal');
  if (tm) tm.hidden = true;
  state.ticketModalOpen = false;
  if (state.mode === 'free' && !state.photo) {
    W.player.active = true;
  }
}

function selectTicketMode(mode) {
  closeTicketModal();
  state.hasTicket = true;
  state.ticketType = mode;
  fadeFlash();

  const ent = W.structures?.entrance;
  const fwd = ent ? ent.outward.clone().negate() : new V3(0, 0, 1);
  const g = ent ? ent.gate : { x: 0, z: 0 };
  const admYaw = Math.atan2(fwd.x, fwd.z);

  if (mode === 'walk') {
    W.player.setMode('walk');
    state.mode = 'free';
    const admX = g.x + fwd.x * 5.5, admZ = g.z + fwd.z * 5.5;
    W.player.place(admX, admZ, admYaw);
    W.player.active = true;
    setHelp();
    toast('🎟️ Ticket Issued: Walking Tour — Admitted through Main Gate!', 4000);
    caption('Main Entrance Plaza', 'Walking Tour active — explore shaded trails and animal viewing aprons.');
  } else if (mode === 'bike') {
    W.player.setMode('bike');
    state.mode = 'free';
    const admX = g.x + fwd.x * 7.0, admZ = g.z + fwd.z * 7.0;
    W.player.place(admX, admZ, admYaw);
    W.player.active = true;
    setHelp();
    toast('🎟️ Ticket Issued: Rental Bicycle — Admitted through Main Gate!', 4000);
    caption('Main Entrance Plaza', 'Rental Bicycle active — cruise outer circuits, press [B] anytime to walk.');
  } else if (mode === 'safari') {
    toast('🎟️ Ticket Issued: Guided Safari Tram — Admitted through Main Gate! Boarding…', 3000);
    startSafari();
  }
}

function interact() {
  if (nearTicketCounter || isNearTicketCounter(W.player.pos.x, W.player.pos.z)) {
    openTicketModal();
  } else if (near) {
    openPanel(near.en);
  } else if (nearFac) {
    openFacility(nearFac);
  }
}
$('prompt').onclick = interact;
const spName = en => SPECIES[en.species]?.name || en.id;
function openPanel(en) {
  const sp = SPECIES[en.species]; if (!sp) return;
  const badges = ['<span class="badge ok">Shown on official visitor map</span>', '<span class="badge warn">Animal presence not verified</span>'];
  if (sp.assumed) badges.push('<span class="badge warn">Species assumed</span>');
  $('pBadges').innerHTML = badges.join('');
  $('pName').textContent = sp.name + (en.species2 && SPECIES[en.species2] ? ` & ${SPECIES[en.species2].name}` : '');
  $('pSci').textContent = sp.sci;
  $('pDesc').textContent = sp.desc;
  $('pHabitat').textContent = sp.habitat;
  $('pCons').textContent = `${sp.status} — source: ${sp.src}`;
  $('pFacts').innerHTML = sp.facts.length ? sp.facts.map(f => `• ${f}`).join('<br>') : '—';
  const others = W.layers.enclosures.filter(o => o !== en).map(o => ({ o, d: Math.hypot(o.cx - en.cx, o.cz - en.cz) })).sort((a, b) => a.d - b.d).slice(0, 3);
  $('pNear').textContent = others.map(({ o }) => spName(o)).join(' · ');
  $('pNote').textContent = (sp.assumed ? sp.assumed + ' ' : '') + 'General species information — not a description of the individual animals at IGZP. ' + (en.species === 'bengal_tiger' ? 'The tiger is the detailed benchmark model.' : 'The 3D animal is a stylised procedural model.');
  bindActions(en, { nav: $('pNav'), cam: $('pCam'), tele: $('pTele') }, () => ($('panel').hidden = true));
  $('pNarrate').onclick = () => narrate(`${sp.name}. ${sp.desc} ${sp.habitat}`);
  $('pPhoto').onclick = () => { $('panel').hidden = true; enterPhoto(); };
  $('panel').hidden = false; $('settings').hidden = true;
  if (state.autoNarr) narrate(`${sp.name}. ${sp.desc}`);
}
function openFacility(b) {
  $('pBadges').innerHTML = '<span class="badge ok">Shown on official visitor map</span>' + (b.restricted ? '<span class="badge warn">Not a visitor area</span>' : '');
  $('pName').textContent = b.name; $('pSci').textContent = 'Facility'; $('pDesc').textContent = FACILITY_INFO[b.id] || '';
  $('pHabitat').textContent = '—'; $('pCons').textContent = '—'; $('pFacts').textContent = '—'; $('pNear').textContent = '—'; $('pNote').textContent = 'Building interiors are not modelled in this demo.';
  for (const id of ['pNav', 'pCam', 'pTele']) $(id).hidden = true;
  $('pNarrate').onclick = () => narrate(`${b.name}. ${FACILITY_INFO[b.id] || ''}`); $('pPhoto').onclick = () => { $('panel').hidden = true; enterPhoto(); };
  $('panel').hidden = false;
}
/** The four exhibit actions, shared by the info panel and every map view. */
function bindActions(en, btn, after = () => {}) {
  for (const b of Object.values(btn)) b.hidden = false;
  btn.nav.onclick = () => { after(); closeMaps(); navigateTo(en); };
  btn.cam.onclick = () => { after(); closeMaps(); enterCamera(en); };
  btn.tele.onclick = () => { after(); closeMaps(); teleportTo(en); };
  if (btn.info) btn.info.onclick = () => openPanel(en);
}
function narrate(text) {
  if (!('speechSynthesis' in window)) { toast('Narration is not supported in this browser'); return; }
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); const v = speechSynthesis.getVoices().find(v => /en-IN/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang)); if (v) u.voice = v; u.rate = 0.98; speechSynthesis.speak(u);
}

// ------------------------------------------------------------------ maps (illustrated / isometric / live)
function playerPose() { return { x: W.player.pos.x, z: W.player.pos.z, yaw: camera.rotation.y }; }
function toggleMap() { if (W.map.isOpen || W.iso.active) closeMaps(); else openMapView(state.mapView); }
function closeMaps() { if (W.map.isOpen) W.map.close(); if (W.iso.active) closeIso(); $('mapCard').hidden = true; }
function openMapView(v) {
  if (!state.started) return;
  state.mapView = v;
  if (v === 'iso') { if (W.map.isOpen) W.map.close(); W.iso.open(playerPose()); $('hud').hidden = true; return; }
  if (W.iso.active) closeIso();
  W.map.player = playerPose(); W.map.route = state.route; W.map.dest = state.dest;
  if (v === 'illustrated' && !W.map._opened) { W.map.cx = 40; W.map.cz = 40; W.map.scale = 1; W.map._opened = true; }
  W.map.open(v); $('map').classList.toggle('live', v === 'live'); $('mapHead').hidden = v !== 'live';
  document.querySelectorAll('#map .tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
}
function closeIso() { W.iso.close(); if (state.mode !== 'camera' && !state.photo) $('hud').hidden = !state.started; }
document.querySelectorAll('.tab').forEach(t => (t.onclick = () => openMapView(t.dataset.view)));
$('isoClose').onclick = () => closeIso();
$('mapHead').onclick = () => { W.map.headingUp = !W.map.headingUp; $('mapHead').textContent = W.map.headingUp ? 'North-up' : 'Heading-up'; W.map.draw(); };
function openMapCard(en) {
  const sp = SPECIES[en.species]; $('mcName').textContent = sp ? sp.name : en.id; $('mcSci').textContent = sp ? sp.sci : '';
  W.map.sel = en; W.iso.sel = en; if (W.map.isOpen) W.map.draw();
  $('mapCard').hidden = false;
  bindActions(en, { nav: $('mcNav'), cam: $('mcCam'), tele: $('mcTele'), info: $('mcInfo') }, () => ($('mapCard').hidden = true));
}

// ------------------------------------------------------------------ navigation (route graph = public walkable grid)
const guide3d = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.85, depthTest: true }));
guide3d.visible = false; scene.add(guide3d);
function navigateTo(en) {
  if (state.mode !== 'free') { if (state.mode === 'camera') exitCamera(); else if (state.mode === 'safari') exitSafari(); }
  const v = en.view, p = W.player.pos, path = findPath(W.layers, p.x, p.z, v.x, v.z);
  if (!path) { toast('No public route found'); return; }
  state.route = path; state.dest = { x: v.x, z: v.z, en }; state.routeOff = 0;
  $('guide').hidden = false; toast(`Route to ${spName(en)} — follow the arrow`);
}
function clearRoute() { state.route = null; state.dest = null; $('guide').hidden = true; guide3d.visible = false; }
$('guideClear').onclick = clearRoute;
/**
 * Route following. The previous version spliced the route array while scanning it, which skipped
 * waypoints and made the arrow point at random. Now: project the player onto the route polyline,
 * drop the segments already passed, aim at a look-ahead point ~8 m further ALONG the route, and
 * re-plan if the player strays more than 14 m from it.
 */
function routeAim(route, px, pz, ahead = 8) {
  const pts = [[px, pz], ...route]; let best = 0, bd = 1e9, bt = 0;
  for (let i = 1; i < pts.length; i++) {        // nearest point on route segments (skip the player->first link)
    if (i === 1 && pts.length > 2) continue;
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1), qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(px - qx, pz - qz);
    if (d < bd) { bd = d; best = i; bt = t; }
  }
  // walk forward `ahead` metres from the projection
  let [ax, az] = pts[best - 1], [bx, bz] = pts[best]; let cx = ax + (bx - ax) * bt, cz = az + (bz - az) * bt, left = ahead, i = best;
  while (i < pts.length) { const [nx, nz] = pts[i], d = Math.hypot(nx - cx, nz - cz); if (d >= left) { cx += (nx - cx) * left / d; cz += (nz - cz) * left / d; break; } left -= d; cx = nx; cz = nz; i++; }
  return { aim: [cx, cz], off: bd, passed: Math.max(0, best - 2) };
}
function updateGuide(dt) {
  if (!state.dest || state.mode !== 'free') { guide3d.visible = false; return; }
  const p = W.player.pos, d = Math.hypot(state.dest.x - p.x, state.dest.z - p.z);
  if (d < 6) { toast(`You’ve arrived: ${spName(state.dest.en)}`); clearRoute(); return; }
  const r = routeAim(state.route, p.x, p.z);
  if (r.passed > 0) state.route.splice(0, r.passed);
  state.routeOff = r.off > 14 ? (state.routeOff || 0) + dt : 0;
  if (state.routeOff > 1.0) { const np = findPath(W.layers, p.x, p.z, state.dest.x, state.dest.z); if (np) { state.route = np; toast('Re-routing…', 1200); } state.routeOff = 0; }
  const [ax, az] = r.aim, ang = Math.atan2(-(ax - p.x), -(az - p.z));     // world yaw of the aim direction (camera convention)
  const rel = wrapAngle(ang - camera.rotation.y);                              // relative to where the visitor is LOOKING
  $('guideArrow').style.transform = `rotate(${-rel}rad)`;
  $('guideText').textContent = `${spName(state.dest.en)} · ${Math.round(pathLength([[p.x, p.z], ...state.route]))} m`;
  state.guideRel = rel; state.guideAim = r.aim;
  // 3D chevron floating over the path a few metres ahead
  const gx = p.x + (ax - p.x) * 0.45, gz = p.z + (az - p.z) * 0.45;
  guide3d.visible = true; guide3d.position.set(gx, W.layers.walkHeight(gx, gz) + 0.9 + Math.sin(time * 3) * 0.08, gz); guide3d.rotation.set(0, Math.atan2(ax - p.x, az - p.z), 0);
}

// ------------------------------------------------------------------ teleport
function teleportTo(en) {
  if (state.mode === 'camera') exitCamera(); if (state.mode === 'safari') exitSafari(true); if (state.photo) exitPhoto();
  const v = en.view;
  if (!W.layers.isWalkable(v.x, v.z)) { toast('No public viewing point for this exhibit'); return; }
  const face = Math.atan2(-(en.cx - v.x), -(en.cz - v.z));
  W.player.setMode('walk'); W.player.place(v.x, v.z, face); W.player.active = true; state.mode = 'free';
  clearRoute(); setHelp(); fadeFlash();
  toast(`Teleported to the ${spName(en)} viewing point — walking mode`);
}
function fadeFlash() { const f = $('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 350); }

// ------------------------------------------------------------------ animal camera mode
const cam = { en: null, a: 0, pos: new V3(), look: new V3(), zoom: 35, userYaw: 0, userPitch: 0 };
/** Best permitted public viewpoint for the current animal: walkable, outside every enclosure, 8–28 m away, clearest angle. */
function bestViewpoint(en, animal) {
  const L = W.layers, ap = animal ? animal.pos : new V3(en.cx, 0, en.cz); let best = null, bs = 1e9;
  for (let r = 6; r <= 40; r += 2) for (let k = 0; k < 24; k++) {
    const t = k / 24 * 6.283, x = ap.x + Math.cos(t) * r, z = ap.z + Math.sin(t) * r;
    if (!L.isWalkable(x, z)) continue;
    const dist = Math.hypot(x - ap.x, z - ap.z); let score = Math.abs(dist - 14);
    // penalise views where the sight line crosses fence-heavy edges (prefer moat / glass fronts)
    let blocked = 0; for (let s = 0.15; s < 0.95; s += 0.1) { const qx = x + (ap.x - x) * s, qz = z + (ap.z - z) * s; if (L.maskAt(qx, qz)[2] > 0.15 && !L.isWalkable(qx, qz)) { /* inside habitat: fine */ } else if (!L.isWalkable(qx, qz) && L.heightAt(qx, qz) > L.heightAt(x, z) + 2.5) blocked++; }
    score += blocked * 6;
    if (score < bs) { bs = score; best = [x, z]; }
  }
  return best || [en.view.x, en.view.z];
}
function enterCamera(en) {
  if (!state.started) return;
  if (state.mode === 'safari') exitSafari(true);
  if (state.mode !== 'camera') state.prev = { mode: state.mode, playerMode: W.player.mode, pos: W.player.pos.clone(), heading: W.player.heading, lookYaw: W.player.lookYaw, lookPitch: W.player.lookPitch, tour: tourS.on };
  if (tourS.on) tourS.paused = true;
  closeAll(); state.mode = 'camera'; cam.en = en; cam.a = 0; cam.userYaw = 0; cam.userPitch = 0;
  W.player.active = false; W.player.bars.visible = false; guide3d.visible = false;
  cam.animal = (en.animals || []).find(a => a.mesh.visible) || (en.animals || [])[0] || null;
  const vp = bestViewpoint(en, cam.animal);
  cam.pos.set(vp[0], W.layers.walkHeight(vp[0], vp[1]) + (en.style === 'glass' ? 1.75 : 1.85), vp[1]);
  cam.look.copy(cam.animal ? cam.animal.mesh.position : new V3(en.cx, 0, en.cz));
  $('hud').hidden = true; $('camUI').hidden = false; $('camName').textContent = spName(en);
  $('camNote').textContent = cam.animal ? ' · public viewing point' : ' · no animal currently visible';
  $('camZoom').value = cam.zoom; fadeFlash();
}
function exitCamera() {
  if (state.mode !== 'camera') return;
  const pv = state.prev || { mode: 'free' };
  $('camUI').hidden = true; camera.fov = 62; camera.updateProjectionMatrix();
  state.mode = pv.mode === 'safari' ? 'free' : 'free';
  if (pv.pos) { W.player.pos.copy(pv.pos); W.player.heading = pv.heading; W.player.lookYaw = pv.lookYaw; W.player.lookPitch = pv.lookPitch; W.player.mode = pv.playerMode; }
  W.player.active = true; $('hud').hidden = false; setHelp(); if (pv.tour) tourS.paused = false;
}
function camZoom(d) { cam.zoom = clamp(cam.zoom + d, 0, 100); $('camZoom').value = cam.zoom; }
$('camZoom').oninput = e => (cam.zoom = +e.target.value);
$('camIn').onclick = () => camZoom(12); $('camOut').onclick = () => camZoom(-12);
$('camExit').onclick = exitCamera; $('camShoot').onclick = () => capture();
$('camNext').onclick = () => { const L = cam.en.animals || []; if (L.length < 2) { toast('Only one animal in this exhibit'); return; } cam.animal = L[(L.indexOf(cam.animal) + 1) % L.length]; const vp = bestViewpoint(cam.en, cam.animal); cam.pos.set(vp[0], W.layers.walkHeight(vp[0], vp[1]) + 1.85, vp[1]); };
function updateCamera(dt) {
  const a = cam.animal, target = a ? a.mesh.position.clone().add(new V3(0, (a.meta.bodyY0 || 0.5) * a.k * 0.9, 0)) : new V3(cam.en.cx, W.layers.heightAt(cam.en.cx, cam.en.cz) + 1, cam.en.cz);
  cam.look.lerp(target, damp(3, dt));
  // if the animal wanders far from this viewpoint, glide to a better public one
  if (a && cam.pos.distanceTo(target) > 34) { const vp = bestViewpoint(cam.en, a); cam.pos.lerp(new V3(vp[0], W.layers.walkHeight(vp[0], vp[1]) + 1.85, vp[1]), damp(0.8, dt)); }
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  camera.rotation.y += cam.userYaw; camera.rotation.x += cam.userPitch;
  // frame the animal: fov from its size and distance, then the user zoom (min/max limits)
  const size = a ? Math.max(a.meta.L || 1, (a.meta.leg || 0.5) * 2) * a.k : 4, d = cam.pos.distanceTo(cam.look);
  const fit = THREE.MathUtils.radToDeg(2 * Math.atan(size * 1.9 / (2 * d)));
  const fov = clamp(lerp(clamp(fit * 2.6, 20, 70), clamp(fit, 6, 60), cam.zoom / 100), 6, 70);
  camera.fov = lerp(camera.fov, fov, damp(4, dt)); camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ guided safari (electric cart)
function startSafari() {
  if (!state.started || state.mode === 'cinematic') return;
  if (state.mode === 'camera') exitCamera(); if (tourS.on) endGuided(); closeAll(); clearRoute();
  state.prev = { mode: 'free', playerMode: W.player.mode };
  state.mode = 'safari'; W.player.active = false; W.player.bars.visible = false;
  W.safari.start(); fadeFlash();
  $('hud').hidden = false; $('safariUI').hidden = false; $('btnSafari').textContent = 'Exit safari';
  $('modeName').textContent = modeLabel(); $('prompt').hidden = true;
  toast('Guided Safari — you are a passenger. Drag to look around.');
}
function exitSafari(silent) {
  if (state.mode !== 'safari') return;
  const [x, z] = W.safari.alightPoint(); W.safari.stop();
  state.mode = 'free'; W.player.setMode('walk'); W.player.place(x, z, W.safari.yaw + Math.PI); W.player.active = true;
  $('safariUI').hidden = true; $('btnSafari').textContent = 'Safari'; camera.fov = 62; camera.updateProjectionMatrix(); $('caption').classList.remove('on');
  setHelp(); if (!silent) toast('You stepped off the safari cart — walking mode');
}
$('sfPause').onclick = () => { W.safari.paused = !W.safari.paused; $('sfPause').textContent = W.safari.paused ? 'Resume' : 'Pause'; };
$('sfExit').onclick = () => { if (!W.safari.stopped) { W.safari.paused = true; $('sfPause').textContent = 'Resume'; toast('Stopping the cart…'); setTimeout(() => exitSafari(), 1500); } else exitSafari(); };
function updateSafari(dt) {
  const S = W.safari, ev = S.update(dt, W.people);
  if (ev === 'arrive') { const st = S.stops[S.stopIdx]; caption(st.name, SPECIES[st.en.species]?.desc || ''); if (state.autoNarr) narrate(`${st.name}. ${SPECIES[st.en.species]?.desc || ''}`); }
  if (ev === 'depart') $('caption').classList.remove('on');
  if (ev === 'end') { toast('Safari complete — back at the main entrance'); exitSafari(true); return; }
  // turn the passenger's head toward the exhibit while stopped
  const st = S.stops[S.stopIdx];
  if (S.dwell > 0 && st && look.id === null) { const want = wrapAngle(Math.atan2(-(st.en.cx - S.cart.position.x), -(st.en.cz - S.cart.position.z)) - (S.yaw + Math.PI)); S.lookYaw = lerp(S.lookYaw, want, damp(1.5, dt)); }
  S.seatCamera(camera, dt);
  if (frames % 8 === 0) {
    $('sfWhere').textContent = zoneAt(S.cart.position.x, S.cart.position.z).name;
    $('sfNext').textContent = S.dwell > 0 && st ? `Stopped at ${st.name} · ${Math.ceil(S.dwell)} s` : st ? `Next stop: ${st.name}` : 'Returning to the entrance';
    $('sfFill').style.width = (S.progress * 100).toFixed(1) + '%';
    $('zoneName').textContent = $('sfWhere').textContent;
  }
}

// ------------------------------------------------------------------ photo mode
const photo = { base: new V3(), off: new V3() };
function enterPhoto() {
  if (!state.started || state.photo || state.mode === 'cinematic') return;
  if (state.mode === 'camera') { capture(); return; }
  closeAll(); state.photo = true; tourS.paused = true; if (state.mode === 'safari') W.safari.paused = true;
  W.player.active = false; W.player.speed = 0; W.player.bars.visible = false; photo.base.copy(camera.position); photo.off.set(0, 0, 0);
  photo.yaw = camera.rotation.y; photo.pitch = camera.rotation.x;
  $('hud').hidden = true; $('safariUI').hidden = true; $('photoUI').hidden = false; $('phZoom').value = 60;
  toast('Photo mode — frame your shot');
}
function exitPhoto() {
  state.photo = false; camera.fov = 62; camera.updateProjectionMatrix(); $('photoUI').hidden = true; $('hud').hidden = false;
  if (state.mode === 'free') W.player.active = true; tourS.paused = false;
  if (state.mode === 'safari') { $('safariUI').hidden = false; W.safari.paused = false; }
}
$('phExit').onclick = exitPhoto; $('phShoot').onclick = () => capture();
$('phGrid').onchange = e => $('photoUI').classList.toggle('nogrid', !e.target.checked);
async function capture() {
  W.player.bars.visible = false; guide3d.visible = false;
  renderer.render(scene, camera);
  const w = renderer.domElement.width, h = renderer.domElement.height;
  const blob = await new Promise(r => renderer.domElement.toBlob(r, 'image/jpeg', 0.92));
  $('flash').classList.add('on'); setTimeout(() => $('flash').classList.remove('on'), 60);
  if (!blob) { toast('Capture failed'); return; }
  const bmp = await createImageBitmap(blob), tw = 360, th = Math.round(360 * h / w), tc = document.createElement('canvas'); tc.width = tw; tc.height = th; tc.getContext('2d').drawImage(bmp, 0, 0, tw, th);
  const thumb = await new Promise(r => tc.toBlob(r, 'image/jpeg', 0.8));
  const p = camera.position, ex = state.mode === 'camera' ? { en: cam.en } : nearestExhibit(p.x, p.z, 40), zn = zoneAt(p.x, p.z);
  const rec = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()), ts: Date.now(), blob, thumb, w, h, pos: { x: +p.x.toFixed(1), z: +p.z.toFixed(1) }, zone: zn.name, zoneId: zn.id, exhibit: ex ? SPECIES[ex.en.species]?.name : null, exhibitId: ex ? ex.en.id : null, caption: '', kind: 'virtual-photo', via: state.mode === 'camera' ? 'animal-camera' : state.mode === 'safari' ? 'safari' : 'photo-mode' };
  try { await Gallery.add(rec); toast('Saved to My Gallery'); } catch (e) { console.error(e); toast('Could not save (browser storage unavailable)'); }
}
function updatePhoto(dt) {
  const k = c => (keys.has(c) ? 1 : 0);
  const f = k('KeyW') - k('KeyS') + joy.y, s = k('KeyD') - k('KeyA') + joy.x, u = k('KeyE') - k('KeyQ');
  if (look.id !== null) { /* drag-look updates player look; mirror it */ }
  const yaw = state.mode === 'safari' ? W.safari.yaw + Math.PI + W.safari.lookYaw : W.player.heading + W.player.lookYaw;
  const pitch = state.mode === 'safari' ? W.safari.lookPitch : W.player.lookPitch;
  photo.off.x += (-Math.sin(yaw) * f + Math.cos(yaw) * s) * dt * 1.2; photo.off.z += (-Math.cos(yaw) * f - Math.sin(yaw) * s) * dt * 1.2; photo.off.y += u * dt * 0.8;
  const l = Math.hypot(photo.off.x, photo.off.z); if (l > 2.5) { photo.off.x *= 2.5 / l; photo.off.z *= 2.5 / l; } photo.off.y = clamp(photo.off.y, -0.8, 0.8);
  // never step the camera off public ground
  const nx = photo.base.x + photo.off.x, nz = photo.base.z + photo.off.z;
  if (state.mode !== 'safari' && !W.layers.isWalkable(nx, nz)) { photo.off.x *= 0.9; photo.off.z *= 0.9; }
  camera.position.copy(photo.base).add(photo.off);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.fov = lerp(camera.fov, +$('phZoom').value, damp(8, dt)); camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ gallery UI
let gItems = [], gIdx = -1; const urls = [];
async function openGallery() {
  closeAll(); $('gallery').hidden = false; if (state.started && state.mode === 'free') W.player.active = false;
  let all = []; try { all = await Gallery.all(); } catch (e) { toast('Browser storage unavailable'); }
  const zs = $('gZone'), es = $('gExhibit'), zv = zs.value, evv = es.value;
  zs.innerHTML = '<option value="">All zones</option>' + [...new Set(all.map(p => p.zone))].map(z => `<option>${z}</option>`).join(''); zs.value = zv;
  es.innerHTML = '<option value="">All exhibits</option>' + [...new Set(all.map(p => p.exhibit).filter(Boolean))].map(z => `<option>${z}</option>`).join(''); es.value = evv;
  gItems = all.filter(p => (!zs.value || p.zone === zs.value) && (!es.value || p.exhibit === es.value)).sort((a, b) => ($('gSort').value === 'new' ? b.ts - a.ts : a.ts - b.ts));
  urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  $('gGrid').innerHTML = ''; $('gEmpty').hidden = gItems.length > 0;
  gItems.forEach((p, i) => {
    const u = URL.createObjectURL(p.thumb || p.blob); urls.push(u);
    const card = document.createElement('button'); card.className = 'gcard';
    card.innerHTML = `<img src="${u}" alt=""><div><b>${p.caption || p.exhibit || p.zone}</b>${new Date(p.ts).toLocaleString()}</div>`;
    card.onclick = () => openViewer(i); $('gGrid').appendChild(card);
  });
}
['gSort', 'gZone', 'gExhibit'].forEach(id => ($(id).onchange = openGallery));
function closeGallery() { $('gallery').hidden = true; $('viewer').hidden = true; if (state.started && state.mode === 'free' && !state.photo) W.player.active = true; }
let vUrl = null;
function openViewer(i) {
  gIdx = (i + gItems.length) % gItems.length; const p = gItems[gIdx]; if (!p) return;
  if (vUrl) URL.revokeObjectURL(vUrl); vUrl = URL.createObjectURL(p.blob); $('vImg').src = vUrl;
  $('vTitle').textContent = p.exhibit || p.zone;
  $('vMeta').innerHTML = `<dt>Captured</dt><dd>${new Date(p.ts).toLocaleString()}</dd><dt>Zone</dt><dd>${p.zone}</dd><dt>Exhibit</dt><dd>${p.exhibit || '—'}</dd><dt>Position (virtual m)</dt><dd>${p.pos.x}, ${p.pos.z}</dd><dt>Size</dt><dd>${p.w} × ${p.h}</dd><dt>Type</dt><dd>Virtual photograph of the 3D scene${p.via ? ' · ' + p.via : ''}</dd>`;
  $('vCaption').value = p.caption || '';
  $('viewer').hidden = false;
}
$('vCaption').onchange = async e => { const p = gItems[gIdx]; p.caption = e.target.value; await Gallery.update(p.id, { caption: p.caption }); };
$('vDownload').onclick = () => { const p = gItems[gIdx], a = document.createElement('a'); a.href = vUrl; a.download = `IGZP-virtual-photo-${new Date(p.ts).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`; a.click(); };
$('vDelete').onclick = async () => { const p = gItems[gIdx]; if (!confirm('Delete this photo? This cannot be undone.')) return; await Gallery.remove(p.id); $('viewer').hidden = true; openGallery(); };
$('vPrev').onclick = () => openViewer(gIdx - 1); $('vNext').onclick = () => openViewer(gIdx + 1); $('vClose').onclick = () => ($('viewer').hidden = true);

// ------------------------------------------------------------------ cinematic intro + guided (bicycle) tour
const cine = { t: 0, dur: 10 };
function startExperience(guided) {
  W.sound.start(); state.started = true;
  $('intro').classList.add('hide'); setTimeout(() => ($('intro').hidden = true), 1300);
  W.player.place(START.x, START.z, START.heading);
  W.player.setMode('walk');
  W.player.bars.visible = false;
  state.mode = 'cinematic'; document.body.classList.add('cine'); cine.t = 0; cine.guided = guided; cine.c2 = false;
  // approach along the road outside the gate: wide aerial -> the gold nameboard on the granite wall -> visitor position
  const e = W.structures.entrance, g = e.gate, o = e.outward, side = new V3(-o.z, 0, o.x), sign = e.sign.position;
  const eye = W.layers.walkHeight(START.x, START.z) + PLAYER.walk.eye;
  cine.pts = [g.clone().addScaledVector(o, 110).addScaledVector(side, -60).setY(55), sign.clone().addScaledVector(o, 22).addScaledVector(side, 6).setY(sign.y + 3), sign.clone().addScaledVector(o, 12).addScaledVector(side, -3).setY(sign.y + 0.6), new V3(START.x, eye, START.z)];
  cine.look = [g.clone().addScaledVector(o, -120).setY(0), sign.clone(), sign.clone().addScaledVector(side, -2), new V3(START.x - Math.sin(START.heading) * 20, eye - 0.5, START.z - Math.cos(START.heading) * 20)];
  cine.curve = new THREE.CatmullRomCurve3(cine.pts); cine.lcurve = new THREE.CatmullRomCurve3(cine.look);
  caption('Indira Gandhi Zoological Park', 'Visakhapatnam · 625 acres between the Seethakonda hills and Kambalakonda forest');
}
function skipCinematic() { cine.t = cine.dur; }
function updateCinematic(dt) {
  cine.t += dt; const f = clamp(cine.t / cine.dur, 0, 1), e = f * f * (3 - 2 * f);
  camera.position.copy(cine.curve.getPoint(e)); camera.lookAt(cine.lcurve.getPoint(e));
  W.player.bars.visible = W.player.mode === 'bike' && f > 0.96;
  if (cine.t > cine.dur * 0.5 && !cine.c2) { cine.c2 = true; caption('Main Entry', 'Visit the Ticket Counter to select your tour mode and enter'); }
  if (f >= 1) {
    document.body.classList.remove('cine'); $('caption').classList.remove('on');
    state.mode = 'free'; W.player.setMode('walk'); W.player.active = true; $('hud').hidden = false; setHelp();
    if (cine.guided) {
      toast('Welcome to IGZP! Walk up to the Ticket Counter to select your tour mode.', 4000);
    } else {
      toast('Welcome to IGZP! Walk up to the Ticket Counter to buy your ticket and select your tour mode.', 4500);
    }
  }
}
const tourS = { on: false, paused: false, i: 0, path: null, stopT: 0, phase: 'ride' };
function tourTarget(id) {
  const en = W.layers.enclosures.find(e => e.id === id); if (en) return { x: en.view.x, z: en.view.z, en, name: spName(en), sub: SPECIES[en.species]?.desc };
  const b = W.structures.buildings.find(q => q.id === id); if (!b) return null;
  const path = findPath(W.layers, b.x, b.z, b.x, b.z); const p = path ? path[0] : [b.x, b.z];
  return { x: p[0], z: p[1], b, name: b.name, sub: FACILITY_INFO[b.id] || '' };
}
function startGuided() { tourS.on = true; tourS.paused = false; tourS.i = 0; $('tourbar').hidden = false; nextLeg(); toast('Guided bicycle tour — press any movement key to take over'); }
function nextLeg() {
  if (tourS.i >= GUIDED_TOUR.length) { endGuided('Guided tour complete — keep exploring!'); return; }
  const tgt = tourTarget(GUIDED_TOUR[tourS.i]); if (!tgt) { tourS.i++; nextLeg(); return; }
  const p = W.player.pos; tourS.tgt = tgt; tourS.path = findPath(W.layers, p.x, p.z, tgt.x, tgt.z) || [[tgt.x, tgt.z]]; tourS.phase = 'ride';
  $('tourLabel').textContent = `Guided tour · ${tourS.i + 1}/${GUIDED_TOUR.length} · next: ${tgt.name}`;
}
function endGuided(msg) { tourS.on = false; $('tourbar').hidden = true; $('caption').classList.remove('on'); if (msg) toast(msg); }
$('tourPause').onclick = () => { tourS.paused = !tourS.paused; $('tourPause').textContent = tourS.paused ? 'Resume' : 'Pause'; };
$('tourNext').onclick = () => { tourS.i++; $('caption').classList.remove('on'); nextLeg(); };
$('tourEnd').onclick = () => endGuided('Guided tour ended');
function updateGuided(dt) {
  const P = W.player; input.fwd = 0; input.steer = 0; input.brake = false; input.boost = false;
  if (tourS.paused) { input.brake = true; return; }
  if (tourS.phase === 'stop') {
    input.brake = true; tourS.stopT -= dt;
    const tg = tourS.tgt, c = tg.en ? [tg.en.cx, tg.en.cz] : [tg.b.x, tg.b.z];
    const want = wrapAngle(Math.atan2(-(c[0] - P.pos.x), -(c[1] - P.pos.z)) - P.heading);
    if (look.id === null) { P.lookYaw = lerp(P.lookYaw, clamp(want, -2.4, 2.4), damp(1.5, dt)); P.lookPitch = lerp(P.lookPitch, -0.08, damp(1.5, dt)); }
    if (tourS.stopT <= 0) { $('caption').classList.remove('on'); tourS.i++; nextLeg(); }
    return;
  }
  const p = P.pos;
  tourS.stuck = Math.abs(P.speed) < 0.3 ? (tourS.stuck || 0) + dt : 0;
  if (tourS.stuck > 2.5) { tourS.stuck = 0; tourS.path = findPath(W.layers, p.x, p.z, tourS.tgt.x, tourS.tgt.z) || tourS.path; P.heading += 0.6; return; }
  const r = routeAim(tourS.path, p.x, p.z, 6); if (r.passed > 0) tourS.path.splice(0, r.passed);
  const dEnd = Math.hypot(tourS.tgt.x - p.x, tourS.tgt.z - p.z), [wx, wz] = r.aim;
  const want = Math.atan2(-(wx - p.x), -(wz - p.z)), diff = wrapAngle(want - P.heading);
  input.steer = clamp(diff * 2.4, -1, 1);
  input.fwd = Math.abs(diff) > 1.2 ? 0.25 : P.speed < (dEnd < 25 ? 2.5 : 5.2) ? 1 : 0;
  if (dEnd < 4.5) { tourS.phase = 'stop'; tourS.stopT = 8; caption(tourS.tgt.name, tourS.tgt.sub); if (state.autoNarr) narrate(`${tourS.tgt.name}. ${tourS.tgt.sub}`); }
}
$('btnTour').onclick = () => startExperience(true);
$('btnExplore').onclick = () => startExperience(false);

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock(); let time = 0, frames = 0, fpsAcc = 0, slowSec = 0, slowStep = 0, forcedDt = 0, skipRender = false;
const _focus = { position: new V3() };
function frame() {
  const raw = forcedDt || clock.getDelta(), dt = Math.min(raw, 1 / 20); time += dt; U.uTime.value = time;
  const P = W.player;
  if (!state.started) {     // title shot: slow drift over the herbivore section toward the lake and the Seethakonda hills
    titleCam.t += dt; const [gx, gz] = toWorld(300, 330), [lx, lz] = toWorld(700, 360);
    camera.position.set(gx + Math.sin(titleCam.t * 0.04) * 20, 34 + Math.sin(titleCam.t * 0.07) * 2, gz + Math.cos(titleCam.t * 0.05) * 12);
    camera.lookAt(lx, 10, lz);
    P.bars.visible = false;
  } else if (state.mode === 'view') { /* camera placed by test hook */ }
  else if (state.mode === 'cinematic') updateCinematic(dt);
  else if (state.photo) updatePhoto(dt);
  else if (state.mode === 'camera') updateCamera(dt);
  else if (state.mode === 'safari') updateSafari(dt);
  else {
    if (tourS.on) updateGuided(dt); else readInput();
    const nx = nearestExhibit(P.pos.x, P.pos.z, 20);
    P.update(dt, time, input, { nearExhibit: nx && nx.d < 12, photo: false, bump: () => toast('Stay on the visitor paths', 1200) });
    if (frames % 6 === 0) {
      near = nearestExhibit(P.pos.x, P.pos.z, 16); nearFac = near ? null : nearestFacility(P.pos.x, P.pos.z);
      nearTicketCounter = isNearTicketCounter(P.pos.x, P.pos.z);
      const pr = $('prompt');
      if (nearTicketCounter) {
        pr.hidden = false;
        pr.innerHTML = IS_TOUCH ? 'Tap [E] to Buy Ticket & Select Mode' : 'Press [E] to Buy Ticket & Select Mode';
      } else if (near && SPECIES[near.en.species]) {
        pr.hidden = false; pr.innerHTML = `${IS_TOUCH ? 'Tap <b>E</b>' : 'Press <b>E</b>'} to observe the <b>${spName(near.en)}</b>`;
      } else if (nearFac) {
        pr.hidden = false; pr.innerHTML = `${IS_TOUCH ? 'Tap <b>E</b>' : 'Press <b>E</b>'} — ${nearFac.name}`;
      } else {
        pr.hidden = true;
      }
      $('zoneName').textContent = zoneAt(P.pos.x, P.pos.z).name; $('modeName').textContent = modeLabel();
      $('speedVal').textContent = Math.round(Math.abs(P.speed) * 3.6);
    }
    // Gate admission check: if visitor has not purchased ticket, intercept entry through main gate
    if (!state.hasTicket && W.structures?.entrance && state.mode === 'free') {
      const ent = W.structures.entrance, g = ent.gate, outw = ent.outward;
      const fwd = outw.clone().negate();
      const dx = P.pos.x - g.x, dz = P.pos.z - g.z;
      const alongFwd = dx * fwd.x + dz * fwd.z;
      const alongGate = Math.abs(dx * (-fwd.z) + dz * fwd.x);
      if (alongFwd > 0.8 && alongGate < 4.2) {
        P.pos.x = g.x + outw.x * 2.5;
        P.pos.z = g.z + outw.z * 2.5;
        P.speed = 0;
        toast('Admission ticket required to enter! Please purchase a ticket at the Ticket Counter.', 3000);
        openTicketModal();
      }
    }
    updateGuide(dt);
  }
  // the isometric map renders the live world through its own camera
  const iso = W.iso && W.iso.active, viewCam = iso ? W.iso.update(playerPose()) : camera;
  const focus = iso ? (_focus.position.copy(W.iso.focus()), _focus) : camera;
  const cam = focus.position;
  if (!iso) W.sky.follow(camera); else { W.sky.sky.position.copy(W.iso.target); W.sky.sun.target.position.copy(W.iso.target); W.sky.sun.position.copy(W.iso.target).add(new V3(-0.45, 0.62, 0.38).multiplyScalar(180)); W.sky.sun.target.updateMatrixWorld(); }
  W.veg.update(focus); W.veg.animate(dt, time, focus);
  W.animals.update(dt, time, cam);
  W.people.update(dt, time, cam);
  W.structures.update(focus);
  if (!state.photo && state.started && state.mode !== 'camera' && frames % 4 === 0 && !$('hud').hidden) W.map.drawMini($('mini'), state.mode === 'safari' ? { x: W.safari.cart.position.x, z: W.safari.cart.position.z, yaw: camera.rotation.y } : playerPose(), state.route);
  if (W.map.isOpen && W.map.mode === 'live' && frames % 3 === 0) { W.map.player = state.mode === 'safari' ? { x: W.safari.cart.position.x, z: W.safari.cart.position.z, yaw: camera.rotation.y } : playerPose(); W.map.route = state.route; W.map.dest = state.dest; W.map.draw(); }
  if (frames % 10 === 0 && W.sound.ctx) {
    let wsum = 0; for (let a = 0; a < 6; a++) wsum += W.layers.water(cam.x + Math.cos(a) * 20, cam.z + Math.sin(a) * 20);
    const [gx, gz] = toWorld(168, 200), speed = state.mode === 'safari' ? W.safari.speed : Math.abs(P.speed);
    W.sound.update({ speed, coasting: input.fwd <= 0 && state.mode !== 'safari', water: Math.min(1, wsum / 2), crowd: clamp(1 - Math.hypot(cam.x - gx, cam.z - gz) / 120, 0, 1), forest: 0.6 });
  }
  if (!skipRender) renderer.render(scene, viewCam);
  frames++;
  if (raw < 0.5 && !document.hidden) { fpsAcc += raw; }
  if (frames % 60 === 0 && fpsAcc > 0) {
    const fps = 60 / fpsAcc; fpsAcc = 0;
    if (!$('stats').hidden) $('stats').textContent = `${fps.toFixed(0)} fps · ${QK} · pr ${renderer.getPixelRatio().toFixed(2)}\ncalls ${renderer.info.render.calls} · tris ${(renderer.info.render.triangles / 1e3).toFixed(0)}k\npos ${cam.x.toFixed(0)}, ${cam.z.toFixed(0)} · ${state.mode}`;
    if (state.started && !params.has('noadapt')) {
      slowSec = fps < 30 ? slowSec + 1 : 0;
      if (slowSec >= 3 && slowStep < 2) { slowStep++; slowSec = 0; if (slowStep === 1) renderer.setPixelRatio(Math.max(0.8, renderer.getPixelRatio() * 0.75)); else W.sky.sun.castShadow = false; console.info('[igzp] adaptive quality step', slowStep); }
    }
  }
}
addEventListener('resize', () => { if (!innerWidth || !innerHeight) return; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// debug / test hooks
window.IGZP = {
  THREE, scene, camera, renderer, W, state, input, keys, findPath, tourS, START, cam,
  api: { navigateTo, teleportTo, enterCamera, exitCamera, startSafari, exitSafari, openMapView, closeMaps, routeAim, updateGuide, bestViewpoint, enterPhoto, exitPhoto, capture, openPanel, openMapCard, startExperience, skipCinematic, openTicketModal, closeTicketModal, selectTicketMode },
  setView(px, py, pz, lx, ly, lz) { state.started = true; state.mode = 'view'; $('intro').hidden = true; camera.position.set(px, py, pz); camera.lookAt(lx, ly, lz); },
  free() { state.started = true; state.mode = 'free'; $('intro').hidden = true; $('hud').hidden = false; W.player.setMode('walk'); W.player.active = true; setHelp(); },
  ride(exhibitId) { const en = W.layers.enclosures.find(e => e.id === exhibitId); if (!en) return 'no such exhibit'; W.player.place(en.view.x, en.view.z, Math.atan2(-(en.cx - en.view.x), -(en.cz - en.view.z))); this.free(); return 'ok'; },
  /** Advance the simulation deterministically (tests): n frames of dt seconds. */
  step(n, dt = 1 / 30, render = true) { forcedDt = dt; skipRender = !render; for (let i = 0; i < n; i++) frame(); forcedDt = 0; skipRender = false; return { mode: state.mode, tour: tourS.on, leg: tourS.i, phase: tourS.phase, pos: [+W.player.pos.x.toFixed(1), +W.player.pos.z.toFixed(1)], speed: +W.player.speed.toFixed(2) }; },
  async shot(name) { renderer.render(scene, W.iso?.active ? W.iso.cam : camera); const b = await new Promise(r => renderer.domElement.toBlob(r, 'image/jpeg', 0.88)); try { await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: b }); return 'saved'; } catch (e) { return 'no dev server'; } },
  async runTests() { const m = await import('./tests/run-tests.js'); return m.runTests(window.IGZP); },
};

build().then(() => renderer.setAnimationLoop(frame)).catch(e => { console.error(e); $('err').hidden = false; $('err').textContent = 'Something went wrong while building the zoo: ' + e.message; });
