/**
 * Virtual clock for frame-accurate capture, injected before the app's own scripts. Until freeze() is called the
 * page runs normally. After it, time only moves when step(ms) is called: performance.now, Date.now and
 * requestAnimationFrame all follow the virtual clock, so a scene that takes two seconds to draw a frame in software
 * still plays back at exactly its designed speed. Nothing in the app is changed.
 */
(() => {
  const realNow = performance.now.bind(performance);
  const realRAF = window.requestAnimationFrame.bind(window);
  const realCAF = window.cancelAnimationFrame.bind(window);
  const realDateNow = Date.now.bind(Date);
  let frozen = false, vt = 0, dateBase = 0, vtBase = 0, id = 1e9;
  const queue = new Map();
  performance.now = () => (frozen ? vt : realNow());
  Date.now = () => (frozen ? dateBase + (vt - vtBase) : realDateNow());
  window.requestAnimationFrame = (cb) => { if (!frozen) return realRAF(cb); id += 1; queue.set(id, cb); return id; };
  window.cancelAnimationFrame = (i) => { if (queue.has(i)) queue.delete(i); else realCAF(i); };
  const settle = () => new Promise((r) => realRAF(() => realRAF(r)));
  // CSS transitions and animations are driven through the Web Animations API so they follow the same clock.
  const held = new WeakMap();
  const driveCss = (ms) => {
    for (const a of document.getAnimations()) {
      try {
        if (!held.has(a)) { a.pause(); held.set(a, Number(a.currentTime) || 0); }
        const next = held.get(a) + ms;
        held.set(a, next);
        a.currentTime = next;
      } catch { /* an animation that cannot be seeked is left alone */ }
    }
  };
  window.__clock = {
    freeze() { if (frozen) return; vt = vtBase = realNow(); dateBase = realDateNow(); frozen = true; },
    async step(ms) {
      vt += ms;
      const cbs = [...queue.values()];
      queue.clear();
      for (const cb of cbs) { try { cb(vt); } catch (e) { console.error(e); } }
      driveCss(ms);
      await settle();
    },
    get frozen() { return frozen; },
  };
})();
