// Animal behaviour: a small per-individual state machine (idle / walk / graze / rest / alert /
// climb / swim / perch / coil ...) with randomised timers so nothing moves in sync, plus
// species-family pose functions that drive the procedural skeletons.
import * as THREE from 'three';
import { WORLD } from '../config.js';
import { template, instantiate, SPECIES_MODELS, TIGER_BENCHMARK, WHITE_TIGER_BENCHMARK, LION_BENCHMARK, HYENA_BENCHMARK, DHOLE_BENCHMARK, MARMOSET_BENCHMARK } from './models.js';
import { buildTiger, tigerMaterials, buildWhiteTiger, whiteTigerMaterials, attachWhiteTigerGLB } from './tiger.js';
import { buildLion, lionMaterials } from './lion.js';
import { buildHyena, hyenaMaterials } from './hyena.js';
import { buildDhole, dholeMaterials } from './dhole.js';
import { buildMarmoset, setupMarmosetViewingPerches, updatePrimateGrooming, applyLemurSunbathingPose, applyChimpKnuckleWalking, playMarmosetTrill, playPrimateChatter, playPrimateScreech, playChimpPantHoot } from './primates.js';
import { attachLionGLB, attachLionessGLB } from './glb-lion.js';
import { attachChimpanzeeGLB } from './glb-chimpanzee.js';
TIGER_BENCHMARK.build = buildTiger;
WHITE_TIGER_BENCHMARK.build = buildWhiteTiger;
LION_BENCHMARK.build = buildLion;
HYENA_BENCHMARK.build = buildHyena;
DHOLE_BENCHMARK.build = buildDhole;
MARMOSET_BENCHMARK.build = buildMarmoset;
import { V3, rand, rr, pick, clamp, lerp, damp, wrapAngle, pointInPoly, insetPoly, seed } from '../core/util.js';

const PROFILE = {
  cat:      { walk: 0.9,  turn: 1.4, states: { rest: 0.42, walk: 0.26, idle: 0.2, pace: 0.12 }, react: 'look', reactDist: 24 },
  lion:     { walk: 0.95, turn: 1.5, states: { rest: 0.44, pace: 0.28, walk: 0.22, idle: 0.045, roar: 0.015 }, react: 'roar', reactDist: 26 },
  canid:    { walk: 1.1,  turn: 2.0, states: { walk: 0.36, idle: 0.24, sniff: 0.22, rest: 0.18 }, react: 'look', reactDist: 18 },
  hyena:    { walk: 0.95, turn: 1.6, states: { scavenge: 0.35, pace: 0.28, cackle: 0.16, rest: 0.13, idle: 0.08 }, react: 'scavenge', reactDist: 22 },
  dhole:    { walk: 1.25, turn: 2.4, states: { trot: 0.38, pack_alert: 0.22, whistle: 0.18, idle: 0.12, rest: 0.10 }, react: 'alert', reactDist: 22, pack: true },
  bear:     { walk: 0.75, turn: 1.2, states: { walk: 0.3, sniff: 0.3, rest: 0.22, idle: 0.18 }, react: 'look', reactDist: 18 },
  grazer:   { walk: 1.0,  turn: 1.2, states: { graze: 0.46, walk: 0.24, idle: 0.2, rest: 0.1 }, react: 'alert', reactDist: 16, herd: true },
  browser:  { walk: 0.9,  turn: 0.8, states: { browse: 0.4, walk: 0.35, idle: 0.25 }, react: 'look', reactDist: 20 },
  elephant: { walk: 0.9,  turn: 0.6, states: { walk: 0.3, forage: 0.3, idle: 0.3, bathe: 0.1 }, react: 'look', reactDist: 25 },
  hippo:    { walk: 0.6,  turn: 0.6, states: { swim: 0.6, idle: 0.25, walk: 0.15 }, react: null },
  rooter:   { walk: 0.8,  turn: 1.5, states: { sniff: 0.5, walk: 0.3, rest: 0.2 }, react: 'look', reactDist: 12 },
  primate:  { walk: 1.0,  turn: 2.5, states: { sit: 0.35, climb: 0.3, walk: 0.2, groom: 0.15 }, react: 'approach', reactDist: 14 },
  ratite:   { walk: 0.9,  turn: 1.5, states: { walk: 0.35, peck: 0.35, idle: 0.3 }, react: 'look', reactDist: 14 },
  wader:    { walk: 0.5,  turn: 1.2, states: { walk: 0.3, peck: 0.4, idle: 0.25, stretch: 0.05 }, react: 'alert', reactDist: 12 },
  ground:   { walk: 0.6,  turn: 2.5, states: { walk: 0.4, peck: 0.45, idle: 0.15 }, react: null },
  swimmer:  { walk: 0.35, turn: 0.8, states: { swim: 0.6, idle: 0.25, preen: 0.15 }, react: null },
  perch:    { walk: 0.5,  turn: 2.0, states: { perched: 0.6, hop: 0.3, preen: 0.1 }, react: null },
  croc:     { walk: 0.35, turn: 0.4, states: { rest: 0.55, swim: 0.3, walk: 0.15 }, react: 'look', reactDist: 10 },
  lizard:   { walk: 0.35, turn: 1.0, states: { rest: 0.6, walk: 0.4 }, react: null },
  snake:    { walk: 0.18, turn: 0.8, states: { coil: 0.6, slither: 0.4 }, react: 'raise', reactDist: 7 },
  tortoise: { walk: 0.06, turn: 0.5, states: { walk: 0.55, rest: 0.45 }, react: null },
  turtle:   { walk: 0.2,  turn: 0.8, states: { swim: 0.6, bask: 0.4 }, react: null },
};
const AQUATIC = new Set(['hippo', 'swimmer', 'croc', 'turtle']);
const pickState = st => { let r = rand(), s = 0; for (const k in st) { s += st[k]; if (r <= s) return k; } return Object.keys(st)[0]; };

class Animal {
  constructor(inst, tpl, species, en, layers, idx) {
    Object.assign(this, inst);
    this.tpl = tpl; this.meta = tpl.meta; this.fam = tpl.fam; this.beh = tpl.beh; this.species = species; this.en = en; this.L = layers;
    this.P = PROFILE[this.beh];
    const k = rr(0.88, 1.1); this.mesh.scale.setScalar(k); this.k = k;
    this.pos = new V3(); this.yaw = rand() * 6.28; this.speed = 0; this.target = new V3(); this.state = 'idle'; this.timer = rr(0, 3);
    this.phase = rand() * 6.28; this.t0 = rand() * 100;
    this.look = 0; this.lookP = 0; this.headDown = 0; this.lie = 0; this.sit = 0; this.raise = 0; this.y = null; this.hop = null; this.flap = 0;
    this.leap = null; this.climbUp = null; this.climbDown = null; this.crouchTimer = 0; this.climbPhase = 0;
    const p = this._point(this.species === 'swan' || (AQUATIC.has(this.beh) && rand() < 0.6) ? 'water' : 'land');
    this.pos.set(p.x, 0, p.z);
    if (this.beh === 'perch' || this.beh === 'primate') {
      if (p.y !== undefined) this.y = p.y;
    } else {
      this.y = null;
    }
    if (this.beh === 'perch' || this.beh === 'primate') {
      const pp = (this.species === 'marmoset' && this.en.perches && this.en.perches.length)
        ? this.en.perches[idx % this.en.perches.length]
        : this._perch();
      if (pp && (rand() < 0.7 || this.species === 'marmoset')) {
        this.pos.set(pp.x, 0, pp.z);
        this.y = pp.y;
        this.state = this.beh === 'perch' ? 'perched' : 'sit';
      }
    }
    this.mesh.userData.animal = this;
    const g0 = layers.heightAt(this.pos.x, this.pos.z);
    const isSwimmer = this.beh === 'swimmer' || this.species === 'swan' || this.species === 'pelican';
    const isAquaticHab = this.en.habitat === 'water';
    const pondLevel = this.en.pondWaterLevel ?? layers.waterLevelAt?.(this.pos.x, this.pos.z) ?? WORLD.waterLevel;
    const w0 = layers.water(this.pos.x, this.pos.z);
    const inWater = (w0 > 0.20 || g0 < pondLevel + 0.05 || isAquaticHab) && (AQUATIC.has(this.beh) || isSwimmer);
    let initY = this.y ?? g0;
    if (this.y === null && inWater) {
      if (isSwimmer) {
        initY = pondLevel - (this.meta.bodyY0 * this.k) + ((this.meta.D || 0.38) * 0.18 * this.k);
      } else if (this.beh === 'hippo') {
        initY = Math.max(g0, pondLevel - this.meta.bodyY0 * this.k - this.meta.D * this.k * 0.22);
      } else if (this.beh === 'turtle') {
        initY = Math.max(g0, pondLevel - this.meta.bodyY0 * this.k + 0.02);
      } else { // croc
        initY = Math.max(g0, pondLevel - this.meta.bodyY0 * this.k - this.meta.D * this.k * 0.15);
      }
    }
    this.mesh.position.set(this.pos.x, initY, this.pos.z);
    this.mesh.rotation.y = this.yaw;
  }
  _point(kind) {
    const en = this.en;
    if (this.species === 'swan' && en.waterPts?.length) {
      const pool = (en.frontWaterPts && rand() < 0.7) ? en.frontWaterPts : en.waterPts;
      return pick(pool);
    }
    const pts = kind === 'water' && en.waterPts.length ? en.waterPts : (en.frontPts && en.frontPts.length && rand() < 0.65 ? en.frontPts : en.landPts);
    return pick(pts.length ? pts : [{ x: en.cx, z: en.cz }]);
  }
  _perch() { return this.en.perches && this.en.perches.length ? pick(this.en.perches) : null; }
  ground(x, z) { return this.L.heightAt(x, z); }

