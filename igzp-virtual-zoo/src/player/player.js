// First-person visitor: bicycle (default) or walking. Movement is confined to the mapped
// visitor routes (tar roads, walking paths, plazas) via the rasterised walkable grid.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { V3, clamp, lerp, damp, wrapAngle, paint, merge, limb, ellipsoid } from '../core/util.js';

function handlebars() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#2b3a46', metalness: 0.7, roughness: 0.35 });
  const grip = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: '#8d5a3c', roughness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#c9cfd2', metalness: 0.95, roughness: 0.2 });
  const pivot = new THREE.Group(); pivot.position.set(0, -0.4, -0.66); pivot.rotation.x = -0.25; g.add(pivot);   // just inside the bottom of the view
  const tube = (a, b, r, m) => { const mesh = new THREE.Mesh(limb(new V3(...a), new V3(...b), r, r, 10), m); pivot.add(mesh); return mesh; };
  tube([0, -0.6, 0.08], [0, 0.0, 0], 0.022, metal);                    // steerer / stem
  tube([0, 0.0, 0], [0, 0.03, -0.08], 0.02, metal);
  tube([-0.3, 0.06, 0.05], [0.3, 0.06, 0.05], 0.014, metal);           // bar
  tube([-0.3, 0.06, 0.05], [-0.36, 0.08, 0.13], 0.014, metal);
  tube([0.3, 0.06, 0.05], [0.36, 0.08, 0.13], 0.014, metal);
  for (const s of [-1, 1]) {
    tube([s * 0.33, 0.07, 0.09], [s * 0.42, 0.09, 0.2], 0.019, grip);  // grips
    tube([s * 0.22, 0.07, 0.03], [s * 0.34, 0.03, -0.06], 0.006, chrome); // brake levers
  }
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8, 0, 6.3, 0, 1.6), chrome); bell.position.set(-0.14, 0.09, 0.02); pivot.add(bell);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.06, 12).rotateX(Math.PI / 2), chrome); lamp.position.set(0, -0.06, -0.1); pivot.add(lamp);
  // top of the front wheel and fork, just visible when looking down
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 8, 40), grip); tyre.rotation.y = Math.PI / 2; tyre.position.set(0, -0.95, -0.3); pivot.add(tyre);
  tube([-0.04, -0.6, 0.08], [-0.04, -0.95, -0.3], 0.012, metal); tube([0.04, -0.6, 0.08], [0.04, -0.95, -0.3], 0.012, metal);
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  return { group: g, pivot };
}

