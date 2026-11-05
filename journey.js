/* ---------- collections and journey (from Time Memoria's collections payload) ----------
   Time Memoria sends what a character owns and has done as ids only: the collections
   payload on its own ("kind":"collections"), or nested as "collections" inside the full
   export (/tm full). This file stores it on the character and draws two sections from it:

   Collections: mounts, minions and the rest against FFXIV Collect's obtainable lists
     (collection-lists.js, refreshed daily by a GitHub Action).
   Journey: questlines, relics and seasonal events grouped by the game's own journal genres
     (TM_QUEST_GENRES), duty clears (TM_DUTIES), and exploration (TM_WORLD).

   All three tables are generated, so a patch's new mounts, questlines or duties appear
   without anyone editing this file. Nothing here has an input: the panels are drawn whole
   from c.tmCollections, so collectCharInputs() has nothing to read back. */

const COLLECTION_KINDS = [
  {key:'mounts',      label:'Mounts'},
  {key:'minions',     label:'Minions'},
  {key:'orchestrion', label:'Orchestrion'},
  {key:'ttCards',     label:'Triple Triad cards'},
  {key:'ttNpcs',      label:'Triple Triad NPCs'},
  {key:'emotes',      label:'Emotes', note:'Collectable emotes only; the starting ones are left out.'},
  {key:'accessories', label:'Fashion accessories'},
  {key:'facewear',    label:'Facewear', note:'Counted by style, the way the game’s Facewear window counts.'},
  // Not on FFXIV Collect: the list comes from the game's own sheets
  // (tm-export-tables.js), so "game" swaps the source and the column headings.
  {key:'fish',        label:'Fish', game:'TM_FISH', note:'The fish the game’s Fish Guide lists.'},
  {key:'spearfish',   label:'Spearfish', game:'TM_SPEARFISH', note:'The game gives no place for spearfish, only the expansion.'}
];
/* [id, name, expansion name, place, ''] rows from a game table, in the shape the
   collection tables use for FFXIV Collect's lists. Index 5 keeps the expansion
   number for the route filter. */
function gameCollectionRows(table){
  // A top-level const is not a property of globalThis, so look the table up here.
  const src = table === 'TM_FISH' ? (typeof TM_FISH !== 'undefined' ? TM_FISH : null)
            : table === 'TM_SPEARFISH' ? (typeof TM_SPEARFISH !== 'undefined' ? TM_SPEARFISH : null)
            : null;
  return src ? Object.keys(src).map(id => {
    const [name, place, ex] = src[id];
    return [+id, name, EXPANSION_NAMES[ex] || '', place, '', ex];
  }) : [];
}
const EXPANSION_NAMES = ['A Realm Reborn','Heavensward','Stormblood','Shadowbringers','Endwalker','Dawntrail','Evercold'];
const DUTY_TYPES = ['Dungeons','Trials','Raids','Alliance Raids','Ultimate Raids','Guildhests','V&C Dungeon Finder'];

/* The payload's collections part, whichever shape was pasted, or null. */
function tmCollectionsOf(p){
  if(!p || typeof p !== 'object') return null;
  if(p.kind === 'collections') return p;
  if(p.collections && typeof p.collections === 'object') return p.collections;
  return null;
}

/* Stored whole, replacing the last reading: every list is a full read of what the client
   holds, so merging would keep things the player no longer has (a sold card, a reset log). */
function applyTmCollections(p, c){
  const src = tmCollectionsOf(p);
  if(!src) return false;
  const lists = {};
  Object.keys(src).forEach(k => { if(Array.isArray(src[k])) lists[k] = src[k].slice(); });
  c.tmCollections = { asOf: p.exported || new Date().toISOString(), game: src.game || null, lists,
    // TerritoryType id -> speed level, zones above 0 only; and bicolor gemstones held.
    mountSpeed: src.mountSpeed && typeof src.mountSpeed === 'object' ? Object.assign({}, src.mountSpeed) : null,
    gemstones: Number.isFinite(src.gemstones) ? src.gemstones : null,
    // Highest relic stage per line and job, "ZDWAR-C RSWAR-A"; see heldRelics.
    relics: typeof src.relics === 'string' ? src.relics : null };
  return true;
}

