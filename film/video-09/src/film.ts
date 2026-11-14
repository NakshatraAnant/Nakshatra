import * as THREE from 'three';
import type { Stage } from './stage';
import { ARCHETYPES, BRAND, DIMS } from './data';
import { buildEnvironment } from './env';
import { buildHeadScene } from './headScene';
import { buildCosmos, HELIX, podAngle, podPos, podY, SCULPT_FORMS, updatePod } from './cosmos';
import { TAU, clamp, easeIn, easeInOut, easeOut, lerp, pulse, seg, smooth, window4 } from './util';

/**
 * NAKSHATRA — Video 09 — "24 archetypes. Which one are you?"
 * The whole film is a pure function of time: render(t) draws exactly one frame, so the renderer
 * (scripts/render.mjs) can step it at any frame rate and get the same picture every run.
 *
 *  00–04  The question        04–11  24 identities        11–18  Your unique blend
 *  18–24  The discovery       24–30  The call to action
 */
export const DURATION = 30;
/** Archetypes the tracking shot stops on (catalogue order, evenly spread over the gallery). */
export const FEATURED = [0, 4, 8, 12, 16, 20, 23];
/** When the camera is settled on each. */
export const DWELL = [5.75, 6.5, 7.25, 8.0, 8.75, 9.5, 10.3];

