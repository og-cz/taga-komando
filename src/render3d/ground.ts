import * as THREE from 'three';
import type { TerrainLayer } from '../render/terrainLayer';
import { surface } from './surfaces';
import { groundDetailTexture } from './textures';

/**
 * World units one repeat of each ground surface covers: larger than life, so
 * leaves, grit and stones still show as grain at battle zoom instead of
 * averaging away to a flat colour.
 */
const TILE_SIZE = { grass: 72, road: 56, earth: 60, jungle: 76 };

/**
 * The battlefield's ground: photo-scanned grass, red-earth road, bare trodden
 * earth and jungle floor, blended by the terrain layer's material map, with
 * their own bumps and roughness. Each surface is sampled at two scales and
 * blended by broad noise, so no repeat shows. The flat painting of the
 * ground still supplies paddies, water and rubble outright, and everywhere
 * its fine marks (ruts, puddles, craters, dikes) as light and shade.
 */
export function groundMaterial(terrain: TerrainLayer, painted: THREE.Texture, W: number, H: number): { material: THREE.MeshStandardMaterial; update(): void } {
  const splat = new THREE.DataTexture(terrain.splat, terrain.splatW, terrain.splatH, THREE.RGBAFormat);
  splat.magFilter = THREE.LinearFilter;
  splat.minFilter = THREE.LinearFilter;
  splat.needsUpdate = true;
  const more = new THREE.DataTexture(terrain.ground2, terrain.splatW, terrain.splatH, THREE.RGBAFormat);
  more.magFilter = THREE.LinearFilter;
  more.minFilter = THREE.LinearFilter;
  more.needsUpdate = true;
  let version = terrain.splatVersion;

  const grass = surface('leafy_grass');
  const road = surface('red_dirt_mud_01');
  const earth = surface('brown_mud_02');
  const jungle = surface('forrest_ground_01');
  const macro = groundDetailTexture();

  // The grass normal map is the material's own, so the shader gets a tangent frame for free.
  const material = new THREE.MeshStandardMaterial({ map: painted, normalMap: grass.normal, normalScale: new THREE.Vector2(1, 1), roughness: 1 });
  material.onBeforeCompile = (shader) => {
    // Relief: wheel ruts sunk into the road, its shoulders pushed up, the open ground gently uneven.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform sampler2D splatMap;
uniform sampler2D ground2Map;
uniform sampler2D macroMap;
uniform vec2 worldSize;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec2 rUv = vec2(uv.x, 1.0 - uv.y);
vec4 rSp = textureLod(splatMap, rUv, 0.0);
vec4 rG2 = textureLod(ground2Map, rUv, 0.0);
float rIn = rG2.b * 32.0;
float rRut = (exp(-pow((rIn - 4.0) / 1.8, 2.0)) + 0.85 * exp(-pow((rIn - 11.0) / 1.8, 2.0))) * rSp.r;
float rBank = smoothstep(0.1, 0.45, rSp.r) * (1.0 - smoothstep(0.45, 0.85, rSp.r));
float rLump = textureLod(macroMap, uv * worldSize / 45.0, 0.0).b - 0.5;
// Paddies and rivers: the water sits low, the dike round the edge stands up.
float rWet = rG2.a;
float rDike = smoothstep(0.22, 0.4, rWet) * (1.0 - smoothstep(0.45, 0.6, rWet));
float rPool = smoothstep(0.5, 0.68, rWet);
transformed.z += -rRut * 0.45 + rBank * 0.3 + rLump * 0.5 * (1.0 - rSp.r) * (1.0 - rSp.a) * (1.0 - rWet) + rDike * 1.1 - rPool * 0.6;`,
      );
    Object.assign(shader.uniforms, {
      splatMap: { value: splat },
      ground2Map: { value: more },
      texel: { value: new THREE.Vector2(1 / terrain.splatW, 1 / terrain.splatH) },
      macroMap: { value: macro },
      cGrass: { value: grass.color },
      cRoad: { value: road.color },
      cEarth: { value: earth.color },
      cJungle: { value: jungle.color },
      nRoad: { value: road.normal },
      nEarth: { value: earth.normal },
      nJungle: { value: jungle.normal },
      worldSize: { value: new THREE.Vector2(W, H) },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D splatMap;
uniform sampler2D ground2Map;
uniform vec2 texel;
uniform sampler2D macroMap;
uniform sampler2D cGrass;
uniform sampler2D cRoad;
uniform sampler2D cEarth;
uniform sampler2D cJungle;
uniform sampler2D nRoad;
uniform sampler2D nEarth;
uniform sampler2D nJungle;
uniform vec2 worldSize;
vec4 gW;
float gPainted;
float gMacro;
vec2 gWorld;
vec2 gDx;
vec2 gDy;
vec2 gUv;
float gWet;
float gRoadD;
float gRutK;
float gDike;
float gPool;
// A surface sampled near and far, blended by broad noise, so its repeat never lines up.
// Gradients are taken once up front, so surfaces can be skipped where they do not show.
vec4 twoScale(sampler2D t, vec2 p, float size) {
  float m = smoothstep(0.3, 0.7, gMacro);
  float k1 = 1.0 / size;
  float k2 = 1.0 / (size * 2.7);
  vec4 a = m < 0.99 ? textureGrad(t, p * k1, gDx * k1, gDy * k1) : vec4(0.0);
  if (m < 0.01) return a;
  vec4 b = textureGrad(t, p * k2 + vec2(0.37, 0.71), gDx * k2, gDy * k2);
  return mix(a, b, m);
}
vec3 twoScaleN(sampler2D t, vec2 p, float size) {
  return twoScale(t, p, size).xyz * 2.0 - 1.0;
}`,
      )
      .replace(
        '#include <map_fragment>',
        `gWorld = vMapUv * worldSize;
gDx = dFdx(gWorld);
gDy = dFdy(gWorld);
gMacro = texture2D(macroMap, gWorld / 700.0).b;
// The material map runs top to bottom like the map; the ground's v runs bottom to top.
gUv = vec2(vMapUv.x, 1.0 - vMapUv.y);
vec4 sp = texture2D(splatMap, gUv);
vec2 mUv = gWorld / 90.0 + 0.21;
float clump = textureGrad(macroMap, mUv, gDx / 90.0, gDy / 90.0).b * 0.6 + texture2D(macroMap, gWorld / 23.0 + 0.63).b * 0.4;
float dryness = smoothstep(0.5, 0.85, texture2D(macroMap, gWorld / 260.0 + 0.5).b);
// Grass, wherever any can show (it also decides how ragged the edges of road and earth are).
vec4 grassC = vec4(0.0);
float tall = 0.5;
if (sp.r + sp.g + sp.b + sp.a < 0.985) {
  grassC = twoScale(cGrass, gWorld, ${TILE_SIZE.grass.toFixed(1)});
  // Tropical grass: greener and lusher than the scan, in clumps, drier in broad patches.
  float gl = dot(grassC.rgb, vec3(0.3, 0.55, 0.15));
  vec3 lush = mix(grassC.rgb, vec3(gl) * vec3(0.66, 0.95, 0.38), 0.62);
  vec3 dry = mix(grassC.rgb, vec3(gl) * vec3(0.95, 0.95, 0.42), 0.55);
  grassC.rgb = mix(lush, dry, clamp(dryness * 0.7 + (0.4 - clump) * 0.8, 0.0, 1.0)) * mix(0.75, 1.1, clump);
  tall = smoothstep(0.25, 0.75, gl * 2.0);
}
// Grass grows over the edges of earth and road where its blades stand tallest.
float wr = clamp(sp.r * 1.35 - 0.18 + (0.5 - tall) * 0.35 * (1.0 - sp.r), 0.0, 1.0);
float we = clamp(sp.g * 1.3 - 0.12 + (0.5 - tall) * 0.3 * (1.0 - sp.g), 0.0, 1.0) * (1.0 - wr);
float wj = sp.b * (1.0 - wr) * (1.0 - we);
gPainted = sp.a;
float wg = max(0.0, 1.0 - wr - we - wj - gPainted);
gW = vec4(wg, wr, we, wj);
vec4 surf = grassC * wg;
if (wr > 0.002) {
  vec4 roadC = twoScale(cRoad, gWorld, ${TILE_SIZE.road.toFixed(1)});
  // Road: dusty red earth.
  roadC.rgb = mix(roadC.rgb, vec3(dot(roadC.rgb, vec3(0.33))) * vec3(1.25, 0.95, 0.68), 0.45) * 1.05;
  surf += roadC * wr;
}
if (we > 0.002) {
  vec4 earthC = twoScale(cEarth, gWorld, ${TILE_SIZE.earth.toFixed(1)});
  // Bare trodden earth: warm and dusty, not grey.
  earthC.rgb = mix(earthC.rgb, vec3(dot(earthC.rgb, vec3(0.33))) * vec3(1.3, 1.0, 0.68), 0.6) * 1.2;
  surf += earthC * we;
}
if (wj > 0.002) surf += twoScale(cJungle, gWorld, ${TILE_SIZE.jungle.toFixed(1)}) * wj;
vec4 paint = texture2D(map, vMapUv);
// The painting's own marks as light and shade: its colour against a blurred copy of itself.
float fine = dot(paint.rgb, vec3(0.33)) / max(0.02, dot(textureLod(map, vMapUv, 4.5).rgb, vec3(0.33)));
float marks = mix(1.0, clamp(fine, 0.55, 1.3), 0.85);
vec3 col = mix(surf.rgb / max(0.001, 1.0 - gPainted), paint.rgb, gPainted);
col *= marks;
// Broad variation in tone across the field.
col *= 0.9 + 0.2 * gMacro;
diffuseColor.rgb = col;
float gRough = mix(surf.a / max(0.001, 1.0 - gPainted), 0.85, gPainted);
vec4 g2 = texture2D(ground2Map, gUv);
gRoadD = g2.b * 32.0;
// Wheel ruts: a pair of grooves in each lane, four and eleven units in from the road's edge,
// darker and holding water.
float rut = (exp(-pow((gRoadD - 4.0) / 1.1, 2.0)) + exp(-pow((gRoadD - 11.0) / 1.1, 2.0)) * 0.85) * gW.y;
gRutK = 1.0;
gWet = clamp(g2.g + rut * 0.6 * smoothstep(0.35, 0.65, gMacro + clump * 0.3), 0.0, 1.0) * (1.0 - gPainted * 0.5);
diffuseColor.rgb *= 1.0 - rut * 0.3;
// Wet ground: darker and richer, and smooth enough to catch the sky.
diffuseColor.rgb *= mix(1.0, 0.52, gWet);
gRough = mix(gRough, 0.28, gWet * 0.85);
// Paddies and rivers: a grassy dike round the edge, then still, muddy water that mirrors the sky.
gDike = smoothstep(0.22, 0.4, g2.a) * (1.0 - smoothstep(0.45, 0.6, g2.a));
gPool = smoothstep(0.5, 0.66, g2.a);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.95, 1.12, 0.7) * 1.1, gDike * 0.6);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.06, 0.035) + diffuseColor.rgb * 0.15, gPool * 0.9);
gRough = mix(gRough, 0.05, gPool);
// Round every building: trodden, scorched dark earth instead of a clean edge.
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.5, 0.45, 0.4), g2.r * 0.8);`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(gRough, mix(0.45, 0.04, gPool), 1.0);')
      // Still water shows a faint sheen of the sky.
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.016, 0.022, 0.026) * gPool;`)
      .replace(
        '#include <normal_fragment_maps>',
        `vec3 mapN = vec3(0.0, 0.0, 1.0) * gPainted;
if (gW.x > 0.002) mapN += twoScaleN(normalMap, gWorld, ${TILE_SIZE.grass.toFixed(1)}) * gW.x;
if (gW.y > 0.002) mapN += twoScaleN(nRoad, gWorld, ${TILE_SIZE.road.toFixed(1)}) * gW.y * 1.2;
if (gW.z > 0.002) mapN += twoScaleN(nEarth, gWorld, ${TILE_SIZE.earth.toFixed(1)}) * gW.z * 1.2;
if (gW.w > 0.002) mapN += twoScaleN(nJungle, gWorld, ${TILE_SIZE.jungle.toFixed(1)}) * gW.w;
mapN = normalize(mapN + vec3(0.0, 0.0, 0.001));
// Puddles and paddy water lie flat, with the faintest ripple.
mapN = normalize(mix(mapN, vec3(0.0, 0.0, 1.0), max(gWet * 0.7, gPool * 0.92)));
if (gW.y > 0.002 && gRoadD > 1.5 && gRoadD < 14.0) {
  // The ruts' walls: the slope of the groove across the road (one unit per texel).
  float dX = (texture2D(ground2Map, gUv + vec2(texel.x, 0.0)).b - texture2D(ground2Map, gUv - vec2(texel.x, 0.0)).b) * 16.0;
  float dZ = (texture2D(ground2Map, gUv + vec2(0.0, texel.y)).b - texture2D(ground2Map, gUv - vec2(0.0, texel.y)).b) * 16.0;
  float u = (gRoadD - 4.0) / 1.1;
  float w = (gRoadD - 11.0) / 1.1;
  float dh = 1.4 * 2.0 / 1.1 * (u * exp(-u * u) + 0.85 * w * exp(-w * w)) * gW.y * gRutK;
  mapN = normalize(vec3(mapN.xy + vec2(-dh * dX, dh * dZ) * mapN.z, mapN.z));
}
mapN.xy *= normalScale;
normal = normalize(tbn * mapN);`,
      );
  };
  return {
    material,
    update(): void {
      if (terrain.splatVersion === version) return;
      version = terrain.splatVersion;
      splat.needsUpdate = true;
      more.needsUpdate = true;
    },
  };
}
