/* ---- Crafting solver (Jobs → Crafting solver, 16 Nov 2026) ----
   Finds a crafting rotation for one recipe and one set of stats, and gives it
   as game macros. The solver is Raphael (https://www.raphael-xiv.com/,
   Apache-2.0), built to WebAssembly in vendor/raphael/ and run in
   craft-solver-worker.js. It is single-threaded, so it is about three times
   slower than raphael-xiv.com; its results are the same.

   Nothing loads until the player uses the frame: the worker (about 350 KB
   compressed) starts on the first recipe search or solve.

   Saved per character in c.craftSolver:
     {job, recipe: {id, name, level}, stats: {<job>: {crafts, control, cp, level}},
      manip, hs, qi}
   The level defaults to the job level in the Ledger (c.craft). Version 1 has
   no food, potion or HQ materials: the player types the stats the game shows
   without consumables. */
const CS_JOB_SHORT = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL'];
const CS_MACRO_LINES = 15;

const csWorker = (() => {
  let w = null, seq = 0, pending = {};
  function get(){
    if(!w){
      w = new Worker('craft-solver-worker.js', {type: 'module'});
      w.onmessage = e => { const p = pending[e.data.id]; delete pending[e.data.id]; if(p) p(e.data); };
      w.onerror = e => { const all = pending; pending = {}; Object.values(all).forEach(p => p({out: {error: 'The solver did not load. ' + (e.message || '')}})); };
    }
    return w;
  }
  return {
    call(msg){ return new Promise(res => { const id = ++seq; pending[id] = res; get().postMessage({...msg, id}); }); },
    cancel(){ if(!w) return; w.terminate(); w = null; const all = pending; pending = {}; Object.values(all).forEach(p => p({cancelled: true})); }
  };
})();
const csRecipeCache = {};
function csRecipes(job){
  const k = CRAFT_JOBS.indexOf(job);
  if(!csRecipeCache[k]) csRecipeCache[k] = csWorker.call({kind: 'recipes', job: k}).then(r => r.rows || []);
  return csRecipeCache[k];
}
function csState(c){
  let s = c.craftSolver;
  if(!s || typeof s !== 'object') s = c.craftSolver = {};
  if(!CRAFT_JOBS.includes(s.job)){
    // The highest crafter in the Ledger, or Carpenter on an empty character.
    const lv = j => (c.craft || {})[j] || 0;
    s.job = CRAFT_JOBS.reduce((a, j) => lv(j) > lv(a) ? j : a, CRAFT_JOBS[0]);
  }
  s.stats = s.stats || {};
  if(s.manip === undefined) s.manip = true;
  return s;
}
function csStats(c, s){
  const st = s.stats[s.job] = s.stats[s.job] || {};
  // c.craft holds the level plus the EXP share as a fraction (83.646 = level 83).
  if(!st.level) st.level = Math.min(100, Math.floor((c.craft || {})[s.job] || 100));
  return st;
}
function csMacros(steps){
  const lines = steps.map(([n, w]) => `/ac "${n}" <wait.${w}>`);
  const out = [];
  for(let i = 0; i < lines.length; i += CS_MACRO_LINES) out.push(lines.slice(i, i + CS_MACRO_LINES).join('\n'));
  return out;
}

