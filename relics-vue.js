/* ---- Relics ----
   Weapons, Armor, Tools and GARO frames, with one collapsible panel per FFXIV Collect
   type. A panel counts items, the same way as FFXIV Collect's relic pages. Its grid has
   one row per stage, slot or set, and one column per job, role or slot.

   The panels only read the character. They have no inputs and write nothing, so the
   saved data and the Time Memoria import format do not change. Which panels are open
   is local to the page and resets on reload. */
const RelicLinePanel = {
  props: {line: Object, open: Boolean},
  emits: ['toggle'],
  template: `
    <section class="rl-panel">
      <button type="button" class="rl-head" :class="{full: line.total && line.have === line.total}" :aria-expanded="String(open)" @click="$emit('toggle')">
        <span class="rl-name">{{ line.name }}</span>
        <span class="jr-v">{{ line.have }} of {{ line.total }} Complete</span>
      </button>
      <div v-if="open" class="rl-scroll">
        <table class="rl-grid">
          <thead><tr><th scope="col">{{ line.corner }}</th><th v-for="j in line.jobs" :key="j" scope="col" :title="jobName(j)">{{ j }}</th></tr></thead>
          <tbody>
            <tr v-for="r in line.rows" :key="r.name">
              <th scope="row">{{ r.name }}<i v-if="r.il" class="faint"> {{ r.il }}</i></th>
              <td v-for="x in r.cells" :key="x.j" :class="{on: x.on}" :title="x.title"><span v-if="x.on" aria-label="Complete">●</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>`,
  setup: () => ({jobName: j => TM_JOB_NAMES[j] || j})
};

/* ---- Relics by job (Layout D, 9 Nov 2026) ----
   A row of job buttons by role; picking one shows every weapon or tool line
   that job can have (RELIC_JOBS), with a tiered stage bar for a held stage, or
   how to start the line. Button colours: green = the job picked; yellow = the
   job holds a stage but a line is still locked by level; red = the job cannot
   do any of its lines yet. A line's level is its starting quest's level
   (relic-unlocks.js); Resplendent has no quest and is a Shadowbringers line (80).
   Below level 30 an ARR job is still its base class, so the class is named. */
const RJ_ROLES = [['Tanks',['PLD','WAR','DRK','GNB']],['Healers',['WHM','SCH','AST','SGE']],['Melee',['MNK','DRG','NIN','SAM','RPR','VPR']],
  ['Ranged',['BRD','MCH','DNC']],['Casters',['BLM','SMN','RDM','PCT']],['Crafters',['CRP','BSM','ARM','GSM','LTW','WVR','ALC','CUL']],['Gatherers',['MIN','BTN','FSH']]];
