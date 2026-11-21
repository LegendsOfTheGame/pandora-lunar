/* ---- Gear guide (Jobs → Gear guide, 21 Nov 2026) ----
   For one job and one level, the gear with the highest item level in each slot. The player chooses which sources
   count: crafted, bought from an NPC for gil, traded at an NPC, or other (quests,
   duties and the like, from the wiki). Each item then has these options:
     A) copy it as "1x Name" for the Teamcraft import in Teamcraft or Allagan Tools;
     B) copy the name for the Crafting Log search, when a crafter makes it;
     C) where to get it: the NPC with zone, position and price, or the trade.
        With no NPC source, C is the market board (Universalis);
     D) the market board as well, when an NPC source exists and the item is tradable.

   Data: gear-guide.js, made by tools/gear-guide-data from the game's sheets, with
   the wiki dump as the fallback. It is about 3 MB, so it loads the first time the
   frame is on screen, not with the page.

   Saved per character in c.gearGuide: {job, craft, buy, trade, other, skip: [ids]}.
   The level is not saved: it starts at the job's current level in the Ledger.
   Free company chest items are never counted as the player's (see the inventory
   import, when it comes). */
const GG_SLOTS = [
  ['MainHand', 'Main hand'], ['OffHand', 'Off hand'], ['Head', 'Head'], ['Body', 'Body'], ['Hands', 'Hands'],
  ['Legs', 'Legs'], ['Feet', 'Feet'], ['Ears', 'Ears'], ['Neck', 'Neck'], ['Wrists', 'Wrists'],
  ['Ring', 'Left ring'], ['Ring2', 'Right ring']
];
const GG_MAX_LEVEL = 100;

const ggData = (() => {
  let promise = null;
  return () => promise || (promise = new Promise((resolve, reject) => {
    if(typeof GEAR_GUIDE !== 'undefined'){ resolve(GEAR_GUIDE); return; }
    const s = document.createElement('script');
    s.src = 'gear-guide.js';
    s.onload = () => resolve(GEAR_GUIDE);
    s.onerror = () => { promise = null; reject(new Error('gear-guide.js did not load')); };
    document.head.appendChild(s);
  }));
})();

/* Per job: the items it can wear, per slot, highest item level first. Built once
   per job, since the full list is 29,000 items. */
const ggJobCache = {};
function ggItemsFor(G, abbr){
  if(ggJobCache[abbr]) return ggJobCache[abbr];
  const cats = new Set(Object.entries(G.jobs).filter(([, list]) => list.split(' ').includes(abbr)).map(([k]) => k));
  const bySlot = {};
  for(const [id, it] of Object.entries(G.items)){
    if(it[6] || !cats.has(String(it[4]))) continue; // PvP gear is left out
    (bySlot[it[1]] = bySlot[it[1]] || []).push(Number(id));
  }
  for(const list of Object.values(bySlot))
    list.sort((a, b) => G.items[b][3] - G.items[a][3] || G.items[b][2] - G.items[a][2] || a - b);
  return ggJobCache[abbr] = bySlot;
}

function ggState(c){
  let s = c.gearGuide;
  if(!s || typeof s !== 'object') s = c.gearGuide = {};
  if(s.craft === undefined) s.craft = true;
  if(s.buy === undefined) s.buy = true;
  if(s.trade === undefined) s.trade = true;
  if(s.other === undefined) s.other = false;
  if(!Array.isArray(s.skip)) s.skip = [];
  return s;
}
/* The Ledger's level for a job name, or 0. c.combat, c.craft and c.gather hold the
   level plus the EXP share as a fraction (83.646 = level 83). */
function ggLedgerLevel(c, name){
  for(const k of ['combat', 'craft', 'gather']){
    const v = (c[k] || {})[name];
    if(v) return Math.floor(v);
  }
  return 0;
}