interface Meta { frames: number; fps: number; taps: { t: number; x: number; y: number }[]; exampleFrom: number }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`Could not load ${src}`)); i.src = src; });
}
async function svgTexture(src: string, size = 512): Promise<THREE.Texture> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.drawImage(img, 0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export async function createFilm(stage: Stage) {
  const scale = stage.renderer.getPixelRatio();
  stage.renderer.localClippingEnabled = true;
  const env = buildEnvironment(stage.renderer);
  const sigils = await Promise.all(ARCHETYPES.map((a) => svgTexture(a.sigil)));
  const head = buildHeadScene(env);
  const camera = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.1, 900);
  const cosmos = buildCosmos(env, sigils, scale, camera);

  /* ---------------- overlay ---------------- */
  const overlay = document.getElementById('overlay')!;
  const el = (cls: string, html: string, style: Partial<CSSStyleDeclaration> = {}) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; Object.assign(d.style, style); overlay.appendChild(d); return d; };
  const show = (d: HTMLElement, o: number, ty = 0, sc = 1, extra = '') => { d.style.opacity = o.toFixed(3); d.style.visibility = o <= 0.002 ? 'hidden' : 'visible'; d.style.transform = `${extra} translate3d(0, ${ty.toFixed(2)}px, 0) scale(${sc.toFixed(4)})`; };
  /** Standard text move: rise in, hold, lift out. */
  const text = (d: HTMLElement, t: number, a: number, b: number, inDur = 0.35, outDur = 0.3) => { const i = easeOut(seg(t, a, a + inDur)), o = smooth(seg(t, b - outDur, b)); show(d, i * (1 - o), (1 - i) * 36 - o * 24, 0.96 + 0.04 * i); };

  const t1 = el('headline', 'Do you <span class="gold">really?</span>', { top: '1330px', fontSize: '148px' });
  const t2 = el('headline', '<span class="gold">24</span> archetypes.', { top: '210px', fontSize: '150px' });
  const t2b = el('eyebrow', '24 archetypes', { top: '150px' });
  const labels = FEATURED.map((i) => { const a = ARCHETYPES[i]; return el('pod-label', `<span class="n" style="color:${a.accent}">Archetype ${String(i + 1).padStart(2, '0')} of 24</span><span class="name">${a.name}</span>`, { left: '0', right: '0', top: '1590px' }); });
  const dimLabels = DIMS.map((d) => el('dim-label', d.name, { left: '0', top: '0', color: d.color }));
  const tagP = el('tag', 'Primary archetype', { left: '0', top: '0', color: '#ecd29d' });
  const tagS = el('tag', 'Secondary archetype', { left: '0', top: '0', color: '#b9adf0' });
  const t3 = ['Your archetype.', 'Your blend.', 'Your story.'].map((s, i) => el('headline', i === 1 ? `<span class="gold">${s}</span>` : s, { top: `${1392 + i * 112}px`, fontSize: '112px' }));
  const t4 = el('headline', '<span class="line"><span class="gold">20</span> statements.</span><span class="line">One personal discovery.</span>', { top: '96px', fontSize: '86px' });
  const phone = el('', '<div class="screen"><canvas width="800" height="1560"></canvas><div class="tap"></div></div><div class="example">Example result</div>', {});
  phone.id = 'phone';
  const phoneCtx = (phone.querySelector('canvas') as HTMLCanvasElement).getContext('2d')!;
  const phoneTap = phone.querySelector('.tap') as HTMLElement;
  const phoneExample = phone.querySelector('.example') as HTMLElement;
  const brand = el('brand', `<img alt="Nakshatra" src="${BRAND.symbol}" style="width:210px;height:210px" /><br /><img alt="NAKSHATRA" src="${BRAND.wordmark}" style="width:800px;margin-top:44px" />`, { top: '470px' });
  const t5 = el('headline', '<span class="line">Which archetype</span><span class="line"><span class="gold">are you?</span></span>', { top: '1000px', fontSize: '118px' });
  const cta = el('cta', 'Discover your identity', { top: '1352px' });

  /* ---------------- app footage (scene 04) ---------------- */
  let meta: Meta | null = null;
  const frames: HTMLImageElement[] = [];
  try {
    const r = await fetch('/footage/meta.json');
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) meta = (await r.json()) as Meta;
  } catch { meta = null; }
  if (meta) {
    const imgs = await Promise.all(Array.from({ length: meta.frames }, (_, i) => loadImage(`/footage/app-${String(i).padStart(4, '0')}.jpg`)));
    await Promise.all(imgs.map((i) => i.decode().catch(() => undefined)));
    frames.push(...imgs);
  }
  let shown = -1;

  /* ---------------- camera ---------------- */
  const P = new THREE.Vector3(), L = new THREE.Vector3(), P2 = new THREE.Vector3(), L2 = new THREE.Vector3();
  const WIDE_ANGLE = (105 / 180) * Math.PI, WIDE = 44;
  /** Continuous position along the gallery, in archetype index units. */
  const track = (t: number) => {
    const keys: [number, number][] = [];
    FEATURED.forEach((f, k) => { keys.push([DWELL[k] - 0.26, f - 0.1], [DWELL[k] + 0.24, f + 0.1]); });
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [ta, ua] = keys[i - 1], [tb, ub] = keys[i]; const x = seg(t, ta, tb); return lerp(ua, ub, i % 2 ? x : easeInOut(x)); }
    return keys[keys.length - 1][1];
  };
  const montage = (t: number, pos: THREE.Vector3, look: THREE.Vector3) => {
    const u = track(t), a = podAngle(u), rc = 1.2;
    pos.set(Math.cos(a) * rc, podY(u) + 0.25, Math.sin(a) * rc);
    podPos(u, look).y += 0.15;
  };
  const ORBIT0 = podAngle(FEATURED[FEATURED.length - 1]) + Math.PI;
  const orbit = (t: number, pos: THREE.Vector3, look: THREE.Vector3) => {
    const th = ORBIT0 + (t - 12.6) * 0.085;
    const r = lerp(lerp(15.5, 12.2, easeInOut(seg(t, 12.6, 15.2))), 9.4, easeInOut(seg(t, 15.6, 17.8))) + 3.5 * smooth(seg(t, 18, 22));
    pos.set(Math.cos(th) * r, 1.1 - 0.5 * smooth(seg(t, 15.6, 17.8)), Math.sin(th) * r);
    look.set(0, 0.25, 0);
  };
  const setCamera = (t: number) => {
    let fov = 40;
    if (t < 4.95) {
      const d = lerp(22, WIDE, easeOut(seg(t, 4.0, 4.95)));
      P.set(Math.cos(WIDE_ANGLE) * d, 3 + d * 0.06, Math.sin(WIDE_ANGLE) * d); L.set(0, 0, 0); fov = 50;
    } else if (t < 5.5) {
      const x = easeInOut(seg(t, 4.95, 5.5));
      // Swoop under the lowest statues and rise into the axis, so the camera never passes through one.
      const s = x, w0 = (1 - s) * (1 - s), w1 = 2 * s * (1 - s), w2 = s * s;
      montage(5.5, P2, L2);
      P.set(Math.cos(WIDE_ANGLE) * (WIDE * w0 + 13 * w1) + P2.x * w2, (3 + WIDE * 0.06) * w0 - 31 * w1 + P2.y * w2, Math.sin(WIDE_ANGLE) * (WIDE * w0 + 13 * w1) + P2.z * w2);
      L.set(0, -4 * w1, 0).lerp(L2, smooth(seg(s, 0.35, 1))); fov = lerp(50, 36, x);
    } else if (t < 10.9) { montage(t, P, L); fov = 36; }
    else if (t < 12.6) {
      const x = easeInOut(seg(t, 10.9, 12.6));
      montage(10.9, P, L); orbit(12.6, P2, L2); P.lerp(P2, x); L.lerp(L2, smooth(seg(t, 11.3, 12.6))); fov = lerp(36, 40, x);
    } else if (t < 24) { orbit(t, P, L); }
    else if (t < 26.4) {
      const d = lerp(27, 112, easeInOut(seg(t, 24.0, 26.3)));
      P.set(Math.cos(WIDE_ANGLE) * d, 2 + d * 0.08, Math.sin(WIDE_ANGLE) * d); L.set(0, 0, 0); fov = 50;
    } else if (t < 27.3) {
      const d = lerp(112, 9, easeIn(seg(t, 26.4, 27.3)));
      P.set(Math.cos(WIDE_ANGLE) * d, 2 + d * 0.08, Math.sin(WIDE_ANGLE) * d); L.set(0, 0, 0); fov = 50;
    } else {
      const d = 92 - (t - 27.3) * 2.2, th = WIDE_ANGLE + (t - 27.3) * 0.02;
      P.set(Math.cos(th) * d, 9, Math.sin(th) * d); L.set(0, 0, 0); fov = 50;
    }
    camera.fov = fov;
    camera.position.copy(P);
    camera.lookAt(L);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  const project = (v: THREE.Vector3) => { const p = v.clone().project(camera); return { x: (p.x * 0.5 + 0.5) * 1080, y: (-p.y * 0.5 + 0.5) * 1920, front: p.z < 1 }; };
  const place = (d: HTMLElement, v: THREE.Vector3, o: number, dx = 0, dy = 0) => { const p = project(v); p.x = clamp(p.x + dx, 200, 880) - dx; p.y = clamp(p.y + dy, 250, 1310) - dy; const on = p.front ? o : 0; d.style.opacity = on.toFixed(3); d.style.visibility = on <= 0.002 ? 'hidden' : 'visible'; d.style.transform = `translate3d(${(p.x + dx).toFixed(1)}px, ${(p.y + dy).toFixed(1)}px, 0) translate(-50%, -50%)`; };

  const tmp = new THREE.Vector3();
  const streamPoint = (s: number, phase: number, y0: number, out: THREE.Vector3) => {
    const c = clamp(s), r = 12.5 * Math.pow(1 - c, 1.5) + 0.12, a = phase + c * 7.5;
    return out.set(Math.cos(a) * r, y0 * Math.pow(1 - c, 1.3) + 0.25 * c, Math.sin(a) * r);
  };

  /* ---------------- one frame ---------------- */
  const render = (t: number) => {
    // Overlay first: it never depends on the 3D state except for projected labels, which are placed below.
    text(t1, t, 2.25, 3.95, 0.4, 0.15);
    text(t2, t, 4.2, 5.75);
    show(t2b, window4(t, 5.7, 6.0, 10.7, 11.0) * 0.9);
    labels.forEach((d, k) => { const a = DWELL[k] - 0.3, b = k === labels.length - 1 ? 11.0 : DWELL[k] + 0.4; const i = easeOut(seg(t, a, a + 0.2)), o = smooth(seg(t, b - 0.14, b)); show(d, i * (1 - o), (1 - i) * 26, 1); });
    t3.forEach((d, i) => text(d, t, 14.55 + i * 1.0, 17.9, 0.35, 0.25));
    text(t4, t, 18.25, 23.9, 0.4, 0.25);
    const end = t >= 27.3;
    show(brand, end ? easeOut(seg(t, 27.3, 27.9)) : 0, 0, 1.06 - 0.06 * easeOut(seg(t, 27.3, 28.4)));
    text(t5, t, 27.85, 99, 0.45);
    { const i = easeOut(seg(t, 28.45, 28.9)); show(cta, i, (1 - i) * 30, (0.92 + 0.08 * i) * (1 + 0.018 * Math.sin((t - 28.9) * 5) * seg(t, 28.9, 29.2)), 'translateX(-50%)'); }

    if (t < 4) {
      head.update(t);
      [...dimLabels, tagP, tagS].forEach((d) => show(d, 0));
      show(phone, 0);
      stage.render(head.scene, head.camera, t, { fade: smooth(seg(t, 0, 0.5)), flash: easeIn(seg(t, 3.8, 4.0)), bloom: 0.6 });
      return;
    }

    setCamera(t);
    cosmos.setTime(t);
    const camDist = camera.position.length();

    // Pods.
    cosmos.pods.forEach((p, i) => {
      let open = 1, reveal = 1, flare = 0;
      if (t < 11) { open = seg(t, 3.9 + i * 0.012, 4.3 + i * 0.012); reveal = seg(t, 4.45 + i * 0.035, 5.25 + i * 0.035); flare = pulse(t, 4.05, 0.05, 0.7) * 0.6; }
      else if (t < 24) { open = 1 - seg(t, 11.1 + (23 - i) * 0.03, 12.0 + (23 - i) * 0.03); flare = 0.12 + 0.1 * Math.sin(t * 2.3 + i * 1.7); }
      else { open = seg(t, 24.0, 24.3) * (1 - seg(t, 25.3, 26.2)); flare = end ? 0.25 + 0.12 * Math.sin(t * 2.3 + i * 1.7) : pulse(t, 24.1, 0.1, 1.2) + 0.3 * seg(t, 25.0, 26.0) + 0.25 * pulse(t, 26.0 + (i % 6) * 0.12, 0.1, 0.4); }
      updatePod(p, t, open, reveal, flare);
      if (t >= 24) p.star.scale.multiplyScalar(end ? 0.9 : Math.max(1, camDist / 60));
    });
    cosmos.linkMat.opacity = t < 11 ? 0.22 * seg(t, 4.2, 4.9) : t < 24 ? 0.22 + 0.28 * seg(t, 11.5, 12.6) * (1 - 0.5 * seg(t, 14, 16)) : end ? 0.35 : 0.25 + 0.5 * seg(t, 24.6, 26);
    cosmos.outerMat.opacity = (end ? 0.14 : 0.3) * seg(t, 25.0, 26.2);
    (cosmos.outerStars.material as THREE.PointsMaterial).opacity = seg(t, 24.8, 25.8);
    (cosmos.outerStars.material as THREE.PointsMaterial).size = 1.4 + camDist / 60;

    // The person at the centre, and the five dimensions.
    const youIn = easeOut(seg(t, 11.3, 12.4)) * (1 - seg(t, 23.8, 24));
    cosmos.youGroup.visible = youIn > 0.003;
    cosmos.youGroup.scale.setScalar(Math.max(0.001, youIn));
    cosmos.youGroup.rotation.y = ORBIT0 - Math.PI / 2 + Math.PI + 0.25 + (t - 12) * 0.03; // facing the orbit camera, a little off
    cosmos.you.update(t);
    const settle = smooth(seg(t, 15.4, 16.6)); // rings come to rest around the sculpture, as they do in the app
    const align = smooth(seg(t, 13.9, 14.7)) * (1 - settle);
    const markerWorld: THREE.Vector3[] = [];
    cosmos.rings.forEach((r, i) => {
      const a = easeOut(seg(t, 12.5 + i * 0.3, 13.15 + i * 0.3)) * (1 - seg(t, 23.8, 24));
      r.group.visible = a > 0.003;
      r.group.scale.setScalar(Math.max(0.001, (0.4 + 0.6 * a) * (1.12 - 0.12 * settle)));
      const wild = new THREE.Euler(0.5 + i * 0.62 + t * 0.32 * (i % 2 ? 1 : -1), i * 0.7 + t * 0.22, i * 0.4);
      const flat = new THREE.Euler(Math.PI / 2 - 0.62 + (i - 2) * 0.13, ORBIT0 * -1 + Math.PI / 2 + (i - 2) * 0.12, t * 0.05);
      const shared = new THREE.Euler(Math.PI / 2 - 0.5, t * 0.5, 0.3);
      const q = new THREE.Quaternion().setFromEuler(wild).slerp(new THREE.Quaternion().setFromEuler(shared), align * 0.85).slerp(new THREE.Quaternion().setFromEuler(flat), settle);
      r.group.quaternion.copy(q);
      r.mat.opacity = a * (0.55 + 0.4 * pulse(t, 12.6 + i * 0.3, 0.1, 0.5));
      const ang = i * 1.256 + t * (0.5 + i * 0.07) * (1 - settle * 0.7);
      r.marker.position.set(Math.cos(ang) * r.radius, Math.sin(ang) * r.radius, 0);
      r.group.updateMatrixWorld(true);
      markerWorld.push(r.marker.getWorldPosition(new THREE.Vector3()));
      const labelOn = a * (1 - seg(t, 14.2, 14.6));
      place(dimLabels[i], markerWorld[i], labelOn, 0, -34);
    });
    cosmos.pentagon.geometry.setFromPoints([...markerWorld, markerWorld[0]]);
    cosmos.pentagonMat.opacity = 0.7 * window4(t, 13.9, 14.5, 15.3, 16.2);

    // Two energies converge.
    cosmos.streams.forEach((s, k) => {
      const p = seg(t, 14.3 + k * 0.12, 16.25);
      const n = s.pos.length / 3;
      for (let j = 0; j < n; j++) {
        const lag = (j / n) * 0.42, sj = p * 1.42 - lag;
        if (sj <= 0 || p <= 0) { s.pos.set([0, -9999, 0], j * 3); continue; }
        streamPoint(sj, s.phase, s.y0, tmp);
        const w = (1 - clamp(sj)) * 0.9 + 0.05, h = j * 12.9898;
        s.pos.set([tmp.x + Math.sin(h) * w * 0.5, tmp.y + Math.sin(h * 1.7 + t * 3) * w * 0.5, tmp.z + Math.cos(h * 2.3) * w * 0.5], j * 3);
      }
      (s.pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      s.mat.opacity = 0.95 * seg(t, 14.3, 14.6) * (1 - seg(t, 16.3, 17.0));
      streamPoint(p * 1.42, s.phase, s.y0, s.head.position);
      s.head.material.opacity = seg(t, 14.3, 14.6) * (1 - seg(t, 16.0, 16.4));
      place(k ? tagS : tagP, s.head.position, window4(t, 14.6, 14.9, 15.7, 16.0), k ? 150 : -150, -52);
    });

    // The blend sculpture.
    const sc = cosmos.sculpture;
    const born = easeOut(seg(t, 15.95, 16.7)) * (1 - seg(t, 23.8, 24));
    sc.group.visible = born > 0.003;
    sc.group.scale.setScalar(Math.max(0.001, born * (1 + 0.03 * Math.sin(t * 2.2))));
    const settled = t >= 17.05;
    const form = settled ? SCULPT_FORMS.length - 1 : Math.floor(Math.max(0, t - 15.95) / 0.14) % SCULPT_FORMS.length;
    sc.primary.forEach((f, i) => { f.mesh.visible = f.lines.visible = i === form; f.mesh.rotation.set(0.25, t * 0.5, 0.1); f.lines.rotation.copy(f.mesh.rotation); });
    sc.inner.rotation.set(t * 0.4, -t * 0.7, 0.3);
    sc.innerMat.opacity = 0.9 * seg(t, 16.3, 16.9);
    sc.glow.material.opacity = 0.25 * born + 0.6 * pulse(t, 17.05, 0.08, 0.7);
    sc.fill.opacity = 0.1 + 0.25 * pulse(t, 17.05, 0.08, 0.6);

    // The central light of the last scene.
    const coreOn = seg(t, 25.5, 26.2);
    cosmos.core.material.opacity = coreOn * (0.7 + 0.3 * Math.sin((t - 25.5) * 9));
    cosmos.core.scale.setScalar((5 + camDist * 0.16) * (1 + 0.28 * Math.sin((t - 25.5) * 9)));
    const raysMat = cosmos.coreRays.material as THREE.MeshBasicMaterial;
    raysMat.opacity = coreOn * (0.75 + 0.25 * Math.sin((t - 25.5) * 9));
    cosmos.coreRays.scale.setScalar((4 + camDist * 0.34) * (1 + 0.22 * Math.sin((t - 25.5) * 9)));
    cosmos.coreRays.quaternion.copy(camera.quaternion);
    if (end) { cosmos.core.material.opacity = 0; raysMat.opacity = 0; }

    // Scene 04: the product itself.
    const inApp = t >= 18 && t < 24;
    if (inApp && meta && frames.length) {
      const f = Math.min(frames.length - 1, Math.max(0, Math.round((t - 18) * meta.fps)));
      if (f !== shown) { phoneCtx.drawImage(frames[f], 0, 0, 800, 1560); shown = f; }
      const i = easeOut(seg(t, 18.0, 18.55)), o = smooth(seg(t, 23.72, 24.0));
      const y = 1062 - 728 + (1 - i) * 120 + Math.sin(t * 1.1) * 5;
      phone.style.opacity = (i * (1 - o)).toFixed(3);
      phone.style.visibility = 'visible';
      phone.style.transform = `translate3d(-50%, ${y.toFixed(2)}px, 0) perspective(2200px) rotateY(${((1 - i) * -16 + Math.sin(t * 0.7) * 1.2).toFixed(3)}deg) rotateX(${((1 - i) * 8).toFixed(3)}deg) scale(${(0.9 + 0.1 * i + 0.12 * o).toFixed(4)})`;
      let tapO = 0, tx = 0, ty = 0, ts = 1;
      for (const tap of meta.taps) { const dt = t - (18 + tap.t); if (dt > -0.2 && dt < 0.26) { tapO = dt < 0 ? smooth(seg(dt, -0.2, 0)) * 0.8 : 1 - seg(dt, 0, 0.26); ts = dt < 0 ? 1 - 0.3 * seg(dt, -0.2, 0) : 0.7 + 0.8 * easeOut(seg(dt, 0, 0.26)); tx = tap.x; ty = tap.y; } }
      phoneTap.style.opacity = tapO.toFixed(3);
      phoneTap.style.left = `${(tx * 100).toFixed(2)}%`;
      phoneTap.style.top = `${(ty * 100).toFixed(2)}%`;
      phoneTap.style.transform = `scale(${ts.toFixed(3)})`;
      phoneExample.style.opacity = seg(t, 18 + meta.exampleFrom, 18 + meta.exampleFrom + 0.3).toFixed(3);
    } else show(phone, 0);

    let flash = 0, fade = 1;
    flash = Math.max(flash, 1 - easeOut(seg(t, 4.0, 4.55)));
    flash = Math.max(flash, 0.9 * easeIn(seg(t, 17.8, 18.0)) * (1 - easeOut(seg(t, 18.0, 18.4))));
    flash = Math.max(flash, 0.75 * easeIn(seg(t, 23.85, 24.0)) * (1 - easeOut(seg(t, 24.0, 24.45))));
    flash = Math.max(flash, easeIn(seg(t, 27.05, 27.3)) * (1 - easeOut(seg(t, 27.3, 27.95))));
    if (inApp) fade = lerp(1, 0.42, smooth(seg(t, 18.0, 18.5))) + 0.58 * smooth(seg(t, 23.8, 24.0));
    if (end) fade = 0.62;
    // A tap in the app is answered by the five dimensions out here.
    if (inApp && meta) for (const tap of meta.taps) fade += 0.22 * pulse(t, 18 + tap.t + 0.05, 0.05, 0.5);
    stage.render(cosmos.scene, camera, t, { flash, fade, bloom: 0.8 });
  };

  await document.fonts.ready;
  return { ready: Promise.resolve(), duration: DURATION, fps: 30, render };
}
void HELIX; void TAU;
