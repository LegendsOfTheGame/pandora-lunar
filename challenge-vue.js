/* ---- Challenge Log (Layout D, 9 Nov 2026) ----
   Every Challenge Log entry the character can do, with a counter each, in one
   scrolling box. A bar at the top names every section; a click scrolls to it.
   Sections, in order:
   - Suggested: entries completed in earlier weeks, most often first. It grows
     each week. Until there is history it shows the entries the Duty Roulette
     fills (Feeling Lucky, Dungeon Master).
   - One per category, open entries only.
   - Completed: entries done this week. As in the game, a full entry moves here,
     and moves back if its count drops.
   Entries whose ReqUnlock quest is not done are hidden, counted per category.
   Linked entries: one action counts for every entry it links to (see CL_LINKS).
   Counts over 20, and a linked 20, take a typed number.
   Saved per character in c.challengeLog = {week, counts, history}; counts reset
   at the weekly reset (Tuesday 08:00 UTC), history stays. Data: challenge-log.js
   (ContentsNote sheet). */
const CL_ROWS = (window.CHALLENGE_NOTES || []).filter(r => r[3] !== 'Complete');
const CL_BY = Object.fromEntries(CL_ROWS.map(r => [r[0], r]));
const CL_CATS = [...new Set(CL_ROWS.map(r => r[3]))];
const CL_ROUTINE_FED = ['Feeling Lucky', 'Dungeon Master'];

/* Linked entries.
   - A name series (I, II, III) where each entry asks a different amount of the
     same action links both ways (You're the Hest Around I and II). A series of
     different targets (Soul Survivor's boards) does not link.
   - One-way links: the first entry's action is also the second's
     (a win is also a match played; a roulette dungeon is also a dungeon). */
const CL_LINKS = (() => {
  const L = {}, base = n => n.replace(/\s+(I|II|III|IV|V)$/, ''), series = {};
  for(const r of CL_ROWS) if(base(r[1]) !== r[1]) (series[base(r[1])] = series[base(r[1])] || []).push(r);
  for(const rs of Object.values(series)) if(rs.length > 1 && new Set(rs.map(r => r[5])).size === rs.length)
    for(const r of rs) L[r[0]] = rs.filter(x => x !== r).map(x => x[0]);
  const id = n => (CL_ROWS.find(r => r[1] === n) || [])[0];
  const one = (a, b) => { if(id(a) && id(b)) (L[id(a)] = L[id(a)] || []).push(id(b)); };
  one('Feeling Lucky', 'Dungeon Master');
  one('Crafting Up a Storm (HQ)', 'Crafting Up a Storm');
  one('Venture Bothers', 'Venture Capital');
  one('Spear No Effort', 'Spear Me');
  one('Catch of the Day', 'Hooked on the Reeling');
  one('A Boon from Nature', 'The Gathering Storm');
  one('Thrown to the Wolves', 'A Wolf in Your Belly');
  one('In the Line of Fire', 'Line Up');
  one('Luck Be a Lady Tonight', 'Prepare to Dice');
  one('Close the Gates', 'Open the Gates');
  for(const v of ['Victory Lap I', 'Victory Lap II']) for(const t of ['To the Races I', 'To the Races II']) one(v, t);
  one('A Winner Is You', 'Always in Threes');
  one('Cards in the Hall', 'Always in Threes');
  one('Triple Tumble', 'Cards in the Hall'); one('Triple Tumble', 'A Winner Is You');
  return L;
})();
function clReach(id){
  const seen = new Set([id]), st = [id];
  while(st.length) for(const t of CL_LINKS[st.pop()] || []) if(!seen.has(t)){ seen.add(t); st.push(t); }
  seen.delete(id); return seen;
}
const clLinkedAny = id => (CL_LINKS[id] || []).length > 0 || Object.values(CL_LINKS).some(l => l.includes(id));
const clTyped = r => r[5] > 20 || (r[5] === 20 && clLinkedAny(r[0]));
const clClean = s => String(s).replace(/^[-]\s*/, '').trim();

