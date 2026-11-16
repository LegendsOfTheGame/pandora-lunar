/* The crafting solver runs here, off the page's main thread, so the page stays
   usable during a solve (about 10 s for a level 100 recipe). Cancel terminates
   this worker; craft-solver-vue.js starts a new one on the next request.
   The WebAssembly build is Raphael (Apache-2.0): see vendor/raphael/README.md. */
import init, { recipes, solve } from './vendor/raphael/craft_solver.js';

const ready = init();
self.onmessage = async (e) => {
  const m = e.data;
  try {
    await ready;
    if (m.kind === 'recipes') {
      self.postMessage({ id: m.id, rows: JSON.parse(recipes(m.job)) });
    } else if (m.kind === 'solve') {
      const t0 = performance.now();
      const out = JSON.parse(solve(m.recipe, m.crafts, m.control, m.cp, m.level, m.manip, m.hs, m.qi));
      self.postMessage({ id: m.id, ms: Math.round(performance.now() - t0), out });
    }
  } catch (err) {
    self.postMessage({ id: m.id, out: { error: String(err && err.message || err) } });
  }
};