const GearGuidePanel = {
  props: ['state'],
  setup(props){
    const c = () => getChar(props.state.cid);
    const bump = Vue.ref(0);
    const G = Vue.shallowRef(null);
    const failed = Vue.ref('');
    const selected = Vue.ref(null); // {slot, col}
    const copied = Vue.ref('');
    const root = Vue.ref(null);
    const save = () => { bump.value++; scheduleSave(); };
    const typed = Vue.ref({}); // job -> level typed this visit, not saved

    // Load the data the first time the frame is on screen.
    Vue.onMounted(() => {
      const load = () => ggData().then(d => { G.value = d; }).catch(e => { failed.value = e.message; });
      if(!('IntersectionObserver' in window)){ load(); return; }
      const io = new IntersectionObserver(entries => {
        if(entries.some(e => e.isIntersecting)){ io.disconnect(); load(); }
      });
      io.observe(root.value);
    });

    const s = Vue.computed(() => {
      props.state.tick; bump.value;
      const st = ggState(c());
      const g = G.value;
      if(g && !g.jobList.some(j => j[0] === st.job)){
        // The highest-level job in the Ledger; Paladin on an empty character.
        let best = ['PLD', 0];
        for(const [abbr, , ledgerName] of g.jobList){
          const lv = ggLedgerLevel(c(), ledgerName);
          if(lv > best[1]) best = [abbr, lv];
        }
        st.job = best[0];
      }
      delete st.level; // saved by the first version; the level is no longer saved
      // The level is the job's current level in the Ledger, unless the player typed
      // another one this visit. A typed level is not saved: on the next visit the
      // guide starts again from the current level. No Ledger level: the level cap.
      const job = g ? g.jobList.find(j => j[0] === st.job) : null;
      const ledger = job ? ggLedgerLevel(c(), job[2]) : 0;
      const level = Math.min(GG_MAX_LEVEL, Math.max(1, Number(typed.value[st.job]) || ledger || GG_MAX_LEVEL));
      // A copy: the saved object is not reactive and keeps its identity, so returning
      // it would not tell the grid that anything changed.
      return {...st, level, ledger, skip: [...st.skip]};
    });
    const saved = () => ggState(c());

    const src = id => {
      const g = G.value, k = String(id);
      return {craft: g.crafts[k], gil: g.gil[k], trades: g.trades[k], wiki: g.wiki[k]};
    };
    const allowed = (id, st) => {
      const x = src(id);
      return (st.craft && x.craft) || (st.buy && x.gil) || (st.trade && x.trades) || (st.other && x.wiki);
    };

    // grid[slot] = item id or 0, for the one level chosen. One level only: Haven
    // finds Teamcraft's several level columns hard to read (21 Nov 2026).
    // Every slot at one level: {slot: item id or 0}.
    const pickAll = (level, st, skip) => {
      const g = G.value, bySlot = ggItemsFor(g, st.job);
      const pick = (slot, not) => (bySlot[slot] || [])
        .find(id => g.items[id][2] <= level && !skip.has(id) && id !== not && allowed(id, st)) || 0;
      const out = {};
      for(const [slot] of GG_SLOTS){
        if(slot === 'Ring2'){
          // A unique ring cannot be worn twice: the right ring is then the next one.
          out.Ring2 = out.Ring && g.items[out.Ring][7] ? pick('Ring', out.Ring) : out.Ring;
        } else out[slot] = pick(slot);
      }
      return out;
    };
    const grid = Vue.computed(() => {
      if(!G.value) return {};
      const st = s.value;
      return pickAll(st.level, st, new Set(st.skip));
    });
    // next[slot] = the first level above the chosen one where that slot gets a
    // different item, or 0 when the item stays to the level cap.
    const next = Vue.computed(() => {
      if(!G.value) return {};
      const st = s.value, skip = new Set(st.skip), now = grid.value, out = {};
      for(let level = st.level + 1; level <= GG_MAX_LEVEL; level++){
        const at = pickAll(level, st, skip);
        for(const [slot] of GG_SLOTS)
          if(!out[slot] && at[slot] !== now[slot]) out[slot] = level;
      }
      return out;
    });
    const rows = Vue.computed(() => GG_SLOTS.filter(([slot]) => slot !== 'OffHand' || grid.value.OffHand));
    // A short line per row: the sources that are ticked and that the item has.
    const summary = id => {
      const x = src(id), st = s.value, out = [];
      if(st.craft && x.craft) out.push(`Crafted (${x.craft[0]} ${x.craft[1]})`);
      if(st.buy && x.gil) out.push(`NPC, ${Number(x.gil[0]).toLocaleString('en-US')} gil`);
      if(st.trade && x.trades) out.push('Trade at an NPC');
      if(st.other && x.wiki) out.push(x.wiki[0].length ? 'Quest' : 'Other');
      return out.join(' · ');
    };

    const item = id => G.value.items[String(id)];
    const npc = n => {
      const p = G.value.npcs[String(n)] || ['', '', 0, 0];
      return {name: p[0], where: p[1] ? `${p[1]} (X: ${p[2]} Y: ${p[3]})` : 'position not known'};
    };
    const fmt = n => Number(n).toLocaleString('en-US');

    const detail = Vue.computed(() => {
      const sel = selected.value;
      if(!sel || !G.value) return null;
      const id = grid.value[sel];
      if(!id) return null;
      const it = item(id), x = src(id);
      // One NPC can have several ids (one per phase or instance) in the same place:
      // show each name and place once.
      const once = list => list.filter((n, i) => list.findIndex(m => m.name === n.name && m.where === n.where) === i);
      const vendors = x.gil ? once(x.gil[1].map(npc)).map(n => ({...n, price: fmt(x.gil[0])})) : [];
      const trades = (x.trades || []).map(t => ({
        cost: t[0].map(([cid, count, hq]) => `${fmt(count)}× ${G.value.costs[String(cid)] || ('item ' + cid)}${hq ? ' (HQ or collectable)' : ''}`).join(' + '),
        get: t[1] > 1 ? `${t[1]}× ` : '',
        npcs: once(t[2].map(npc))
      }));
      const jobName = abbr => (G.value.jobList.find(j => j[0] === abbr) || [abbr, abbr])[1];
      const npcSource = vendors.length > 0 || trades.length > 0;
      const tradable = !it[8];
      return {
        id, name: it[0], level: it[2], ilvl: it[3], hq: !!it[5], unique: !!it[7], tradable,
        craft: x.craft ? {job: jobName(x.craft[0]), level: x.craft[1]} : null,
        vendors, trades,
        wiki: x.wiki ? {quests: x.wiki[0], note: x.wiki[1]} : null,
        npcSource,
        universalis: tradable ? `https://universalis.app/market/${id}` : ''
      };
    });

    const copy = async (key, text) => {
      try { await navigator.clipboard.writeText(text); copied.value = key; setTimeout(() => { if(copied.value === key) copied.value = ''; }, 1500); }
      catch(e){ copied.value = 'blocked'; }
    };
    // One "Nx Name" line per item: the Teamcraft import format, which Allagan Tools also reads.
    const list = () => {
      const counts = new Map();
      for(const [slot] of GG_SLOTS){
        const id = grid.value[slot];
        if(id) counts.set(id, (counts.get(id) || 0) + 1);
      }
      return [...counts].map(([id, n]) => `${n}x ${item(id)[0]}`).join('\n');
    };

    const setJob = abbr => { saved().job = abbr; selected.value = null; save(); };
    const setLevel = v => { typed.value = {...typed.value, [s.value.job]: Number(v)}; selected.value = null; };
    const resetLevel = () => { const t = {...typed.value}; delete t[s.value.job]; typed.value = t; selected.value = null; };
    const toggle = k => { const st = saved(); st[k] = !st[k]; save(); };
    const skipItem = id => { saved().skip.push(id); save(); };
    const resetSkips = () => { saved().skip = []; save(); };
    const pickCell = slot => { selected.value = selected.value === slot ? null : slot; };

    return {root, G, failed, s, grid, next, rows, summary, item, detail, selected, copied, copy, list,
      setJob, setLevel, resetLevel, toggle, skipItem, resetSkips, pickCell, maxLevel: GG_MAX_LEVEL};
  },
  template: `
    <div ref="root" class="gg">
      <div v-if="failed" class="cs-error">The gear data did not load ({{ failed }}). Reload the page to try again.</div>
      <div v-else-if="!G" class="gg-loading">Loading gear data…</div>
      <template v-else>
        <div class="gg-controls">
          <label>Job
            <select :value="s.job" @change="setJob($event.target.value)">
              <option v-for="j in G.jobList" :key="j[0]" :value="j[0]">{{ j[1] }}</option>
            </select>
          </label>
          <label>Level <input type="number" min="1" :max="maxLevel" :value="s.level" @change="setLevel($event.target.value)"></label>
          <button v-if="s.ledger && s.level !== s.ledger" type="button" class="link-btn" @click="resetLevel">Back to your level ({{ s.ledger }})</button>
          <label class="gg-check"><input type="checkbox" :checked="s.craft" @change="toggle('craft')"> Crafted</label>
          <label class="gg-check"><input type="checkbox" :checked="s.buy" @change="toggle('buy')"> Bought from an NPC</label>
          <label class="gg-check"><input type="checkbox" :checked="s.trade" @change="toggle('trade')"> Traded at an NPC</label>
          <label class="gg-check"><input type="checkbox" :checked="s.other" @change="toggle('other')"> Other (quests, duties)</label>
          <button v-if="s.skip.length" type="button" class="link-btn" @click="resetSkips">Show {{ s.skip.length }} removed {{ s.skip.length === 1 ? 'item' : 'items' }} again</button>
        </div>
        <p class="gg-note">Each slot shows the item with the highest item level that this job can wear at that level, from the sources ticked above. Select an item to see where to get it. Remove an item to show the next one.</p>
        <table class="gg-grid">
          <tbody>
            <tr v-for="[slot, label] in rows" :key="slot" :class="selected === slot ? 'on' : ''">
              <th>{{ label }}</th>
              <td v-if="grid[slot]">
                <button type="button" class="gg-item" @click="pickCell(slot)">
                  <span>{{ item(grid[slot])[0] }}</span>
                  <small>item level {{ item(grid[slot])[3] }} · equip level {{ item(grid[slot])[2] }}</small>
                </button>
              </td>
              <td v-else class="gg-empty">No item from the sources ticked.</td>
              <td class="gg-how">
                <div>{{ grid[slot] ? summary(grid[slot]) : '' }}</div>
                <div v-if="next[slot]" class="gg-next">Next item at level {{ next[slot] }}</div>
              </td>
              <td class="gg-x"><button v-if="grid[slot]" type="button" class="gg-skip" title="Remove this item and show the next one" @click="skipItem(grid[slot])">×</button></td>
            </tr>
          </tbody>
        </table>
        <div class="gg-listbar">
          <button type="button" class="edit-btn" @click="copy('list', list())">{{ copied === 'list' ? 'Copied' : 'Copy list' }}</button>
          <span class="gg-note">One "1x Item Name" line per item, for the Teamcraft import in Teamcraft or Allagan Tools.</span>
        </div>

        <div v-if="detail" class="gg-detail">
          <h3>{{ detail.name }} <small>item level {{ detail.ilvl }} · equip level {{ detail.level }}{{ detail.unique ? ' · unique' : '' }}{{ detail.tradable ? '' : ' · untradable' }}</small></h3>
          <div class="gg-option">
            <b>A</b><div>Export: <button type="button" class="edit-btn" @click="copy('a', '1x ' + detail.name)">{{ copied === 'a' ? 'Copied' : 'Copy "1x ' + detail.name + '"' }}</button> for Teamcraft or Allagan Tools.</div>
          </div>
          <div v-if="detail.craft" class="gg-option">
            <b>B</b><div>Craft it: {{ detail.craft.job }}, recipe level {{ detail.craft.level }}. <button type="button" class="edit-btn" @click="copy('b', detail.name)">{{ copied === 'b' ? 'Copied' : 'Copy name' }}</button> and paste it in the Crafting Log search.</div>
          </div>
          <div class="gg-option">
            <b>C</b>
            <div v-if="detail.npcSource || detail.wiki">
              <div v-for="(v, i) in detail.vendors" :key="'v' + i">Buy from {{ v.name }}, {{ v.where }}: {{ v.price }} gil.</div>
              <div v-for="(t, i) in detail.trades" :key="'t' + i">Trade {{ t.cost }} for {{ t.get }}{{ detail.name }} at
                <span v-for="(n, j) in t.npcs" :key="j">{{ j ? '; ' : '' }}{{ n.name }}, {{ n.where }}</span>.</div>
              <template v-if="!detail.npcSource && detail.wiki">
                <div v-for="q in detail.wiki.quests" :key="q">Quest reward: {{ q }}.</div>
                <div v-if="detail.wiki.note">{{ detail.wiki.note }}</div>
                <div class="gg-src">Source: the wiki.</div>
              </template>
              <div v-if="!detail.npcSource && detail.universalis">Market board: <a :href="detail.universalis" target="_blank" rel="noopener">prices on Universalis</a>.</div>
            </div>
            <div v-else-if="detail.universalis">Market board: <a :href="detail.universalis" target="_blank" rel="noopener">prices on Universalis</a>.</div>
            <div v-else>No source is known for this item.</div>
          </div>
          <div v-if="detail.npcSource && detail.universalis" class="gg-option">
            <b>D</b><div>Market board: <a :href="detail.universalis" target="_blank" rel="noopener">prices on Universalis</a>.</div>
          </div>
        </div>
        <div v-if="copied === 'blocked'" class="cs-error">The browser did not allow the copy. Select the text and copy it by hand.</div>
        <p class="cs-credit">Gear data from the game's files (built {{ G.built }}), with the FFXIV wiki for quests and duties.</p>
      </template>
    </div>`
};
function renderGearGuide(cid){
  const state = boxState(cid + '-gearguide', GearGuidePanel);
  if(state) Object.assign(state, {cid, tick: (state.tick || 0) + 1});
}
