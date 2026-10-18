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
  c.tmCollections = { asOf: p.exported || new Date().toISOString(), game: src.game || null, lists };
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
function genreListHTML(rows){
  return `<div class="jr-grid">${rows.map(r =>
    `<div class="jr-row${r.have === r.total ? ' full' : ''}"><span>${esc(r.g)}</span><span class="jr-v">${r.have} / ${r.total}</span>
      <div class="jr-bar"><i style="width:${jrPct(r.have, r.total)}%"></i></div></div>`).join('')}</div>`;
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

  box.innerHTML = asOf
    + `<div data-frame="questlines">${genreListHTML(questlines)}</div>`
    + `<div data-frame="relics">${genreListHTML(relics)}</div>`
    + `<div data-frame="seasonal"><div class="jr-note">Every seasonal quest ever offered, by event. Many events reuse their quests each year.</div>${genreListHTML(seasonal)}</div>`
    + `<div data-frame="duties"><div class="jr-note">Cleared means the game recorded a completion. Quest battles and deep dungeon floors are not counted here.</div>${dutyHTML}</div>`
    + `<div data-frame="exploration">${explore}</div>`;
  if(DATA.activeId === cid && activeTab(cid) === 'journey') applyFrames(cid, 'journey');
}