const RJ_LINES = ['ZD','AN','EU','RS','MV','PH','LU','SK','RP','SP','CO'];
const RJ_CLASS = {PLD:'GLA',WAR:'MRD',WHM:'CNJ',SCH:'ACN',SMN:'ACN',MNK:'PGL',DRG:'LNC',BRD:'ARC',NIN:'ROG',BLM:'THM'};
const RJ_UNLOCK = Object.fromEntries((window.RELIC_UNLOCK || []).map(u => [u[0], u]));
const RJ_LV = Object.assign(Object.fromEntries((window.RELIC_UNLOCK || []).map(u => [u[0], u[7]])), {RP: 80});
const RJ_EXP = ['ARR','HW','SB','ShB','EW','DT'];
const rjClean = s => String(s).replace(/^[-]\s*/, '').trim();
function rjLevel(c, j){
  const n = TM_JOB_NAMES[j], v = (c.combat || {})[n] ?? (c.craft || {})[n] ?? (c.gather || {})[n];
  return v ? Math.floor(v) : 0;
}
/* Tiers: stages with the same name apart from a version (v1.1, +1, IL 720). */
function rjTiers(code){
  const tier = n => { const b = n.replace(/\s*v\d+(\.\d+)*/g, '').replace(/\s*\(IL \d+\)/, '').replace(/\s*\+\d+$/, '').replace(/\s+\d+$/, '').trim();
    return b.replace(/\s*(Tools|Weapons)$/, '').trim() || b; };
  const out = [];
  RELIC_STAGES[code].stages.forEach((s, k) => { const t = tier(s[0]); if(!out.length || out[out.length - 1].t !== t) out.push({t, from: k, n: 0}); out[out.length - 1].n++; });
  return out;
}
function rjView(c, held, j){
  const lv = rjLevel(c, j), done = ownedSet(c, 'questsDone');
  const lines = RJ_LINES.filter(k => RELIC_STAGES[k] && (RELIC_JOBS[k] || []).includes(j)).map(k => {
    const L = RELIC_STAGES[k], st = (held[k] || {})[j], u = RJ_UNLOCK[k], need = RJ_LV[k] || 0;
    const v = {code: k, name: L.name, exp: RJ_EXP[L.ex] || '', total: L.stages.length, held: st !== undefined};
    if(v.held){
      v.stage = st + 1; v.stageName = L.stages[st] ? L.stages[st][0] : 'Stage ' + (st + 1);
      v.next = L.stages[st + 1] ? L.stages[st + 1][0] : null;
      v.cells = []; v.tiers = rjTiers(k).map((g, gi) => ({t: g.t, n: g.n, c: 'var(--tier-' + (gi % 8 + 1) + ')'}));
      rjTiers(k).forEach((g, gi) => { for(let i = g.from; i < g.from + g.n; i++) v.cells.push({c: 'var(--tier-' + (gi % 8 + 1) + ')', on: i <= st, cur: i === st, title: L.stages[i][0]}); });
      v.tierName = rjTiers(k).find(g => st < g.from + g.n).t;
    } else {
      v.low = lv < need; v.need = need; v.lvGap = need - lv;
      if(u){ v.quest = rjClean(u[2]); v.giver = u[3].charAt(0).toUpperCase() + u[3].slice(1); v.place = u[4];
        v.x = (+u[5]).toFixed(1); v.y = (+u[6]).toFixed(1); v.qlv = u[7]; v.questDone = done.has(u[1]); }
    }
    return v;
  });
  return {lv, lines};
}
function rjState(c, held, j){
  const v = rjView(c, held, j), has = v.lines.some(l => l.held), low = v.lines.filter(l => !l.held && l.low).length;
  if(v.lines.length && low === v.lines.length) return 'low';
  if(has && low) return 'part';
  return '';
}
const RelicsByJob = {
  props: {c: Object, tick: Number},
  setup(props){
    let saved = null; try{ saved = localStorage.getItem('lunar-relic-job'); }catch(e){}
    const held = Vue.computed(() => (props.tick, heldRelics(props.c) || {}));
    const first = () => { for(const [, js] of RJ_ROLES) for(const j of js) if(RJ_LINES.some(k => (held.value[k] || {})[j] !== undefined)) return j; return 'WAR'; };
    const pick = Vue.ref(saved && TM_JOB_NAMES[saved] ? saved : first());
    const rows = Vue.computed(() => RJ_ROLES.map(([r, js]) => ({r, jobs: js.map(j => ({j, st: rjState(props.c, held.value, j),
      has: RJ_LINES.some(k => (held.value[k] || {})[j] !== undefined), title: TM_JOB_NAMES[j] + (rjLevel(props.c, j) ? ' · Lv ' + rjLevel(props.c, j) : '')}))})));
    const view = Vue.computed(() => rjView(props.c, held.value, pick.value));
    const name = Vue.computed(() => { const j = pick.value, lv = rjLevel(props.c, j);
      return RJ_CLASS[j] && lv > 0 && lv < 30 ? TM_JOB_NAMES[j] + ' (now ' + (/^[AEIOU]/.test(TM_JOB_NAMES[RJ_CLASS[j]]) ? 'an ' : 'a ') + TM_JOB_NAMES[RJ_CLASS[j]] + '; the job opens at level 30)' : TM_JOB_NAMES[j]; });
    const choose = j => { pick.value = j; try{ localStorage.setItem('lunar-relic-job', j); }catch(e){} };
    return {rows, view, name, pick, choose};
  },
  template: `
    <div class="rj">
      <div class="jr-note">Pick a job. A dot marks a job that already has a relic weapon or tool. Green is the job you picked. Yellow: the job has done at least one step, but a line is still locked by level. Red: the job cannot do any of its lines yet.</div>
      <div class="rj-jobs">
        <div v-for="g in rows" :key="g.r" class="rj-row"><span class="rj-role">{{ g.r }}</span>
          <button v-for="x in g.jobs" :key="x.j" type="button" class="rj-job" :class="[x.st, {on: x.j === pick, has: x.has}]" :aria-pressed="String(x.j === pick)" :title="x.title" @click="choose(x.j)">{{ x.j }}</button>
        </div>
      </div>
      <div class="jr-note"><b>{{ name }}</b> · {{ view.lv ? 'Lv ' + view.lv : 'not started' }} · {{ view.lines.length }} {{ view.lines.length === 1 ? 'line' : 'lines' }}. A starting quest is done once per character; the stages are per job.</div>
      <div class="rj-grid">
        <section v-for="l in view.lines" :key="l.code" class="rj-card" :class="{dim: !l.held}">
          <h4>{{ l.name }} <span class="pl-exp" :class="'exp-' + l.exp">{{ l.exp }}</span></h4>
          <template v-if="l.held">
            <div><b>{{ l.stageName }}</b> <small>stage {{ l.stage }} of {{ l.total }}</small></div>
            <small>{{ l.next ? 'Next: ' + l.next : 'Final stage' }}</small>
            <div class="tbar" role="img" :aria-label="'Stage ' + l.stage + ' of ' + l.total + ', ' + l.tierName + ' tier'"><i v-for="(x, i) in l.cells" :key="i" :class="{on: x.on, cur: x.cur}" :style="{'--c': x.c}" :title="x.title"></i></div>
            <div class="tlbl" aria-hidden="true"><span v-for="t in l.tiers" :key="t.t" :style="{flex: t.n, '--c': t.c}">{{ t.t }}</span></div>
          </template>
          <template v-else>
            <span v-if="l.low" class="rj-st low">NOT YET · NEEDS LV {{ l.need }}</span>
            <span v-else class="rj-st">NOT STARTED</span>
            <small v-if="l.low">{{ view.lv ? 'Level ' + view.lv : 'Not started' }}. {{ l.lvGap }} more {{ l.lvGap === 1 ? 'level' : 'levels' }} to go before this line opens.</small>
            <small v-if="l.quest && l.questDone">You have done the starting quest, <b>{{ l.quest }}</b>.</small>
            <small v-else-if="l.quest">Start with <b>{{ l.quest }}</b> from {{ l.giver }} in {{ l.place }} (X: {{ l.x }} Y: {{ l.y }}) · Lv {{ l.qlv }}</small>
            <small v-else>This line has no starting quest. The stages are bought or earned directly.</small>
          </template>
        </section>
      </div>
    </div>`
};

