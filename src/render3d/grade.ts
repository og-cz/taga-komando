import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * The battlefield's look, applied to the finished HDR frame on its way to the
 * screen: filmic (ACES) tone mapping, then a war-photograph grade: colour
 * held back, contrast pushed, shadows cooled towards blue-green and
 * highlights warmed to gold, greens drawn towards olive and earth towards
 * umber, and a fine grain over all of it.
 */
export class GradePass {
  private readonly quad: FullScreenQuad;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        exposure: { value: 1 },
        grain: { value: 0 },
        aspect: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float exposure;
        uniform float grain;
        uniform float aspect;
        varying vec2 vUv;

        // ACES filmic curve (Hill's fit, as three.js uses).
        vec3 rrtOdt(vec3 v) {
          vec3 a = v * (v + 0.0245786) - 0.000090537;
          vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
          return a / b;
        }
        vec3 aces(vec3 c) {
          const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
          const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
          c *= exposure / 0.6;
          return clamp(outM * rrtOdt(inM * c), 0.0, 1.0);
        }
        vec3 toSrgb(vec3 c) {
          return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
        }
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec3 c = aces(texture2D(tDiffuse, vUv).rgb);
          // Hold the colour back.
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 0.74);
          c = toSrgb(c);
          // Push the contrast round the middle greys.
          c = clamp((c - 0.46) * 1.2 + 0.46, 0.0, 1.0);
          // Cool shadows, golden highlights; greens towards olive.
          float L = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c += mix(vec3(-0.018, 0.004, 0.03), vec3(0.035, 0.014, -0.035), smoothstep(0.15, 0.75, L));
          // Greens towards olive (#3b4728), earth towards umber (#4a3c2c), keeping their lightness.
          float green = smoothstep(0.0, 0.12, c.g - max(c.r, c.b));
          float earth = smoothstep(0.0, 0.1, c.r - c.b) * (1.0 - green);
          vec3 olive = vec3(0.231, 0.278, 0.157) / 0.262;
          vec3 umber = vec3(0.290, 0.235, 0.173) / 0.243;
          float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(c, olive * lum, green * 0.5);
          c = mix(c, umber * lum, earth * 0.35);
          // Film grain, a new pattern every frame.
          c += (hash(gl_FragCoord.xy + grain) - 0.5) * 0.035;
          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  /** Grade `source` onto the screen. */
  render(renderer: THREE.WebGLRenderer, source: THREE.Texture, width: number, height: number): void {
    const u = this.material.uniforms;
    u.tDiffuse.value = source;
    u.exposure.value = renderer.toneMappingExposure;
    u.grain.value = (u.grain.value + 17.31) % 1000;
    u.aspect.value = width / Math.max(1, height);
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
