import * as THREE from 'three';
import { T } from '../data/terrain';
import type { SimEvent } from '../sim/entities';
import type { World } from '../sim/world';
import { CAMERA_TILT, type Camera } from '../render/camera';
import { TerrainLayer } from '../render/terrainLayer';
import { buildBuildings, type BuildingInfo } from './buildings';
import { Effects3D } from './fx';
import { Structures3D } from './structures';
import { Units3D, type UnitLook } from './units';
import type { Squad } from '../sim/entities';
import { buildProps } from './props';
import { disposeTextures, groundDetailTexture } from './textures';
import { buildVegetation } from './vegetation';

/** A plane over the map that shows a screen-aligned canvas, so 2D drawing sits in the 3D scene. */
function screenOverlayMaterial(tex: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, res: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D map;
      uniform vec2 res;
      void main() {
        vec4 c = texture2D(map, gl_FragCoord.xy / res);
        if (c.a < 0.003) discard;
        gl_FragColor = c;
      }`,
    transparent: true,
    depthWrite: false,
  });
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
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
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
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x0c0f0b);

    const map = world.map;
    const W = map.pixelWidth;
    const H = map.pixelHeight;
    this.terrain = new TerrainLayer(map, true);
    this.groundTex = new THREE.CanvasTexture(this.terrain.canvas);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    // Light: a low afternoon sun from the north-west, and sky and earth bounce.
    this.sun = new THREE.DirectionalLight(0xffd6a0, 3.6);
    this.sun.position.set(W / 2 - 520, 470, H / 2 - 430);
    this.sun.target.position.set(W / 2, 0, H / 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const half = Math.max(W, H) * 0.62;
    Object.assign(this.sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 10, far: 2600 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.5;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0x9fb3c8, 0x3d3220, 0.7));

    // The land beyond the battlefield, then the battlefield itself.
    const surround = new THREE.CanvasTexture(this.terrain.surroundCanvas());
    surround.colorSpace = THREE.SRGBColorSpace;
    const m = TerrainLayer.SURROUND_MARGIN;
    const outer = mapPlane(W + m * 2, H + m * 2, -0.6, new THREE.MeshBasicMaterial({ map: surround, toneMapped: false }));
    outer.position.set(W / 2, -0.6, H / 2);
    this.scene.add(outer);
    const groundMat = new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.96 });
    // Fine grit, pebbles and grass tiled over the painted ground, so it stays sharp close up.
    const detail = groundDetailTexture();
    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.detailMap = { value: detail };
      shader.uniforms.detailRepeat = { value: new THREE.Vector2(W / 22, H / 22) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nuniform vec2 detailRepeat;')
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\nfloat dA = texture2D(detailMap, vMapUv * detailRepeat).r;\nfloat dB = texture2D(detailMap, vMapUv * detailRepeat * 0.37 + 0.31).r;\ndiffuseColor.rgb *= 0.62 + (dA * 0.6 + dB * 0.4) * 0.76;',
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
    this.overlayMat = screenOverlayMaterial(this.overlayTex);
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
    // Shelled houses smoulder; a few still burn.
    this.info.damaged.forEach((d, i) => this.fx.addFire(d.x, d.y, 0.7 + (i % 3) * 0.2, Infinity, i % 3 !== 0));
  }

  /** Buildings, trees and props, rebuilt when the ground changes. */
  private buildStatics(): void {
    const map = this.world.map;
    this.scene.remove(this.statics);
    this.statics = new THREE.Group();
    const b = buildBuildings(map, this.terrain, this.groundTex);
    this.buildingTiles = new Set();
    map.tiles.forEach((t, i) => t === T.Building && this.buildingTiles.add(i));
    this.info = b.info;
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
    if (map.changes.length === 0) return;
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
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.overlayMat.uniforms.res.value.copy(size);
    // The units-and-markers canvas has a new size: free the old texture so it is
    // allocated afresh, or every update would fail and the markers drift off the map.
    this.overlayTex.dispose();
    this.overlayTex.needsUpdate = true;
  }

  /** Match the 3D camera to the game camera (plus screen shake, in screen pixels). */
  private syncCamera(camera: Camera, shakeX: number, shakeY: number): void {
    const z = camera.zoom;
    const w = camera.viewW / z;
    const h = camera.viewH / z;
    const cam = this.cam;
    cam.left = -w / 2 - shakeX / z;
    cam.right = w / 2 - shakeX / z;
    cam.top = h / 2 + shakeY / z;
    cam.bottom = -h / 2 + shakeY / z;
    cam.updateProjectionMatrix();
    const D = 2500;
    cam.position.set(camera.x, Math.cos(CAMERA_TILT) * D, camera.y + Math.sin(CAMERA_TILT) * D);
    cam.lookAt(camera.x, 0, camera.y);
  }

  /** New fires and blasts from this frame's battle events. */
  consume(events: readonly SimEvent[], visible: (p: { x: number; y: number }) => boolean): void {
    for (const e of events) {
      if (e.type === 'explosion' && visible(e.pos)) this.fx.explosion(e.pos.x, e.pos.y, e.radius);
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