/* ---- Relic line cards (Layout D) ----
   Weapons, Tools and GARO frames: one card per line. Each job holding the line
   shows its stage and the tiered stage bar; a line nobody holds shows how to
   start it. The full FFXIV Collect grid (every stage by job) stays inside each
   card behind "Show every job". */
function rjCard(code, held){
  const L = RELIC_STAGES[code], tiers = rjTiers(code), u = RJ_UNLOCK[code];
  const jobs = Object.entries(held[code] || {}).filter(([j, st]) => typeof st === 'number').map(([j, st]) => {
    const cells = []; tiers.forEach((g, gi) => { for(let i = g.from; i < g.from + g.n; i++) cells.push({c: 'var(--tier-' + (gi % 8 + 1) + ')', on: i <= st, cur: i === st, title: L.stages[i][0]}); });
    return {j, stage: st + 1, stageName: L.stages[st] ? L.stages[st][0] : 'Stage ' + (st + 1), next: L.stages[st + 1] ? L.stages[st + 1][0] : null, cells,
      tierName: (tiers.find(g => st < g.from + g.n) || {}).t || ''};
  });
  return {code, name: L.name, exp: RJ_EXP[L.ex] || 'Other', total: L.stages.length, jobs,
    tiers: tiers.map((g, gi) => ({t: g.t, n: g.n, c: 'var(--tier-' + (gi % 8 + 1) + ')'})),
    start: u ? {quest: rjClean(u[2]), giver: u[3].charAt(0).toUpperCase() + u[3].slice(1), place: u[4], x: (+u[5]).toFixed(1), y: (+u[6]).toFixed(1), lv: u[7]} : null};
}
const RelicLineCards = {
  components: {RelicLinePanel},
  props: {c: Object, kind: String, tick: Number},
  setup(props){
    const open = Vue.reactive({});
    const held = Vue.computed(() => (props.tick, heldRelics(props.c)));
    const cards = Vue.computed(() => {
      const h = held.value || {}, grids = Object.fromEntries(relicPanels(props.kind, h).map(l => [l.code, l]));
      return relicLinesOfKind(props.kind).filter(k => RELIC_STAGES[k]).map(k => Object.assign(rjCard(k, h), {grid: grids[k]}));
    });
    const startDone = code => { const u = RJ_UNLOCK[code]; return !!(u && ownedSet(props.c, 'questsDone').has(u[1])); };
    return {open, held, cards, startDone};
  },
  template: `
    <div v-if="held === null" class="jr-note">Import a newer Tales of Milestones export (Copy everything) to see your relics.</div>
    <div v-else class="rj-grid">
      <section v-for="l in cards" :key="l.code" class="rj-card" :class="{dim: !l.jobs.length}">
        <h4>{{ l.name }} <span class="pl-exp" :class="'exp-' + l.exp">{{ l.exp }}</span></h4>
        <div v-for="x in l.jobs" :key="x.j" class="rl-job">
          <span class="pl-exp">{{ x.j }}</span>
          <div class="rl-job-body"><b>{{ x.stageName }}</b> <small>stage {{ x.stage }} of {{ l.total }}</small><br><small>{{ x.next ? 'Next: ' + x.next : 'Final stage' }}</small>
            <div class="tbar" role="img" :aria-label="x.j + ': stage ' + x.stage + ' of ' + l.total + ', ' + x.tierName + ' tier'"><i v-for="(cl, i) in x.cells" :key="i" :class="{on: cl.on, cur: cl.cur}" :style="{'--c': cl.c}" :title="cl.title"></i></div>
            <div class="tlbl" aria-hidden="true"><span v-for="t in l.tiers" :key="t.t" :style="{flex: t.n, '--c': t.c}">{{ t.t }}</span></div>
          </div>
        </div>
        <template v-if="!l.jobs.length">
          <span class="rj-st">NOT STARTED</span>
          <small v-if="l.start && startDone(l.code)">You have done the starting quest, <b>{{ l.start.quest }}</b>.</small>
          <small v-else-if="l.start">Start with <b>{{ l.start.quest }}</b> from {{ l.start.giver }} in {{ l.start.place }} (X: {{ l.start.x }} Y: {{ l.start.y }}) · Lv {{ l.start.lv }}</small>
          <small v-else>This line has no starting quest. The stages are bought or earned directly.</small>
        </template>
        <relic-line-panel v-if="l.grid" :line="l.grid" :open="!!open[l.code]" @toggle="open[l.code] = !open[l.code]"></relic-line-panel>
      </section>
    </div>`
};

