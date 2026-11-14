import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export const W = 1080, H = 1920;

/** Lens finish: gentle chromatic fringe, vignette, film grain, and a flash/fade level for cuts. */
const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color('#fff1d0') }, uFade: { value: 1 }, uVignette: { value: 1 }, uAberration: { value: 1 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uFlash; uniform vec3 uFlashColor; uniform float uFade; uniform float uVignette; uniform float uAberration;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * 0.005 * uAberration;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1.0, smoothstep(0.95, 0.18, length(c * vec2(1.0, 0.82))), 0.6 * uVignette);
      col += (hash(floor(gl_FragCoord.xy) + fract(uTime * 7.31) * 311.0) - 0.5) * 0.014;
      col = mix(col, uFlashColor * 1.6, clamp(uFlash, 0.0, 1.0));
      gl_FragColor = vec4(col * uFade, 1.0);
    }`,
};

export interface Stage {
  renderer: THREE.WebGLRenderer;
  render: (scene: THREE.Scene, camera: THREE.Camera, t: number, look: { flash?: number; fade?: number; bloom?: number; vignette?: number; flashColor?: string }) => void;
}

export function createStage(canvas: HTMLCanvasElement, scale: number): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(scale);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const target = new THREE.WebGLRenderTarget(W * scale, H * scale, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(scale);
  composer.setSize(W, H);
  const pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(W * scale, H * scale), 0.7, 0.6, 0.86);
  const finish = new ShaderPass(FinishShader);
  composer.addPass(pass);
  composer.addPass(bloom);
  composer.addPass(finish);
  composer.addPass(new OutputPass());
  return {
    renderer,
    render(scene, camera, t, look) {
      pass.scene = scene;
      pass.camera = camera;
      bloom.strength = look.bloom ?? 0.7;
      finish.uniforms.uTime.value = t;
      finish.uniforms.uFlash.value = look.flash ?? 0;
      finish.uniforms.uFade.value = look.fade ?? 1;
      finish.uniforms.uVignette.value = look.vignette ?? 1;
      (finish.uniforms.uFlashColor.value as THREE.Color).set(look.flashColor ?? '#fff1d0');
      composer.render();
    },
  };
}
