import * as THREE from 'three';
import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import type { SimEvent } from '../sim/entities';
import type { World } from '../sim/world';
import { CAMERA_FOV, type Camera } from '../render/camera';
import { TerrainLayer } from '../render/terrainLayer';
import { WEAPONS } from '../data/weapons';
import { smokeStrength } from '../sim/systems/smoke';
import { buildBuildings, type BuildingInfo } from './buildings';
import { Effects3D } from './fx';
import { Structures3D } from './structures';
import { Units3D, type UnitLook } from './units';
import type { Squad } from '../sim/entities';
import { buildProps } from './props';
import { disposeTextures, groundDetailTexture, groundNormalTexture } from './textures';
import { buildVegetation } from './vegetation';

/**
 * A plane over the map showing the units-and-markers canvas. That canvas is a
 * flat plan of the ground in view (see `overlayView`), so each point of the
 * plane looks up its own spot and the markers lie on the ground in perspective.
 */
function groundOverlayMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, view: { value: new THREE.Vector4(0, 0, 1, 1) } },
    vertexShader: 'varying vec2 vGround; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vGround = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform sampler2D map;
      uniform vec4 view;
      varying vec2 vGround;
      void main() {
        vec2 uv = vec2((vGround.x - view.x) * view.z, 1.0 - (vGround.y - view.y) * view.w);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
        vec4 c = texture2D(map, uv);
        if (c.a < 0.003) discard;
        gl_FragColor = c;
      }`,
    transparent: true,
    depthWrite: false,
  });
}

/** Where the units-and-markers canvas lies on the ground: canvas pixel = (world - origin) × scale. */
export interface OverlayView {
  x0: number;
  y0: number;
  scale: number;
}

/** A plane over the map showing a map-aligned canvas (the fog of war). */
function mapOverlayMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, vUv); }',
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

/** A flat plane lying on the ground over the map (x right, y down in map terms). */
function mapPlane(w: number, h: number, y: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(w / 2, y, h / 2);
  return m;
}

/**
 * The battlefield in 3D (Three.js / WebGL): textured ground, buildings with
 * height and roofs, trees, walls, sandbags and debris, lit by a low sun with
 * real shadows, with fire, smoke and explosions. It only reads the
 * simulation. Units, markers and 2D effects are still drawn by the 2D
 * renderer, into a canvas that is laid on the ground here, so buildings and
 * tree crowns pass correctly in front of the troops behind them.
 */
export class Battlefield3D {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(30, 1, 4, 9000);
  readonly terrain: TerrainLayer;
  private readonly groundTex: THREE.CanvasTexture;
  private readonly overlayTex: THREE.CanvasTexture;
  private readonly overlayMat: THREE.ShaderMaterial;
  private readonly fogTex: THREE.CanvasTexture;
  private readonly sun: THREE.DirectionalLight;
  private statics = new THREE.Group();
  private props = new THREE.Group();
  private info: BuildingInfo = { damaged: [] };
  private buildingTiles = new Set<number>();
  /** Checksum of every house's damage stage: when it changes, the houses are rebuilt. */
  private houseStages = 0;
  readonly fx = new Effects3D();
  private readonly structures = new Structures3D();
  private readonly units = new Units3D();
  /** While anything is being built, shadows are refreshed now and then. */
  private shadowClock = 0;
  private readonly deadSeen = new Set<number>();
  private fogVersion = -1;
  /** Milliseconds the last frame took to draw (CPU side). */
  frameMs = 0;

  constructor(
    private readonly world: World,
    overlay: HTMLCanvasElement,
    fog: HTMLCanvasElement,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game3d';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x8c9478);
    // Tropical haze: soft and warm, only far off.
    this.scene.fog = new THREE.Fog(0x9aa184, 800, 3000);

    const map = world.map;
    const W = map.pixelWidth;
    const H = map.pixelHeight;
    this.terrain = new TerrainLayer(map, true);
    this.groundTex = new THREE.CanvasTexture(this.terrain.canvas);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    // Light: a high mid-afternoon tropical sun from the north-west, a bright
    // hazy sky and warm bounce off the earth.
    this.sun = new THREE.DirectionalLight(0xfff0d6, 3.0);
    this.sun.position.set(W / 2 - 430, 820, H / 2 - 520);
    this.sun.target.position.set(W / 2, 0, H / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const half = Math.max(W, H) * 0.62;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 3200 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xc8d8ea, 0x6a5838, 1.55));

    // The land beyond the battlefield, then the battlefield itself.
    const surround = new THREE.CanvasTexture(this.terrain.surroundCanvas());
    surround.colorSpace = THREE.SRGBColorSpace;
    const m = TerrainLayer.SURROUND_MARGIN;
    const outer = mapPlane(W + m * 2, H + m * 2, -0.6, new THREE.MeshBasicMaterial({ map: surround, toneMapped: false }));
    outer.position.set(W / 2, -0.6, H / 2);
    this.scene.add(outer);
    // Grass blades on green ground, grit, pebbles and cracks on bare earth, tiled
    // over the painted ground so it stays sharp close up, with real bumps for the sun.
    const detail = groundDetailTexture();
    const bumps = groundNormalTexture();
    bumps.repeat.set(W / 40, H / 40);
    const groundMat = new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.96, normalMap: bumps, normalScale: new THREE.Vector2(0.9, 0.9) });
    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.detailMap = { value: detail };
      shader.uniforms.detailRepeat = { value: new THREE.Vector2(W / 40, H / 40) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform vec2 detailRepeat;')
        .replace(
          '#include <map_fragment>',
          [
            '#include <map_fragment>',
            'vec2 dUv = vMapUv * detailRepeat;',
            'vec3 dA = texture2D(detailMap, dUv).rgb;',
            'vec3 dB = texture2D(detailMap, dUv * 0.29 + 0.37).rgb;',
            'float macro = texture2D(detailMap, dUv * 0.043 + 0.11).b;',
            // Green ground gets grass, brown ground gets bare earth.
            'float green = smoothstep(0.95, 1.3, diffuseColor.g / max(diffuseColor.r, 0.001));',
            'float det = mix(dA.g * 0.6 + dB.g * 0.4, dA.r * 0.6 + dB.r * 0.4, green);',
            'diffuseColor.rgb *= 0.58 + det * 0.84;',
            // Broad patches: lush and sun-dried grass, damp and dusty earth.
            'float m = smoothstep(0.25, 0.75, macro);',
            'vec3 grassTint = mix(vec3(0.84, 1.0, 0.84), vec3(1.12, 1.04, 0.8), m);',
            'vec3 earthTint = vec3(mix(0.86, 1.1, m));',
            'diffuseColor.rgb *= mix(earthTint, grassTint, green);',
          ].join('\n'),
        );
    };
    const ground = mapPlane(W, H, 0, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.buildStatics();

    // Troops, markers and 2D effects, laid on the ground.
    this.overlayTex = new THREE.CanvasTexture(overlay);
    this.overlayTex.minFilter = THREE.LinearFilter;
    this.overlayTex.generateMipmaps = false;
    this.overlayMat = groundOverlayMaterial(this.overlayTex);
    const overlayPlane = mapPlane(W + 2400, H + 2400, 0.35, this.overlayMat);
    overlayPlane.position.set(W / 2, 0.35, H / 2);
    overlayPlane.renderOrder = 1;
    this.scene.add(overlayPlane);

    this.fogTex = new THREE.CanvasTexture(fog);
    this.fogTex.minFilter = THREE.LinearFilter;
    this.fogTex.generateMipmaps = false;
    const fogPlane = mapPlane(W, H, 0.5, mapOverlayMaterial(this.fogTex));
    fogPlane.renderOrder = 5;
    this.scene.add(fogPlane);

    this.scene.add(this.fx.group, this.structures.group, this.units.group);
  }

  private stageChecksum(): number {
    let s = 0;
    for (const h of this.world.houses) s = (Math.imul(s, 31) + h.stage + 1) | 0;
    return s;
  }

  /** Buildings, trees and props, rebuilt when the ground changes. */
  private buildStatics(): void {
    const map = this.world.map;
    this.scene.remove(this.statics);
    this.statics = new THREE.Group();
    // Which tiles belong to a damaged or burning house.
    const stage = new Map<number, number>();
    for (const h of this.world.houses) if (h.stage > 0 && h.stage < 3) for (const k of h.tiles) stage.set(k, h.stage);
    this.houseStages = this.stageChecksum();
    this.statics.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    // A headquarters stands in its own compound: the house under it is its model's, not the map's.
    const hqTiles = new Set<number>();
    for (const sq of this.world.squads) {
      if (sq.dead || sq.def.role !== 'hq') continue;
      const tx = Math.floor(sq.pos.x / TILE);
      const ty = Math.floor(sq.pos.y / TILE);
      const n = Math.ceil(sq.def.radius / TILE) + 1;
      for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) if (map.inBounds(tx + dx, ty + dy)) hqTiles.add((ty + dy) * map.w + tx + dx);
    }
    const b = buildBuildings(map, this.terrain, this.groundTex, (k) => stage.get(k) ?? 0, (k) => hqTiles.has(k));
    this.buildingTiles = new Set();
    map.tiles.forEach((t, i) => t === T.Building && this.buildingTiles.add(i));
    this.info = b.info;
    // Damaged houses smoke; burning ones are on fire.
    this.fx.removeFires('house');
    for (const d of this.info.damaged) {
      if (d.stage === 2) this.fx.addFire(d.x, d.y, 0.9 + Math.min(1, d.size / 40), Infinity, false, 'house');
      this.fx.addFire(d.x, d.y, d.stage === 2 ? 1.1 : 0.7, Infinity, true, 'house');
    }
    this.statics.add(b.group);
    const veg = buildVegetation(map, this.terrain);
    this.statics.add(veg.ground, veg.crowns);
    this.scene.add(this.statics);
    this.rebuildProps();
  }

  private rebuildProps(): void {
    this.scene.remove(this.props);
    this.props.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        o.dispose();
      }
    });
    this.props = buildProps(this.world.map, this.info);
    this.scene.add(this.props);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Repaint and rebuild what the battle has changed on the ground. */
  private syncGround(): void {
    const map = this.world.map;
    // A house shelled into its next stage of damage is rebuilt, even if no tile changed.
    if (map.changes.length === 0) {
      if (this.stageChecksum() !== this.houseStages) this.buildStatics();
      return;
    }
    // Buildings only need rebuilding if one was touched; walls, wire and the like always.
    const buildingsTouched = map.changes.some((i) => map.tiles[i] === T.Building || this.buildingTiles.has(i));
    this.terrain.sync();
    this.groundTex.needsUpdate = true;
    if (buildingsTouched) this.buildStatics();
    else this.rebuildProps();
  }

  /** Pixel ratio the 3D world renders at: full screen detail costs too much on most GPUs. */
  static pixelRatio(dpr: number): number {
    return Math.min(dpr, 1);
  }

  setSize(w: number, h: number, dpr: number): void {
    this.renderer.setPixelRatio(Battlefield3D.pixelRatio(dpr));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // The units-and-markers canvas has a new size: free the old texture so it is
    // allocated afresh, or every update would fail and the markers drift off the map.
    this.overlayTex.dispose();
    this.overlayTex.needsUpdate = true;
  }

  /**
   * Where to draw the units-and-markers canvas: a flat plan of the ground the
   * camera sees, scaled to fit the canvas. The 2D renderer draws with it and
   * the ground plane maps it back, so both agree.
   */
  overlayView(camera: Camera, canvasW: number, canvasH: number): OverlayView {
    const b = camera.visibleBounds();
    const pad = 40;
    const x0 = b.x0 - pad;
    const y0 = b.y0 - pad;
    const scale = Math.min(canvasW / (b.x1 - b.x0 + pad * 2), canvasH / (b.y1 - b.y0 + pad * 2));
    this.overlayMat.uniforms.view.value.set(x0, y0, scale / canvasW, scale / canvasH);
    return { x0, y0, scale };
  }

  /** Match the 3D camera to the game camera (plus screen shake, in screen pixels). */
  private syncCamera(camera: Camera, shakeX: number, shakeY: number): void {
    const cam = this.cam;
    cam.fov = (CAMERA_FOV * 180) / Math.PI;
    cam.aspect = camera.viewW / Math.max(1, camera.viewH);
    const d = camera.distance;
    // Near and far planes follow the zoom, so depth precision stays where the battle is.
    cam.near = Math.max(2, d * 0.25);
    cam.far = d * 6 + 1500;
    cam.updateProjectionMatrix();
    const e = camera.eye;
    const sx = -shakeX / camera.zoom;
    const sy = -shakeY / camera.zoom;
    cam.position.set(e.x + sx, e.h, e.y + sy);
    cam.lookAt(camera.x + sx, 0, camera.y + sy);
    // A light haze over the far side of the field, never over the near side.
    const fog = this.scene.fog as THREE.Fog;
    fog.near = d * 1.15;
    fog.far = d * 4.5;
  }

  /** New fires and blasts from this frame's battle events. */
  consume(events: readonly SimEvent[], visible: (p: { x: number; y: number }) => boolean): void {
    for (const e of events) {
      if (e.type === 'shot' && (visible(e.from) || visible(e.to))) {
        const kind = e.projectile === 'shell' || e.projectile === 'rocket' ? 'shell' : WEAPONS[e.weapon]?.suppression >= 0.05 ? 'mg' : 'rifle';
        const target = e.hit ? this.world.squads.find((s) => !s.dead && s.def.armor && Math.hypot(s.pos.x - e.to.x, s.pos.y - e.to.y) < s.def.radius + 4) : undefined;
        this.fx.shot(e.from.x, e.from.y, e.to.x, e.to.y, e.hit, kind, !!target);
      } else if (e.type === 'explosion' && visible(e.pos)) this.fx.explosion(e.pos.x, e.pos.y, e.radius);
      else if (e.type === 'smoke' && visible(e.pos)) this.fx.smokeBurst(e.pos.x, e.pos.y, e.radius);
      else if (e.type === 'collapse' && visible(e.pos)) {
        // A house falls in: a cloud of dust and smoke, and the wreck burns for a while.
        this.fx.explosion(e.pos.x, e.pos.y, Math.max(30, e.radius * 1.2));
        this.fx.addFire(e.pos.x, e.pos.y, 1.2, 40);
        this.fx.addFire(e.pos.x, e.pos.y, 1, 120, true);
      }
      else if (e.type === 'death' && e.vehicle && visible(e.pos)) {
        // A knocked-out tank burns.
        this.fx.explosion(e.pos.x, e.pos.y, 26);
        this.fx.addFire(e.pos.x, e.pos.y, 1.3, 40);
      }
    }
    // Emplacements and buildings that fall go up in flames.
    for (const sq of this.world.squads) {
      if (!sq.dead || sq.def.kind !== 'structure' || this.deadSeen.has(sq.id)) continue;
      this.deadSeen.add(sq.id);
      if (!visible(sq.pos)) continue;
      this.fx.explosion(sq.pos.x, sq.pos.y, 30);
      this.fx.addFire(sq.pos.x, sq.pos.y, sq.def.role === 'hq' || sq.def.role === 'tech' ? 2 : 1.4, 60);
    }
  }

  /** Show these structures (the ones the player can see) as buildings. */
  /** Show these soldiers, weapon teams and tanks (the ones the player can see) as models. */
  syncUnits(list: readonly Squad[], lookOf: (sq: Squad) => UnitLook): void {
    this.units.sync(list, this.world.time, lookOf);
  }

  syncStructures(list: readonly Squad[]): void {
    const changed = this.structures.sync(list, (sq) => this.world.teams[sq.team].faction.id);
    this.shadowClock -= 1 / 60;
    if (changed && this.shadowClock <= 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowClock = 0.4;
    }
  }

  render(camera: Camera, dt: number, fogVersion: number, shakeX = 0, shakeY = 0): void {
    const t0 = performance.now();
    this.syncGround();
    this.syncCamera(camera, shakeX, shakeY);
    // Smoke screens billow for as long as they hang; anyone may see a cloud from outside it.
    for (const s of this.world.smokes) {
      const k = smokeStrength(s, this.world.time);
      if (k > 0) this.fx.smokeScreen(s.pos.x, s.pos.y, s.radius, k, dt);
    }
    this.fx.update(dt);
    this.overlayTex.needsUpdate = true;
    if (fogVersion !== this.fogVersion) {
      this.fogVersion = fogVersion;
      this.fogTex.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.cam);
    this.frameMs = performance.now() - t0;
  }

  /** Stats for the performance readout. */
  stats(): { calls: number; triangles: number; particles: number } {
    const r = this.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles, particles: this.fx.particles };
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.fx.dispose();
    this.structures.dispose();
    this.units.dispose();
    this.groundTex.dispose();
    this.overlayTex.dispose();
    this.fogTex.dispose();
    disposeTextures();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

/** Whether this machine can run the 3D battlefield. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