const RelicsPanel = {
  components: {RelicLinePanel},
  props: {c: Object, kind: String, tick: Number},
  setup(props){
    const open = Vue.reactive({});
    // DATA is not reactive, so the tick makes this run again after an import.
    const held = Vue.computed(() => (props.tick, heldRelics(props.c)));
    const lines = Vue.computed(() => relicPanels(props.kind, held.value || {}));
    const allOpen = Vue.computed(() => lines.value.every(l => open[l.code]));
    const toggleAll = () => {
      const to = !allOpen.value;
      lines.value.forEach(l => { open[l.code] = to; });
    };
    return {open, held, lines, allOpen, toggleAll};
  },
  template: `
    <div v-if="held === null" class="jr-note">Import a newer Tales of Milestones export (Copy everything) to see your relics.</div>
    <template v-else>
      <div class="rl-bar"><button type="button" class="link-btn" @click="toggleAll">{{ allOpen ? 'Collapse all' : 'Expand all' }}</button></div>
      <relic-line-panel v-for="l in lines" :key="l.code" :line="l" :open="!!open[l.code]" @toggle="open[l.code] = !open[l.code]"></relic-line-panel>
      <div class="jr-note" style="margin-top:10px">An item counts when you hold it, or when you used it to make an item that you hold. Tales of Milestones reads what you have equipped, the armoury chest, bags, saddlebag, retainers and glamour dresser. It does not read the Armoire or what a retainer has equipped, so an item there is not counted.</div>
    </template>`
};