/* One diff row per list that changed, for the import preview. */
function tmCollectionsDiffRows(p, c){
  const src = tmCollectionsOf(p);
  if(!src) return [];
  const old = (c.tmCollections || {}).lists || {};
  const rows = [];
  const label = {questsDone:'Quests done', dutiesDone:'Duties cleared', sightseeing:'Sightseeing vistas', currents:'Aether currents',
                 currentZones:'Current zones complete', aetherytes:'Aetherytes', porters:'Porter stops', fish:'Fish', spearfish:'Spearfish', curios:'Curiosities',
                 bestiary:'Master’s Bestiary', folklore:'Folklore tomes'};
  COLLECTION_KINDS.forEach(k => label[k.key] = k.label);
  Object.keys(src).forEach(k => {
    if(!Array.isArray(src[k])) return;
    const before = Array.isArray(old[k]) ? old[k].length : null;
    if(before === src[k].length) return;
    rows.push([label[k] || k, before == null ? '—' : before, src[k].length]);
  });
  if(src.mountSpeed && typeof src.mountSpeed === 'object'){
    const atTop = speeds => speeds ? speedZones().filter(z => (speeds[z.id] || 0) >= z.top).length : null;
    const before = atTop((c.tmCollections || {}).mountSpeed), after = atTop(src.mountSpeed);
    if(before !== after) rows.push(['Zones at top mount speed', before == null ? '—' : before, after]);
  }
  if(typeof src.relics === 'string' && src.relics !== (c.tmCollections || {}).relics){
    const count = s => typeof s === 'string' ? s.split(/\s+/).filter(Boolean).length : null;
    rows.push(['Relic stages held', count((c.tmCollections || {}).relics) ?? '—', count(src.relics)]);
  }
  if(Number.isFinite(src.gemstones) && src.gemstones !== (c.tmCollections || {}).gemstones)
    rows.push(['Bicolor gemstones', (c.tmCollections || {}).gemstones ?? '—', src.gemstones]);
  return rows;
}

/* The route line's expansion filter (routeExp in app.js), as a test on an expansion index.
   A collection item's expansion comes from the patch it arrived in: 2.x is ARR (0). */
function inRoute(ex){ const r = routeExp(); return r === null || ex === r; }
function patchExpansion(patch){ return parseInt(patch, 10) - 2; }

function ownedSet(c, key){ return new Set(((c.tmCollections || {}).lists || {})[key] || []); }
function hasCollections(c){ return !!(c.tmCollections && c.tmCollections.lists); }
function jrPct(n, d){ return d ? Math.round(n / d * 100) : 0; }
function collectionsAsOfText(c){
  if(!hasCollections(c)) return '';
  const when = c.tmCollections.asOf ? fmtTmTimestamp(c.tmCollections.asOf) : 'an earlier import';
  return `From Tales of Milestones, exported ${when}${c.tmCollections.game ? ' · game build ' + c.tmCollections.game : ''}.`;
}
/* "No … yet" and how to get it, for Collections and Journey. */
const EmptyTm = {
  props: {what: String},
  setup: () => ({toggleTmImportPanel}),
  template: `<div class="jr-note">No {{ what }} yet. In Tales of Milestones press <b>Copy everything</b> (or type <code>/tm full</code>), then click <button class="link-btn" @click="toggleTmImportPanel()">Import from Tales of Milestones</button> and paste it.</div>`
};

/* ---- Collections ---- */
let collOwnFilter = 'all';
function setCollFilter(cid, v){ collOwnFilter = v; renderCollections(cid); }

/* Drawn by Vue (boxState in app.js). DATA is not reactive, so renderCollections
   bumps state.tick and the panel works its lists out again. applyFrames still
   hides the [data-frame] blocks, so it runs after Vue has drawn them. */
