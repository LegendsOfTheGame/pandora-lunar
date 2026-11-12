/* ---- Next steps (Layout D "next brick" planner, 9 Nov 2026) ----
   One card per goal the character is working on, each naming the next quest or
   duty to do. Goals, in order: the main scenario; the Battle Mentor role quests
   (Dawntrail tank and healer lines); the next duty whose unlock quest is done;
   the next stage of each held relic line; the first job quest waiting at or
   below a job's level. No backlog counts, no ranking language.
   Data: QUEST_GRAPH (quest-graph.js, from the game files: id, name, expansion,
   section, category, genre, prerequisites, join, level, place, locks, gc, …,
   repeatable, tribe, sort key, duty unlock) and DUTIES (duties.js). A quest is
   available when its prerequisites are done (any one when join is 2), no lock
   quest is done, it is not repeatable, tribal, seasonal or for another Grand
   Company, and only one starting-city opener counts. */
const PL_EXP = ['ARR', 'HW', 'SB', 'ShB', 'EW', 'DT'];
const PL_CLASS_JOB = {Gladiator:'Paladin', Marauder:'Warrior', Conjurer:'White Mage', Arcanist:'Summoner', Pugilist:'Monk', Lancer:'Dragoon', Archer:'Bard', Rogue:'Ninja', Thaumaturge:'Black Mage'};
const PL_GC = ['Maelstrom', 'Twin Adder', 'Immortal Flames'];
const PL_HE = /\((Extreme|Savage|Unreal|Ultimate)\)|Minstrel's Ballad|^The Minstrel/;
let PL_G = null;
function plGraph(){
  if(PL_G) return PL_G;
  const G = window.QUEST_GRAPH || [], Q = new Map(G.map(r => [r[0], r]));
  const kids = new Map(); for(const r of G) for(const p of r[6]){ if(!kids.has(p)) kids.set(p, []); kids.get(p).push(r[0]); }
  const byName = new Map(); for(const r of G) if(!byName.has(r[1])) byName.set(r[1], r);
  const dutyUnlock = new Map(G.filter(r => r[18]).map(r => [r[18], r[0]]));
  const openers = G.filter(r => !r[6].length && r[2] === 0 && r[8] === 1 && /^Coming to /.test(r[1]));
  return PL_G = {G, Q, kids, byName, dutyUnlock, openers};
}
const plClean = s => String(s).replace(/^[-]\s*/, '').trim();
function plView(c){
  const {G, Q, byName, dutyUnlock, openers} = plGraph();
  const done = ownedSet(c, 'questsDone');
  if(!G.length || !done.size) return null;
  const doneNames = new Set([...done].filter(i => Q.has(i)).map(i => Q.get(i)[1]));
  const startDone = openers.some(r => done.has(r[0]));
  const gcRow = [...done].map(i => Q.get(i)).find(r => r && /^The Company You Keep \(/.test(r[1]));
  const myGC = gcRow ? gcRow[1].replace(/^.*\((.*)\)$/, '$1') : '';
  const byOrder = (a, b) => a[2] - b[2] || a[17] - b[17] || a[0] - b[0];
  const otherGC = r => { const m = r[1].match(/\(([^)]*)\)$/); return !!(m && myGC && PL_GC.includes(m[1]) && m[1] !== myGC); };
  const available = r => {
    if(done.has(r[0]) || doneNames.has(r[1]) || r[15] || r[16]) return false;
    if(r[4] === 'Seasonal Events' || r[4] === 'Special Quests' || r[5] === 'Sephiroth Missions') return false;
    if(r[10].some(x => done.has(x))) return false;
    if(startDone && openers.includes(r)) return false;
    if(otherGC(r)) return false;
    const p = r[6].filter(x => Q.has(x));
    if(!p.length) return r[3] !== 'Class & Job Quests';
    return r[7] === 2 ? p.some(x => done.has(x)) : p.every(x => done.has(x));
  };
  const nextStepTo = id => { const seen = new Set(), st = [id]; let best = null;
    while(st.length){ const q = Q.get(st.pop()); if(!q || seen.has(q[0]) || done.has(q[0])) continue; seen.add(q[0]);
      const p = q[6].filter(x => Q.has(x) && !done.has(x)); if(!p.length){ if(!best || byOrder(q, best) < 0) best = q; } else st.push(...p); }
    return best; };
  const levels = Object.assign({}, c.combat, c.craft, c.gather);
  const jobOf = g => { const n = g.replace(/ Quests$/, ''); return PL_CLASS_JOB[n] || n; };
  const jobLv = g => { const j = jobOf(g); return j in levels ? Math.floor(levels[j]) : null; };
  const brick = (kind, r, opts = {}) => {
    let wait = '';
    if(opts.job){ const lv = jobLv(r[5]); if(lv !== null && lv < r[8]) wait = `Needs Lv ${r[8]}. ${jobOf(r[5])} is ${lv}.`; }
    return {kind, title: plClean(r[1]), exp: PL_EXP[r[2]] || '', meta: [r[5], r[9], 'Lv ' + r[8]].filter(Boolean).join(' · '), ready: !wait, why: wait || 'You can pick it up now.'};
  };
  const steps = [];
  const AV = G.filter(available);
  const msq = AV.filter(r => r[3].startsWith('Main Scenario')).sort(byOrder)[0];
  if(msq) steps.push(brick('Main scenario', msq));
  for(const [n, label] of [['Dreams of a New Day', 'Battle Mentor · tank role quests'], ['An Antidote for Anarchy', 'Battle Mentor · healer role quests']]){
    const q = byName.get(n); if(!q || done.has(q[0])) continue; const s = nextStepTo(q[0]); if(s) steps.push(brick(label, s)); }
  const dDone = ownedSet(c, 'dutiesDone');
  const ready = (window.DUTIES || []).filter(d => d[10] && d[3] <= 5 && !dDone.has(d[0]) && !PL_HE.test(d[1]) && d[2] !== 'Ultimate Raids'
      && ['Dungeons', 'Trials', 'Raids', 'Guildhests'].includes(d[2]))
    .map(d => ({d, uq: d[6] >= 65536 && d[6] < 131072 ? d[6] - 65536 : dutyUnlock.get(d[0])}))
    .filter(x => x.uq && done.has(x.uq)).sort((a, b) => a.d[3] - b.d[3] || a.d[9] - b.d[9]);
  const duty = d => ({kind: 'Encounters · clear next', title: d[1], exp: PL_EXP[d[3]], meta: d[2] + ' · Lv ' + d[8], ready: true, why: 'Unlocked. Queue for it in the Duty Finder.'});
  if(ready.length) steps.push(duty(ready[0].d));
  const held = heldRelics(c) || {};
  for(const k of ['ZD', 'AN', 'EU', 'RS', 'MV', 'PH']){
    const line = held[k]; if(!line || typeof RELIC_STAGES === 'undefined' || !RELIC_STAGES[k]) continue;
    for(const [job, st] of Object.entries(line)){ const L = RELIC_STAGES[k], nx = L.stages[st + 1];
      if(nx) steps.push({kind: 'Relic · ' + L.name, title: nx[0], exp: job, meta: 'Now ' + L.stages[st][0], ready: true, why: 'The next stage of this line.'}); }
  }
  const perJob = new Map(); for(const r of AV.filter(r => r[3] === 'Class & Job Quests').sort(byOrder)) if(!perJob.has(r[5])) perJob.set(r[5], r);
  const lines = [];
  for(const [genre] of perJob){ const lv = jobLv(genre); if(lv === null || lv < 1) continue;
    const want = G.filter(r => r[5] === genre && !done.has(r[0]) && !doneNames.has(r[1]) && r[8] <= lv && !r[15]).sort(byOrder)[0];
    if(want) lines.push(nextStepTo(want[0]) || want); }
  lines.sort(byOrder);
  const jobStep = r => brick('Job line · ' + jobOf(r[5]), r, {job: true});
  if(lines[0]) steps.push(jobStep(lines[0]));
  // Second pass, so "Show 5 more" can fill two rows: the next duties and job quests.
  // It takes duties first, then job quests, until there are 10.
  ready.slice(1, 3).forEach(x => steps.push(duty(x.d)));
  lines.slice(1).forEach(r => { if(steps.length < 10) steps.push(jobStep(r)); });
  return {steps: steps.slice(0, 10)};
}
const NextSteps = {
  props: ['state'],
  setup(props){
    // 5 next steps, one full row; "Show 5 more" gives 10, two full rows (tester's
    // feedback, 12 Nov 2026: 7 cards leave a ragged row). Steps are in priority order.
    const more = Vue.ref(false);
    const view = Vue.computed(() => { props.state.tick; const c = getChar(props.state.cid); return c ? plView(c) : null; });
    const shown = Vue.computed(() => view.value ? view.value.steps.slice(0, more.value ? 10 : 5) : []);
    // Below the steps, as on the Layout D Today page: running and announced events.
    const events = Vue.computed(() => { props.state.tick; const t = Date.now();
      return (typeof currentEvents === 'function' ? currentEvents() : []).map(e => ({name: e.name.replace(/ Arrives.*$/, ''), url: e.url,
        when: (e.from <= t ? 'Running since ' : 'Starts ') + fmtEventDay(e.from) + (e.note ? ' · ' + e.note : '') + (e.estimated ? ' (end date estimated)' : '')})); });
    return {view, shown, more, events};
  },
  template: `
    <div v-if="!view" class="empty-hint">Import Copy everything from Tales of Milestones to see the next step for each goal.</div>
    <template v-else>
      <p class="pl-lede">One next step for each goal you are working on.</p>
      <div class="pl-grid">
        <div v-for="(s, i) in shown" :key="i" class="pl-card">
          <div class="pl-kind">{{ s.kind }}</div>
          <div class="pl-title">{{ s.title }}</div>
          <div class="pl-meta"><span class="pl-exp" :class="'exp-' + s.exp">{{ s.exp }}</span>{{ s.meta }}</div>
          <div class="pl-why"><span class="pl-st" :class="s.ready ? 'ready' : 'wait'">{{ s.ready ? 'READY' : 'WAITING' }}</span>{{ s.why }}</div>
        </div>
      </div>
      <button v-if="view.steps.length > 5" type="button" class="edit-btn pl-more" @click="more = !more">{{ more ? 'Show 5' : 'Show ' + Math.min(5, view.steps.length - 5) + ' more' }}</button>
      <div class="pl-events">
        <div class="pl-kind">From the Lodestone</div>
        <div v-if="!events.length" class="pl-meta">No events running.</div>
        <div v-for="e in events" :key="e.name" class="pl-ev"><a :href="e.url" target="_blank" rel="noopener">{{ e.name }}</a><span class="pl-meta">{{ e.when }}</span></div>
      </div>
    </template>`
};
function renderNextSteps(cid){
  const state = boxState(cid + '-next', NextSteps);
  if(!state) return;
  Object.assign(state, {cid, tick: (state.tick || 0) + 1});
}
