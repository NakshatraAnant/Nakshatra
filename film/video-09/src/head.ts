import * as THREE from 'three';

/**
 * The film's stylised head: one signed-distance sculpt, meshed by finding the surface along every
 * direction of an icosphere. Low detail gives the faceted, crystalline statue used throughout;
 * high detail gives the smooth version for the opening close-up. No downloaded model.
 */
type V3 = [number, number, number];
const ell = (p: V3, c: V3, r: V3) => {
  const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2];
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  return k1 === 0 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
};
const capsule = (p: V3, a: V3, b: V3, r: number) => {
  const pa: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], ba: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const h = Math.max(0, Math.min(1, (pa[0] * ba[0] + pa[1] * ba[1] + pa[2] * ba[2]) / (ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2])));
  return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - r;
};
const smin = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export function headSdf(p: V3, abstract = false): number {
  const q: V3 = [Math.abs(p[0]), p[1], p[2]]; // mirror: the face is symmetric
  let d = ell(q, [0, 0.3, -0.12], [0.71, 0.8, 0.9]);
  d = smin(d, ell(q, [0, -0.24, 0.12], [0.56, 0.76, 0.66]), 0.3);
  d = smin(d, ell(q, [0, -0.86, 0.42], [0.22, 0.19, 0.22]), 0.26); // chin
  d = smin(d, ell(q, [0.38, -0.16, 0.44], [0.19, 0.17, 0.2]), 0.24); // cheekbone
  d = smin(d, ell(q, [0.25, 0.23, 0.66], [0.25, 0.07, 0.13]), 0.14); // brow
  d = smax(d, -(Math.hypot(q[0] - 0.28, q[1] - 0.04, q[2] - 0.88) - 0.15), 0.16); // eye hollow, shallow
  d = smin(d, ell(q, [0.275, 0.02, 0.69], [0.13, 0.065, 0.09]), 0.07); // closed lid
  d = smin(d, capsule(q, [0, 0.2, 0.72], [0, -0.2, 0.92], 0.05), 0.12); // nose bridge
  d = smin(d, Math.hypot(q[0], q[1] + 0.23, q[2] - 0.92) - 0.07, 0.07); // nose tip
  d = smin(d, ell(q, [0.075, -0.275, 0.82], [0.05, 0.04, 0.07]), 0.06); // nostril wing
  if (!abstract) {
    d = smin(d, ell(q, [0, -0.555, 0.715], [0.155, 0.075, 0.09]), 0.09); // lips, as one soft form
  }
  d = smin(d, ell(q, [0.72, -0.02, -0.06], [0.06, 0.19, 0.12]), 0.05); // ear
  d = smin(d, capsule(q, [0, -0.7, -0.14], [0, -1.9, -0.28], 0.27), 0.24); // neck
  return d;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** `detail` is the icosphere subdivision; `faceted` leaves faces unwelded for flat shading. */
export function headGeometry(detail: number, faceted: boolean, abstract = false): THREE.BufferGeometry {
  const id = `${detail}:${faceted}:${abstract}`;
  const sdf = (p: V3) => headSdf(p, abstract);
  const hit = cache.get(id);
  if (hit) return hit;
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const pos = ico.getAttribute('position') as THREE.BufferAttribute;
  const nrm = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i), uy = pos.getY(i), uz = pos.getZ(i);
    // March inward from outside so the outermost surface is always the one found (lips and ears overhang).
    let rr = 2.6;
    for (let k = 0; k < 90; k++) {
      const dd = sdf([ux * rr, uy * rr, uz * rr]);
      if (dd < 0.0006) break;
      rr -= dd * 0.6;
    }
    const r = Math.min(rr, 1.75 / Math.max(0.001, -uy)); // the neck is cut flat below the collar
    const p: V3 = [ux * r, uy * r, uz * r];
    pos.setXYZ(i, p[0], p[1], p[2]);
    const e = 0.004;
    const gx = sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]);
    const gy = sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]);
    const gz = sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e]);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nrm.set([gx / gl, gy / gl, gz / gl], i * 3);
  }
  if (faceted) ico.computeVertexNormals(); else ico.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  ico.computeBoundingSphere();
  cache.set(id, ico);
  return ico;
}
