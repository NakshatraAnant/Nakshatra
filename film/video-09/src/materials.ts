import * as THREE from 'three';
import type { WorldBuild } from '@app/web/three/archetypeWorlds';

/** Adds a view-dependent rim in `rim` colour to a standard material: every statue carries its own edge light. */
export function withRim<T extends THREE.MeshStandardMaterial>(m: T, rim: THREE.ColorRepresentation, strength = 1.1, power = 2.6): T {
  const uRim = { value: new THREE.Color(rim) };
  const uRimS = { value: strength };
  m.userData.rim = uRimS;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = uRim;
    sh.uniforms.uRimS = uRimS;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform float uRimS;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), ${power.toFixed(2)});
        totalEmissiveRadiance += uRim * rimF * uRimS;`);
  };
  m.customProgramCacheKey = () => `rim-${power}`;
  return m;
}

const INK = new THREE.Color('#0d0f2b');

export interface StatueMaterials { body: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial; line: THREE.LineBasicMaterial | null }

/**
 * One coherent statue language, three finishes. The finish is not invented here: it is the archetype's own
 * world build (wire / facets / glass) from the app's archetypeWorlds.ts, and the colour is its accent.
 */
export function statueMaterials(accent: string, build: WorldBuild): StatueMaterials {
  const c = new THREE.Color(accent);
  const glow = new THREE.MeshBasicMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.2).multiplyScalar(0.9) });
  if (build === 'glass') {
    // Pearl: pale, polished, lit from within.
    const body = withRim(new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color('#ffffff'), 0.3), metalness: 0.35, roughness: 0.34, emissive: c, emissiveIntensity: 0.04 }), c, 0.75, 2.6);
    const trim = withRim(new THREE.MeshStandardMaterial({ color: '#f1e6cf', metalness: 0.95, roughness: 0.2, emissive: c, emissiveIntensity: 0.08 }), c, 0.5);
    return { body, trim, glow, line: null };
  }
  if (build === 'wire') {
    // Obsidian drawn in light: a dark polished body whose contours glow.
    const body = withRim(new THREE.MeshStandardMaterial({ color: INK.clone().lerp(c, 0.1), metalness: 0.85, roughness: 0.3, emissive: c, emissiveIntensity: 0.03 }), c, 1.9, 2.0);
    const trim = withRim(new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.75), metalness: 0.75, roughness: 0.28, emissive: c, emissiveIntensity: 0.45 }), c, 0.6);
    return { body, trim, glow, line: new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.85 }) };
  }
  // Tinted metal with gold trim.
  const body = withRim(new THREE.MeshStandardMaterial({ color: c.clone().lerp(INK, 0.3), metalness: 0.75, roughness: 0.38, emissive: c, emissiveIntensity: 0.05 }), c, 1.0, 2.5);
  const trim = withRim(new THREE.MeshStandardMaterial({ color: '#f1e6cf', metalness: 0.9, roughness: 0.42, emissive: '#c39a51', emissiveIntensity: 0.12 }), '#ecd29d', 0.8);
  return { body, trim, glow, line: null };
}

let glowTex: THREE.Texture | null = null;
/** Soft radial falloff used for every light halo. */
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function glowSprite(color: THREE.ColorRepresentation, size: number, opacity = 1): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}