  _startPrimateClimbUp(targetPerch) {
    const g = this.ground(targetPerch.x, targetPerch.z);
    this.pos.x = targetPerch.x;
    this.pos.z = targetPerch.z;
    this.y = g;
    const dur = Math.max(0.9, (targetPerch.y - g) / 1.6); // ~1.6 m/s vertical climbing
    this.climbUp = { fromY: g, toY: targetPerch.y, t: 0, dur, perch: targetPerch };
    this.state = 'climbing_up';
    this.timer = dur + 0.5;
  }

  _startPrimateClimbDown(thenState) {
    const g = this.ground(this.pos.x, this.pos.z);
    const startY = this.y ?? g;
    const dur = Math.max(0.8, (startY - g) / 1.5); // ~1.5 m/s controlled descent
    this.climbDown = { fromY: startY, toY: g, t: 0, dur, then: thenState };
    this.state = 'climbing_down';
    this.timer = dur + 0.5;
  }

  _startPrimateLeap(targetPerch) {
    const fromX = this.pos.x, fromZ = this.pos.z, fromY = this.y ?? this.ground(fromX, fromZ);
    const toX = targetPerch.x, toZ = targetPerch.z, toY = targetPerch.y;
    const dx = toX - fromX, dz = toZ - fromZ;
    const horizDist = Math.hypot(dx, dz);
    const g = 12.0; // gravity acceleration
    // Apex of parabola: clears platforms cleanly
    const apexY = Math.max(fromY, toY) + Math.max(0.4, horizDist * 0.18);
    const tUp = Math.sqrt(Math.max(0.01, 2 * (apexY - fromY) / g));
    const tDown = Math.sqrt(Math.max(0.01, 2 * (apexY - toY) / g));
    const totalTime = Math.max(0.45, tUp + tDown);
    const vy0 = g * tUp;
    this.leap = {
      from: new V3(fromX, fromY, fromZ),
      to: new V3(toX, toY, toZ),
      t: 0,
      dur: totalTime,
      vy0,
      g,
      targetPerch,
    };
    this.yaw = Math.atan2(dx, dz);
    this.state = 'leaping';
    this.timer = totalTime + 0.5;
    if (rand() < 0.65) {
      if (this.species === 'marmoset') playMarmosetTrill(fromX, fromZ, window.__playerPos);
      else playPrimateChatter(fromX, fromZ, window.__playerPos);
    }
  }

  choose(player, dPlayer) {
    const P = this.P;
    let s = pickState(P.states);
    // visitor reactions
    if (P.react && dPlayer < P.reactDist && rand() < 0.5) {
      if (P.react === 'alert') s = this.beh === 'dhole' ? 'pack_alert' : 'alert';
      if (P.react === 'scavenge') s = 'scavenge';
      if (P.react === 'approach') s = 'approach';
      if (P.react === 'raise' && this.species === 'indian_cobra') s = 'raise';
      if (P.react === 'roar') s = rand() < 0.015 ? 'roar' : 'pace';
    }
    this.state = s;
    this.timer = { rest: rr(10, 30), sit: rr(6, 16), coil: rr(10, 25), perched: rr(4, 12), alert: rr(2.5, 5), pack_alert: rr(3, 7), scavenge: rr(6, 15), cackle: rr(3, 6), whistle: rr(3, 6), roar: rr(4.5, 6.0), pace: rr(6, 15), trot: rr(5, 12), graze: rr(5, 14), sniff: rr(4, 9), forage: rr(5, 10), browse: rr(6, 12), groom: rr(5, 10), peck: rr(2, 5), idle: rr(2, 6), preen: rr(3, 6), stretch: 2.5, raise: rr(5, 9), bask: rr(10, 20) }[s] || rr(5, 12);
    const en = this.en;
    if (!en.landPts.length && !en.waterPts.length) { this.state = 'idle'; return; }
    if (!en.landPts.length && s !== 'swim') s = this.state = en.waterPts.length && AQUATIC.has(this.beh) ? 'swim' : 'idle';

    // Primate specific behaviour: move to pole base -> climb up -> leap between perches -> climb down
    if (this.beh === 'primate') {
      const isPerched = this.y !== null && this.y !== undefined;
      if (isPerched) {
        if (s === 'climb') {
          const others = (en.perches || []).filter(p => Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 0.6);
          const leapable = others.filter(p => Math.hypot(p.x - this.pos.x, p.z - this.pos.z) <= 5.5);
          if (leapable.length > 0 && rand() < 0.7) {
            this._startPrimateLeap(pick(leapable));
            return;
          } else {
            this._startPrimateClimbDown('sit');
            return;
          }
        }
        if (s === 'walk' || s === 'approach') {
          // Must climb down to ground first! Never gliding!
          this._startPrimateClimbDown(s);
          return;
        }
        if (s === 'sit' || s === 'groom' || s === 'idle') {
          this.state = s;
          this.timer = rr(6, 16);
          if (s === 'groom') {
            const other = en.animals.find(p => p !== this);
            if (other) {
              this.partner = other;
              other.partner = this;
              this.groomRole = 'groomer';
              other.groomRole = 'receiver';
              other.state = 'groom';
              other.timer = this.timer;
            }
          }
          return;
        }
      } else {
        // Primate on ground
        if (s === 'groom') {
          const other = en.animals.find(p => p !== this);
          if (other) {
            this.partner = other;
            other.partner = this;
            this.groomRole = 'groomer';
            other.groomRole = 'receiver';
            other.state = 'groom';
            other.timer = this.timer;
          }
        }
        if (s === 'climb' && en.perches && en.perches.length) {
          const targetPerch = (this.species === 'marmoset' && en.perches.length > 0)
            ? pick(en.perches.slice(0, Math.min(en.perches.length, 3)))
            : pick(en.perches);
          const dPole = Math.hypot(targetPerch.x - this.pos.x, targetPerch.z - this.pos.z);
          if (dPole < 0.4) {
            this._startPrimateClimbUp(targetPerch);
          } else {
            this.target.set(targetPerch.x, 0, targetPerch.z);
            this.pendingPerch = targetPerch;
            this.state = 'walk_to_pole';
            this.timer = Math.max(6, dPole / (P.walk * 0.8) + 4);
          }
          return;
        } else if (s === 'climb') {
          this.state = 'sit';
          this.timer = rr(5, 12);
          return;
        }
      }
    }

    if (s === 'walk' || s === 'pace' || s === 'trot' || s === 'scavenge' || s === 'slither' || s === 'swim' || s === 'bathe' || s === 'approach') {
      let p;
      if (s === 'swim' || s === 'bathe') p = this._point('water');
      else if (s === 'approach') { p = en.landPts.reduce((b, q) => ((q.x - player.x) ** 2 + (q.z - player.z) ** 2 < (b.x - player.x) ** 2 + (b.z - player.z) ** 2 ? q : b), en.landPts[0] || { x: en.cx, z: en.cz }); }
      else if (s === 'pace') p = pick(en.frontPts && en.frontPts.length && rand() < 0.75 ? en.frontPts : (en.edgePts.length ? en.edgePts : en.landPts));
      else if (P.pack && en.animals.length > 1 && en.landPts.length) {
        // Dhole pack coordination: stay clustered with pack, moving in coordinated formation
        const h = en.herdC;
        p = en.landPts.reduce((b, q) => (Math.hypot(q.x - h.x, q.z - h.z) < Math.hypot(b.x - h.x, b.z - h.z) + rr(-2.5, 2.5) ? q : b));
      }
      else if (P.herd && en.animals.length > 1 && en.landPts.length && rand() < 0.6) { const h = en.herdC; p = en.landPts.reduce((b, q) => (Math.hypot(q.x - h.x, q.z - h.z) < Math.hypot(b.x - h.x, b.z - h.z) + rr(-3, 3) ? q : b)); }
      else p = this._point('land');
      if (!p) p = { x: en.cx, z: en.cz };
      this.target.set(p.x, 0, p.z); this.targetY = p.y;
      if (this.beh === 'hippo' || this.beh === 'croc' || this.beh === 'swimmer' || this.beh === 'turtle') this.inWaterTarget = s === 'swim' || s === 'bathe';
    }
    if (s === 'browse' && en.shade.length) { const [x, z] = pick(en.shade); const a = rand() * 6.28; this.target.set(x + Math.cos(a) * 2.5, 0, z + Math.sin(a) * 2.5); this.state = 'walk'; this.after = 'browse'; }
    if (s === 'rest' && (this.beh === 'cat' || this.beh === 'lion') && en.shade.length && rand() < 0.7) {
      const [x, z] = pick(en.shade);
      const sa = rand() * 6.28, sd = rr(1.8, 3.0);
      this.target.set(x + Math.cos(sa) * sd, 0, z + Math.sin(sa) * sd);
      this.state = 'walk'; this.after = 'rest';
    }
    
    // Birds hopping between perches
    if ((s === 'climb' || s === 'hop') && this.beh === 'perch' && en.perches && en.perches.length) {
      const pp = this._perch();
      this.hop = { from: new V3(this.pos.x, this.y ?? this.ground(this.pos.x, this.pos.z), this.pos.z), to: pp.clone(), t: 0, dur: Math.max(0.6, Math.hypot(pp.x - this.pos.x, pp.z - this.pos.z) / 3.5) };
      this.state = 'hopping';
    } else if (s === 'climb' || s === 'hop') {
      this.state = this.beh === 'perch' ? 'perched' : 'sit';
    }
  }

