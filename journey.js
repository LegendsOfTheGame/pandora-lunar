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
/* Plain text for Vue; collectionsAsOf is the escaped form for HTML strings. */
function collectionsAsOfText(c){
  if(!hasCollections(c)) return '';
  const when = c.tmCollections.asOf ? fmtTmTimestamp(c.tmCollections.asOf) : 'an earlier import';
  return `From Tales of Milestones, exported ${when}${c.tmCollections.game ? ' · game build ' + c.tmCollections.game : ''}.`;
}
function collectionsAsOf(c){ return esc(collectionsAsOfText(c)); }
function emptyCollectionsHTML(what){
  return `<div class="jr-note">No ${what} yet. In Tales of Milestones press <b>Copy everything</b> (or type <code>/tm full</code>), then click <button class="link-btn" onclick="toggleTmImportPanel()">Import from Tales of Milestones</button> and paste it.</div>`;
}

/* ---- Collections ---- */
let collOwnFilter = 'all';
function setCollFilter(cid, v){ collOwnFilter = v; renderCollections(cid); }

/* Drawn by Vue (boxState in app.js). DATA is not reactive, so renderCollections
   bumps state.tick and the panel works its lists out again. applyFrames still
   hides the [data-frame] blocks, so it runs after Vue has drawn them. */