const CollectionsPanel = {
  components: {EmptyTm},
  props: ['state'],
  setup(props){
    const view = Vue.computed(() => {
      props.state.tick;
      const c = getChar(props.state.cid);
      if(!c || !hasCollections(c)) return null;
      const source = (typeof COLLECTION_LISTS !== 'undefined' && COLLECTION_LISTS.lists) || {};
      const lists = {};
      Object.keys(source).forEach(k => lists[k] = source[k].filter(r => inRoute(patchExpansion(r[2]))));
      COLLECTION_KINDS.filter(k => k.game).forEach(k => lists[k.key] = gameCollectionRows(k.game).filter(r => inRoute(r[5])));
      const kinds = COLLECTION_KINDS.map(k => {
        const all = lists[k.key] || [], owned = ownedSet(c, k.key);
        const have = all.filter(r => owned.has(r[0])).length;
        const rows = all.filter(r => collOwnFilter === 'all' || (collOwnFilter === 'owned') === owned.has(r[0]))
          .map(r => ({id: r[0], name: r[1], when: r[2], how: [r[3], r[4]].filter(Boolean).join(' · '), own: owned.has(r[0])}));
        return {key: k.key, frame: frameSlug(k.key), label: k.label, note: k.note, game: !!k.game,
                have, total: all.length, pct: jrPct(have, all.length), rows};
      });
      return {kinds, filter: collOwnFilter, asOf: collectionsAsOfText(c), curios: ownedSet(c, 'curios').size,
              built: (typeof COLLECTION_LISTS !== 'undefined' && COLLECTION_LISTS.built) || '?'};
    });
    return {view, setFilter: v => setCollFilter(props.state.cid, v)};
  },
  template: `
    <empty-tm v-if="!view" what="collections"></empty-tm>
    <template v-else>
      <div data-frame="overview">
        <div class="jr-note">{{ view.asOf }} Totals are FFXIV Collect’s obtainable items (list built {{ view.built }}). Fish and spearfish totals come from the game’s own tables.</div>
        <div class="jr-grid">
          <div v-for="k in view.kinds" :key="k.key" class="jr-row"><span>{{ k.label }}</span><span class="jr-v">{{ k.have }} / {{ k.total }}</span>
            <div class="jr-bar"><i :style="{width: k.pct + '%'}"></i></div></div>
        </div>
        <div class="jr-note" style="margin-top:8px">Not on Collect: {{ view.curios }} curiosities.</div>
      </div>
      <div v-for="k in view.kinds" :key="k.key" :data-frame="k.frame">
        <div class="subhead">{{ k.label }} · {{ k.have }} of {{ k.total }} {{ k.game ? 'caught' : 'owned' }}<template v-if="k.note"> · {{ k.note }}</template></div>
        <div class="jr-chips"><button v-for="v in ['all','owned','missing']" :key="v" class="tab-btn" :class="{active: view.filter === v}" @click="setFilter(v)">{{ v[0].toUpperCase() + v.slice(1) }}</button></div>
        <div class="jr-scroll"><table class="jr-table"><tbody>
          <tr><th></th><th>Name</th><th>{{ k.game ? 'Expansion' : 'Patch' }}</th><th>{{ k.game ? 'Where' : 'How to get it' }}</th></tr>
          <tr v-for="r in k.rows" :key="r.id" :class="{have: r.own}"><td>{{ r.own ? '✓' : '' }}</td><td>{{ r.name }}</td><td class="jr-v">{{ r.when }}</td><td class="jr-note">{{ r.how }}</td></tr>
        </tbody></table></div>
      </div>
    </template>`
};
function renderCollections(cid){
  const state = boxState(cid + '-coll', CollectionsPanel);
  if(!state) return;
  Object.assign(state, {cid, tick: (state.tick || 0) + 1});
  Vue.nextTick(() => { if(DATA.activeId === cid && activeTab(cid) === 'collections') applyFrames(cid, 'collections'); });
}

/* ---- Journey ---- */
function genreRows(c, filter){
  const done = ownedSet(c, 'questsDone');
  return Object.keys(TM_QUEST_GENRES).filter(g => filter(TM_QUEST_GENRES[g], g)).map(g => {
    const ids = TM_QUEST_GENRES[g].ids, have = ids.filter(id => done.has(id)).length;
    return {g, have, total: ids.length};
  }).sort((a, b) => (b.have > 0) - (a.have > 0) || a.g.localeCompare(b.g));
}
/* Finished questlines are hidden unless the character asks for them, so the list
   is what is left to do. The note under the list gives the count and the switch. */
function genreList(c, filter){
  const rows = genreRows(c, filter);
  return {rows: c.showDoneQuestlines ? rows : rows.filter(r => r.have !== r.total),
          done: rows.filter(r => r.total > 0 && r.have === r.total).length, showing: !!c.showDoneQuestlines};
}
const GenreList = {
  props: {list: Object},
  emits: ['toggle'],
  setup: () => ({jrPct, wikiUrl}),
  template: `
    <div v-if="list.rows.length" class="jr-grid">
      <div v-for="r in list.rows" :key="r.g" class="jr-row" :class="{full: r.have === r.total}"><a class="jr-link" :href="wikiUrl(r.g)" target="_blank" rel="noopener noreferrer" title="Open the wiki page in a new tab">{{ r.g }}</a><span class="jr-v">{{ r.have }} / {{ r.total }}</span>
        <div class="jr-bar"><i :style="{width: jrPct(r.have, r.total) + '%'}"></i></div></div>
    </div>
    <div v-else class="jr-note">Every questline here is complete.</div>
    <div v-if="list.done" class="hidden-note"><span>{{ list.done }} complete{{ list.showing ? '' : ' — hidden' }}</span><button class="link-btn" @click="$emit('toggle')">{{ list.showing ? 'hide them' : 'show them' }}</button></div>`
};
function toggleDoneQuestlines(cid){
  const c = getChar(cid);
  c.showDoneQuestlines = !c.showDoneQuestlines;
  renderJourney(cid);
  scheduleSave();
}
/* Each questline links to its FFXIV wiki page. The genre name is the page title for 79 of
   the 82 genres (checked 18 October 2026 against the local wiki copy); the other three are
   named here. A new genre from a patch links by its own name, which the wiki usually uses. */