  update(dt, t, player) {
    const dPlayer = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
    this.timer -= dt;
    const isBusyPrimate = this.state === 'climbing_up' || this.state === 'climbing_down' || this.state === 'leaping' || this.state === 'land_crouch';
    if (this.timer <= 0 && this.state !== 'hopping' && !isBusyPrimate) {
      const after = this.after; this.after = null;
      if (after) { this.state = after; this.timer = rr(8, 20); }
      else this.choose(player, dPlayer);
    }
    const P = this.P;
    const moving = ['walk', 'pace', 'trot', 'scavenge', 'slither', 'swim', 'bathe', 'approach', 'walk_to_pole'].includes(this.state);
    let wantSpeed = 0;
    if (moving) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz), diff = wrapAngle(want - this.yaw);
      this.yaw += clamp(diff, -P.turn * dt, P.turn * dt);
      wantSpeed = P.walk * (this.state === 'swim' ? 0.8 : 1) * Math.max(0, Math.cos(diff)) * (d < 1 ? d : 1);
      if (this.state === 'pace') wantSpeed *= 1.1;
      if (this.state === 'trot') wantSpeed *= 1.25;
      if (this.state === 'scavenge') wantSpeed *= 0.55;
      if (this.state === 'walk_to_pole') {
        if (d < 0.35) {
          this.speed = 0;
          const target = this.pendingPerch;
          this.pendingPerch = null;
          if (target) this._startPrimateClimbUp(target);
          else { this.state = 'sit'; this.timer = rr(4, 10); }
        }
      } else if (d < 0.35) {
        this.timer = 0;
        if (this.after === undefined || this.after === null) this.after = this.state === 'approach' ? 'idle' : null;
      }
    }

    // Primate vertical climb up
    if (this.state === 'climbing_up') {
      const cu = this.climbUp;
      cu.t += dt / cu.dur;
      const f = clamp(cu.t, 0, 1);
      this.pos.x = cu.perch.x;
      this.pos.z = cu.perch.z;
      this.y = lerp(cu.fromY, cu.toY, f);
      this.climbPhase = (this.climbPhase || 0) + dt * 6.5;
      if (cu.t >= 1) {
        this.y = cu.toY;
        this.climbUp = null;
        this.state = 'sit';
        this.timer = rr(6, 16);
      }
    }

    // Primate vertical climb down
    if (this.state === 'climbing_down') {
      const cd = this.climbDown;
      cd.t += dt / cd.dur;
      const f = clamp(cd.t, 0, 1);
      this.y = lerp(cd.fromY, cd.toY, f);
      this.climbPhase = (this.climbPhase || 0) + dt * 5.5;
      if (cd.t >= 1) {
        this.y = null; // Reached ground!
        const then = cd.then;
        this.climbDown = null;
        if (then === 'walk' || then === 'approach') {
          this.choose(player, dPlayer);
        } else {
          this.state = then || 'idle';
          this.timer = rr(4, 10);
        }
      }
    }

    // Primate ballistic parabolic leap
    if (this.state === 'leaping') {
      const lp = this.leap;
      lp.t += dt;
      const f = clamp(lp.t / lp.dur, 0, 1);
      this.pos.x = lerp(lp.from.x, lp.to.x, f);
      this.pos.z = lerp(lp.from.z, lp.to.z, f);
      // y = y0 + vy*t - 0.5*g*t^2
      this.y = lp.from.y + lp.vy0 * lp.t - 0.5 * lp.g * lp.t * lp.t;
      const dyaw = Math.atan2(lp.to.x - lp.from.x, lp.to.z - lp.from.z);
      this.yaw = dyaw;
      if (lp.t >= lp.dur) {
        this.pos.x = lp.to.x;
        this.pos.z = lp.to.z;
        this.y = lp.to.y;
        this.leap = null;
        this.state = 'land_crouch';
        this.crouchTimer = 0.45;
        this.timer = 0.45;
      }
    }

    // Primate landing crouch and recovery
    if (this.state === 'land_crouch') {
      this.crouchTimer -= dt;
      if (this.crouchTimer <= 0) {
        this.crouchTimer = 0;
        this.state = 'sit';
        this.timer = rr(6, 14);
      }
    }

    // Bird hopping
    if (this.state === 'hopping') {
      const h = this.hop; h.t += dt / h.dur; const f = clamp(h.t, 0, 1);
      this.pos.set(lerp(h.from.x, h.to.x, f), 0, lerp(h.from.z, h.to.z, f));
      this.y = lerp(h.from.y, h.to.y, f) + Math.sin(f * Math.PI) * Math.min(2, 0.6 + Math.hypot(h.to.x - h.from.x, h.to.z - h.from.z) * 0.3);
      const dy = Math.atan2(h.to.x - h.from.x, h.to.z - h.from.z);
      if (Math.hypot(h.to.x - h.from.x, h.to.z - h.from.z) > 0.2) this.yaw += wrapAngle(dy - this.yaw) * damp(8, dt);
      this.flap = this.fam === 'bird' ? 1 : 0;
      if (h.t >= 1) {
        const onGround = Math.abs(h.to.y - this.ground(h.to.x, h.to.z)) < 0.05;
        this.y = onGround ? null : h.to.y; this.hop = null; this.flap = 0;
        if (h.then) { this.y = null; this.choose(player, dPlayer); }
        else { this.state = 'perched'; this.timer = rr(6, 14); }
      }
    }

    this.speed = lerp(this.speed, wantSpeed, damp(3, dt));
    if (this.speed > 0.01) {
      const nx = this.pos.x + Math.sin(this.yaw) * this.speed * dt, nz = this.pos.z + Math.cos(this.yaw) * this.speed * dt;
      const okWater = AQUATIC.has(this.beh) || this.L.water(nx, nz) < 0.45;
      if (pointInPoly(nx, nz, this.en.inner) && okWater) { this.pos.x = nx; this.pos.z = nz; }
      else { this.speed = 0; this.timer = Math.min(this.timer, 0.2); }
    }

    // heights: ground, water surface (swimmers float / hippo & crocs mostly submerged), perches
    const g = this.ground(this.pos.x, this.pos.z), w = this.L.water(this.pos.x, this.pos.z);
    let y = g;
    const isAquaticHab = this.en.habitat === 'water';
    const isSwimmer = this.beh === 'swimmer' || this.species === 'swan' || this.species === 'pelican';
    const pondLevel = this.en.pondWaterLevel ?? this.L.waterLevelAt?.(this.pos.x, this.pos.z) ?? WORLD.waterLevel;
    const inWater = (w > 0.20 || g < pondLevel + 0.05 || isAquaticHab) && (AQUATIC.has(this.beh) || isSwimmer);

    if (this.beh !== 'perch' && this.beh !== 'primate') {
      this.y = null;
    }
    if (this.y !== null && this.y !== undefined) {
      y = this.y;
    } else if (inWater) {
      const D = this.meta.D * this.k;
      const waterSurface = pondLevel;
      if (isSwimmer) {
        // Accurate waterline buoyancy: ~35% body keel submerged at pondWaterLevel
        const submersion = (this.meta.D || 0.38) * 0.18 * this.k;
        const bob = Math.sin(t * 1.8 + this.t0) * 0.016 + Math.cos(t * 0.9 + this.t0) * 0.008;
        y = waterSurface - (this.meta.bodyY0 * this.k) + submersion + bob;
      } else if (this.beh === 'hippo') {
        y = Math.max(g, waterSurface - this.meta.bodyY0 * this.k - D * 0.22);
      } else if (this.beh === 'turtle') {
        y = Math.max(g, waterSurface - this.meta.bodyY0 * this.k + 0.02);
      } else { // croc
        y = Math.max(g, waterSurface - this.meta.bodyY0 * this.k - D * 0.15);
      }
    }
    this.mesh.position.set(this.pos.x, y, this.pos.z);

    // pitch to the slope for ground walkers (snakes handle slope along spine bones; swimmers bob on water)
    if (this.fam === 'snake') {
      this.mesh.rotation.set(0, this.yaw, 0);
    } else if (inWater && isSwimmer) {
      const bobPitch = Math.sin(t * 1.5 + this.t0) * 0.024;
      const bobRoll = Math.cos(t * 1.1 + this.t0) * 0.018;
      this.mesh.rotation.set(bobPitch, this.yaw, bobRoll, 'YXZ');
    } else {
      const L = (this.meta.L || 1) * this.k * 0.5;
      const slope = (this.y === null || this.y === undefined) ? Math.atan2(
        this.ground(this.pos.x + Math.sin(this.yaw) * L, this.pos.z + Math.cos(this.yaw) * L) -
        this.ground(this.pos.x - Math.sin(this.yaw) * L, this.pos.z - Math.cos(this.yaw) * L),
        2 * L
      ) : 0;
      this.mesh.rotation.set(-clamp(slope, -0.4, 0.4), this.yaw, 0, 'YXZ');
    }

    // Dhole pack coordination: alerts trigger pack sentinels
    if (this.beh === 'dhole' && (this.state === 'whistle' || this.state === 'pack_alert')) {
      for (const mate of (this.en.animals || [])) {
        if (mate !== this && mate.beh === 'dhole' && (mate.state === 'idle' || mate.state === 'trot') && rand() < 0.25) {
          mate.state = 'pack_alert';
          mate.timer = rr(3, 6);
          mate.look = this.look;
        }
      }
    }

    // Animal vocalization triggers (Striped Hyena cackles/whoops & Dhole whistling chirps)
    if (this.state === 'cackle' && this.beh === 'hyena') {
      this.vocalTimer = (this.vocalTimer ?? 0) - dt;
      if (this.vocalTimer <= 0) {
        this.vocalTimer = 3.5 + rand() * 3.5;
        if (dPlayer < 35 && window.__soundscape?.hyenaCackle) {
          const panX = clamp((this.pos.x - player.x) / 30, -0.9, 0.9);
          window.__soundscape.hyenaCackle(panX);
        }
      }
    } else if (this.state === 'whistle' && this.beh === 'dhole') {
      this.vocalTimer = (this.vocalTimer ?? 0) - dt;
      if (this.vocalTimer <= 0) {
        this.vocalTimer = 2.8 + rand() * 3.2;
        if (dPlayer < 35 && window.__soundscape?.dholeWhistle) {
          const panX = clamp((this.pos.x - player.x) / 30, -0.9, 0.9);
          window.__soundscape.dholeWhistle(panX);
        }
      }
    } else if (this.state === 'roar' && (this.beh === 'lion' || this.species === 'lion')) {
      if (!this.roared) {
        this.roared = true;
        const snd = (typeof window !== 'undefined' ? (window.W?.sound || window.__soundscape) : null);
        if (snd?.lionRoar) {
          const panX = clamp((this.pos.x - player.x) / 35, -0.9, 0.9);
          snd.lionRoar(panX, dPlayer);
        }
      }
      // Animate open mouth during ground-shaking roar
      const roarProg = clamp(1.0 - (this.timer / 5.0), 0, 1);
      let mOpen = 0;
      if (roarProg > 0.08 && roarProg < 0.70) {
        mOpen = 0.65 + Math.sin(t * 16.0) * 0.08;
      } else if (roarProg >= 0.70 && roarProg < 0.95) {
        mOpen = Math.max(0, Math.sin((roarProg - 0.70) * 22.0)) * 0.45;
      }
      this.roarMouth = lerp(this.roarMouth || 0, mOpen, damp(12, dt));
    } else {
      this.roared = false;
      this.roarMouth = lerp(this.roarMouth || 0, 0, damp(8, dt));
    }

    // look at the visitor when close (and not busy)
    let wantLook = Math.sin(t * 0.3 + this.t0) * 0.5 * (this.state === 'idle' || this.state === 'sit' ? 1 : 0.3), wantLookP = 0;
    if (P.react && dPlayer < (P.reactDist || 15) * 1.3 && (!moving || this.fam === 'lion') && !isBusyPrimate) {
      wantLook = clamp(wrapAngle(Math.atan2(player.x - this.pos.x, player.z - this.pos.z) - this.yaw), -1.2, 1.2);
      wantLookP = -0.15;
    }
    this.look = lerp(this.look, wantLook, damp(2, dt));
    this.lookP = lerp(this.lookP, wantLookP, damp(2, dt));
    const down = ['graze', 'sniff', 'forage', 'peck', 'scavenge'].includes(this.state) ? 1 : 0;
    this.headDown = lerp(this.headDown, down, damp(1.6, dt));
    this.lie = lerp(this.lie, this.state === 'rest' && (this.fam === 'quad' || this.fam === 'tiger' || this.fam === 'white_tiger' || this.fam === 'hyena' || this.fam === 'dhole' || this.fam === 'lion') && !['elephant', 'grazer'].includes(this.beh) || (this.state === 'rest' && this.beh === 'grazer') ? 1 : 0, damp(1.2, dt));
    this.sit = lerp(this.sit, (this.state === 'sit' || this.state === 'groom' || this.state === 'idle' && this.beh === 'primate') ? 1 : 0, damp(2.5, dt));
    this.raise = lerp(this.raise, this.state === 'raise' ? 1 : 0, damp(1.5, dt));
    this.phase += dt * (this.speed / Math.max(0.15, (this.meta.leg || 0.3) * this.k * 1.3)) * Math.PI;
    POSE[this.fam](this, t, dt);
  }
}