function clWeek(){ return lastResetInstant(schedById('weeklyTue'), new Date()); }
function clState(c){
  let s = c.challengeLog;
  if(!s || typeof s !== 'object') s = c.challengeLog = {};
  s.history = s.history || {};
  if(s.week !== clWeek()){ s.week = clWeek(); s.counts = {}; }
  s.counts = s.counts || {};
  return s;
}
function clOpen(c, r){
  const q = r[7];
  if(q >= 65536 && q < 131072) return ownedSet(c, 'questsDone').has(q - 65536);
  return true;
}
function clApply(s, id, delta){
  const r = CL_BY[id]; if(!r) return;
  const was = (s.counts[id] || 0) >= r[5];
  s.counts[id] = Math.min(r[5], Math.max(0, (s.counts[id] || 0) + delta));
  const now = s.counts[id] >= r[5], h = s.history[id] || [];
  if(now && !was && !h.includes(s.week)) s.history[id] = [...h, s.week];
  if(!now && was) s.history[id] = h.filter(w => w !== s.week);
}
/* One action on an entry; a typed lower number corrects that entry only. */
function clAdd(cid, id, delta, link = true){
  const c = getChar(cid); if(!c || !delta) return;
  const s = clState(c);
  clApply(s, id, delta);
  if(link) for(const t of clReach(id)) clApply(s, t, delta);
  scheduleSave();
}
/* For routine sub-checks: add one to an entry and its links, and return the
   entries that actually went up (a full entry does not). Unticking the sub-check
   takes one back from exactly those, so a tick on a full entry cannot later
   lower it. */
function clAddTracked(cid, id){
  const c = getChar(cid); if(!c) return [];
  const s = clState(c), raised = [];
  for(const t of [id, ...clReach(id)]){ const before = s.counts[t] || 0; clApply(s, t, 1); if((s.counts[t] || 0) > before) raised.push(t); }
  scheduleSave(); return raised;
}
function clRemoveIds(cid, ids){
  const c = getChar(cid); if(!c || !ids || !ids.length) return;
  const s = clState(c); ids.forEach(t => clApply(s, t, -1)); scheduleSave();
}

