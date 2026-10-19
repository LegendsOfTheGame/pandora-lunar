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
  {key:'facewear',    label:'Facewear', note:'Counted by style, the way the game’s Facewear window counts.'}
];
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
    gemstones: Number.isFinite(src.gemstones) ? src.gemstones : null };
  return true;
}

/* One diff row per list that changed, for the import preview. */
function tmCollectionsDiffRows(p, c){
  const src = tmCollectionsOf(p);
  if(!src) return [];
  const old = (c.tmCollections || {}).lists || {};
  const rows = [];
  const label = {questsDone:'Quests done', dutiesDone:'Duties cleared', sightseeing:'Sightseeing vistas', currents:'Aether currents',
                 currentZones:'Current zones complete', aetherytes:'Aetherytes', porters:'Porter stops', fish:'Fish', spearfish:'Spearfish', curios:'Curiosities'};
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
function collectionsAsOf(c){
  if(!hasCollections(c)) return '';
  const when = c.tmCollections.asOf ? fmtTmTimestamp(c.tmCollections.asOf) : 'an earlier import';
  return `From Time Memoria, exported ${when}${c.tmCollections.game ? ' &middot; game build ' + esc(c.tmCollections.game) : ''}.`;
}
function emptyCollectionsHTML(what){
  return `<div class="jr-note">No ${what} yet. In Time Memoria press <b>Copy everything</b> (or type <code>/tm full</code>), then click <button class="link-btn" onclick="toggleTmImportPanel()">Import from Time Memoria</button> and paste it.</div>`;
}

/* ---- Collections ---- */
let collOwnFilter = 'all';
function setCollFilter(cid, v){ collOwnFilter = v; renderCollections(cid); }

function renderCollections(cid){
  const c = getChar(cid);
  const box = document.getElementById(cid + '-coll');
  if(!box) return;
  if(!hasCollections(c)){ box.innerHTML = emptyCollectionsHTML('collections'); return; }
  const source = (typeof COLLECTION_LISTS !== 'undefined' && COLLECTION_LISTS.lists) || {};
  const lists = {};
  Object.keys(source).forEach(k => lists[k] = source[k].filter(r => inRoute(patchExpansion(r[2]))));

  const overview = COLLECTION_KINDS.map(k => {
    const all = lists[k.key] || [], owned = ownedSet(c, k.key);
    const have = all.filter(r => owned.has(r[0])).length;
    return `<div class="jr-row"><span>${esc(k.label)}</span><span class="jr-v">${have} / ${all.length}</span>
      <div class="jr-bar"><i style="width:${jrPct(have, all.length)}%"></i></div></div>`;
  }).join('');
  const fish = ownedSet(c, 'fish').size, spear = ownedSet(c, 'spearfish').size, curios = ownedSet(c, 'curios').size;

  const chips = ['all','owned','missing'].map(v =>
    `<button class="tab-btn${collOwnFilter===v?' active':''}" onclick="setCollFilter('${cid}','${v}')">${v[0].toUpperCase()+v.slice(1)}</button>`).join('');

  const tables = COLLECTION_KINDS.map(k => {
    const all = lists[k.key] || [], owned = ownedSet(c, k.key);
    const rows = all.filter(r => collOwnFilter === 'all' || (collOwnFilter === 'owned') === owned.has(r[0]));
    return `<div data-frame="${frameSlug(k.key)}">
      <div class="subhead">${esc(k.label)} &middot; ${all.filter(r => owned.has(r[0])).length} of ${all.length} owned${k.note ? ' &middot; ' + esc(k.note) : ''}</div>
      <div class="jr-chips">${chips}</div>
      <div class="jr-scroll"><table class="jr-table"><tr><th></th><th>Name</th><th>Patch</th><th>How to get it</th></tr>${
        rows.map(r => `<tr class="${owned.has(r[0]) ? 'have' : ''}"><td>${owned.has(r[0]) ? '&#10003;' : ''}</td><td>${esc(r[1])}</td><td class="jr-v">${esc(r[2])}</td><td class="jr-note">${esc(r[3] ? r[3] + ' · ' + r[4] : r[4])}</td></tr>`).join('')
      }</table></div></div>`;
  }).join('');

  box.innerHTML = `<div data-frame="overview">
      <div class="jr-note">${collectionsAsOf(c)} Totals are FFXIV Collect&rsquo;s obtainable items (list built ${esc((typeof COLLECTION_LISTS !== 'undefined' && COLLECTION_LISTS.built) || '?')}).</div>
      <div class="jr-grid">${overview}</div>
      <div class="jr-note" style="margin-top:8px">Not on Collect: ${fish} fish &middot; ${spear} spearfish &middot; ${curios} curiosities.</div>
    </div>${tables}`;
  if(DATA.activeId === cid && activeTab(cid) === 'collections') applyFrames(cid, 'collections');
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
  if(!speeds) return '<div class="jr-note">No mount speed yet. Import a newer Time Memoria export (Copy everything).</div>';
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

function renderJourney(cid){
  const c = getChar(cid);
  const box = document.getElementById(cid + '-journey');
  if(!box) return;
  if(!hasCollections(c)){ box.innerHTML = emptyCollectionsHTML('journey data'); return; }
  const L = c.tmCollections.lists;
  const asOf = `<div class="jr-note">${collectionsAsOf(c)}</div>`;

  const isRelic = info => info.category === 'Weapon Enhancement Sidequests' || /^(Splendorous Tools|Manderville Weapons)$/.test(info.genre || '');
  const questlines = genreRows(c, (info, g) => !isRelic(Object.assign({genre:g}, info)) && info.category !== 'Seasonal Events');
  const relics = genreRows(c, (info, g) => isRelic(Object.assign({genre:g}, info)));
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
    + `<div data-frame="seasonal"><div class="jr-note">Every seasonal quest ever offered, by event. Many events reuse their quests each year.</div>${genreListHTML(seasonal, c)}</div>`
    + `<div data-frame="duties"><div class="jr-note">Cleared means the game recorded a completion. Quest battles and deep dungeon floors are not counted here.</div>${dutyHTML}</div>`
    + `<div data-frame="exploration">${explore}</div>`
    + `<div data-frame="mountspeed">${speedHTML}</div>`;
  if(DATA.activeId === cid && activeTab(cid) === 'journey') applyFrames(cid, 'journey');
}