// ---------------------------------------------------------------- poses
const B = (a, n) => a.bone[n];
const POSE = {
  quad(a, t, dt) {
    const m = a.meta, g = clamp(a.speed / (a.P.walk || 1), 0, 1.5), ph = a.phase, lie = a.lie, sit = a.sit;
    const body = B(a, 'body'), legH = m.leg;
    const isPrimate = a.beh === 'primate';
    const isClimbing = isPrimate && (a.state === 'climbing_up' || a.state === 'climbing_down');
    const isLeaping = isPrimate && a.state === 'leaping';
    const isLandCrouch = isPrimate && a.state === 'land_crouch';

    if (isClimbing) {
      // Primate vertical pole climbing with alternating limb kinematics
      body.position.copy(a.rest.body);
      body.rotation.set(-1.18, 0, 0); // vertical posture against climbing pole
      const cph = a.climbPhase || 0;
      const climbDir = a.state === 'climbing_up' ? 1 : -1;
      // Alternating limb reach and push
      B(a, 'lf1').rotation.set(-1.3 + Math.sin(cph) * 0.45, 0, 0.15);
      B(a, 'lf2').rotation.set(0.6 + Math.cos(cph) * 0.4, 0, 0);
      B(a, 'rf1').rotation.set(-1.3 - Math.sin(cph) * 0.45, 0, -0.15);
      B(a, 'rf2').rotation.set(0.6 - Math.cos(cph) * 0.4, 0, 0);
      B(a, 'rh1').rotation.set(-0.4 - Math.sin(cph) * 0.4, 0, -0.1);
      B(a, 'rh2').rotation.set(1.5 - Math.cos(cph) * 0.35, 0, 0);
      B(a, 'lh1').rotation.set(-0.4 + Math.sin(cph) * 0.4, 0, 0.1);
      B(a, 'lh2').rotation.set(1.5 + Math.cos(cph) * 0.35, 0, 0);

      const neck = B(a, 'neck'), head = B(a, 'head');
      neck.rotation.set(climbDir * 0.45, a.look * 0.3, 0);
      head.rotation.set(climbDir * 0.25, a.look * 0.3, 0);
      if (a.bone.tail1) { a.bone.tail1.rotation.set(0.2, Math.sin(cph) * 0.25, 0); a.bone.tail2.rotation.y = Math.sin(cph - 0.5) * 0.3; }
      return;
    }

    if (isLeaping) {
      // Primate ballistic flight pose
      const vy = a.leap ? (a.leap.vy0 - a.leap.g * a.leap.t) : 0;
      const pitch = clamp(-vy * 0.04, -0.45, 0.45);
      body.position.copy(a.rest.body);
      body.rotation.set(-0.35 + pitch, 0, 0);
      // Arms reach forward toward landing branch
      B(a, 'lf1').rotation.set(-1.35, 0, 0.15); B(a, 'lf2').rotation.set(0.35, 0, 0);
      B(a, 'rf1').rotation.set(-1.35, 0, -0.15); B(a, 'rf2').rotation.set(0.35, 0, 0);
      // Hindlegs trail behind
      B(a, 'lh1').rotation.set(0.55, 0, 0.1); B(a, 'lh2').rotation.set(1.1, 0, 0);
      B(a, 'rh1').rotation.set(0.55, 0, -0.1); B(a, 'rh2').rotation.set(1.1, 0, 0);

      const neck = B(a, 'neck'), head = B(a, 'head');
      neck.rotation.set(0.3, 0, 0); head.rotation.set(0.15, 0, 0);
      if (a.bone.tail1) { a.bone.tail1.rotation.set(-0.3, 0, 0); a.bone.tail2.rotation.y = 0; }
      return;
    }

    if (isLandCrouch) {
      // Landing crouch and impact recovery
      const cr = clamp(a.crouchTimer / 0.45, 0, 1);
      body.position.copy(a.rest.body);
      body.position.y -= cr * legH * 0.4;
      body.rotation.set(-0.45 * cr, 0, 0);
      B(a, 'lf1').rotation.set(0.65 * cr, 0, 0.15); B(a, 'lf2').rotation.set(1.5 * cr, 0, 0);
      B(a, 'rf1').rotation.set(0.65 * cr, 0, -0.15); B(a, 'rf2').rotation.set(1.5 * cr, 0, 0);
      B(a, 'lh1').rotation.set(-1.1 * cr, 0, 0.2); B(a, 'lh2').rotation.set(2.3 * cr, 0, 0);
      B(a, 'rh1').rotation.set(-1.1 * cr, 0, -0.2); B(a, 'rh2').rotation.set(2.3 * cr, 0, 0);

      const neck = B(a, 'neck'), head = B(a, 'head');
      neck.rotation.set(0.3 * cr, 0, 0); head.rotation.set(-0.15 * cr, 0, 0);
      if (a.bone.tail1) a.bone.tail1.rotation.set(0.2, 0, 0);
      return;
    }

    if (isPrimate && a.state === 'groom') {
      updatePrimateGrooming(a, a.partner, dt, t);
      return;
    }
    if (a.species === 'ring_tailed_lemur' && (a.state === 'sit' || a.state === 'sunbathe')) {
      applyLemurSunbathingPose(a, t);
      return;
    }
    if (a.species === 'chimpanzee' && g > 0.05 && a.state !== 'sit') {
      applyChimpKnuckleWalking(a, t, dt, g, ph);
      return;
    }

    // Standard quadruped locomotion and poses
    body.position.copy(a.rest.body);
    body.position.y += Math.abs(Math.sin(ph)) * 0.028 * legH * g - lie * legH * 0.62 - sit * legH * 0.45;
    body.rotation.set(-sit * 0.85 + Math.sin(ph * 2) * 0.02 * g, Math.sin(ph) * 0.035 * g, Math.sin(ph) * 0.025 * g);

    const isGiraffe = a.species === 'giraffe';
    // Giraffes use a pacing gait (ipsilateral legs in phase); other quadrupeds use diagonal/lateral sequence
    const offs = isGiraffe
      ? { lh: 0, lf: 0.12, rh: Math.PI, rf: Math.PI + 0.12 }
      : { lh: 0, lf: Math.PI * 0.5, rh: Math.PI, rf: Math.PI * 1.5 };

    for (const n of m.legs) {
      const front = n[1] === 'f', u = B(a, n + '1'), l = B(a, n + '2'), p = ph + offs[n];
      const stance = Math.sin(p);
      const lift = Math.max(0, -Math.cos(p));
      let ux = -stance * (front ? 0.42 : 0.38) * g;
      let lx = lift * (front ? 0.8 : 0.85) * g;

      // lying: legs folded under the body; sitting (primates/cats): hind legs forward, arms down
      ux = lerp(ux, front ? 0.35 : -1.2, lie); lx = lerp(lx, front ? 2.3 : 2.4, lie);
      if (front) { ux = lerp(ux, 0.85, sit); lx = lerp(lx, 0.1, sit); }
      else { ux = lerp(ux, -0.5, sit); lx = lerp(lx, 1.6, sit); }
      if (a.state === 'groom' && n === 'rf') { ux = -0.4 + Math.sin(t * 6) * 0.25; lx = 1.6; }
      u.rotation.x = ux; l.rotation.x = lx;
      u.rotation.z = front ? 0 : (n[0] === 'l' ? 1 : -1) * 0.08 * sit;
    }
    const neck = B(a, 'neck'), head = B(a, 'head');
    const graze = a.beh === 'grazer' || a.beh === 'rooter' ? 1.25 : a.beh === 'elephant' ? 0.25 : 0.7;
    const browse = a.state === 'browse' ? -0.5 + Math.sin(t * 0.7) * 0.1 : 0;
    const giraffeNeck = isGiraffe ? Math.sin(ph) * 0.08 * g : 0;
    neck.rotation.set(a.headDown * graze + browse + giraffeNeck + a.lookP + lie * 0.25 + sit * 0.75 + Math.sin(ph * 2) * 0.03 * g, a.look * 0.55, 0);
    head.rotation.set(a.headDown * 0.25 + (a.state === 'alert' ? -0.25 : 0) + Math.sin(t * 2.3 + a.t0) * 0.02, a.look * 0.45, Math.sin(t * 0.5 + a.t0) * 0.03);
    if (a.bone.tail1) {
      if (a.species === 'hamadryas_baboon') {
        a.bone.tail1.rotation.set(-0.75 + Math.sin(t * 1.4 + a.t0) * 0.08, Math.sin(t * 1.8 + a.t0) * 0.12, 0);
        if (a.bone.tail2) a.bone.tail2.rotation.set(1.4 + Math.sin(t * 1.8 + a.t0) * 0.12, 0, 0);
      } else if (a.species === 'langur' || a.species === 'common_langur') {
        a.bone.tail1.rotation.set(-1.1 + Math.sin(t * 1.1 + a.t0) * 0.06, Math.sin(t * 1.5 + a.t0) * 0.1, 0);
        if (a.bone.tail2) a.bone.tail2.rotation.set(0.85 + Math.sin(t * 1.5 + a.t0) * 0.08, 0, 0);
      } else {
        a.bone.tail1.rotation.set(Math.sin(t * 0.7 + a.t0) * 0.1, Math.sin(t * (a.beh === 'grazer' ? 2.8 : 1.4) + a.t0) * 0.35, 0);
        if (a.bone.tail2) a.bone.tail2.rotation.y = Math.sin(t * 2 + a.t0 - 0.8) * 0.4;
      }
    }
    if (a.bone.trunk1) {   // elephant trunk & ears
      const forage = a.state === 'forage' ? 1 : 0;
      a.bone.trunk1.rotation.set(Math.sin(t * 0.6 + a.t0) * 0.15 + forage * 0.25, Math.sin(t * 0.4 + a.t0) * 0.25, 0);
      a.bone.trunk2.rotation.set(Math.sin(t * 0.8 + a.t0) * 0.25 + forage * 0.3, Math.sin(t * 0.55) * 0.2, 0);
      a.bone.trunk3.rotation.set(-0.4 + Math.sin(t * 1.1 + a.t0) * 0.35 - forage * 0.2, 0, 0);
      const flap = Math.sin(t * 1.7 + a.t0) * 0.25 + 0.15;
      a.bone.earL.rotation.y = flap; a.bone.earR.rotation.y = -flap;
      if (a.state === 'idle') body.rotation.z += Math.sin(t * 0.9 + a.t0) * 0.03;   // gentle weight shift
    }
  },
  /** African Lion & Lioness: heavy regal feline swagger, flexing spine,
   *  territorial pacing, sphinx and pride resting poses, open-mouthed ground-shaking roar,
   *  and alert stereoscopic gaze tracking visitors. */
  lion(a, t, dt) {
    const g = clamp(a.speed / (a.P.walk || 1), 0, 1.6), ph = a.phase, lie = a.lie, R = a.rest, B2 = n => a.bone[n];
    const hips = B2('hips'), chest = B2('chest');
    hips.position.copy(R.hips); chest.position.copy(R.chest);

    const isRoaring = a.state === 'roar';
    const isPacing = a.state === 'pace';

    // Characteristic heavy, slow, regal swagger with lateral pelvic sway
    const swaggerRoll = Math.sin(ph) * (isPacing ? 0.045 : 0.035) * g;
    hips.position.y += Math.sin(ph * 2) * 0.014 * g - lie * 0.52;
    const roarHeave = isRoaring ? Math.sin(t * 16.0) * 0.016 : 0;
    chest.position.y += Math.sin(t * 1.4 + a.t0) * 0.005 + lie * 0.06 + roarHeave;
    hips.rotation.set(lie * 0.04, Math.sin(ph) * 0.05 * g, swaggerRoll + lie * 0.12);
    chest.rotation.set(-lie * 0.06 + Math.sin(ph * 2 + 0.5) * 0.015 * g + (isRoaring ? -0.16 : 0), -Math.sin(ph) * 0.06 * g, -swaggerRoll - lie * 0.1);

    // Diagonal-sequence felid walk
    const off = { lh: 0, lf: Math.PI / 2, rh: Math.PI, rf: Math.PI * 1.5 };
    for (const n of ['lf', 'rf', 'lh', 'rh']) {
      const p = ph + off[n], front = n[1] === 'f', side = n[0] === 'l' ? 1 : -1, lift = Math.max(0, Math.cos(p - 0.6));
      let u = -Math.sin(p) * (front ? 0.40 : 0.36) * g;
      let l = (front ? 0.95 : -0.75) * lift * g;
      let w = (front ? -0.55 : 0.85) * lift * g;
      let uz = 0;
      if (front) {
        u = lerp(u, isRoaring ? -0.05 : -1.25, lie);
        l = lerp(l, 0.05, lie);
        w = lerp(w, 1.15, lie);
      } else {
        u = lerp(u, -1.0, lie);
        l = lerp(l, 1.75, lie);
        w = lerp(w, -0.75, lie);
        uz = side * 0.35 * lie;
      }
      // Planted wide stance during roaring
      if (isRoaring && !lie) {
        u = front ? 0.06 : -0.06;
        l = 0;
        w = 0;
        uz = side * 0.08;
      }
      B2(n + '1').rotation.set(u, 0, uz);
      B2(n + '2').rotation.x = l;
      B2(n + '3').rotation.x = w;
    }

    // Proud, regal head carriage + alert visitor tracking + roaring throat arch
    const neck = B2('neck'), head = B2('head'), jaw = B2('jaw');
    const roarNeck = isRoaring ? -0.34 : 0;
    const roarHead = isRoaring ? 0.36 : 0;
    neck.rotation.set(0.18 * Math.min(g, 1) - lie * 0.22 + a.lookP + a.headDown * 0.6 + roarNeck, a.look * 0.52, 0);
    head.rotation.set(-0.10 * Math.min(g, 1) + lie * 0.16 + Math.sin(t * 0.6 + a.t0) * 0.02 + roarHead, a.look * 0.48, Math.sin(t * 0.4 + a.t0) * 0.03 * lie);

    // Articulated jaw: opens wide during roar exposing fangs and tongue!
    if (jaw) {
      jaw.rotation.x = a.roarMouth || 0;
    }

    // Ear flicks & alert reaction
    a.flickT = (a.flickT ?? 3) - dt;
    if (a.flickT < 0) {
      a.flickT = 2.5 + Math.random() * 5;
      a.flickSide = Math.random() < 0.5 ? 'earL' : 'earR';
      a.flick = 1;
    }
    a.flick = Math.max(0, (a.flick || 0) - dt * 5);
    const earPin = isRoaring ? -0.22 : 0;
    B2('earL').rotation.set(earPin, 0, 0);
    B2('earR').rotation.set(earPin, 0, 0);
    if (a.flickSide && !isRoaring) {
      B2(a.flickSide).rotation.set(-Math.sin(a.flick * Math.PI) * 0.45, 0, (a.flickSide === 'earL' ? 1 : -1) * Math.sin(a.flick * Math.PI) * 0.3);
    }

    // Long tufted tail: gentle S-curve sway, raised and curled during roaring/alert
    for (let i = 1; i <= 4; i++) {
      const b = B2('tail' + i);
      if (b) {
        const sway = Math.sin(t * (1.1 + g * 0.7 + (isRoaring ? 2.5 : 0)) - i * 0.75 + a.t0) * (0.08 + 0.06 * i) * (0.6 + 0.6 * g + (isRoaring ? 1.2 : 0));
        const basePitch = isRoaring ? (i === 1 ? -0.28 : i === 4 ? -0.55 : 0.08) : (i === 1 ? 0.25 - g * 0.15 - lie * 0.4 : i === 4 ? -0.42 : 0.05);
        b.rotation.set(basePitch, sway + (i === 1 ? lie * 0.85 : 0), 0);
      }
    }
  },
  /** Bengal tiger benchmark: diagonal-sequence walk, flexing spine, low "stalking" head carriage,
   *  S-curved tail, ear flicks, breathing, and a sphinx-like resting pose with the head up. */
  tiger(a, t, dt) {
    const g = clamp(a.speed / (a.P.walk || 1), 0, 1.6), ph = a.phase, lie = a.lie, R = a.rest, B2 = n => a.bone[n];
    const hips = B2('hips'), chest = B2('chest');
    hips.position.copy(R.hips); chest.position.copy(R.chest);
    hips.position.y += Math.sin(ph * 2) * 0.012 * g - lie * 0.5;
    chest.position.y += Math.sin(t * 1.5 + a.t0) * 0.004 + lie * 0.06;           // breathing
    hips.rotation.set(lie * 0.04, Math.sin(ph) * 0.05 * g, lie * 0.12);
    chest.rotation.set(-lie * 0.06 + Math.sin(ph * 2 + 0.5) * 0.015 * g, -Math.sin(ph) * 0.07 * g, -lie * 0.1);
    const off = { lh: 0, lf: Math.PI / 2, rh: Math.PI, rf: Math.PI * 1.5 };
    for (const n of ['lf', 'rf', 'lh', 'rh']) {
      const p = ph + off[n], front = n[1] === 'f', side = n[0] === 'l' ? 1 : -1, lift = Math.max(0, Math.cos(p - 0.6));
      let u = -Math.sin(p) * (front ? 0.42 : 0.38) * g, l = (front ? 0.95 : -0.75) * lift * g, w = (front ? -0.55 : 0.85) * lift * g, uz = 0;
      if (front) { u = lerp(u, -1.25, lie); l = lerp(l, 0.05, lie); w = lerp(w, 1.15, lie); }               // forelegs stretched forward
      else { u = lerp(u, -1.0, lie); l = lerp(l, 1.75, lie); w = lerp(w, -0.75, lie); uz = side * 0.35 * lie; } // haunches folded
      B2(n + '1').rotation.set(u, 0, uz); B2(n + '2').rotation.x = l; B2(n + '3').rotation.x = w;
    }
    const neck = B2('neck'), head = B2('head');
    neck.rotation.set(0.22 * Math.min(g, 1) - lie * 0.25 + a.lookP + a.headDown * 0.7, a.look * 0.5, 0);
    head.rotation.set(-0.12 * Math.min(g, 1) + lie * 0.18 + Math.sin(t * 0.6 + a.t0) * 0.02, a.look * 0.45, Math.sin(t * 0.4 + a.t0) * 0.04 * lie);
    // ear flicks every few seconds
    a.flickT = (a.flickT ?? 3) - dt; if (a.flickT < 0) { a.flickT = 2 + Math.random() * 6; a.flickSide = Math.random() < 0.5 ? 'earL' : 'earR'; a.flick = 1; }
    a.flick = Math.max(0, (a.flick || 0) - dt * 5);
    B2('earL').rotation.set(0, 0, 0); B2('earR').rotation.set(0, 0, 0);
    if (a.flickSide) B2(a.flickSide).rotation.set(-Math.sin(a.flick * Math.PI) * 0.5, 0, (a.flickSide === 'earL' ? 1 : -1) * Math.sin(a.flick * Math.PI) * 0.3);
    // tail: hangs in a relaxed S, sways slowly, tip curls; flicks more when walking
    for (let i = 1; i <= 4; i++) {
      const b = B2('tail' + i), sway = Math.sin(t * (1.0 + g * 0.6) - i * 0.75 + a.t0) * (0.08 + 0.05 * i) * (0.6 + 0.6 * g);
      b.rotation.set(i === 1 ? 0.25 - g * 0.15 - lie * 0.4 : i === 4 ? -0.45 : 0.05, sway + (i === 1 ? lie * 0.9 : 0), 0);
    }
  },
  white_tiger(a, t, dt) {
    return this.tiger(a, t, dt);
  },
  /** Striped Hyena: pacing/loping gait with rocking hunchbacked stride, head carried low,
   *  scavenging bone-crushing jaw motions, large bat ear flicks, and laughing cackles/whoops. */
  hyena(a, t, dt) {
    const g = clamp(a.speed / (a.P.walk || 1), 0, 1.6), ph = a.phase, lie = a.lie, R = a.rest, B2 = n => a.bone[n];
    const hips = B2('hips'), chest = B2('chest');
    hips.position.copy(R.hips); chest.position.copy(R.chest);

    // Iconic hyena pacing gait: ipsilateral legs move nearly in phase (LH + LF, then RH + RF)
    // Produces characteristic rolling / rocking hunchbacked stride
    const roll = Math.sin(ph) * 0.055 * g;
    const hunchBob = Math.abs(Math.sin(ph)) * 0.025 * g;
    hips.position.y += Math.sin(ph * 2) * 0.015 * g - lie * 0.42;
    chest.position.y += hunchBob + Math.sin(t * 1.6 + a.t0) * 0.005 + lie * 0.05; // breathing + hunch bob
    hips.rotation.set(lie * 0.06, Math.sin(ph) * 0.06 * g, roll + lie * 0.12);
    chest.rotation.set(-lie * 0.08 + Math.sin(ph * 2 + 0.4) * 0.02 * g, -Math.sin(ph) * 0.07 * g, -roll - lie * 0.1);

    // Pacing gait phase offsets (lateral pairs move together)
    const offs = { lh: 0, lf: 0.18, rh: Math.PI, rf: Math.PI + 0.18 };
    for (const n of ['lf', 'rf', 'lh', 'rh']) {
      const p = ph + offs[n], front = n[1] === 'f', side = n[0] === 'l' ? 1 : -1;
      const lift = Math.max(0, -Math.cos(p));
      let u = -Math.sin(p) * (front ? 0.44 : 0.36) * g;
      let l = lift * (front ? 0.85 : 0.75) * g;
      let w = lift * (front ? -0.45 : 0.65) * g;
      let uz = 0;
      if (front) {
        u = lerp(u, -1.15, lie); l = lerp(l, 0.1, lie); w = lerp(w, 1.05, lie);
      } else {
        u = lerp(u, -0.95, lie); l = lerp(l, 1.65, lie); w = lerp(w, -0.65, lie); uz = side * 0.28 * lie;
      }
      if (a.state === 'scavenge' && front && Math.sin(t * 8) > 0.4) {
        u += 0.35 * Math.sin(t * 8); l += 0.25;
      }
      B2(n + '1').rotation.set(u, 0, uz);
      B2(n + '2').rotation.x = l;
      B2(n + '3').rotation.x = w;
    }

    // Head carriage: characteristically CARRIED LOW, sniffing and scavenging!
    const neck = B2('neck'), head = B2('head'), jaw = B2('jaw');
    const isCackle = a.state === 'cackle';
    const isScavenge = a.state === 'scavenge';
    const neckDown = isScavenge ? 0.55 : 0.28 * Math.min(g, 1);
    neck.rotation.set(neckDown - lie * 0.22 + a.lookP + a.headDown * 0.55 + (isCackle ? -0.25 : 0), a.look * 0.5, 0);
    head.rotation.set(-0.10 + lie * 0.15 + (isCackle ? 0.28 : 0) + (isScavenge ? 0.18 : 0) + Math.sin(t * 0.8 + a.t0) * 0.02, a.look * 0.45, 0);

    // Crushing jaw movement
    if (jaw) {
      if (isCackle) {
        jaw.rotation.x = 0.30 + Math.sin(t * 22) * 0.18;
      } else if (isScavenge) {
        jaw.rotation.x = 0.20 + Math.sin(t * 6) * 0.15;
      } else {
        jaw.rotation.x = 0.05 + Math.sin(t * 0.5 + a.t0) * 0.02;
      }
    }

    // Bat ear twitches
    a.flickT = (a.flickT ?? 3) - dt;
    if (a.flickT < 0) { a.flickT = 2 + Math.random() * 5; a.flickSide = Math.random() < 0.5 ? 'earL' : 'earR'; a.flick = 1; }
    a.flick = Math.max(0, (a.flick || 0) - dt * 4);
    B2('earL').rotation.set(0, 0, 0); B2('earR').rotation.set(0, 0, 0);
    if (a.flickSide) B2(a.flickSide).rotation.set(-Math.sin(a.flick * Math.PI) * 0.35, 0, (a.flickSide === 'earL' ? 1 : -1) * Math.sin(a.flick * Math.PI) * 0.25);

    // Low droop tail, gentle sway
    for (let i = 1; i <= 3; i++) {
      const b = B2('tail' + i);
      if (b) {
        const sway = Math.sin(t * (1.2 + g * 0.8) - i * 0.7 + a.t0) * (0.06 + 0.04 * i);
        b.rotation.set(i === 1 ? 0.20 - g * 0.12 - lie * 0.35 : 0.08, sway + (i === 1 ? lie * 0.8 : 0), 0);
      }
    }
  },

  /** Dhole (Indian Wild Dog): springy athletic canid trot, pack alert postures,
   *  bird-like whistling calls ('whistling hunter'), and jet-black bushy tail flicking. */
  dhole(a, t, dt) {
    const g = clamp(a.speed / (a.P.walk || 1), 0, 1.6), ph = a.phase, lie = a.lie, R = a.rest, B2 = n => a.bone[n];
    const hips = B2('hips'), chest = B2('chest');
    hips.position.copy(R.hips); chest.position.copy(R.chest);

    // Springy, bouncy athletic canid trot
    const trotBounce = Math.abs(Math.sin(ph * 2)) * 0.022 * g;
    hips.position.y += trotBounce - lie * 0.35;
    chest.position.y += trotBounce * 1.1 + Math.sin(t * 2.0 + a.t0) * 0.003 + lie * 0.04;
    hips.rotation.set(lie * 0.05, Math.sin(ph) * 0.04 * g, lie * 0.1);
    chest.rotation.set(-lie * 0.06 + Math.sin(ph * 2) * 0.015 * g, -Math.sin(ph) * 0.05 * g, -lie * 0.08);

    // Diagonal canid trot sequence
    const offs = { lh: 0, lf: Math.PI, rh: Math.PI, rf: 0 };
    for (const n of ['lf', 'rf', 'lh', 'rh']) {
      const p = ph + offs[n], front = n[1] === 'f', side = n[0] === 'l' ? 1 : -1;
      const lift = Math.max(0, -Math.cos(p));
      let u = -Math.sin(p) * (front ? 0.48 : 0.42) * g;
      let l = lift * (front ? 0.90 : 0.82) * g;
      let w = lift * (front ? -0.50 : 0.75) * g;
      let uz = 0;
      if (front) {
        u = lerp(u, -1.2, lie); l = lerp(l, 0.08, lie); w = lerp(w, 1.1, lie);
      } else {
        u = lerp(u, -0.9, lie); l = lerp(l, 1.7, lie); w = lerp(w, -0.7, lie); uz = side * 0.3 * lie;
      }
      B2(n + '1').rotation.set(u, 0, uz);
      B2(n + '2').rotation.x = l;
      B2(n + '3').rotation.x = w;
    }

    // Head carriage: alert, proud canid posture, raised when whistling
    const neck = B2('neck'), head = B2('head'), jaw = B2('jaw');
    const isWhistle = a.state === 'whistle';
    const isAlert = a.state === 'pack_alert';
    const neckPitch = isWhistle ? -0.32 : isAlert ? -0.22 : -0.12 * Math.min(g, 1) + a.lookP;
    neck.rotation.set(neckPitch - lie * 0.2 + a.headDown * 0.6, a.look * 0.55, 0);
    head.rotation.set((isWhistle ? 0.24 : isAlert ? 0.12 : 0) + lie * 0.15 + Math.sin(t * 1.1 + a.t0) * 0.02, a.look * 0.45, 0);

    if (jaw) {
      jaw.rotation.x = isWhistle ? 0.18 + Math.sin(t * 14) * 0.06 : 0.02;
    }

    // Jet-black bushy tail: expressive canid tail carriage and rhythmic flicking
    for (let i = 1; i <= 4; i++) {
      const b = B2('tail' + i);
      if (b) {
        const wag = Math.sin(t * (1.8 + g * 1.2) - i * 0.65 + a.t0) * (0.12 + 0.06 * i) * (0.8 + 0.6 * g);
        const pitch = i === 1 ? (isAlert ? -0.2 : 0.35 - g * 0.2 - lie * 0.35) : i === 4 ? -0.3 : 0.08;
        b.rotation.set(pitch, wag + (i === 1 ? lie * 0.85 : 0), 0);
      }
    }
  },
  bird(a, t, dt) {
    const g = clamp(a.speed / (a.P.walk || 0.5), 0, 1.5), ph = a.phase;
    const isSwan = a.species === 'swan';
    const isPelican = a.species === 'pelican';
    const isWaterfowl = isSwan || isPelican;
    const w = a.L.water(a.pos.x, a.pos.z);
    const swim = (a.beh === 'swimmer' || isWaterfowl) && (w > 0.22 || a.en.habitat === 'water');
    const body = B(a, 'body');
    body.position.copy(a.rest.body);
    if (!swim) body.position.y += Math.abs(Math.sin(ph)) * 0.02 * g;
    const bobPitch = swim ? Math.sin(t * 1.5 + a.t0) * 0.02 : 0;
    body.rotation.set(a.headDown * 0.25 + Math.sin(t * 0.8 + a.t0) * 0.02 + bobPitch, 0, 0);

    for (const [n, o] of [['legL', 0], ['legR', Math.PI]]) {
      if (swim) {
        // Legs tucked under/behind body; gentle paddling stroke when moving
        const paddle = g > 0.05 ? Math.sin(ph + o) * 0.25 : 0;
        B(a, n + '1').rotation.x = -1.25 + paddle;
        B(a, n + '2').rotation.x = 1.55;
      } else {
        // Alternating bipedal walking gait
        B(a, n + '1').rotation.x = -Math.sin(ph + o) * 0.45 * g;
        B(a, n + '2').rotation.x = Math.max(0, Math.cos(ph + o)) * 0.65 * g;
      }
    }
    const peck = a.state === 'peck' ? Math.max(0, Math.sin(t * 5 + a.t0)) : 0;
    const isRatite = a.beh === 'ratite'; // ostrich, emu head bobbing
    const headBob = isRatite ? Math.sin(ph) * 0.15 * g : -Math.abs(Math.sin(ph)) * 0.12 * g;
    if (isSwan) {
      // Elegant swan neck S-curve posture held proud and high
      const preen = a.state === 'preen' ? 1.0 : 0;
      B(a, 'neck').rotation.set(-0.15 + a.headDown * 0.7 + a.lookP + preen * 1.1 + Math.sin(t * 0.7 + a.t0) * 0.025, a.look * 0.45 + preen * 1.2, 0);
      B(a, 'head').rotation.set(0.12 + Math.sin(t * 1.1 + a.t0) * 0.02 + preen * 0.3, a.look * 0.35, 0);
    } else {
      B(a, 'neck').rotation.set(a.headDown * 0.9 + peck * 0.5 + headBob + a.lookP + (a.state === 'preen' ? 1.2 : 0), a.look * 0.6 + (a.state === 'preen' ? 1.4 : 0), 0);
      B(a, 'head').rotation.set(Math.sin(t * 3 + a.t0) * 0.05, a.look * 0.5 + Math.sin(t * 1.3 + a.t0) * 0.2, 0);
    }
    const flapping = a.flap || a.state === 'stretch' ? 1 : 0;
    a.flapAmt = lerp(a.flapAmt || 0, flapping, damp(5, dt));
    const f = Math.sin(t * (a.state === 'stretch' ? 5 : 16)) * a.flapAmt;
    B(a, 'wingL').rotation.set(0, -a.flapAmt * 0.6, a.flapAmt * 0.6 + f * 0.8);
    B(a, 'wingR').rotation.set(0, a.flapAmt * 0.6, -a.flapAmt * 0.6 - f * 0.8);
    if (a.bone.tail) a.bone.tail.rotation.x = (isSwan ? -0.22 : 0) + Math.sin(t * 2 + a.t0) * 0.06;
  },
  reptile(a, t) {
    const g = clamp(a.speed / (a.P.walk || 0.3), 0, 1.5), ph = a.phase;
    const body = B(a, 'body');
    body.position.copy(a.rest.body);
    body.rotation.y = Math.sin(ph) * 0.16 * g;
    body.rotation.z = Math.sin(ph * 2) * 0.03 * g;
    const offs = { lf: 0, rh: 0, rf: Math.PI, lh: Math.PI };
    for (const n of a.meta.legs) {
      const s = n[0] === 'l' ? 1 : -1, p = ph + offs[n];
      const swing = Math.sin(p);
      const lift = Math.max(0, -Math.cos(p));
      B(a, n + '1').rotation.set(-swing * 0.35 * g, Math.sin(p) * 0.65 * g * s, (a.state === 'swim' ? 0.9 : 0.18 + lift * 0.12) * s);
      B(a, n + '2').rotation.set(Math.max(0, Math.cos(p)) * 0.5 * g, 0, 0);
    }
    for (let i = 1; i <= 3; i++) {
      B(a, 'tail' + i).rotation.y = Math.sin(ph - i * 0.85) * (0.18 + i * 0.08) * g + Math.sin(t * 0.5 + a.t0 + i) * (a.state === 'swim' ? 0.35 : 0.06);
    }
    B(a, 'head').rotation.set(Math.sin(t * 0.4 + a.t0) * 0.03, -Math.sin(ph) * 0.18 * g + a.look * 0.35, 0);
  },
  snake(a, t, dt) {
    const N = a.meta.N || 10, L = a.meta.L || 1.8, k = a.k;
    const slither = a.state === 'slither' ? 1 : 0;
    const raise = a.raise || 0;

    // Slither wave phase travels backwards along the spine to propel the snake forward
    if (a.speed > 0.005) {
      a.slitherPhase = (a.slitherPhase || 0) + dt * (a.speed / (L * 0.2)) * Math.PI * 2;
    }
    a.coil = lerp(a.coil ?? 1, (slither ? 0 : (a.state === 'coil' ? 1 : (a.coil ?? 1))), damp(2.5, dt));
    const coil = a.coil;

    // Calculate desired bone points in mesh local coordinates
    const pts = [];
    const waveLen = L * 0.75;
    const waveK = (Math.PI * 2) / waveLen;

    for (let i = 0; i < N; i++) {
      const u = i / (N - 1); // 0 at tail (s0), 1 at head (s9)
      const zNom = (u - 0.5) * L;

      // Backward propagating lateral wave (head phase leads, travels to tail)
      const psi = (a.slitherPhase || 0) - u * waveK * L;
      const amp = L * 0.16 * Math.sin(Math.PI * (0.08 + 0.84 * u));
      const xWave = (1 - coil) * amp * Math.sin(psi);

      // Spiral coil resting pose
      const rCoil = L * (0.08 + 0.16 * (1 - u * 0.65));
      const thetaCoil = u * 3.6 + Math.PI * 0.4;
      const xCoil = rCoil * Math.cos(thetaCoil);
      const zCoil = rCoil * Math.sin(thetaCoil) * 0.85;

      const xLoc = lerp(xWave, xCoil, coil);
      const zLoc = lerp(zNom, zCoil, coil);

      // World coordinates of this vertebra
      const wx = a.pos.x + (Math.sin(a.yaw) * zLoc + Math.cos(a.yaw) * xLoc) * k;
      const wz = a.pos.z + (Math.cos(a.yaw) * zLoc - Math.sin(a.yaw) * xLoc) * k;
      const g_i = a.ground(wx, wz);

      // Conforming belly height: belly touches ground g_i dynamically
      let yLoc = (g_i - a.mesh.position.y) / k + a.meta.bodyY0;
      if (raise > 0.01 && i >= 6) {
        // Cobra hood rearing: rear segments stay on ground, front segments arch up
        const rFrac = (i - 5) / 4;
        yLoc += Math.pow(rFrac, 1.6) * raise * 0.52 * L;
      }
      pts.push(new THREE.Vector3(xLoc, yLoc, zLoc));
    }

    // Orientations for each segment along the chain
    const quats = [];
    const vForward = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < N - 1; i++) {
      const dir = new THREE.Vector3().subVectors(pts[i + 1], pts[i]);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      else dir.normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(vForward, dir);
      quats.push(q);
    }
    quats.push(quats[N - 2].clone());

    // Apply to bone hierarchy
    const b0 = B(a, 's0');
    b0.position.copy(pts[0]);
    b0.quaternion.copy(quats[0]);

    for (let i = 1; i < N; i++) {
      const segLen = pts[i].distanceTo(pts[i - 1]);
      const bi = B(a, 's' + i);
      bi.position.set(0, 0, Math.max(0.001, segLen));
      const localQ = quats[i - 1].clone().invert().multiply(quats[i]);
      bi.quaternion.copy(localQ);
    }

    // Head bone
    const bHead = B(a, 'head');
    if (bHead) {
      if (raise > 0.05) {
        // When reared up, head levels off horizontally to face the visitor
        const targetHeadDir = new THREE.Vector3(Math.sin(a.look * 0.5), 0, Math.cos(a.look * 0.5));
        const worldHeadQ = new THREE.Quaternion().setFromUnitVectors(vForward, targetHeadDir);
        const localHeadQ = quats[N - 1].clone().invert().multiply(worldHeadQ);
        bHead.quaternion.copy(localHeadQ);
      } else {
        bHead.quaternion.set(0, 0, 0, 1);
        bHead.rotation.set(Math.sin(t * 1.2 + a.t0) * 0.03, a.look * 0.4 + Math.sin(a.slitherPhase || 0) * 0.08, 0);
      }
    }
  },
  chelonian(a, t) {
    const g = clamp(a.speed / (a.P.walk || 0.1), 0, 1.5), ph = a.phase;
    const body = B(a, 'body');
    if (body) {
      body.rotation.z = Math.sin(ph) * 0.035 * g;
      body.rotation.x = Math.sin(ph * 2) * 0.02 * g;
    }
    for (const [n, o] of [['lf', 0], ['rh', 0], ['rf', Math.PI], ['lh', Math.PI]]) {
      B(a, n + '1').rotation.set(Math.sin(ph + o) * 0.42 * g, 0, a.state === 'swim' ? (n[0] === 'l' ? 1 : -1) * 0.8 : 0);
    }
    const headExt = (a.state === 'rest' || a.state === 'bask') ? -0.03 : Math.sin(t * 0.5 + a.t0) * 0.01 + g * 0.015;
    B(a, 'head').position.copy(a.rest.head).add(new V3(0, 0, headExt));
  },
};