const WIKI_TITLE_FOR_GENRE = {
  "Garlemald's Machinations": "Garlemald's Machinations Quests",
  'Tales from the Calamity': 'Tales from the Calamity Quests',
  'The Occult Crescent': 'Occult Crescent'
};
/* The click counter (tools/go-worker), which counts a click by page and day only and then
   redirects to the wiki. Empty until the Worker is deployed: the links then go straight to
   the wiki. When the DNS moves to Cloudflare this becomes https://go.legendmemoria.org. */
const WIKI_GO_BASE = '';
function wikiUrl(name){
  const title = (WIKI_TITLE_FOR_GENRE[name] || name).replace(/ /g, '_');
  return WIKI_GO_BASE
    ? WIKI_GO_BASE + '/wiki/' + encodeURIComponent(title)
    : 'https://ffxiv.consolegameswiki.com/mediawiki/index.php?title=' + encodeURIComponent(title);
}

/* ---- Mount speed ----
   Every zone with a speed upgrade, in the order of the game's Mount Speed window
   (TM_MOUNT_SPEED). One star for each level the character has, an empty star for each
   level still to get. A zone with aetherytes and none attuned is "not reached", as the
   game's window leaves it out; a zone with no aetheryte (Bozja, the Occult Crescent)
   always shows its stars. */
function speedZones(){
  if(typeof TM_MOUNT_SPEED === 'undefined') return [];
  return Object.keys(TM_MOUNT_SPEED).map(id => {
    const [name, region, top, ex, order, aetherytes] = TM_MOUNT_SPEED[id];
    return {id, name, region: region === '???' ? 'Other areas' : region, top, ex, order, aetherytes};
  }).sort((a, b) => a.ex - b.ex || a.order - b.order);
}
/* Null when the export had no mount speed. Otherwise the totals and one group per
   expansion, each a run of region headings and zone rows in window order. */
function mountSpeedView(c){
  const speeds = c.tmCollections.mountSpeed;
  if(!speeds) return null;
  const attuned = ownedSet(c, 'aetherytes');
  const reached = z => (speeds[z.id] || 0) > 0 || !z.aetherytes.length || z.aetherytes.some(a => attuned.has(a));
  const shown = speedZones().filter(z => inRoute(z.ex));
  const groups = [];
  let g = null, lastRegion = null;
  shown.forEach(z => {
    if(!g || g.ex !== z.ex){ g = {ex: z.ex, name: EXPANSION_NAMES[z.ex] || 'Other', items: []}; groups.push(g); lastRegion = null; }
    if(z.region !== lastRegion){ g.items.push({key: 'r' + z.id, region: z.region}); lastRegion = z.region; }
    const have = speeds[z.id] || 0;
    g.items.push({key: z.id, name: z.name, have, top: z.top, off: Math.max(0, z.top - have), reached: reached(z)});
  });
  return {top: shown.filter(z => (speeds[z.id] || 0) >= z.top).length, count: shown.length,
          gems: c.tmCollections.gemstones, groups};
}

/* ---- Relics ----
   Weapons and Tools frames, with one panel per relic line (relics-vue.js). The lines
   and their stages are RELIC_STAGES (relic-stages.js), generated by Time Memoria's
   tools/Build-RelicStages.py from the same table the plugin uses, so a stage letter
   means the same stage on both sides.

   Each job's stage comes from the collections export's "relics" string: one code per
   line and job, the highest stage held anywhere the game lets Time Memoria read
   (armoury chest, bags, saddlebag, retainers, glamour dresser). "RSWAR-A" is
   Resistance Weapons, Warrior, stage A (the first). */
const RELIC_WEAPON_LINES = ['PH', 'FG', 'EX', 'MV', 'RS', 'EU', 'AN', 'DD', 'ZD'];
const RELIC_TOOL_LINES = ['CO', 'SP', 'RP', 'SK', 'LU'];
/* The jobs of each line, in role order: the grid's columns. The export lists only what
   a character holds, so it cannot supply the jobs that hold nothing. A new relic line
   needs an entry here. */