const ChallengeLogPanel = {
  props: {cid: String, tick: Number},
  setup(props){
    const bump = Vue.ref(0);
    const box = Vue.ref(null), on = Vue.ref('');
    const view = Vue.computed(() => {
      props.tick; bump.value;
      const c = getChar(props.cid); if(!c) return null;
      const s = clState(c), n = id => s.counts[id] || 0, full = r => n(r[0]) >= r[5];
      const weeks = id => (s.history[id] || []).filter(w => w !== s.week).length;
      const avail = CL_ROWS.filter(r => clOpen(c, r));
      const open = avail.filter(r => !full(r));
      const doneNow = avail.filter(full).sort((a, b) => a[6] - b[6]);
      const hist = open.filter(r => weeks(r[0]) > 0)
        .sort((a, b) => weeks(b[0]) - weeks(a[0]) || Math.max(...s.history[b[0]]) - Math.max(...s.history[a[0]]));
      const sug = hist.length ? hist : open.filter(r => CL_ROUTINE_FED.includes(r[1]));
      const row = (r, note) => ({id: r[0], name: r[1], desc: r[2], req: r[5], n: n(r[0]), full: full(r), typed: clTyped(r), note,
        links: [...clReach(r[0])].map(t => CL_BY[t] && CL_BY[t][1]).filter(Boolean)});
      const secs = [{k: 'sug', name: 'Suggested', note: hist.length ? 'Entries you completed in earlier weeks, the most often first.'
          : 'No completed weeks yet. This list grows as you complete entries. Until then it shows the entries your Duty Roulette fills.',
        rows: sug.map(r => row(r, weeks(r[0]) ? `${r[3]} · completed ${weeks(r[0])} ${weeks(r[0]) === 1 ? 'week' : 'weeks'}` : r[3]))}];
      CL_CATS.forEach((cat, i) => {
        const rs = open.filter(r => r[3] === cat).sort((a, b) => a[6] - b[6]);
        const hidden = CL_ROWS.filter(r => r[3] === cat && !clOpen(c, r)).length;
        if(rs.length) secs.push({k: 'c' + i, name: cat, note: hidden ? `${hidden} hidden, not unlocked` : '', rows: rs.map(r => row(r, ''))});
      });
      secs.push({k: 'done', name: 'Completed', note: doneNow.length ? 'Done this week. An entry moves back if its count drops.' : 'Nothing completed this week yet.',
        rows: doneNow.map(r => row(r, r[3]))});
      return {secs, reset: tz('Tuesday 08:00 UTC')};
    });
    const step = (id, d) => { clAdd(props.cid, id, d); bump.value++; };
    const typed = (id, e) => {
      const c = getChar(props.cid), s = clState(c), r = CL_BY[id];
      const v = Math.max(0, Math.min(r[5], Math.floor(+e.target.value || 0))), d = v - (s.counts[id] || 0);
      clAdd(props.cid, id, d, d > 0); bump.value++; e.target.value = (clState(c).counts[id] || 0);
    };
    const go = k => { const b = box.value, el = b && b.querySelector('[data-cls="' + k + '"]'); if(el) b.scrollTop = el.offsetTop; };
    const mark = () => { const b = box.value; if(!b) return; let cur = null;
      b.querySelectorAll('[data-cls]').forEach(el => { if(el.offsetTop <= b.scrollTop + 8) cur = el.dataset.cls; });
      if(b.scrollTop + b.clientHeight >= b.scrollHeight - 4) cur = 'done';
      on.value = cur || 'sug'; };
    Vue.onMounted(mark);
    return {view, step, typed, go, mark, box, on};
  },
  template: `
    <div v-if="view" class="cl-panel">
      <div class="cl-reset">Resets {{ view.reset }}</div>
      <nav class="clbar" aria-label="Challenge Log sections">
        <button v-for="s in view.secs" :key="s.k" type="button" :class="{on: on === s.k}" @click="go(s.k)">{{ s.name }} <span>{{ s.rows.length }}</span></button>
      </nav>
      <div class="clbox" ref="box" @scroll.passive="mark">
        <div v-for="s in view.secs" :key="s.k" class="clsec" :data-cls="s.k">
          <h3>{{ s.name }}<small v-if="s.note">{{ s.note }}</small></h3>
          <div class="clgrid">
            <div v-for="r in s.rows" :key="s.k + r.id" class="cl-row" :class="{done: r.full}">
              <div class="cl-head"><span class="cl-name">{{ r.name }}<small v-if="r.note">{{ r.note }}</small></span><span class="cl-cnt">{{ r.n }} / {{ r.req }}</span></div>
              <div class="cl-ctl">
                <template v-if="r.typed">
                  <input class="clin" type="number" inputmode="numeric" min="0" :max="r.req" :value="r.n" :aria-label="r.name + ' count'" @change="typed(r.id, $event)"><span class="of">/ {{ r.req }}</span>
                </template>
                <template v-else>
                  <button type="button" class="step" :aria-label="r.name + ' minus one'" @click="step(r.id, -1)">−</button><span class="n">{{ r.n }}</span><span class="of">/ {{ r.req }}</span><button type="button" class="step" :aria-label="r.name + ' plus one'" @click="step(r.id, 1)">+</button>
                </template>
              </div>
              <div class="cl-desc">{{ r.desc }}<span v-if="r.links.length" class="linked">Also counts for {{ r.links.join(', ') }}</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="cl-foot">The plugin can read these counts, but only after the Challenge Log window has been opened in game. Until then you tick them here.</div>
    </div>`
};