export class Animals {
  constructor(scene, layers, enclosures, Q) {
    seed(4242);
    this.Q = Q; this.list = []; this.frame = 0;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 }); mat.envMapIntensity = 0.35;
    for (const en of enclosures) {
      // sampling points used for wandering
      en.inner = insetPoly(en.poly, en.style === 'moat' ? 7.5 : Math.min(2.5, en.r * 0.25));   // animals stay behind the moat
      en.landPts = []; en.waterPts = []; en.edgePts = [];
      // land = dry enough to stand on (< 0.3); water = swimmable (>= 0.45). Small pond exhibits sit almost
      // entirely in the shore band, so fall back to anything < 0.45 rather than leaving the exhibit empty.
      const sampleIn = (n, ok) => { const out = []; for (let i = 0; i < n * 12 && out.length < n; i++) { const x = en.cx + rr(-1, 1) * en.r, z = en.cz + rr(-1, 1) * en.r; if (pointInPoly(x, z, en.inner) && ok(layers.water(x, z))) out.push({ x, z }); } return out; };
      en.landPts = sampleIn(40, w => w < 0.3);
      if (en.landPts.length < 4) en.landPts = en.landPts.concat(sampleIn(20, w => w < 0.45));
      en.waterPts = sampleIn(15, w => w >= 0.45);
      if (en.waterPts.length < 4 && (en.habitat === 'water' || AQUATIC.has(SPECIES_MODELS[en.species]?.beh))) {
        en.waterPts = en.waterPts.concat(sampleIn(10, w => w >= 0.35));
      }
      if (en.species === 'swan' && en.pool) {
        // High-density water points across the elevated pond basin biased toward visitor view
        const pts = [];
        const px = en.pool.x, pz = en.pool.z, pr = en.pool.r;
        for (let a = 0; a < 20; a++) {
          const ang = a / 20 * 6.283;
          for (const radFrac of [0.25, 0.50, 0.72]) {
            const rad = pr * radFrac;
            const sx = px + Math.cos(ang) * rad, sz = pz + Math.sin(ang) * rad;
            if (pointInPoly(sx, sz, en.inner)) pts.push({ x: sx, z: sz });
          }
        }
        if (pts.length) en.waterPts = pts;
        if (en.view) {
          const v = en.view;
          const byD = en.waterPts.slice().sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z));
          en.frontWaterPts = byD.slice(0, Math.max(4, Math.ceil(byD.length * 0.65)));
        }
      }
      en.edgePts = insetPoly(en.poly, en.style === 'moat' ? 8 : 2.2).filter((_, i) => i % 3 === 0).map(([x, z]) => ({ x, z }));
      // the half of the habitat nearest the public viewing point: animals favour it so visitors can see them
      if (en.view) { const v = en.view, byD = en.landPts.slice().sort((a, b) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(b.x - v.x, b.z - v.z)); en.frontPts = byD.slice(0, Math.max(3, Math.ceil(byD.length * 0.55))); }
      en.herdC = new V3(en.cx, 0, en.cz); en.animals = [];
      en.shade = en.shade || [];
      if (en.species === 'marmoset') {
        setupMarmosetViewingPerches(en, scene, layers);
      }
      for (let i = 0; i < (en.count || 1); i++) {
        const sp = en.species2 && i % 2 === 1 ? en.species2 : en.species;
        if (!SPECIES_MODELS[sp]) continue;
        const tpl = template(sp, i === 0);
        let inst;
        if (tpl.fam === 'tiger') {      // benchmark tiger: coat material + fur shells sharing the skeleton
          this.tigerMats = this.tigerMats || tigerMaterials({ High: 10, Medium: 6, Low: 0 }[Q.label] ?? 6);
          inst = instantiate(tpl, this.tigerMats.base);
          for (const m of this.tigerMats.shells) { const sm = new THREE.SkinnedMesh(tpl.geo, m); sm.bind(inst.mesh.skeleton, inst.mesh.bindMatrix); sm.castShadow = false; sm.receiveShadow = true; inst.mesh.add(sm); }
        } else if (tpl.fam === 'white_tiger') { // benchmark white tiger: creamy coat + sepia stripes + fur shells
          this.whiteTigerMats = this.whiteTigerMats || whiteTigerMaterials({ High: 10, Medium: 6, Low: 0 }[Q.label] ?? 6);
          inst = instantiate(tpl, this.whiteTigerMats.base);
          for (const m of this.whiteTigerMats.shells) { const sm = new THREE.SkinnedMesh(tpl.geo, m); sm.bind(inst.mesh.skeleton, inst.mesh.bindMatrix); sm.castShadow = false; sm.receiveShadow = true; inst.mesh.add(sm); }
        } else if (tpl.fam === 'lion') { // ultra-realistic lion/lioness: multi-layered mane + fur shells
          this.lionMats = this.lionMats || {};
          const isM = tpl.meta?.male !== false;
          const matKey = (isM ? 'm_' : 'f_') + (Q.label ?? 'Medium');
          if (!this.lionMats[matKey]) {
            this.lionMats[matKey] = lionMaterials({ High: 8, Medium: 6, Low: 0 }[Q.label] ?? 6, isM);
          }
          const lm = this.lionMats[matKey];
          inst = instantiate(tpl, lm.base);
          for (const m of lm.shells) {
            const sm = new THREE.SkinnedMesh(tpl.geo, m);
            sm.bind(inst.mesh.skeleton, inst.mesh.bindMatrix);
            sm.castShadow = false;
            sm.receiveShadow = true;
            inst.mesh.add(sm);
          }
        } else if (tpl.fam === 'hyena') { // ultra-realistic striped hyena: pale striped coat + fur shells
          this.hyenaMats = this.hyenaMats || hyenaMaterials({ High: 6, Medium: 4, Low: 0 }[Q.label] ?? 4);
          inst = instantiate(tpl, this.hyenaMats.base);
          for (const m of this.hyenaMats.shells) { const sm = new THREE.SkinnedMesh(tpl.geo, m); sm.bind(inst.mesh.skeleton, inst.mesh.bindMatrix); sm.castShadow = false; sm.receiveShadow = true; inst.mesh.add(sm); }
        } else if (tpl.fam === 'dhole') { // ultra-realistic dhole: copper-red coat + black bushy tail shells
          this.dholeMats = this.dholeMats || dholeMaterials({ High: 6, Medium: 4, Low: 0 }[Q.label] ?? 4);
          inst = instantiate(tpl, this.dholeMats.base);
          for (const m of this.dholeMats.shells) { const sm = new THREE.SkinnedMesh(tpl.geo, m); sm.bind(inst.mesh.skeleton, inst.mesh.bindMatrix); sm.castShadow = false; sm.receiveShadow = true; inst.mesh.add(sm); }
        } else inst = instantiate(tpl, mat);
        const a = new Animal(inst, tpl, sp, en, layers, i);
        scene.add(inst.mesh); this.list.push(a); en.animals.push(a);
      }
    }
  }
  update(dt, t, player) {
    this.frame++;
    const R = this.Q.animalRange;
    for (const en of new Set(this.list.map(a => a.en))) { // drifting herd centre
      if (en.animals.length > 1) { const c = en.animals.reduce((s, a) => s.add(a.pos), new V3()).divideScalar(en.animals.length); en.herdC.lerp(c, 0.01); }
    }
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i], d = Math.hypot(a.pos.x - player.x, a.pos.z - player.z);
      if (d > R) { a.mesh.visible = false; a.acc = 0; continue; }
      a.mesh.visible = true;
      a.acc = (a.acc || 0) + dt;
      if (d > R * 0.5 && (this.frame + i) % 2) continue;     // half-rate updates for distant animals
      if (a.beh === 'primate' && d < 24) {
        a.audioTimer = (a.audioTimer ?? rr(3, 8)) - dt;
        if (a.audioTimer <= 0) {
          a.audioTimer = rr(8, 20);
          if (a.species === 'marmoset') playMarmosetTrill(a.pos.x, a.pos.z, player);
          else if (a.species === 'chimpanzee') playChimpPantHoot(a.pos.x, a.pos.z, player);
          else if (rand() < 0.5) playPrimateChatter(a.pos.x, a.pos.z, player);
          else playPrimateScreech(a.pos.x, a.pos.z, player);
        }
      }
      a.update(Math.min(a.acc, 0.1), t, player); a.acc = 0;
    }
  }
  nearest(x, z, maxD) { let best = null, bd = maxD; for (const a of this.list) { const d = Math.hypot(a.pos.x - x, a.pos.z - z); if (d < bd) { bd = d; best = a; } } return best; }
  attachLionGLB() { return attachLionGLB(this); }
  attachLionessGLB() { return attachLionessGLB(this); }
  attachChimpanzeeGLB() { return attachChimpanzeeGLB(this); }
  attachWhiteTigerGLB() { return attachWhiteTigerGLB(this); }
}

export { attachLionGLB, attachLionessGLB, attachChimpanzeeGLB, attachWhiteTigerGLB };