const RELIC_TOOL_JOBS = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL', 'MIN', 'BTN', 'FSH'];
const RELIC_JOBS = {
  ZD: ['PLD', 'WAR', 'WHM', 'SCH', 'MNK', 'DRG', 'NIN', 'BRD', 'BLM', 'SMN'],
  AN: ['PLD', 'WAR', 'DRK', 'WHM', 'SCH', 'AST', 'MNK', 'DRG', 'NIN', 'BRD', 'MCH', 'BLM', 'SMN'],
  EU: ['PLD', 'WAR', 'DRK', 'WHM', 'SCH', 'AST', 'MNK', 'DRG', 'NIN', 'SAM', 'BRD', 'MCH', 'BLM', 'SMN', 'RDM'],
  RS: ['PLD', 'WAR', 'DRK', 'GNB', 'WHM', 'SCH', 'AST', 'MNK', 'DRG', 'NIN', 'SAM', 'BRD', 'MCH', 'DNC', 'BLM', 'SMN', 'RDM'],
  MV: ['PLD', 'WAR', 'DRK', 'GNB', 'WHM', 'SCH', 'AST', 'SGE', 'MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'BRD', 'MCH', 'DNC', 'BLM', 'SMN', 'RDM'],
  PH: ['PLD', 'WAR', 'DRK', 'GNB', 'WHM', 'SCH', 'AST', 'SGE', 'MNK', 'DRG', 'NIN', 'SAM', 'RPR', 'VPR', 'BRD', 'MCH', 'DNC', 'BLM', 'SMN', 'RDM', 'PCT'],
  CO: RELIC_TOOL_JOBS, SP: RELIC_TOOL_JOBS, RP: RELIC_TOOL_JOBS, SK: RELIC_TOOL_JOBS, LU: RELIC_TOOL_JOBS
};
RELIC_JOBS.DD = RELIC_JOBS.PH;
RELIC_JOBS.FG = RELIC_JOBS.EX = RELIC_JOBS.PH.concat('BLU');
RELIC_JOBS.GW = RELIC_JOBS.AN;

/* Armor: one panel per FFXIV Collect type, newest first. A panel's rows are the five
   slots. Its columns are the seven roles, or the jobs of a set made per job. "line" and
   "stage" are the export's codes: "EHF-C" is line E, slot H, role F, stage C (2). */
const RELIC_SLOTS = [['H', 'Head'], ['B', 'Body'], ['G', 'Hands'], ['L', 'Legs'], ['F', 'Feet']];
const RELIC_ROLES = [['F', 'Fending'], ['M', 'Maiming'], ['S', 'Striking'], ['A', 'Aiming'], ['O', 'Scouting'], ['H', 'Healing'], ['C', 'Casting']];
const RELIC_ARMOR_PANELS = [
  ['Phantom Vision +3', 'P', 3], ['Phantom Vision +2', 'P', 2], ['Phantom Vision +1', 'P', 1], ['Phantom Vision', 'P', 0],
  ["Arcanaut's Armor +2", 'A', 2], ["Arcanaut's Armor +1", 'A', 1], ["Arcanaut's Armor", 'A', 0],
  ["Blade's Armor", 'D', 0], ["Augmented Law's Order", 'L', 1], ["Law's Order", 'L', 0],
  ['Augmented Bozjan Armor', 'B', 1], ['Bozjan Armor', 'B', 0], ['Idealized Armor', 'I', 0],
  ['Elemental Armor +2', 'E', 2], ['Elemental Armor +1', 'E', 1], ['Elemental Armor', 'E', 0],
  ['Eureka Anemos Armor', 'J', 3], ['Eureka Job Armor +2', 'J', 2], ['Eureka Job Armor +1', 'J', 1], ['Eureka Job Armor', 'J', 0]
];
const RELIC_ARMOR_JOBS = {I: RELIC_JOBS.RS, J: RELIC_JOBS.EU};
/* A later piece uses up an earlier one, so holding it also counts the earlier one. All
   links are from the game's SpecialShop sheet, checked on 5 November 2026.
   Deep Dungeon: only these stages are made from another. GARO armor has no links.
   Other lines: a stage uses up the stage before it, and these use up a second line too. */
const RELIC_EVERY_STAGE_LINES = ['DD', 'G'];
const RELIC_DD_MADE_FROM = {1: 0, 4: 3, 6: 5};
const RELIC_ALSO_USES = {L: {1: ['B', 1]}, P: {1: ['A', 1], 2: ['A', 2], 3: ['A', 2]}};
/* The stages a line counts, where that is not all of them. These two lines follow
   FFXIV Collect's totals. Eureka (225) leaves out the Antiquated weapons. Cosmic (44)
   counts four tiers per job, from the first tool of each tier. Checked on 4 November
   2026 against one character: 3 of 44 from COCRP-M and COGSM-O. */
const RELIC_COUNTED_STAGES = {
  EU: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  CO: [8, 13, 16, 19]
};
function relicLineCodes(){ return typeof RELIC_STAGES === 'undefined' ? [] : Object.keys(RELIC_STAGES); }
/* Newest expansion first, the order of FFXIV Collect's pages. */
function relicLinesOfKind(kind){
  return {weapons: RELIC_WEAPON_LINES, tools: RELIC_TOOL_LINES, garo: ['GW']}[kind] || [];
}
function relicCountedStages(code){
  return RELIC_COUNTED_STAGES[code] || RELIC_STAGES[code].stages.map((_, i) => i);
}
/* One line for the panel: an item per job per counted stage. A held stage also counts
   every stage before it, because a relic upgrades from the one before. */
function relicLineView(code, held){
  const line = RELIC_STAGES[code], jobs = RELIC_JOBS[code], counted = relicCountedStages(code);
  const rows = counted.map(stage => {
    const [name, il] = line.stages[stage];
    return {name, il, cells: jobs.map(j => ({j, on: relicIsHeld(held, code, j, stage),
      title: (TM_JOB_NAMES[j] || j) + ' · ' + relicStageName(code, j, stage) + (il ? ' · item level ' + il : '')}))};
  });
  return relicPanel(code, line.name, 'Stage', jobs, rows);
}
function relicPanel(code, name, corner, cols, rows){
  return {code, name, corner, jobs: cols, rows, total: cols.length * rows.length,
    have: rows.reduce((n, r) => n + r.cells.filter(x => x.on).length, 0)};
}
/* One item is held, or used up to make an item that is held. */
function relicIsHeld(held, line, key, stage){
  if(line === 'DD'){
    const all = held.DD || {};
    if(all[key + '@' + stage]) return true;
    return Object.keys(RELIC_DD_MADE_FROM).some(to => RELIC_DD_MADE_FROM[to] === stage && all[key + '@' + to]);
  }
  if(line === 'G') return !!(held.G || {})[key + '@' + stage];
  const mine = (held[line] || {})[key];
  if(mine !== undefined && mine >= stage) return true;
  return Object.keys(RELIC_ALSO_USES).some(later => {
    const top = (held[later] || {})[key];
    if(top === undefined) return false;
    return Object.keys(RELIC_ALSO_USES[later]).some(s => +s <= top
      && RELIC_ALSO_USES[later][s][0] === line && RELIC_ALSO_USES[later][s][1] >= stage);
  });
}
function relicArmorPanel(name, line, stage, held){
  const jobs = RELIC_ARMOR_JOBS[line];
  const cols = jobs || RELIC_ROLES.map(r => r[1]), keys = jobs || RELIC_ROLES.map(r => r[0]);
  const rows = RELIC_SLOTS.map(([slot, slotName]) => ({name: slotName, cells: keys.map((k, i) => ({j: cols[i],
    on: relicIsHeld(held, line, slot + k, stage), title: name + ' · ' + slotName + ' · ' + (TM_JOB_NAMES[cols[i]] || cols[i])}))}));
  return relicPanel(line + stage, name, 'Slot', cols, rows);
}
function relicGaroArmorPanel(held){
  const cols = RELIC_SLOTS.map(s => s[1]);
  const rows = RELIC_GARO_SETS.map((set, stage) => ({name: set, cells: RELIC_SLOTS.map(([slot, slotName]) => ({j: slotName,
    on: relicIsHeld(held, 'G', slot, stage), title: set + ' · ' + slotName}))}));
  return relicPanel('G', 'GARO Armor', 'Set', cols, rows);
}
function relicPanels(kind, held){
  if(kind === 'armor') return RELIC_ARMOR_PANELS.map(([name, line, stage]) => relicArmorPanel(name, line, stage, held));
  const lines = relicLinesOfKind(kind).map(code => relicLineView(code, held));
  return kind === 'garo' ? lines.concat(relicGaroArmorPanel(held)) : lines;
}

/* "ZDWAR-C EHF-B JHPLD-A" -> {ZD:{WAR:2}, E:{HF:1}, J:{HPLD:0}}. Null when the export
   had no "relics" (an export from before Time Memoria read them); {} when it held none.
   The length of the code gives its shape:
     5 letters: J or I, slot, job (armor per job), else a two-letter line and a job.
     3 letters: line, slot, role (armor per role).
     2 letters: G, slot (GARO armor, where the stage letter is the set).
   A line where every stage has its own code stores key@stage instead. */
function heldRelics(c){
  const s = c.tmCollections && c.tmCollections.relics;
  if(typeof s !== 'string') return null;
  const out = {};
  s.split(/\s+/).forEach(code => {
    const m = /^([A-Z]{2,5})-([A-Z])$/.exec(code);
    if(!m || m[1].length === 4) return;
    const name = m[1], stage = m[2].charCodeAt(0) - 65;
    const two = name.length === 5 && name[0] !== 'J' && name[0] !== 'I';
    const line = two ? name.slice(0, 2) : name[0], key = two ? name.slice(2) : name.slice(1);
    const into = out[line] = out[line] || {};
    if(RELIC_EVERY_STAGE_LINES.includes(line)) into[key + '@' + stage] = true;
    else into[key] = stage;
  });
  return out;
}

/* Rail meter: weapon items complete of all weapon items, the Weapons frame's totals. */
function relicsMeter(c){
  if(!hasCollections(c)) return null;
  const held = heldRelics(c);
  if(held === null) return null;
  const lines = relicLinesOfKind('weapons').map(code => relicLineView(code, held));
  const all = lines.reduce((n, l) => n + l.total, 0);
  return all ? Math.round(lines.reduce((n, l) => n + l.have, 0) / all * 100) : null;
}

/* A stage's name for one job. Cosmic tools are named per class ("Cosmic Saw v1.1"),
   from the Cosmic panel's table, which has the same 20 stages in the same order. */
function relicStageName(code, job, stage){
  const jobName = TM_JOB_NAMES[job] || job;
  if(code === 'CO' && typeof cosmicToolName === 'function'){
    const named = cosmicToolName(jobName, stage);
    if(named) return named;
  }
  return RELIC_STAGES[code].stages[stage] ? RELIC_STAGES[code].stages[stage][0] : 'Stage ' + (stage + 1);
}

/* Journey, drawn by Vue (boxState in app.js), the same way as Collections: DATA is
   not reactive, so renderJourney bumps state.tick, and applyFrames runs after the
   draw. The Relics frames are RelicsPanel (relics-vue.js), which take the tick as a
   prop, so an open panel stays open when renderJourney runs. */
const JourneyPanel = {
  components: {EmptyTm, GenreList, RelicsPanel},
  props: ['state'],
  setup(props){
    const view = Vue.computed(() => {
      const tick = props.state.tick;
      const c = getChar(props.state.cid);
      if(!c || !hasCollections(c)) return null;
      const L = c.tmCollections.lists;

      // Duty grid: cleared of all, per expansion and type.
      const cleared = new Set(L.dutiesDone || []);
      const byExp = {};
      Object.keys(TM_DUTIES).forEach(id => {
        const [name, type, ex] = TM_DUTIES[id];
        if(DUTY_TYPES.indexOf(type) < 0 || !inRoute(ex)) return;
        const exp = EXPANSION_NAMES[ex] || 'Other';
        ((byExp[exp] = byExp[exp] || {})[type] = byExp[exp][type] || []).push({name, done: cleared.has(+id)});
      });
      const duties = EXPANSION_NAMES.filter(e => byExp[e]).map(exp => {
        const types = DUTY_TYPES.filter(t => byExp[exp][t]).map(t => {
          const items = byExp[exp][t];
          return {t, items, done: items.filter(d => d.done).length, all: items.length};
        });
        return {exp, types, done: types.reduce((n, t) => n + t.done, 0), all: types.reduce((n, t) => n + t.all, 0)};
      });

      const W = TM_WORLD, zonesDone = new Set(L.currentZones || []), porters = new Set(L.porters || []);
      const explore = {
        rows: [
          ['Sightseeing vistas', (L.sightseeing||[]).length, W.sightseeing],
          ['Aether currents', (L.currents||[]).length, W.currents],
          ['Current zones complete', zonesDone.size, Object.keys(W.zones).length],
          ['Aetherytes attuned', (L.aetherytes||[]).length, W.aetherytes],
          ['Porter stops registered', W.porters.filter(id => porters.has(id)).length, W.porters.length]
        ].map(([label, have, total]) => ({label, have, total})),
        zones: Object.keys(W.zones).map(id => ({id, name: W.zones[id], done: zonesDone.has(+id)}))
      };

      return {tick, c, asOf: collectionsAsOfText(c),
        questlines: genreList(c, info => info.category !== 'Seasonal Events'),
        seasonal: genreList(c, info => info.category === 'Seasonal Events'),
        duties, explore, speed: mountSpeedView(c)};
    });
    return {view, jrPct, toggle: () => toggleDoneQuestlines(props.state.cid)};
  },
  template: `
    <empty-tm v-if="!view" what="journey data"></empty-tm>
    <template v-else>
      <div class="jr-note">{{ view.asOf }}</div>
      <div data-frame="questlines"><genre-list :list="view.questlines" @toggle="toggle"></genre-list></div>
      <div data-frame="relics"><relics-panel :c="view.c" kind="weapons" :tick="view.tick"></relics-panel></div>
      <div data-frame="relic-armor"><relics-panel :c="view.c" kind="armor" :tick="view.tick"></relics-panel></div>
      <div data-frame="relic-tools"><relics-panel :c="view.c" kind="tools" :tick="view.tick"></relics-panel></div>
      <div data-frame="relic-garo"><relics-panel :c="view.c" kind="garo" :tick="view.tick"></relics-panel></div>
      <div data-frame="seasonal"><div class="jr-note">Every seasonal quest ever offered, by event. Many events reuse their quests each year.</div><genre-list :list="view.seasonal" @toggle="toggle"></genre-list></div>
      <div data-frame="duties"><div class="jr-note">Cleared means the game recorded a completion. Quest battles and deep dungeon floors are not counted here.</div>
        <template v-for="d in view.duties" :key="d.exp">
          <div class="subhead">{{ d.exp }} · {{ d.done }} of {{ d.all }} cleared</div>
          <template v-for="t in d.types" :key="t.t">
            <div class="jr-note" style="margin:4px 0 2px">{{ t.t }} · {{ t.done }} / {{ t.all }}</div>
            <div class="jr-duties"><span v-for="(x, i) in t.items" :key="i" :class="{done: x.done}" :title="x.name">{{ x.name }}</span></div>
          </template>
        </template>
      </div>
      <div data-frame="exploration">
        <div class="jr-grid">
          <div v-for="r in view.explore.rows" :key="r.label" class="jr-row"><span>{{ r.label }}</span><span class="jr-v">{{ r.have }} / {{ r.total }}</span><div class="jr-bar"><i :style="{width: jrPct(r.have, r.total) + '%'}"></i></div></div>
        </div>
        <div class="subhead" style="margin-top:10px">Flying zones</div><div class="jr-duties"><span v-for="z in view.explore.zones" :key="z.id" :class="{done: z.done}">{{ z.name }}</span></div>
      </div>
      <div data-frame="mountspeed">
        <div v-if="!view.speed" class="jr-note">No mount speed yet. Import a newer Tales of Milestones export (Copy everything).</div>
        <template v-else>
          <div class="jr-grid">
            <div class="jr-row"><span>Zones at top speed</span><span class="jr-v">{{ view.speed.top }} / {{ view.speed.count }}</span><div class="jr-bar"><i :style="{width: jrPct(view.speed.top, view.speed.count) + '%'}"></i></div></div>
            <div v-if="view.speed.gems != null" class="jr-row"><span>Bicolor gemstones</span><span class="jr-v">{{ view.speed.gems.toLocaleString() }} / 1,500</span><div class="jr-bar"><i :style="{width: jrPct(view.speed.gems, 1500) + '%'}"></i></div></div>
          </div>
          <div class="jr-note">From Shadowbringers on, a zone's riding map is bought with bicolor gemstones from that zone's gemstone trader. In Endwalker and Dawntrail zones the map needs Shared FATE rank 2 in that zone.</div>
          <template v-for="g in view.speed.groups" :key="g.ex">
            <div class="subhead">{{ g.name }}</div>
            <div class="ms-list"><template v-for="z in g.items" :key="z.key">
              <div v-if="z.region" class="ms-region">{{ z.region }}</div>
              <div v-else class="ms-row" :class="{full: z.have >= z.top}"><span>{{ z.name }}</span><span class="ms-stars" :title="z.have + ' of ' + z.top"><template v-if="z.reached"><span v-for="n in z.have" :key="'on' + n" class="ms-on">★</span><span v-for="n in z.off" :key="'off' + n" class="ms-off">☆</span></template><span v-else class="jr-note">not reached</span></span></div>
            </template></div>
          </template>
        </template>
      </div>
    </template>`
};
function renderJourney(cid){
  const state = boxState(cid + '-journey', JourneyPanel);
  if(!state) return;
  Object.assign(state, {cid, tick: (state.tick || 0) + 1});
  Vue.nextTick(() => { if(DATA.activeId === cid && activeTab(cid) === 'journey') applyFrames(cid, 'journey'); });
}