const CollectionsPanel = {
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
    return {view, toggleTmImportPanel, setFilter: v => setCollFilter(props.state.cid, v)};
  },
  template: `
    <div v-if="!view" class="jr-note">No collections yet. In Tales of Milestones press <b>Copy everything</b> (or type <code>/tm full</code>), then click <button class="link-btn" @click="toggleTmImportPanel()">Import from Tales of Milestones</button> and paste it.</div>
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
function genreListHTML(rows, c){
  const done = rows.filter(r => r.total > 0 && r.have === r.total).length;
  const shown = c.showDoneQuestlines ? rows : rows.filter(r => r.have !== r.total);
  const note = done
    ? `<div class="hidden-note"><span>${done} complete${c.showDoneQuestlines ? '' : ' &mdash; hidden'}</span><button class="link-btn" onclick="toggleDoneQuestlines('${c.id}')">${c.showDoneQuestlines ? 'hide them' : 'show them'}</button></div>`
    : '';
  return (shown.length ? listRowsHTML(shown) : '<div class="jr-note">Every questline here is complete.</div>') + note;
}
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
function listRowsHTML(rows){
  return `<div class="jr-grid">${rows.map(r =>
    `<div class="jr-row${r.have === r.total ? ' full' : ''}"><a class="jr-link" href="${wikiUrl(r.g)}" target="_blank" rel="noopener noreferrer" title="Open the wiki page in a new tab">${esc(r.g)}</a><span class="jr-v">${r.have} / ${r.total}</span>
      <div class="jr-bar"><i style="width:${jrPct(r.have, r.total)}%"></i></div></div>`).join('')}</div>`;
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
function mountSpeedHTML(c){
  const speeds = c.tmCollections.mountSpeed;
  if(!speeds) return '<div class="jr-note">No mount speed yet. Import a newer Tales of Milestones export (Copy everything).</div>';
  const attuned = ownedSet(c, 'aetherytes');
  const zones = speedZones();
  const reached = z => (speeds[z.id] || 0) > 0 || !z.aetherytes.length || z.aetherytes.some(a => attuned.has(a));
  const shown = zones.filter(z => inRoute(z.ex));
  const top = shown.filter(z => (speeds[z.id] || 0) >= z.top).length;
  const gems = c.tmCollections.gemstones;

  let html = `<div class="jr-grid">
      <div class="jr-row"><span>Zones at top speed</span><span class="jr-v">${top} / ${shown.length}</span><div class="jr-bar"><i style="width:${jrPct(top, shown.length)}%"></i></div></div>
      ${gems == null ? '' : `<div class="jr-row"><span>Bicolor gemstones</span><span class="jr-v">${gems.toLocaleString()} / 1,500</span><div class="jr-bar"><i style="width:${jrPct(gems, 1500)}%"></i></div></div>`}
    </div>
    <div class="jr-note">From Shadowbringers on, a zone's riding map is bought with bicolor gemstones from that zone's gemstone trader. In Endwalker and Dawntrail zones the map needs Shared FATE rank 2 in that zone.</div>`;
  let lastEx = null, lastRegion = null;
  shown.forEach(z => {
    if(z.ex !== lastEx){
      if(lastEx !== null) html += '</div>';
      html += `<div class="subhead">${esc(EXPANSION_NAMES[z.ex] || 'Other')}</div><div class="ms-list">`;
      lastEx = z.ex; lastRegion = null;
    }
    if(z.region !== lastRegion){ html += `<div class="ms-region">${esc(z.region)}</div>`; lastRegion = z.region; }
    const have = speeds[z.id] || 0;
    const stars = reached(z)
      ? '<span class="ms-on">★</span>'.repeat(have) + '<span class="ms-off">☆</span>'.repeat(Math.max(0, z.top - have))
      : '<span class="jr-note">not reached</span>';
    html += `<div class="ms-row${have >= z.top ? ' full' : ''}"><span>${esc(z.name)}</span><span class="ms-stars" title="${have} of ${z.top}">${stars}</span></div>`;
  });
  if(lastEx !== null) html += '</div>';
  return html;
}

/* ---- Relics ----
   One frame per expansion, each listing that expansion's relic lines. The lines and
   their stages are RELIC_STAGES (relic-stages.js), generated by Time Memoria's
   tools/Build-RelicStages.py from the same table the plugin uses, so a stage letter
   means the same stage on both sides.

   Each job's stage comes from the collections export's "relics" string: one code per
   line and job, the highest stage held anywhere the game lets Time Memoria read
   (armoury chest, bags, saddlebag, retainers, glamour dresser). "RSWAR-A" is
   Resistance Weapons, Warrior, stage A (the first). */
function isRelicGenre(info, g){
  return info.category === 'Weapon Enhancement Sidequests' || /^(Splendorous Tools|Manderville Weapons)$/.test(g);
}
// The TM_QUEST_GENRES name for each line's quests, or null when its quests share a
// genre with other content (Skysteel sits inside Ishgardian Restoration) or it has
// none (cosmic tools are upgraded at an NPC).
const RELIC_GENRE = {ZD:'Zodiac Weapons', AN:'Anima Weapons', EU:'The Forbidden Land, Eureka',
  RS:'Resistance Weapons', SK:null, MV:'Manderville Weapons', SP:'Splendorous Tools', PH:'Phantom Weapons', CO:null};
function relicLineCodes(){ return typeof RELIC_STAGES === 'undefined' ? [] : Object.keys(RELIC_STAGES); }
function relicExpansions(){ return [...new Set(relicLineCodes().map(k => RELIC_STAGES[k].ex))].sort((a, b) => a - b); }
function relicFrameKey(ex){ return 'relic-' + frameSlug(EXPANSION_NAMES[ex]); }

/* "ZDWAR-C RSWAR-A" -> {ZD:{WAR:2}, RS:{WAR:0}}. Null when the export had no
   "relics" (an export from before Time Memoria read them); {} when it held none. */
function heldRelics(c){
  const s = c.tmCollections && c.tmCollections.relics;
  if(typeof s !== 'string') return null;
  const out = {};
  s.split(/\s+/).forEach(code => {
    const m = /^([A-Z]{2})([A-Z]{3})-([A-Z])$/.exec(code);
    if(m) (out[m[1]] = out[m[1]] || {})[m[2]] = m[3].charCodeAt(0) - 65;
  });
  return out;
}

/* Rail meter: relic quests done of all relic quests. */
function relicsMeter(c){
  if(!hasCollections(c)) return null;
  const rows = genreRows(c, isRelicGenre);
  const all = rows.reduce((n, r) => n + r.total, 0);
  return all ? Math.round(rows.reduce((n, r) => n + r.have, 0) / all * 100) : null;
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

// Each expansion's relic lines are drawn by Vue: see relics-vue.js.

function renderJourney(cid){
  const c = getChar(cid);
  const box = document.getElementById(cid + '-journey');
  if(!box) return;
  unmountRelics(cid);
  if(!hasCollections(c)){ box.innerHTML = emptyCollectionsHTML('journey data'); return; }
  const L = c.tmCollections.lists;
  const asOf = `<div class="jr-note">${collectionsAsOf(c)}</div>`;

  const questlines = genreRows(c, (info, g) => !isRelicGenre(info, g) && info.category !== 'Seasonal Events');
  const relics = genreRows(c, isRelicGenre);
  const seasonal = genreRows(c, info => info.category === 'Seasonal Events');

  // Duty grid: cleared of all, per expansion and type.
  const cleared = new Set(L.dutiesDone || []);
  const byExp = {};
  Object.keys(TM_DUTIES).forEach(id => {
    const [name, type, ex] = TM_DUTIES[id];
    if(DUTY_TYPES.indexOf(type) < 0 || !inRoute(ex)) return;
    const exp = EXPANSION_NAMES[ex] || 'Other';
    ((byExp[exp] = byExp[exp] || {})[type] = byExp[exp][type] || []).push({name, done: cleared.has(+id)});
  });
  const dutyHTML = EXPANSION_NAMES.filter(e => byExp[e]).map(exp => {
    const types = DUTY_TYPES.filter(t => byExp[exp][t]);
    const done = types.reduce((n, t) => n + byExp[exp][t].filter(d => d.done).length, 0);
    const all = types.reduce((n, t) => n + byExp[exp][t].length, 0);
    return `<div class="subhead">${esc(exp)} &middot; ${done} of ${all} cleared</div>` + types.map(t =>
      `<div class="jr-note" style="margin:4px 0 2px">${esc(t)} &middot; ${byExp[exp][t].filter(d => d.done).length} / ${byExp[exp][t].length}</div>
       <div class="jr-duties">${byExp[exp][t].map(d => `<span class="${d.done ? 'done' : ''}" title="${esc(d.name)}">${esc(d.name)}</span>`).join('')}</div>`).join('');
  }).join('');

  const W = TM_WORLD, zonesDone = new Set(L.currentZones || []), porters = new Set(L.porters || []);
  const realPorters = W.porters.filter(id => porters.has(id)).length;
  const zoneRows = Object.keys(W.zones).map(id =>
    `<span class="${zonesDone.has(+id) ? 'done' : ''}">${esc(W.zones[id])}</span>`).join('');
  const explore = `<div class="jr-grid">
      <div class="jr-row"><span>Sightseeing vistas</span><span class="jr-v">${(L.sightseeing||[]).length} / ${W.sightseeing}</span><div class="jr-bar"><i style="width:${jrPct((L.sightseeing||[]).length, W.sightseeing)}%"></i></div></div>
      <div class="jr-row"><span>Aether currents</span><span class="jr-v">${(L.currents||[]).length} / ${W.currents}</span><div class="jr-bar"><i style="width:${jrPct((L.currents||[]).length, W.currents)}%"></i></div></div>
      <div class="jr-row"><span>Current zones complete</span><span class="jr-v">${zonesDone.size} / ${Object.keys(W.zones).length}</span><div class="jr-bar"><i style="width:${jrPct(zonesDone.size, Object.keys(W.zones).length)}%"></i></div></div>
      <div class="jr-row"><span>Aetherytes attuned</span><span class="jr-v">${(L.aetherytes||[]).length} / ${W.aetherytes}</span><div class="jr-bar"><i style="width:${jrPct((L.aetherytes||[]).length, W.aetherytes)}%"></i></div></div>
      <div class="jr-row"><span>Porter stops registered</span><span class="jr-v">${realPorters} / ${W.porters.length}</span><div class="jr-bar"><i style="width:${jrPct(realPorters, W.porters.length)}%"></i></div></div>
    </div>
    <div class="subhead" style="margin-top:10px">Flying zones</div><div class="jr-duties">${zoneRows}</div>`;

  const speedHTML = mountSpeedHTML(c);

  box.innerHTML = asOf
    + `<div data-frame="questlines">${genreListHTML(questlines, c)}</div>`
    + `<div data-frame="relics">${genreListHTML(relics, c)}</div>`
    + relicExpansions().map(ex => `<div data-frame="${relicFrameKey(ex)}"><div data-relic-ex="${ex}"></div></div>`).join('')
    + `<div data-frame="seasonal"><div class="jr-note">Every seasonal quest ever offered, by event. Many events reuse their quests each year.</div>${genreListHTML(seasonal, c)}</div>`
    + `<div data-frame="duties"><div class="jr-note">Cleared means the game recorded a completion. Quest battles and deep dungeon floors are not counted here.</div>${dutyHTML}</div>`
    + `<div data-frame="exploration">${explore}</div>`
    + `<div data-frame="mountspeed">${speedHTML}</div>`;
  mountRelics(cid, box);
  if(DATA.activeId === cid && activeTab(cid) === 'journey') applyFrames(cid, 'journey');
}