export class Player {
  constructor(camera, layers) {
    this.cam = camera; this.L = layers;
    this.mode = 'bike'; this.active = false;
    this.pos = new V3(); this.heading = 0; this.speed = 0; this.steer = 0; this.vel = new V3();
    this.lookYaw = 0; this.lookPitch = -0.06; this.pedal = 0; this.step = 0; this.lean = 0; this.bob = 0;
    this.blockedT = 0;
    const hb = handlebars(); this.bars = hb.group; this.barPivot = hb.pivot; camera.add(this.bars);
    this._f = new V3(); this._r = new V3();
  }
  place(x, z, heading) { this.pos.set(x, this.L.walkHeight(x, z), z); this.heading = heading; this.speed = 0; this.lookYaw = 0; this.lookPitch = -0.06; }
  setMode(m) { this.mode = m; this.speed = 0; this.vel.set(0, 0, 0); if (m === 'walk') { this.heading += this.lookYaw; this.lookYaw = 0; } }
  get eye() { return this.mode === 'bike' ? PLAYER.bike.eye : PLAYER.walk.eye; }
  /** Walkable test with a small body radius (allowing walking visitors to step directly up to fences). */
  free(x, z, r = (this.mode === 'bike' ? 0.45 : 0.25)) { const L = this.L; return L.isWalkable(x, z) && L.isWalkable(x + r, z) && L.isWalkable(x - r, z) && L.isWalkable(x, z + r) && L.isWalkable(x, z - r); }
  _move(nx, nz) {
    if (this.free(nx, nz)) { this.pos.x = nx; this.pos.z = nz; return true; }
    if (this.free(nx, this.pos.z)) { this.pos.x = nx; return 'slide'; }      // slide along the edge
    if (this.free(this.pos.x, nz)) { this.pos.z = nz; return 'slide'; }
    // Try partial step if full step is blocked (prevents sticking against fences)
    const mx = (this.pos.x + nx) / 2, mz = (this.pos.z + nz) / 2;
    if (this.free(mx, mz)) { this.pos.x = mx; this.pos.z = mz; return 'slide'; }
    return false;
  }
  update(dt, t, inp, ctx) {
    const B = PLAYER.bike, W = PLAYER.walk;
    if (this.active) {
      if (this.mode === 'bike') {
        let max = inp.boost ? B.boost : B.maxSpeed; if (ctx.nearExhibit) max = Math.min(max, inp.boost ? B.maxSpeed : B.exhibitSpeed);
        let a = 0;
        if (inp.fwd > 0) a += this.speed < max ? B.accel * inp.fwd : -1.5;
        if (inp.fwd < 0) a += this.speed > 0.15 ? -B.brake * -inp.fwd : -B.accel * 0.5 * -inp.fwd;
        if (inp.brake) a -= Math.sign(this.speed) * B.handBrake;
        a -= this.speed * 0.1 + Math.sign(this.speed) * 0.12;                    // air + rolling resistance
        const ahead = this.L.walkHeight(this.pos.x - Math.sin(this.heading) * 1.5, this.pos.z - Math.cos(this.heading) * 1.5);
        a -= (ahead - this.pos.y) / 1.5 * 9.8 * 0.3;                           // slopes
        const before = this.speed; this.speed += a * dt;
        if (inp.fwd === 0 && Math.sign(before) !== Math.sign(this.speed)) this.speed = 0;
        if (inp.brake && Math.abs(this.speed) < 0.1) this.speed = 0;
        this.speed = clamp(this.speed, -B.reverse, max + 0.2);
        const steerMax = B.maxSteer / (1 + Math.abs(this.speed) * 0.14);
        this.steer = lerp(this.steer, inp.steer * steerMax, damp(5, dt));
        this.heading += this.speed * Math.tan(this.steer) / B.wheelbase * dt;
        const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
        const ok = this._move(this.pos.x + fx * this.speed * dt, this.pos.z + fz * this.speed * dt);
        if (!ok) { if (Math.abs(this.speed) > 1.5) ctx.bump?.(); this.speed *= -0.15; }
        else if (ok === 'slide') this.speed *= 1 - dt * 1.5;
        this.pedal += dt * Math.max(0, this.speed) * 1.6;
        if (Math.abs(this.speed) > 0.6 && !inp.looking) this.lookYaw = lerp(this.lookYaw, 0, damp(0.8, dt));
      } else {
        const sp = inp.boost ? W.run : W.speed, yaw = this.heading + this.lookYaw;
        this._f.set(-Math.sin(yaw), 0, -Math.cos(yaw)); this._r.set(Math.cos(yaw), 0, -Math.sin(yaw));
        const want = new V3().addScaledVector(this._f, inp.fwd).addScaledVector(this._r, inp.strafe - inp.steer * (inp.strafe ? 0 : 0));
        if (inp.steer && !inp.strafe) this.lookYaw += inp.steer * 1.6 * dt;     // A/D turn when walking
        if (want.lengthSq() > 1) want.normalize();
        this.vel.lerp(want.multiplyScalar(sp), damp(want.lengthSq() > 0 ? 4 : 6, dt));
        if (!this._move(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt)) this.vel.multiplyScalar(0);
        this.speed = this.vel.length();
        this.step += dt * this.speed * 3.6;
      }
    }
    this.pos.y = this.L.walkHeight(this.pos.x, this.pos.z);
    // camera
    const bikeBob = this.mode === 'bike' ? Math.sin(this.pedal * 2) * 0.008 * Math.min(1, this.speed / 3) : Math.sin(this.step) * 0.03 * Math.min(1, this.speed / 1.5);
    this.bob = lerp(this.bob, bikeBob, damp(10, dt));
    this.lean = lerp(this.lean, this.mode === 'bike' ? clamp(-this.steer * this.speed * 0.035, -0.07, 0.07) : 0, damp(3, dt));
    this.cam.position.set(this.pos.x, this.pos.y + this.eye + this.bob, this.pos.z);
    this.cam.rotation.set(this.lookPitch, this.heading + this.lookYaw, this.lean, 'YXZ');
    this.bars.visible = this.mode === 'bike' && !ctx.photo;
    this.barPivot.rotation.y = this.steer * 1.2;
    // handlebars belong to the bike, not the head: cancel the look rotation
    this._e = this._e || new THREE.Euler(); this._q = this._q || new THREE.Quaternion();
    this._q.setFromEuler(this._e.set(0, this.heading, this.lean * 0.6, 'YXZ'));
    this.bars.quaternion.copy(this.cam.quaternion).invert().multiply(this._q);
  }
}