const CraftSolverPanel = {
  props: ['state'],
  setup(props){
    const bump = Vue.ref(0);
    const query = Vue.ref(''), list = Vue.ref(null), loadingList = Vue.ref(false);
    const solving = Vue.ref(false), elapsed = Vue.ref(0), result = Vue.ref(null), copied = Vue.ref(-1);
    let timer = null;
    const c = () => getChar(props.state.cid);
    const view = Vue.computed(() => {
      props.state.tick; bump.value;
      const ch = c(); if(!ch) return null;
      const s = csState(ch), st = csStats(ch, s);
      return {s, st, jobs: CRAFT_JOBS.map((j, i) => ({j, short: CS_JOB_SHORT[i], lv: Math.floor((ch.craft || {})[j] || 0)}))};
    });
    const save = () => { bump.value++; scheduleSave(); };
    const loadList = async () => {
      const s = view.value.s; if(list.value && list.value.job === s.job) return;
      loadingList.value = true;
      const rows = await csRecipes(s.job);
      list.value = {job: s.job, rows: rows.slice().sort((a, b) => b[2] - a[2] || a[1].localeCompare(b[1]))};
      loadingList.value = false;
    };
    const matches = Vue.computed(() => {
      const q = query.value.trim().toLowerCase();
      if(!list.value || !q) return [];
      return list.value.rows.filter(r => r[1].toLowerCase().includes(q)).slice(0, 30);
    });
    const setJob = j => { view.value.s.job = j; query.value = ''; list.value = null; result.value = null; save(); };
    const pick = r => { view.value.s.recipe = {id: r[0], name: r[1], level: r[2]}; query.value = ''; result.value = null; save(); };
    const num = (k, e, max) => { view.value.st[k] = Math.max(0, Math.min(max, Math.floor(+e.target.value || 0))); e.target.value = view.value.st[k]; result.value = null; save(); };
    const flag = k => { view.value.s[k] = !view.value.s[k]; result.value = null; save(); };
    const stop = () => { clearInterval(timer); timer = null; solving.value = false; };
    const run = async () => {
      const {s, st} = view.value; if(!s.recipe || solving.value) return;
      solving.value = true; result.value = null; elapsed.value = 0;
      const t0 = Date.now(); timer = setInterval(() => { elapsed.value = (Date.now() - t0) / 1000; }, 100);
      const r = await csWorker.call({kind: 'solve', recipe: s.recipe.id, crafts: st.crafts || 0, control: st.control || 0,
        cp: st.cp || 0, level: st.level || 1, manip: !!s.manip, hs: !!s.hs, qi: !!s.qi});
      stop();
      if(r.cancelled) return;
      const o = r.out || {};
      result.value = o.error ? {error: o.error} : {...o, ms: r.ms, secs: o.steps.reduce((a, x) => a + x[1], 0), macros: csMacros(o.steps)};
    };
    const cancel = () => { csWorker.cancel(); stop(); };
    const copy = async (i, text) => { try { await navigator.clipboard.writeText(text); copied.value = i; setTimeout(() => { if(copied.value === i) copied.value = -1; }, 1500); } catch(e){ copied.value = -2; } };
    const pctOf = (a, b) => b ? Math.min(100, a / b * 100) : 0;
    Vue.onUnmounted(() => clearInterval(timer));
    return {view, query, list, loadingList, matches, solving, elapsed, result, copied, setJob, pick, num, flag, run, cancel, copy, loadList, pctOf};
  },
  template: `
    <div v-if="view" class="cs">
      <div class="cs-jobs" role="group" aria-label="Crafter">
        <button v-for="j in view.jobs" :key="j.j" type="button" :class="{on: view.s.job === j.j}" :title="j.j" @click="setJob(j.j)">{{ j.short }}<small v-if="j.lv">{{ j.lv }}</small></button>
      </div>
      <div class="cs-grid">
        <div class="cs-col">
          <h3>Recipe</h3>
          <input type="search" class="cs-search" :placeholder="'Search ' + view.s.job + ' recipes'" v-model="query" @focus="loadList" aria-label="Search recipes">
          <div v-if="loadingList" class="empty-hint">Loading the recipe list…</div>
          <div v-else-if="query.trim() && list && !matches.length" class="empty-hint">No {{ view.s.job }} recipe has that name.</div>
          <div v-if="matches.length" class="cs-results">
            <button v-for="r in matches" :key="r[0]" type="button" @click="pick(r)"><span>{{ r[1] }}</span><small>{{ r[2] ? 'Lv ' + r[2] : 'scales' }}</small></button>
          </div>
          <div v-if="view.s.recipe" class="cs-picked"><b>{{ view.s.recipe.name }}</b><small>{{ view.s.recipe.level ? 'Lv ' + view.s.recipe.level : 'Level scales' }}</small></div>
          <div v-else class="empty-hint">No recipe selected. Search for a recipe, then click it.</div>
        </div>
        <div class="cs-col">
          <h3>{{ view.s.job }} stats <small>without food or potion</small></h3>
          <label class="cs-row"><span>Craftsmanship</span><input type="number" min="0" max="9999" :value="view.st.crafts || ''" @change="num('crafts', $event, 9999)"></label>
          <label class="cs-row"><span>Control</span><input type="number" min="0" max="9999" :value="view.st.control || ''" @change="num('control', $event, 9999)"></label>
          <label class="cs-row"><span>CP</span><input type="number" min="0" max="999" :value="view.st.cp || ''" @change="num('cp', $event, 999)"></label>
          <label class="cs-row"><span>Job level</span><input type="number" min="1" max="100" :value="view.st.level" @change="num('level', $event, 100)"></label>
          <label class="cs-check"><input type="checkbox" :checked="view.s.manip" @change="flag('manip')"> Manipulation</label>
          <label class="cs-check"><input type="checkbox" :checked="view.s.hs" @change="flag('hs')"> Heart and Soul</label>
          <label class="cs-check"><input type="checkbox" :checked="view.s.qi" @change="flag('qi')"> Quick Innovation</label>
        </div>
      </div>
      <div class="cs-act">
        <button v-if="!solving" type="button" class="edit-btn" :disabled="!view.s.recipe" @click="run">Solve</button>
        <template v-else>
          <span class="cs-spin" aria-hidden="true"></span><span role="status">Solving… {{ elapsed.toFixed(1) }} s</span>
          <button type="button" class="edit-btn" @click="cancel">Cancel</button>
        </template>
      </div>
      <div v-if="result && result.error" class="cs-error" role="status">The solver found no rotation. {{ result.error }}</div>
      <div v-else-if="result" class="cs-result">
        <div class="cs-bars">
          <div class="jr-row"><span>Progress</span><span class="jr-v">{{ result.progress }} / {{ result.maxProgress }}</span><div class="jr-bar"><i :style="{width: pctOf(result.progress, result.maxProgress) + '%'}"></i></div></div>
          <div class="jr-row"><span>Quality</span><span class="jr-v">{{ result.quality }} / {{ result.maxQuality }} · {{ result.hq }}% HQ</span><div class="jr-bar"><i :style="{width: pctOf(result.quality, result.maxQuality) + '%'}"></i></div></div>
          <div class="jr-row"><span>Durability</span><span class="jr-v">{{ result.durability }} / {{ result.maxDurability }}</span><div class="jr-bar"><i :style="{width: pctOf(result.durability, result.maxDurability) + '%'}"></i></div></div>
          <div class="jr-row"><span>CP</span><span class="jr-v">{{ result.cp }} / {{ result.maxCp }}</span><div class="jr-bar"><i :style="{width: pctOf(result.cp, result.maxCp) + '%'}"></i></div></div>
        </div>
        <div class="cs-meta">{{ result.steps.length }} steps · {{ result.secs }} s in game · solved in {{ (result.ms / 1000).toFixed(1) }} s</div>
        <div class="cs-macros">
          <div v-for="(m, i) in result.macros" :key="i" class="cs-macro">
            <div class="cs-macro-head"><span>Macro {{ i + 1 }} of {{ result.macros.length }}</span><button type="button" class="edit-btn" @click="copy(i, m)">{{ copied === i ? 'Copied' : 'Copy' }}</button></div>
            <pre>{{ m }}</pre>
          </div>
        </div>
        <div v-if="copied === -2" class="cs-error">The browser did not allow the copy. Select the macro text and copy it by hand.</div>
      </div>
      <p class="cs-credit">Solver: <a href="https://www.raphael-xiv.com/" target="_blank" rel="noopener">Raphael</a> by KonaeAkira and contributors, used under the <a href="https://github.com/KonaeAkira/raphael-rs/blob/main/LICENSE" target="_blank" rel="noopener">Apache License 2.0</a>. Recipes from patch 7.55. The solver runs in this browser. It sends nothing to a server.</p>
    </div>`
};
function renderCraftSolver(cid){
  const state = boxState(cid + '-craftsolver', CraftSolverPanel);
  if(state) Object.assign(state, {cid, tick: (state.tick || 0) + 1});
}
