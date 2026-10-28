import * as THREE from 'three';
import { flameSprite, smokeSprite, sparkSprite } from './textures';

/**
 * Billboard particles drawn as instanced quads, one draw call per layer.
 * Each particle has its own size, colour, opacity and spin, changing over its
 * life according to its preset.
 */
class ParticleLayer {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly sizeRot: Float32Array;
  private readonly p: Float32Array;
  private n = 0;
  /** Per particle: x y z vx vy vz age life size0 size1 spin rot preset r g b. */
  private static readonly S = 16;

  constructor(
    private readonly max: number,
    tex: THREE.Texture,
    additive: boolean,
    /** Stretch along the vertical (flames are tall). */
    aspect = 1,
    /** Brightness multiplier (additive layers glow brighter than 1). */
    gain = 1,
  ) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.sizeRot = new Float32Array(max * 2);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iSizeRot', new THREE.InstancedBufferAttribute(this.sizeRot, 2).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    this.geo = geo;
    this.p = new Float32Array(max * ParticleLayer.S);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, aspect: { value: aspect }, gain: { value: gain } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iCol;
        attribute vec2 iSizeRot;
        uniform float aspect;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vUv = uv;
          vCol = iCol;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iSizeRot.y);
          float s = sin(iSizeRot.y);
          vec2 corner = vec2(position.x, position.y * aspect);
          mv.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * iSizeRot.x;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform float gain;
        varying vec2 vUv;
        varying vec4 vCol;
        void main() {
          vec4 t = texture2D(map, vUv);
          gl_FragColor = vec4(vCol.rgb * gain, min(1.0, vCol.a * t.a * gain));
          if (gl_FragColor.a < 0.004) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  /** Add one particle; returns false if the layer is full. */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size0: number, size1: number, preset: number, r: number, g: number, b: number): boolean {
    if (this.n >= this.max) return false;
    const o = this.n++ * ParticleLayer.S;
    const p = this.p;
    p[o] = x;
    p[o + 1] = y;
    p[o + 2] = z;
    p[o + 3] = vx;
    p[o + 4] = vy;
    p[o + 5] = vz;
    p[o + 6] = 0;
    p[o + 7] = life;
    p[o + 8] = size0;
    p[o + 9] = size1;
    p[o + 10] = (Math.random() - 0.5) * 1.2;
    p[o + 11] = Math.random() * Math.PI * 2;
    p[o + 12] = preset;
    p[o + 13] = r;
    p[o + 14] = g;
    p[o + 15] = b;
    return true;
  }

  update(dt: number, wind: THREE.Vector3): void {
    const S = ParticleLayer.S;
    const p = this.p;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * S;
      const age = p[o + 6] + dt;
      if (age >= p[o + 7]) continue;
      if (w !== i) p.copyWithin(w * S, o, o + S);
      const q = w * S;
      p[q + 6] = age;
      const preset = p[q + 12];
      // Smoke drifts with the wind and slows as it spreads; sparks fall.
      if (preset === 2) {
        p[q + 3] += (wind.x - p[q + 3]) * dt * 0.5;
        p[q + 5] += (wind.z - p[q + 5]) * dt * 0.5;
        p[q + 4] *= 1 - dt * 0.25;
      } else if (preset === 3) {
        p[q + 4] -= 30 * dt;
      }
      p[q] += p[q + 3] * dt;
      p[q + 1] += p[q + 4] * dt;
      p[q + 2] += p[q + 5] * dt;
      p[q + 11] += p[q + 10] * dt;
      w++;
    }
    this.n = w;
    for (let i = 0; i < this.n; i++) {
      const o = i * S;
      const t = p[o + 6] / p[o + 7];
      this.pos[i * 3] = p[o];
      this.pos[i * 3 + 1] = p[o + 1];
      this.pos[i * 3 + 2] = p[o + 2];
      const preset = p[o + 12];
      let r = p[o + 13];
      let g = p[o + 14];
      let b = p[o + 15];
      let a: number;
      let size = p[o + 8] + (p[o + 9] - p[o + 8]) * t;
      if (preset === 0) {
        // Flame: a yellow core cooling to orange and deep red as it rises, flickering.
        const heat = (1 - t) * r;
        r = 0.95;
        g = 0.22 + 0.62 * heat * heat;
        b = 0.04 + 0.22 * heat * heat * heat;
        a = Math.sin(Math.PI * Math.min(1, t * 1.5)) * (0.55 + Math.random() * 0.3);
        size *= 0.85 + Math.random() * 0.3;
      } else if (preset === 2) {
        // Smoke: dark near the fire, paler and thinner as it climbs.
        const k = Math.min(1, t * 1.6);
        r = r + (0.42 - r) * k;
        g = g + (0.4 - g) * k;
        b = b + (0.37 - b) * k;
        a = Math.min(1, t * 3) * (1 - t) * 0.75;
      } else if (preset === 3) {
        a = (1 - t) * (0.6 + Math.random() * 0.4);
      } else if (preset === 4) {
        a = 1 - t;
        size *= 0.8 + Math.random() * 0.5;
      } else {
        // Flash / fireball: bright, quick.
        a = (1 - t) * (1 - t);
      }
      this.col[i * 4] = r;
      this.col[i * 4 + 1] = g;
      this.col[i * 4 + 2] = b;
      this.col[i * 4 + 3] = a;
      this.sizeRot[i * 2] = size;
      this.sizeRot[i * 2 + 1] = p[o + 11];
    }
    this.geo.instanceCount = this.n;
    (this.geo.attributes.iPos as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.attributes.iCol as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.geo.attributes.iSizeRot as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** One round in flight: a glowing streak running from the muzzle to where it lands. */
interface Tracer {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y0: number;
  y1: number;
  t: number;
  flight: number;
  len: number;
  width: number;
  r: number;
  g: number;
  b: number;
  /** Rounds fired by a squad's other guns don't all glow: only every few is a tracer. */
  glow: number;
}

interface Fire {
  x: number;
  z: number;
  /** 1 = a small ground fire; bigger burns harder and smokes more. */
  scale: number;
  /** Seconds left; Infinity for fires that smoulder all battle. */
  left: number;
  smokeOnly: boolean;
  /** Fires of one kind (a house's) can be put out together. */
  tag?: string;
  acc: { flame: number; smoke: number; ember: number };
  phase: number;
}

interface Flash {
  x: number;
  z: number;
  y: number;
  power: number;
  life: number;
  age: number;
}

/**
 * Fires, smoke, explosions and their light. Fires are layered: tongues of
 * flame with hot cores, sparks and embers riding the heat, and smoke that is
 * darkest at the source and thins as it climbs and drifts. A small pool of
 * point lights is handed to the brightest fires and blasts each frame, so the
 * ground and walls around them glow orange.
 */
export class Effects3D {
  readonly group = new THREE.Group();
  private readonly flames = new ParticleLayer(2400, flameSprite(), true, 2, 1);
  private readonly sparks = new ParticleLayer(1400, sparkSprite(), true, 1, 1.4);
  /** The warm halo round each fire. */
  private readonly glow = new ParticleLayer(600, sparkSprite(), true, 1, 1);
  private readonly smoke = new ParticleLayer(2000, smokeSprite(), false, 1, 1.5);
  /** Burnt ground under fires. */
  private readonly scorch: THREE.InstancedMesh;
  private scorchCount = 0;
  private readonly fires: Fire[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly tracerMesh: THREE.InstancedMesh;
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly axisX = new THREE.Vector3(1, 0, 0);
  private readonly flashes: Flash[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly wind = new THREE.Vector3(3, 0, -1.6);
  /** 0..1: scales how many particles are spawned (effects quality). */
  quality = 1;

  constructor() {
    this.glow.mesh.renderOrder = 3;
    this.smoke.mesh.renderOrder = 4;
    this.flames.mesh.renderOrder = 5;
    this.sparks.mesh.renderOrder = 5;
    this.group.add(this.glow.mesh, this.smoke.mesh, this.flames.mesh, this.sparks.mesh);
    const disc = new THREE.PlaneGeometry(1, 1);
    disc.rotateX(-Math.PI / 2);
    this.scorch = new THREE.InstancedMesh(
      disc,
      new THREE.MeshBasicMaterial({ map: sparkSprite(), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }),
      200,
    );
    this.scorch.count = 0;
    this.scorch.frustumCulled = false;
    // Tracer streaks: a thin glowing bar along +x, stretched and coloured per round.
    const bar = new THREE.BoxGeometry(1, 1, 1).translate(-0.5, 0, 0);
    this.tracerMesh = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 600);
    this.tracerMesh.count = 0;
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.renderOrder = 6;
    this.group.add(this.tracerMesh);
    this.scorch.renderOrder = 0;
    this.group.add(this.scorch);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 120, 1.5);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
  }

  /** A fire at a world point (x, y on the map). */
  addFire(x: number, y: number, scale: number, seconds: number, smokeOnly = false, tag?: string): void {
    this.fires.push({ x, z: y, scale, left: seconds, smokeOnly, tag, acc: { flame: 0, smoke: 0, ember: 0 }, phase: Math.random() * 10 });
    if (!smokeOnly && !tag) this.addScorch(x, y, 16 * scale);
  }

  /** Put out every fire with this tag. */
  removeFires(tag: string): void {
    for (let i = this.fires.length - 1; i >= 0; i--) if (this.fires[i].tag === tag) this.fires.splice(i, 1);
  }

  /** A burnt patch on the ground (oldest are reused). */
  private addScorch(x: number, y: number, size: number): void {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.15, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)), new THREE.Vector3(size, 1, size * 0.85));
    this.scorch.setMatrixAt(this.scorchCount % 200, m);
    this.scorchCount++;
    this.scorch.count = Math.min(200, this.scorchCount);
    this.scorch.instanceMatrix.needsUpdate = true;
  }

  /**
   * A shot: muzzle flash and a wisp of smoke at the gun, a tracer streak to the
   * target, and a puff of dirt or a shower of sparks where it lands.
   * `kind`: small arms, a machine gun, or a cannon shell.
   */
  shot(fx: number, fy: number, tx: number, ty: number, hit: boolean, kind: 'rifle' | 'mg' | 'shell', armoured: boolean): void {
    const q = this.quality;
    const d = Math.hypot(tx - fx, ty - fy);
    const big = kind === 'shell';
    const muzzleY = big ? 7 : 5.2;
    // Muzzle flash: a hot star at the barrel, gone in a blink.
    this.flames.spawn(fx, muzzleY, fy, 0, 0, 0, big ? 0.12 : 0.06, big ? 9 : kind === 'mg' ? 4.5 : 3.2, big ? 14 : 5, 4, 1, 0.9, 0.55);
    if (big) this.flashes.push({ x: fx, z: fy, y: 8, power: 6, life: 0.12, age: 0 });
    if (q > 0.5 || big) this.smoke.spawn(fx, muzzleY, fy, (Math.random() - 0.5) * 3, 3, (Math.random() - 0.5) * 3, big ? 2.2 : 0.9, big ? 5 : 1.6, big ? 18 : 5, 2, 0.55, 0.53, 0.5);
    // The round: rifles show a tracer now and then, machine guns often, shells always.
    const glow = kind === 'rifle' ? 0.35 : kind === 'mg' ? 0.75 : 1;
    if (Math.random() < glow) {
      const speed = big ? 900 : 1500;
      const fall = hit ? (armoured ? 3.5 : 3) : 0.5;
      this.tracers.push({
        ax: fx, az: fy, bx: tx + (hit ? 0 : (Math.random() - 0.5) * 6), bz: ty + (hit ? 0 : (Math.random() - 0.5) * 6),
        y0: muzzleY, y1: fall, t: 0, flight: Math.max(0.04, d / speed),
        len: Math.min(d * 0.7, big ? 34 : kind === 'mg' ? 26 : 20), width: big ? 2.2 : kind === 'mg' ? 1.25 : 0.95,
        r: 1, g: big ? 0.75 : 0.62, b: big ? 0.35 : 0.22, glow: 1,
      });
    }
    // Impact: sparks off armour, dirt kicked up from a miss.
    const sparks = armoured ? 6 : 0;
    for (let i = 0; i < sparks * q; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 40;
      this.sparks.spawn(tx, 4, ty, Math.cos(a) * s, 10 + Math.random() * 30, Math.sin(a) * s, 0.25 + Math.random() * 0.3, 1, 0.4, 3, 1, 0.85, 0.5);
    }
    if (!hit && q > 0.3) {
      const n = big ? 6 : 2;
      for (let i = 0; i < n; i++) {
        const dirt = 0.32 + Math.random() * 0.1;
        this.smoke.spawn(tx + (Math.random() - 0.5) * 3, 1, ty + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6, 8 + Math.random() * 10, (Math.random() - 0.5) * 6, 0.5 + Math.random() * 0.6, big ? 4 : 1.6, big ? 14 : 5, 2, dirt, dirt * 0.82, dirt * 0.62);
      }
    }
  }

  private updateTracers(dt: number): void {
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      if (tr.t > tr.flight + 0.05) {
        this.tracers.splice(i, 1);
        continue;
      }
      if (n >= 600) continue;
      const k = Math.min(1, tr.t / tr.flight);
      const hx = tr.ax + (tr.bx - tr.ax) * k;
      const hz = tr.az + (tr.bz - tr.az) * k;
      const hy = tr.y0 + (tr.y1 - tr.y0) * k;
      const dx = tr.bx - tr.ax;
      const dz = tr.bz - tr.az;
      const dy = tr.y1 - tr.y0;
      const L = Math.hypot(dx, dy, dz) || 1;
      this.tmpV.set(dx / L, dy / L, dz / L);
      this.tmpQ.setFromUnitVectors(this.axisX, this.tmpV);
      const len = Math.min(tr.len, L * k + 1);
      this.tmpS.set(len, tr.width, tr.width);
      this.tmpM.compose(this.tmpV.set(hx, hy, hz), this.tmpQ, this.tmpS);
      this.tracerMesh.setMatrixAt(n, this.tmpM);
      // Fades out once it has landed.
      const fade = tr.t > tr.flight ? 1 - (tr.t - tr.flight) / 0.05 : 1;
      this.tracerMesh.setColorAt(n, this.tmpC.setRGB(tr.r * fade * 2.2, tr.g * fade * 2.2, tr.b * fade * 2.2));
      n++;
    }
    this.tracerMesh.count = n;
    this.tracerMesh.instanceMatrix.needsUpdate = true;
    if (this.tracerMesh.instanceColor) this.tracerMesh.instanceColor.needsUpdate = true;
  }

  /** A blast: flash, fireball, flying dirt and sparks, then a smoke cloud; big ones leave a fire. */
  explosion(x: number, y: number, radius: number): void {
    const z = y;
    const q = this.quality;
    const r = Math.max(10, radius);
    this.flashes.push({ x, z, y: 6, power: r * 0.35, life: 0.35, age: 0 });
    for (let i = 0; i < 14 * q; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * r * 1.4;
      this.flames.spawn(x, 2 + Math.random() * 4, z, Math.cos(a) * s, 10 + Math.random() * 20, Math.sin(a) * s, 0.35 + Math.random() * 0.3, r * 0.5, r * 1.1, 0, 1, 0, 0);
    }
    for (let i = 0; i < 22 * q; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 30 + Math.random() * 70;
      this.sparks.spawn(x, 3, z, Math.cos(a) * s, 25 + Math.random() * 50, Math.sin(a) * s, 0.5 + Math.random() * 0.7, 1.4, 0.6, 3, 1, 0.75, 0.35);
    }
    for (let i = 0; i < 16 * q; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 8 + Math.random() * 22;
      const brown = 0.22 + Math.random() * 0.1;
      this.smoke.spawn(x + Math.cos(a) * 3, 3, z + Math.sin(a) * 3, Math.cos(a) * s, 6 + Math.random() * 14, Math.sin(a) * s, 2 + Math.random() * 2.5, r * 0.6, r * 2.2, 2, brown, brown * 0.85, brown * 0.65);
    }
    this.addScorch(x, y, r * 1.6);
    if (radius >= 20) this.addFire(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6, 0.55 + Math.random() * 0.35, 6 + Math.random() * 8);
  }

  update(dt: number): void {
    const q = this.quality;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.left -= dt;
      if (f.left <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      // Fires die down over their last few seconds.
      const k = f.scale * Math.min(1, f.left / 4);
      f.phase += dt;
      if (!f.smokeOnly) {
        f.acc.flame += dt * 26 * k * q;
        while (f.acc.flame >= 1) {
          f.acc.flame--;
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * 4 * f.scale;
          // Tongues of flame, and every so often a hotter, brighter core.
          const core = Math.random() < 0.35;
          this.flames.spawn(f.x + Math.cos(a) * d, 0.5 + Math.random(), f.z + Math.sin(a) * d, (Math.random() - 0.5) * 4, 7 + Math.random() * 8 * f.scale, (Math.random() - 0.5) * 4, core ? 0.35 + Math.random() * 0.2 : 0.55 + Math.random() * 0.5, (core ? 5 : 8) * f.scale, (core ? 2 : 3) * f.scale, 0, core ? 1 : 0.65, 0, 0);
        }
        // The halo, flickering.
        const flicker = 0.75 + 0.25 * Math.sin(f.phase * 17) * Math.sin(f.phase * 7.3);
        this.glow.spawn(f.x, 4, f.z, 0, 0, 0, 0.1, 30 * f.scale * flicker, 30 * f.scale * flicker, 1, 1, 0.45, 0.12);
        f.acc.ember += dt * 7 * k * q;
        while (f.acc.ember >= 1) {
          f.acc.ember--;
          this.sparks.spawn(f.x + (Math.random() - 0.5) * 5 * f.scale, 3, f.z + (Math.random() - 0.5) * 5 * f.scale, (Math.random() - 0.5) * 10, 14 + Math.random() * 22, (Math.random() - 0.5) * 10, 1 + Math.random() * 1.4, 0.9, 0.4, 3, 1, 0.6, 0.2);
        }
      }
      f.acc.smoke += dt * (f.smokeOnly ? 2.2 : 5.5) * Math.max(0.4, k) * q;
      while (f.acc.smoke >= 1) {
        f.acc.smoke--;
        const dark = f.smokeOnly ? 0.3 : 0.1 + Math.random() * 0.06;
        this.smoke.spawn(f.x + (Math.random() - 0.5) * 6, 12 * f.scale, f.z + (Math.random() - 0.5) * 6, 0, 5 + Math.random() * 4, 0, 6 + Math.random() * 4, 10 * f.scale, 38 * f.scale, 2, dark, dark * 0.95, dark * 0.9);
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.age += dt;
      if (fl.age >= fl.life) this.flashes.splice(i, 1);
    }
    this.updateTracers(dt);
    this.glow.update(dt, this.wind);
    this.flames.update(dt, this.wind);
    this.sparks.update(dt, this.wind);
    this.smoke.update(dt, this.wind);
    this.assignLights();
  }

  /** Hand the light pool to the brightest blasts and fires, flickering. */
  private assignLights(): void {
    const sources: { x: number; y: number; z: number; power: number; color: number }[] = [];
    for (const fl of this.flashes) sources.push({ x: fl.x, y: fl.y, z: fl.z, power: fl.power * 160 * (1 - fl.age / fl.life), color: 0xffc070 });
    for (const f of this.fires) {
      if (f.smokeOnly) continue;
      const flicker = 0.8 + 0.12 * Math.sin(f.phase * 13) + 0.08 * Math.sin(f.phase * 31 + 1.3);
      sources.push({ x: f.x, y: 9, z: f.z, power: 700 * f.scale * flicker * Math.min(1, f.left / 4), color: 0xff7a2a });
    }
    sources.sort((a, b) => b.power - a.power);
    this.lights.forEach((l, i) => {
      const s = sources[i];
      if (!s) {
        l.intensity = 0;
        return;
      }
      l.position.set(s.x, s.y, s.z);
      l.intensity = s.power;
      l.color.setHex(s.color);
    });
  }

  /** Particles alive right now (for the performance readout). */
  get particles(): number {
    return this.flames.count + this.sparks.count + this.smoke.count;
  }

  dispose(): void {
    this.flames.dispose();
    this.glow.dispose();
    this.scorch.dispose();
    this.tracerMesh.dispose();
    this.sparks.dispose();
    this.smoke.dispose();
  }
}
