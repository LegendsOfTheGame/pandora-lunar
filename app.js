/* Adventurer's Ledger — Pandora Lunar
   Self-serve, per-browser FFXIV progression tracker. Nothing here talks to a server —
   everything lives in this browser's localStorage. Up to 3 characters per browser;
   more than that, use a second browser (separate storage origin). */

const COMBAT_JOBS = [
  ["Paladin","Tank"],["Warrior","Tank"],["Dark Knight","Tank"],["Gunbreaker","Tank"],
  ["White Mage","Healer"],["Scholar","Healer"],["Astrologian","Healer"],["Sage","Healer"],
  ["Monk","Melee"],["Dragoon","Melee"],["Ninja","Melee"],["Samurai","Melee"],["Reaper","Melee"],["Viper","Melee"],
  ["Bard","Phys R"],["Machinist","Phys R"],["Dancer","Phys R"],
  ["Black Mage","Mag R"],["Summoner","Mag R"],["Red Mage","Mag R"],["Pictomancer","Mag R"],
  ["Blue Mage","Limited",80],["Beastmaster","Limited",50]
];
const CRAFT_JOBS = ["Carpenter","Blacksmith","Armorer","Goldsmith","Leatherworker","Weaver","Alchemist","Culinarian"];
const GATHER_JOBS = ["Miner","Botanist","Fisher"];

// "Overall" is a roll-up: sub-categories should sum to it on both the done and total side.
// Totals are editable per-character (Edit totals button) since they grow with patches.
const QUEST_CATS = [
  ["overall","Overall",6472],
  ["msq","Main scenario",991],
  ["era","Chronicles of a New Era",192],
  ["side","Sidequests",1987],
  ["allied","Allied Society",716],
  ["class","Class & Job Quests",848],
  ["leve","Levequests",1738]
];
const SUB_CATS = QUEST_CATS.filter(([key])=>key!=='overall');

// Every reset is a fixed instant in UTC (SE's own convention: GMT reference regardless of
// player DST). Edit/extend this list when 8.0 reworks resets (2027-01-19) — no other code
// changes needed, every routine just points at whichever schedule id you pick.
const RESET_SCHEDULES = [
  { id:'daily15',   kind:'daily',    hour:15,            label:'Daily · 15:00 UTC — roulettes, Allied Society' },
  { id:'daily20',   kind:'daily',    hour:20,            label:'Daily · 20:00 UTC — GC supply, Squadron' },
  { id:'daily09',   kind:'daily',    hour:9,             label:'Daily · 09:00 UTC — Cosmic Exploration' },
  { id:'every12h',  kind:'interval', hours:12,           label:'Every 12h · 00:00 / 12:00 UTC — leve allowances' },
  { id:'weeklyTue', kind:'weekly',   weekday:2, hour:8,  label:'Weekly · Tuesday 08:00 UTC — Challenge Log, raids' },
  { id:'monthly1',  kind:'monthly',  day:1,     hour:8,  label:'Monthly · 1st 08:00 UTC' }
];
const DAY_MS = 86400000;
const ACCENTS = ['gold','teal','rose'];

function schedById(id){ return RESET_SCHEDULES.find(s=>s.id===id) || RESET_SCHEDULES[0]; }

function lastResetInstant(sched, now){
  const t = now.getTime();
  const Y = now.getUTCFullYear(), M = now.getUTCMonth(), D = now.getUTCDate();
  if(sched.kind === 'daily'){
    let d = Date.UTC(Y, M, D, sched.hour, 0, 0);
    if(d > t) d -= DAY_MS;
    return d;
  }
  if(sched.kind === 'interval'){
    const dayStart = Date.UTC(Y, M, D, 0, 0, 0);
    const period = sched.hours * 3600000;
    return dayStart + Math.floor((t - dayStart) / period) * period;
  }
  if(sched.kind === 'weekly'){
    const d = new Date(Date.UTC(Y, M, D, sched.hour, 0, 0));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - sched.weekday + 7) % 7));
    if(d.getTime() > t) d.setUTCDate(d.getUTCDate() - 7);
    return d.getTime();
  }
  if(sched.kind === 'monthly'){
    const d = new Date(Date.UTC(Y, M, sched.day, sched.hour, 0, 0));
    if(d.getTime() > t) d.setUTCMonth(d.getUTCMonth() - 1);
    return d.getTime();
  }
  return 0;
}
function nextResetInstant(sched, now){
  const last = lastResetInstant(sched, now);
  if(sched.kind === 'daily')    return last + DAY_MS;
  if(sched.kind === 'interval') return last + sched.hours * 3600000;
  if(sched.kind === 'weekly')   return last + 7 * DAY_MS;
  if(sched.kind === 'monthly'){ const d = new Date(last); d.setUTCMonth(d.getUTCMonth()+1); return d.getTime(); }
  return last;
}
function isRoutineDone(item, now){
  if(!item.lastDone) return false;
  return item.lastDone >= lastResetInstant(schedById(item.schedId), now);
}
function fmtDue(ms){
  if(ms <= 0) return 'now';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  if(h >= 24) return Math.floor(h/24) + 'd ' + (h % 24) + 'h';
  if(h > 0) return h + 'h ' + m + 'm';
  return m + 'm';
}

/* ---------- ocean fishing (global, character-independent) ---------- */
const OCEAN_INTERVAL_MS = 2 * 3600000;
const OCEAN_WINDOW_MS = 15 * 60000;
function oceanState(now){
  const t = now.getTime();
  const boarding = Math.floor(t / OCEAN_INTERVAL_MS) * OCEAN_INTERVAL_MS;
  const closes = boarding + OCEAN_WINDOW_MS;
  if(t < closes) return { open:true, msLeft: closes - t, at: boarding };
  const next = boarding + OCEAN_INTERVAL_MS;
  return { open:false, msLeft: next - t, at: next };
}
function fmtClock(ms){
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
function updateOceanBar(){
  const bar = document.getElementById('ocean-bar');
  if(!bar) return;
  const st = oceanState(new Date());
  bar.classList.toggle('registering', st.open);
  const label = document.getElementById('oc-label');
  const time  = document.getElementById('oc-time');
  const npc   = document.getElementById('oc-npc');
  if(st.open){
    label.textContent = 'Ocean Fishing · registration open';
    time.textContent  = fmtClock(st.msLeft) + ' left';
    npc.textContent   = '· Dryskthota, Limsa Lominsa Lower Decks (3.0, 12.7)';
  }else{
    label.textContent = 'Ocean Fishing · next boarding';
    time.textContent  = fmtClock(st.msLeft);
    npc.textContent   = '· ' + new Date(st.at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  }
}

/* ---------- patch gating ---------- */
// FFXIV patch numbers compare correctly as plain decimals (x.0 ... x.5, x.55, x.56, x.58,
// then (x+1).0 — there is no x.6). Verified against all 137 real patches 2.0–8.0: zero
// out-of-order comparisons, including leading-zero cases (3.07 < 3.1) that break naive
// integer-minor comparison. Lettered hotfix patches (6.11a) parse to their base number and
// compare equal to it — deliberate, since letter suffixes never carry new content.
function patchValue(s){
  const n = parseFloat(String(s ?? '').trim());
  return isNaN(n) ? null : n;
}
function isGated(item, patchStr){
  const need = patchValue(item.requires);
  if(need === null) return false;
  const have = patchValue(patchStr);
  if(have === null) return false;
  return need > have;
}

/* ---------- job-level ranking ---------- */
// Which job to level next: lowest among those started (level>=1, so unstarted jobs at 0
// don't all tie for "lowest") and not yet capped.
function lowestStarted(entries){
  const eligible = entries.filter(e => e.level >= 1 && e.level < e.cap);
  if(eligible.length < 2) return new Set();
  const min = Math.min(...eligible.map(e=>e.level));
  return new Set(eligible.filter(e=>e.level===min).map(e=>e.name));
}
function markerHTML(lvl, cap, isLowest){
  if(lvl >= cap) return '<span class="at-cap">at cap</span>';
  return isLowest ? '<span class="next-up">lowest</span>' : '';
}
// Ranks the bottom N distinct levels (not just the single lowest) — for beast tribe
// crafting rotations that need to know their 2nd/3rd lowest, not just one job to level.
// Ties share a rank: two jobs tied for lowest both come back as rank 1.
function rankLowestTiers(entries, maxTiers){
  const eligible = entries.filter(e => e.level >= 1 && e.level < e.cap);
  if(eligible.length < 2) return new Map();
  const tierLevels = [...new Set(eligible.map(e=>e.level))].sort((a,b)=>a-b).slice(0, maxTiers);
  const rankOf = new Map();
  eligible.forEach(e=>{
    const tier = tierLevels.indexOf(e.level);
    if(tier !== -1) rankOf.set(e.name, tier+1);
  });
  return rankOf;
}
function rankMarkerHTML(lvl, cap, rank){
  if(lvl >= cap) return '<span class="at-cap">at cap</span>';
  if(!rank) return '';
  return `<span class="next-up">${rank===1 ? 'lowest' : '#'+rank}</span>`;
}

/* ---------- generic helpers ---------- */
function num(v){ const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n) ? 0 : n; }
function fmt(n){ return Math.round(n).toLocaleString(); }
function fmtLvl(n){
  const r = Math.round(n*10)/10;
  return Number.isInteger(r) ? r.toLocaleString() : r.toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1});
}
function pct(a,b){ return b ? ((a/b)*100) : 0; }
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function newId(){ return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

/* ---------- character data model ---------- */
function newCharacter(name){
  return {
    id: newId(),
    name: name || '',
    duty:0, comm:0, roleTank:false, roleHealer:false, roleDps:false,
    playtime:{days:0,hours:0}, patch:'', showGated:false,
    quests: Object.fromEntries(QUEST_CATS.map(([k])=>[k,0])),
    questTotals: Object.fromEntries(QUEST_CATS.map(([k,l,t])=>[k,t])),
    combat: Object.fromEntries(COMBAT_JOBS.map(([n])=>[n,0])),
    craft: Object.fromEntries(CRAFT_JOBS.map(n=>[n,0])),
    gather: Object.fromEntries(GATHER_JOBS.map(n=>[n,0])),
    tradeCollected:0, tradeMade:0,
    custom: [], routines: [], notes: ''
  };
}

function normalizeCharacter(c){
  if(!c.id) c.id = newId();
  if(typeof c.name !== 'string') c.name = '';
  ['duty','comm','tradeCollected','tradeMade'].forEach(k=>{ if(typeof c[k] !== 'number') c[k] = 0; });
  ['roleTank','roleHealer','roleDps','showGated'].forEach(k=>{ c[k] = !!c[k]; });
  if(typeof c.patch !== 'string') c.patch = '';
  if(typeof c.notes !== 'string') c.notes = '';
  if(!c.quests) c.quests = {};
  if(!c.combat) c.combat = {};
  if(!c.craft) c.craft = {};
  if(!c.gather) c.gather = {};
  if(!c.questTotals) c.questTotals = {};
  QUEST_CATS.forEach(([key,label,total])=>{ if(c.questTotals[key] === undefined) c.questTotals[key] = total; });
  if(typeof c.playtime === 'string'){
    const d = c.playtime.match(/(\d+)\s*d/i), h = c.playtime.match(/(\d+)\s*h/i);
    c.playtime = { days: d?parseInt(d[1]):0, hours: h?parseInt(h[1]):0 };
  }
  if(!c.playtime) c.playtime = {days:0,hours:0};
  if(!Array.isArray(c.custom)) c.custom = [];
  if(!Array.isArray(c.routines)) c.routines = [];
  c.routines.forEach(r=>{
    if(!r.schedId || !RESET_SCHEDULES.some(s=>s.id===r.schedId)) r.schedId = 'daily15';
    r.lastDone = typeof r.lastDone === 'number' ? r.lastDone : null;
    if(typeof r.requires !== 'string') r.requires = '';
  });
  return c;
}

/* ---------- top-level data ---------- */
let DATA = null;

async function loadData(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem('ledger-data') || 'null'); }catch(e){ raw = null; }
  if(!raw || !Array.isArray(raw.chars) || raw.chars.length === 0){
    const first = newCharacter('');
    DATA = { chars:[first], activeId:first.id, ui:{collapsed:{}} };
  }else{
    DATA = raw;
  }
  normalizeData();
}
function normalizeData(){
  DATA.chars = DATA.chars.slice(0,3).map(normalizeCharacter);
  if(!DATA.chars.find(c=>c.id===DATA.activeId)) DATA.activeId = DATA.chars[0].id;
  if(!DATA.ui || typeof DATA.ui !== 'object') DATA.ui = {};
  if(!DATA.ui.collapsed || typeof DATA.ui.collapsed !== 'object') DATA.ui.collapsed = {};
}
function getChar(cid){ return DATA.chars.find(c=>c.id===cid); }

async function save(){
  collectAllInputs();
  try{
    localStorage.setItem('ledger-data', JSON.stringify(DATA));
    document.getElementById('save-status').textContent = 'Saved locally';
  }catch(e){
    document.getElementById('save-status').textContent = 'Save failed';
  }
}
let saveTimer = null;
function scheduleSave(){
  document.getElementById('save-status').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}

/* Reads every input for every character currently in the DOM (all pages exist at once,
   only display:none toggles which is visible) back into DATA. Never skips a character
   just because its page isn't the active one. */
function collectAllInputs(){
  DATA.chars.forEach(c => collectCharInputs(c.id));
}
function collectCharInputs(cid){
  const c = getChar(cid); if(!c) return;
  const g = id => document.getElementById(id);
  if(g(`${cid}-name`)) c.name = g(`${cid}-name`).value;
  if(g(`${cid}-duty`)) c.duty = num(g(`${cid}-duty`).value);
  if(g(`${cid}-comm`)) c.comm = num(g(`${cid}-comm`).value);
  if(g(`${cid}-role-tank`)) c.roleTank = g(`${cid}-role-tank`).checked;
  if(g(`${cid}-role-healer`)) c.roleHealer = g(`${cid}-role-healer`).checked;
  if(g(`${cid}-role-dps`)) c.roleDps = g(`${cid}-role-dps`).checked;
  if(g(`${cid}-playtime-days`)) c.playtime.days = num(g(`${cid}-playtime-days`).value);
  if(g(`${cid}-playtime-hours`)) c.playtime.hours = num(g(`${cid}-playtime-hours`).value);
  if(g(`${cid}-trade-collected`)) c.tradeCollected = num(g(`${cid}-trade-collected`).value);
  if(g(`${cid}-trade-made`)) c.tradeMade = num(g(`${cid}-trade-made`).value);
  if(g(`${cid}-patch`)) c.patch = g(`${cid}-patch`).value.trim();
  if(g(`${cid}-notes`)) c.notes = g(`${cid}-notes`).value;

  QUEST_CATS.forEach(([key])=>{
    if(g(`${cid}-quest-${key}`)) c.quests[key] = num(g(`${cid}-quest-${key}`).value);
    if(g(`${cid}-total-${key}`)) c.questTotals[key] = num(g(`${cid}-total-${key}`).value);
  });
  COMBAT_JOBS.forEach(([name])=>{
    const el = g(`${cid}-combat-${name.replace(/\s/g,'')}`);
    if(el) c.combat[name] = num(el.value);
  });
  CRAFT_JOBS.forEach(name=>{ if(g(`${cid}-craft-${name}`)) c.craft[name] = num(g(`${cid}-craft-${name}`).value); });
  GATHER_JOBS.forEach(name=>{ if(g(`${cid}-gather-${name}`)) c.gather[name] = num(g(`${cid}-gather-${name}`).value); });

  c.custom.forEach(item=>{
    if(g(`${cid}-custom-label-${item.id}`)) item.label = g(`${cid}-custom-label-${item.id}`).value;
    if(g(`${cid}-custom-cur-${item.id}`)) item.current = num(g(`${cid}-custom-cur-${item.id}`).value);
    if(g(`${cid}-custom-total-${item.id}`)) item.total = num(g(`${cid}-custom-total-${item.id}`).value);
  });
  c.routines.forEach(item=>{
    if(g(`${cid}-rt-label-${item.id}`)) item.label = g(`${cid}-rt-label-${item.id}`).value;
    if(g(`${cid}-rt-sched-${item.id}`)) item.schedId = g(`${cid}-rt-sched-${item.id}`).value;
    if(g(`${cid}-rt-req-${item.id}`)) item.requires = g(`${cid}-rt-req-${item.id}`).value.trim();
  });
}

/* ---------- switcher ---------- */
function renderSwitcher(){
  const box = document.getElementById('switcher');
  const capNote = document.getElementById('cap-note');
  box.innerHTML = DATA.chars.map((c,i)=>{
    const accent = ACCENTS[i % ACCENTS.length];
    const seal = (c.name||'?').trim().charAt(0).toUpperCase() || '?';
    const active = c.id === DATA.activeId ? ' active' : '';
    return `<button class="switch-btn${active}" style="--accent:var(--${accent})" onclick="setActiveChar('${c.id}')">
      <div class="seal">${esc(seal)}</div>
      <div class="switch-label">
        <span class="name">${esc(c.name || 'Unnamed')}</span>
        <span class="role">Character ${i+1}</span>
      </div>
    </button>`;
  }).join('');
  if(DATA.chars.length < 3){
    box.insertAdjacentHTML('beforeend', `<button class="add-char-btn" onclick="addCharacter()">+ Add character</button>`);
    capNote.style.display = 'none';
  }else{
    capNote.style.display = '';
  }
}
function setActiveChar(cid){
  collectAllInputs();
  DATA.activeId = cid;
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active', p.id === 'page-'+cid));
  renderSwitcher();
  scheduleSave();
}
function addCharacter(){
  if(DATA.chars.length >= 3) return;
  collectAllInputs();
  const c = newCharacter('');
  DATA.chars.push(c);
  DATA.activeId = c.id;
  rebuildPages();
  renderSwitcher();
  const nameEl = document.getElementById(`${c.id}-name`);
  if(nameEl) nameEl.focus();
  scheduleSave();
}
function removeCharacter(cid){
  const c = getChar(cid);
  if(!c) return;
  const label = (c.name||'').trim() || 'this character';
  if(!confirm(`Remove ${label}? This deletes everything tracked for them and can't be undone.`)) return;
  collectAllInputs();
  DATA.chars = DATA.chars.filter(x=>x.id!==cid);
  if(DATA.chars.length === 0) DATA.chars.push(newCharacter(''));
  DATA.activeId = DATA.chars[0].id;
  rebuildPages();
  renderSwitcher();
  scheduleSave();
}

/* ---------- per-character page markup ---------- */
function characterPageHTML(cid){
  return `
  <div class="section">
    <div class="char-header">
      <input type="text" class="char-name-input" id="${cid}-name" placeholder="Character name" oninput="onNameInput('${cid}')">
      <button class="remove-char-btn" onclick="removeCharacter('${cid}')">Remove character</button>
    </div>
    <div class="dash-grid" id="${cid}-dash"></div>
  </div>

  <div class="section">
    <h2>Achievement requirements
      <span class="hint">1000 dungeons &middot; 1500 comms &middot; tank + healer + 1 dps role quest</span>
    </h2>
    <table style="margin-bottom:10px">
      <tr><td style="width:120px"><input type="text" id="${cid}-duty" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 1,000 duty completions</td></tr>
      <tr><td><input type="text" id="${cid}-comm" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 1,500 commendations</td></tr>
    </table>
    <div id="${cid}-roles"></div>
  </div>

  <div class="section">
    <h2>Trade mentor requirements <span class="hint">300 collectables &middot; 100 synthesized &middot; a craft + gather job at 100</span></h2>
    <table style="margin-bottom:10px">
      <tr><td style="width:140px"><input type="text" id="${cid}-trade-collected" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 300 collectables gathered or caught</td><td style="width:60px" id="${cid}-trade-collected-done"></td></tr>
      <tr><td><input type="text" id="${cid}-trade-made" style="text-align:right" oninput="onMainInput('${cid}')"></td><td style="color:var(--text-faint)">/ 100 collectables synthesized</td><td style="width:60px" id="${cid}-trade-made-done"></td></tr>
    </table>
    <div id="${cid}-trade-jobs"></div>
  </div>

  <div class="section">
    <h2>Session</h2>
    <table>
      <tr><td style="width:160px;color:var(--text-faint)">Cumulative playtime</td><td>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="text" id="${cid}-playtime-days" class="playtime-input" oninput="onPlaytimeInput('${cid}')"><span class="cap">d</span>
          <input type="text" id="${cid}-playtime-hours" class="playtime-input" oninput="onPlaytimeInput('${cid}')"><span class="cap">h</span>
          <span class="cap" id="${cid}-playtime-total" style="margin-left:8px"></span>
        </div>
      </td></tr>
    </table>
  </div>

  <div class="section">
    <h2>Quest categories <span class="hint-group"><span class="hint">via QuestTracker plugin</span><button class="edit-btn" id="${cid}-totals-edit-btn" onclick="toggleEditTotals('${cid}')">Edit totals</button></span></h2>
    <div class="quest-grid" id="${cid}-quests"></div>
    <div class="check-note" id="${cid}-overall-check"></div>
  </div>

  <div class="section">
    <h2>Job levels</h2>
    <div class="subhead">Combat &middot; cap 100 (Blue Mage 80, Beastmaster 50)</div>
    <table id="${cid}-combat" style="margin-bottom:20px"></table>
    <div class="two-col">
      <div>
        <div class="subhead">Crafting &middot; cap 100</div>
        <table id="${cid}-craft"></table>
      </div>
      <div>
        <div class="subhead">Gathering &middot; cap 100</div>
        <table id="${cid}-gather"></table>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Routines <span class="hint-group"><span class="hint">clears itself on the game's reset</span><span class="patch-box">patch <input type="text" id="${cid}-patch" class="patch-input" placeholder="4.0" oninput="onPatchInput('${cid}')"></span></span></h2>
    <div class="routine-list" id="${cid}-routines"></div>
    <div class="gated-note" id="${cid}-gated"></div>
    <button class="add-btn" onclick="addRoutine('${cid}')">+ Add routine</button>
  </div>

  <div class="section">
    <h2>Custom trackers <span class="hint">achievements, mounts, minions, logs &mdash; add your own</span></h2>
    <div class="custom-list" id="${cid}-custom"></div>
    <button class="add-btn" onclick="addCustomRow('${cid}')">+ Add tracker</button>
  </div>

  <div class="section">
    <h2>Notes</h2>
    <textarea class="note-area" id="${cid}-notes" placeholder="Anything worth remembering — GC, retainers, sync points, whatever." oninput="scheduleSave()"></textarea>
  </div>`;
}

function rebuildPages(){
  const box = document.getElementById('pages');
  box.innerHTML = DATA.chars.map(c=>
    `<div class="page${c.id===DATA.activeId?' active':''}" id="page-${c.id}">${characterPageHTML(c.id)}</div>`
  ).join('');
  DATA.chars.forEach(c=>renderChar(c.id));
  initCollapsible();
}

/* ---------- per-character render/update ---------- */
function renderCharDash(cid){
  const c = getChar(cid);
  const dutyPct = pct(c.duty,1000), commPct = pct(c.comm,1500);
  const rolesGot = [c.roleTank,c.roleHealer,c.roleDps].filter(Boolean).length;
  const overallPct = ((Math.min(c.duty,1000)/1000)+(Math.min(c.comm,1500)/1500)+(c.roleTank?1:0)+(c.roleHealer?1:0)+(c.roleDps?1:0))/5*100;
  const combatTotal = Object.values(c.combat).reduce((a,b)=>a+b,0);
  const craftTotal = Object.values(c.craft).reduce((a,b)=>a+b,0);
  const gatherTotal = Object.values(c.gather).reduce((a,b)=>a+b,0);
  const questPct = pct(c.quests.overall, c.questTotals.overall);
  document.getElementById(cid+'-dash').innerHTML = `
    <div class="metric ${c.duty>=1000?'done':''}"><div class="label">Duty completions</div><div class="value">${fmt(c.duty)}<small> / 1,000</small></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(dutyPct,100)}%"></div></div></div>
    <div class="metric ${c.comm>=1500?'done':''}"><div class="label">Commendations</div><div class="value">${fmt(c.comm)}<small> / 1,500</small></div><div class="bar-track"><div class="bar-fill" style="width:${Math.min(commPct,100)}%"></div></div></div>
    <div class="metric ${rolesGot>=3?'done':''}"><div class="label">Battle mentor role quests</div><div class="value">${rolesGot}<small> / 3 req'd</small></div><div class="bar-track"><div class="bar-fill" style="width:${rolesGot/3*100}%"></div></div></div>
    <div class="metric"><div class="label">Overall to Battle Mentor</div><div class="value">${overallPct.toFixed(1)}%</div><div class="bar-track"><div class="bar-fill" style="width:${overallPct}%"></div></div></div>
    <div class="metric"><div class="label">Quest completion</div><div class="value">${questPct.toFixed(2)}%</div><div class="bar-track"><div class="bar-fill" style="width:${questPct}%"></div></div></div>
    <div class="metric"><div class="label">Combat levels</div><div class="value">${fmtLvl(combatTotal)}<small> / 2,230</small></div><div class="bar-track"><div class="bar-fill" style="width:${pct(combatTotal,2230)}%"></div></div></div>
    <div class="metric"><div class="label">Crafting levels</div><div class="value">${fmtLvl(craftTotal)}<small> / 800</small></div><div class="bar-track"><div class="bar-fill" style="width:${pct(craftTotal,800)}%"></div></div></div>
    <div class="metric"><div class="label">Gathering levels</div><div class="value">${fmtLvl(gatherTotal)}<small> / 300</small></div><div class="bar-track"><div class="bar-fill" style="width:${pct(gatherTotal,300)}%"></div></div></div>
  `;
}

function renderRoles(cid){
  const c = getChar(cid);
  const tankReady = COMBAT_JOBS.filter(([n,r])=>r==="Tank").some(([n])=>c.combat[n]>=100);
  document.getElementById(cid+'-roles').innerHTML = `
    <div class="check-row"><label><input type="checkbox" id="${cid}-role-tank" ${c.roleTank?'checked':''} onchange="onMainInput('${cid}')"> Tank role quest &mdash; No Sleep Till Tuliyollal <span class="qname">${tankReady?'':'(needs a tank at 100)'}</span></label>${c.roleTank?'<span class="stamp">done</span>':'<span class="stamp pending">pending</span>'}</div>
    <div class="check-row"><label><input type="checkbox" id="${cid}-role-healer" ${c.roleHealer?'checked':''} onchange="onMainInput('${cid}')"> Healer role quest &mdash; An Antidote for Anarchy</label>${c.roleHealer?'<span class="stamp">done</span>':'<span class="stamp pending">pending</span>'}</div>
    <div class="check-row"><label><input type="checkbox" id="${cid}-role-dps" ${c.roleDps?'checked':''} onchange="onMainInput('${cid}')"> One DPS role quest (any of the three)</label>${c.roleDps?'<span class="stamp">done</span>':'<span class="stamp pending">pending</span>'}</div>
  `;
}

function updateTradeMentorChecks(cid){
  const c = getChar(cid);
  const craftJob = CRAFT_JOBS.find(name => (c.craft[name]||0) >= 100);
  const gatherJob = GATHER_JOBS.find(name => (c.gather[name]||0) >= 100);
  const row = (label, job) => `
    <div class="check-row">
      <span>${label}${job ? ` <span class="qname">(${job})</span>` : ''}</span>
      ${job ? '<span class="stamp">done</span>' : '<span class="stamp pending">pending</span>'}
    </div>`;
  document.getElementById(cid+'-trade-jobs').innerHTML =
    row('Crafting job at level 100', craftJob) + row('Gathering job at level 100', gatherJob);
  const collectedEl = document.getElementById(cid+'-trade-collected-done');
  const madeEl = document.getElementById(cid+'-trade-made-done');
  if(collectedEl) collectedEl.innerHTML = c.tradeCollected >= 300 ? '<span class="at-cap">done</span>' : '';
  if(madeEl) madeEl.innerHTML = c.tradeMade >= 100 ? '<span class="at-cap">done</span>' : '';
}

function updatePlaytimeTotal(cid){
  const c = getChar(cid);
  document.getElementById(cid+'-playtime-total').textContent = `= ${c.playtime.days*24 + c.playtime.hours}h total`;
}

function updateOverallCheck(cid){
  const el = document.getElementById(cid+'-overall-check');
  if(!el) return;
  const c = getChar(cid);
  let sumDone=0, sumTotal=0;
  SUB_CATS.forEach(([key])=>{ sumDone += c.quests[key]||0; sumTotal += c.questTotals[key]||0; });
  const doneOk = sumDone === (c.quests.overall||0), totalOk = sumTotal === (c.questTotals.overall||0);
  if(doneOk && totalOk){
    el.className = 'check-note ok';
    el.textContent = `✓ sub-categories sum to ${fmt(sumDone)} / ${fmt(sumTotal)} — matches Overall`;
  }else{
    const parts=[];
    if(!doneOk) parts.push(`done ${fmt(sumDone)} vs Overall ${fmt(c.quests.overall||0)}`);
    if(!totalOk) parts.push(`total ${fmt(sumTotal)} vs Overall ${fmt(c.questTotals.overall||0)}`);
    el.className = 'check-note warn';
    el.textContent = `⚠ sub-categories disagree with Overall — ${parts.join('; ')}`;
  }
}

let editingTotals = {};
function toggleEditTotals(cid){
  editingTotals[cid] = !editingTotals[cid];
  const btn = document.getElementById(cid+'-totals-edit-btn');
  btn.textContent = editingTotals[cid] ? 'Done editing' : 'Edit totals';
  btn.classList.toggle('active', editingTotals[cid]);
  renderQuestsTable(cid);
}
function onTotalInput(cid){
  collectAllInputs();
  updateQuestPercents(cid);
  updateOverallCheck(cid);
  renderCharDash(cid);
  scheduleSave();
}
function renderQuestsTable(cid){
  const c = getChar(cid);
  let rows = `<div class="h">Category</div><div class="h" style="text-align:right">Done</div><div class="h" style="text-align:right">Total</div><div class="h" style="text-align:right">%</div>`;
  QUEST_CATS.forEach(([key,label])=>{
    const v = c.quests[key]||0, total = c.questTotals[key];
    const totalCell = editingTotals[cid]
      ? `<input type="text" class="total-input" id="${cid}-total-${key}" value="${total}" oninput="onTotalInput('${cid}')">`
      : total.toLocaleString();
    rows += `
      <div>${label}</div>
      <div><input type="text" id="${cid}-quest-${key}" value="${v}" style="text-align:right" oninput="onMainInput('${cid}')"></div>
      <div style="text-align:right" class="cap">${totalCell}</div>
      <div style="text-align:right;font-family:var(--font-mono);color:var(--text-dim)" id="${cid}-qpct-${key}">${pct(v,total).toFixed(1)}%</div>
    `;
  });
  document.getElementById(cid+'-quests').innerHTML = rows;
}
function updateQuestPercents(cid){
  const c = getChar(cid);
  QUEST_CATS.forEach(([key])=>{
    const v = c.quests[key]||0, total = c.questTotals[key];
    const el = document.getElementById(cid+'-qpct-'+key);
    if(el) el.textContent = pct(v,total).toFixed(1)+'%';
  });
}

function renderJobTables(cid){
  const c = getChar(cid);
  let crows = '';
  COMBAT_JOBS.forEach(([name,role,capOverride])=>{
    const cap = capOverride || 100, lvl = c.combat[name]||0, id = name.replace(/\s/g,'');
    crows += `<tr>
      <td><div class="job-cell"><span class="role-tag">${role}</span><span class="job-name">${name}</span></div></td>
      <td style="width:104px"><input type="text" id="${cid}-combat-${id}" value="${lvl}" oninput="onMainInput('${cid}')"></td>
      <td style="width:60px" class="cap">/ ${cap}</td>
      <td style="width:60px" id="${cid}-ccap-${id}">${lvl>=cap?'<span class="at-cap">at cap</span>':''}</td>
    </tr>`;
  });
  document.getElementById(cid+'-combat').innerHTML = crows;

  let craftRows = '';
  CRAFT_JOBS.forEach(name=>{
    const lvl = c.craft[name]||0;
    craftRows += `<tr><td>${name}</td><td style="width:96px"><input type="text" id="${cid}-craft-${name}" value="${lvl}" oninput="onMainInput('${cid}')"></td><td class="cap" style="width:52px">/ 100</td><td style="width:66px" id="${cid}-craftmark-${name}"></td></tr>`;
  });
  document.getElementById(cid+'-craft').innerHTML = craftRows;

  let gatherRows = '';
  GATHER_JOBS.forEach(name=>{
    const lvl = c.gather[name]||0;
    gatherRows += `<tr><td>${name}</td><td style="width:96px"><input type="text" id="${cid}-gather-${name}" value="${lvl}" oninput="onMainInput('${cid}')"></td><td class="cap" style="width:52px">/ 100</td><td style="width:66px" id="${cid}-gathermark-${name}"></td></tr>`;
  });
  document.getElementById(cid+'-gather').innerHTML = gatherRows;
  updateJobCaps(cid);
}
function updateJobCaps(cid){
  const c = getChar(cid);
  const combatEntries = COMBAT_JOBS.map(([name,role,capOverride])=>({ name, level: c.combat[name]||0, cap: capOverride||100 }));
  const combatLow = lowestStarted(combatEntries);
  combatEntries.forEach(e=>{
    const el = document.getElementById(cid+'-ccap-'+e.name.replace(/\s/g,''));
    if(el) el.innerHTML = markerHTML(e.level, e.cap, combatLow.has(e.name));
  });
  const craftEntries = CRAFT_JOBS.map(name=>({ name, level: c.craft[name]||0, cap:100 }));
  const craftRanks = rankLowestTiers(craftEntries, 3);
  craftEntries.forEach(e=>{
    const el = document.getElementById(cid+'-craftmark-'+e.name);
    if(el) el.innerHTML = rankMarkerHTML(e.level, e.cap, craftRanks.get(e.name));
  });
  const gatherEntries = GATHER_JOBS.map(name=>({ name, level: c.gather[name]||0, cap:100 }));
  const gatherLow = lowestStarted(gatherEntries);
  gatherEntries.forEach(e=>{
    const el = document.getElementById(cid+'-gathermark-'+e.name);
    if(el) el.innerHTML = markerHTML(e.level, e.cap, gatherLow.has(e.name));
  });
}

/* ---------- custom trackers (per character) ---------- */
function customRowHTML(cid, item){
  const p = pct(item.current, item.total);
  const call = `onCustomInput('${cid}','${item.id}')`;
  return `
    <div class="custom-item" id="${cid}-custom-item-${item.id}">
      <div class="custom-row">
        <input type="text" id="${cid}-custom-label-${item.id}" value="${esc(item.label)}" placeholder="Name (e.g. Mounts)" oninput="${call}">
        <input type="text" id="${cid}-custom-cur-${item.id}" value="${item.current}" style="text-align:right" oninput="${call}">
        <span class="slash">/</span>
        <input type="text" id="${cid}-custom-total-${item.id}" value="${item.total}" style="text-align:right" oninput="${call}">
        <span class="pct" id="${cid}-custom-pct-${item.id}">${p.toFixed(1)}%</span>
        <button class="remove-btn" title="Remove this tracker" onclick="removeCustomRow('${cid}','${item.id}')">&times;</button>
      </div>
      <div class="bar-track"><div class="bar-fill" id="${cid}-custom-bar-${item.id}" style="width:${Math.min(p,100)}%"></div></div>
    </div>`;
}
function renderCustom(cid){
  const box = document.getElementById(cid+'-custom');
  if(!box) return;
  const list = getChar(cid).custom;
  box.innerHTML = list.length
    ? list.map(item=>customRowHTML(cid,item)).join('')
    : '<div class="empty-hint">Nothing yet &mdash; add achievements, mounts, minions, hunting log, or anything else worth counting.</div>';
}
function addCustomRow(cid){
  collectAllInputs();
  const item = { id:newId(), label:'', current:0, total:100 };
  getChar(cid).custom.push(item);
  const box = document.getElementById(cid+'-custom');
  const hint = box.querySelector('.empty-hint');
  if(hint) hint.remove();
  box.insertAdjacentHTML('beforeend', customRowHTML(cid, item));
  const labelEl = document.getElementById(`${cid}-custom-label-${item.id}`);
  if(labelEl) labelEl.focus();
  scheduleSave();
}
function removeCustomRow(cid, id){
  collectAllInputs();
  const c = getChar(cid);
  const item = c.custom.find(i=>i.id===id);
  if(item && ((item.label||'').trim() || item.current)){
    const name = (item.label||'').trim() || 'this tracker';
    if(!confirm(`Remove "${name}"?`)) return;
  }
  c.custom = c.custom.filter(i=>i.id!==id);
  const node = document.getElementById(`${cid}-custom-item-${id}`);
  if(node) node.remove();
  if(c.custom.length===0) renderCustom(cid);
  scheduleSave();
}
function onCustomInput(cid, id){
  collectAllInputs();
  const item = getChar(cid).custom.find(i=>i.id===id);
  if(item){
    const p = pct(item.current, item.total);
    const pctEl = document.getElementById(`${cid}-custom-pct-${id}`);
    const barEl = document.getElementById(`${cid}-custom-bar-${id}`);
    if(pctEl) pctEl.textContent = p.toFixed(1)+'%';
    if(barEl) barEl.style.width = Math.min(p,100)+'%';
  }
  scheduleSave();
}

/* ---------- routines (per character) ---------- */
function routineHTML(cid, item){
  const now = new Date();
  const sched = schedById(item.schedId);
  const done = isRoutineDone(item, now);
  const gated = isGated(item, getChar(cid).patch);
  const dueMs = nextResetInstant(sched, now) - now.getTime();
  const opts = RESET_SCHEDULES.map(s=>`<option value="${s.id}"${s.id===item.schedId?' selected':''}>${esc(s.label)}</option>`).join('');
  return `
    <div class="routine-item${done?' done':''}${gated?' gated':''}" id="${cid}-rt-item-${item.id}">
      <input type="checkbox" id="${cid}-rt-chk-${item.id}"${done?' checked':''}${gated?' disabled':''} onchange="toggleRoutine('${cid}','${item.id}')">
      <input type="text" class="routine-label" id="${cid}-rt-label-${item.id}" value="${esc(item.label)}" placeholder="e.g. Ixali dailies" oninput="onRoutineInput('${cid}','${item.id}')">
      <select id="${cid}-rt-sched-${item.id}" onchange="onRoutineInput('${cid}','${item.id}')">${opts}</select>
      <input type="text" class="routine-req" id="${cid}-rt-req-${item.id}" value="${esc(item.requires||'')}" placeholder="any" title="Patch this unlocks in — blank means always available" oninput="onRoutineInput('${cid}','${item.id}')">
      <span class="routine-due" id="${cid}-rt-due-${item.id}">${gated?'locked':fmtDue(dueMs)}</span>
      <button class="remove-btn" title="Remove this routine" onclick="removeRoutine('${cid}','${item.id}')">&times;</button>
    </div>`;
}
function renderRoutines(cid){
  const box = document.getElementById(cid+'-routines');
  if(!box) return;
  const c = getChar(cid);
  const patchEl = document.getElementById(cid+'-patch');
  if(patchEl && patchEl.value !== (c.patch||'')) patchEl.value = c.patch || '';
  const all = c.routines;
  const visible = c.showGated ? all : all.filter(r=>!isGated(r, c.patch));
  box.innerHTML = visible.length
    ? visible.map(item=>routineHTML(cid,item)).join('')
    : `<div class="empty-hint">${all.length ? 'Everything here needs a later patch.' : 'Nothing yet &mdash; add the things you repeat, like Ixali dailies or GC supply missions.'}</div>`;
  renderGatedNote(cid);
}
function renderGatedNote(cid){
  const el = document.getElementById(cid+'-gated');
  if(!el) return;
  const c = getChar(cid);
  const hidden = c.routines.filter(r=>isGated(r, c.patch));
  if(!hidden.length && !c.showGated){ el.innerHTML=''; return; }
  const lowest = hidden.map(r=>patchValue(r.requires)).filter(v=>v!==null).sort((a,b)=>a-b)[0];
  const label = hidden.length
    ? `${hidden.length} hidden &mdash; ${hidden.length===1?'needs':'need'} a later patch${lowest!==undefined?` (next at ${lowest})`:''}`
    : 'showing patch-locked routines';
  el.innerHTML = `<span>${label}</span><button class="link-btn" onclick="toggleShowGated('${cid}')">${c.showGated?'hide them':'show them'}</button>`;
}
function toggleShowGated(cid){
  collectAllInputs();
  const c = getChar(cid);
  c.showGated = !c.showGated;
  renderRoutines(cid);
  scheduleSave();
}
function onPatchInput(cid){
  const el = document.getElementById(cid+'-patch');
  const c = getChar(cid);
  if(el) c.patch = el.value.trim();
  renderRoutines(cid);
  scheduleSave();
}
function addRoutine(cid){
  collectAllInputs();
  const item = { id:newId(), label:'', schedId:'daily15', lastDone:null, requires:'' };
  getChar(cid).routines.push(item);
  const box = document.getElementById(cid+'-routines');
  const hint = box.querySelector('.empty-hint');
  if(hint) hint.remove();
  box.insertAdjacentHTML('beforeend', routineHTML(cid, item));
  const labelEl = document.getElementById(`${cid}-rt-label-${item.id}`);
  if(labelEl) labelEl.focus();
  scheduleSave();
}
function removeRoutine(cid, id){
  collectAllInputs();
  const c = getChar(cid);
  const item = c.routines.find(i=>i.id===id);
  if(item && (item.label||'').trim()){
    if(!confirm(`Remove "${item.label.trim()}"?`)) return;
  }
  c.routines = c.routines.filter(i=>i.id!==id);
  const node = document.getElementById(`${cid}-rt-item-${id}`);
  if(node) node.remove();
  if(c.routines.length===0) renderRoutines(cid);
  scheduleSave();
}
function toggleRoutine(cid, id){
  const item = getChar(cid).routines.find(i=>i.id===id);
  const chk = document.getElementById(`${cid}-rt-chk-${id}`);
  if(!item || !chk) return;
  item.lastDone = chk.checked ? Date.now() : null;
  const wrap = document.getElementById(`${cid}-rt-item-${id}`);
  if(wrap) wrap.classList.toggle('done', chk.checked);
  scheduleSave();
}
function onRoutineInput(cid, id){
  collectAllInputs();
  const c = getChar(cid);
  const item = c.routines.find(i=>i.id===id);
  if(item){
    const gated = isGated(item, c.patch);
    const wrap = document.getElementById(`${cid}-rt-item-${id}`);
    const chk  = document.getElementById(`${cid}-rt-chk-${id}`);
    const due  = document.getElementById(`${cid}-rt-due-${id}`);
    if(wrap) wrap.classList.toggle('gated', gated);
    if(chk) chk.disabled = gated;
    if(due && gated) due.textContent = 'locked';
  }
  refreshRoutines(cid);
  renderGatedNote(cid);
  scheduleSave();
}
function refreshRoutines(cid){
  const now = new Date();
  const c = getChar(cid);
  c.routines.forEach(item=>{
    const sched = schedById(item.schedId);
    const gated = isGated(item, c.patch);
    const done = !gated && isRoutineDone(item, now);
    const chk  = document.getElementById(`${cid}-rt-chk-${item.id}`);
    const wrap = document.getElementById(`${cid}-rt-item-${item.id}`);
    const due  = document.getElementById(`${cid}-rt-due-${item.id}`);
    if(chk){ chk.checked = done; chk.disabled = gated; }
    if(wrap){ wrap.classList.toggle('done', done); wrap.classList.toggle('gated', gated); }
    if(due){
      if(gated){ due.textContent='locked'; due.classList.remove('soon'); }
      else{
        const ms = nextResetInstant(sched, now) - now.getTime();
        due.textContent = fmtDue(ms);
        due.classList.toggle('soon', ms < 3600000);
      }
    }
  });
}

/* ---------- full render / input handlers (per character) ---------- */
function renderChar(cid){
  const c = getChar(cid);
  document.getElementById(cid+'-name').value = c.name;
  document.getElementById(cid+'-duty').value = c.duty;
  document.getElementById(cid+'-comm').value = c.comm;
  document.getElementById(cid+'-trade-collected').value = c.tradeCollected;
  document.getElementById(cid+'-trade-made').value = c.tradeMade;
  document.getElementById(cid+'-playtime-days').value = c.playtime.days;
  document.getElementById(cid+'-playtime-hours').value = c.playtime.hours;
  document.getElementById(cid+'-notes').value = c.notes;
  updatePlaytimeTotal(cid);
  renderCharDash(cid);
  renderRoles(cid);
  updateTradeMentorChecks(cid);
  renderQuestsTable(cid);
  updateOverallCheck(cid);
  renderJobTables(cid);
  renderRoutines(cid);
  renderCustom(cid);
}
function onNameInput(cid){
  collectAllInputs();
  renderSwitcher();
  scheduleSave();
}
function onMainInput(cid){
  collectAllInputs();
  renderCharDash(cid);
  renderRoles(cid);
  updateTradeMentorChecks(cid);
  updateQuestPercents(cid);
  updateOverallCheck(cid);
  updateJobCaps(cid);
  scheduleSave();
}
function onPlaytimeInput(cid){
  collectAllInputs();
  updatePlaytimeTotal(cid);
  scheduleSave();
}

/* ---------- collapsible sections ---------- */
function sectionKey(sec){
  const page = sec.closest('.page');
  const h2 = sec.querySelector('h2');
  const slug = (h2 ? h2.textContent : '').trim().toLowerCase().replace(/[^a-z0-9\s]/g,'').split(/\s+/).slice(0,3).join('-');
  return (page ? page.id : 'page') + ':' + slug;
}
function initCollapsible(){
  document.querySelectorAll('.section').forEach(sec=>{
    const h2 = sec.querySelector('h2');
    if(!h2 || sec.dataset.collapsibleReady) return;
    sec.dataset.collapsibleReady = '1';
    const key = sectionKey(sec);
    sec.dataset.secKey = key;
    const body = document.createElement('div');
    body.className = 'sec-body';
    let node = h2.nextSibling;
    while(node){ const next = node.nextSibling; body.appendChild(node); node = next; }
    sec.appendChild(body);
    const btn = document.createElement('button');
    btn.className = 'sec-toggle'; btn.type = 'button'; btn.title = 'Collapse or expand';
    btn.onclick = ()=>toggleSection(key);
    h2.appendChild(btn);
    applyCollapsed(sec, !!DATA.ui.collapsed[key]);
  });
}
function applyCollapsed(sec, collapsed){
  sec.classList.toggle('collapsed', collapsed);
  const btn = sec.querySelector('.sec-toggle');
  if(btn) btn.textContent = collapsed ? '+' : '−';
}
function toggleSection(key){
  const sec = document.querySelector(`.section[data-sec-key="${key}"]`);
  if(!sec) return;
  const collapsed = !sec.classList.contains('collapsed');
  DATA.ui.collapsed[key] = collapsed;
  applyCollapsed(sec, collapsed);
  scheduleSave();
}

/* ---------- instructions ---------- */
function toggleInstructions(){
  const panel = document.getElementById('instructions-panel');
  const open = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  document.getElementById('instructions-toggle-btn').textContent = open ? 'Hide' : 'How this works';
}

/* ---------- backup ---------- */
function exportData(){
  collectAllInputs();
  const payload = { app:'adventurers-ledger-fc', version:1, exported:new Date().toISOString(), chars:DATA.chars, ui:DATA.ui };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const a = document.createElement('a');
  a.href = url; a.download = `pandora-lunar-ledger-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  document.getElementById('save-status').textContent = 'Backup downloaded';
}
function importData(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const parsed = JSON.parse(e.target.result);
      if(!parsed || typeof parsed!=='object' || !Array.isArray(parsed.chars)){
        throw new Error('No character data found in that file.');
      }
      const when = parsed.exported ? new Date(parsed.exported).toLocaleString() : 'unknown date';
      if(!confirm(`Replace ALL current tracker data with this backup?\n\nBackup taken: ${when}\n\nThis overwrites everything in this browser and cannot be undone.`)){
        input.value = ''; return;
      }
      DATA = { chars: parsed.chars, activeId: (parsed.chars[0]||{}).id, ui: parsed.ui || {} };
      normalizeData();
      document.querySelectorAll('.section[data-collapsible-ready]').forEach(s=>delete s.dataset.collapsibleReady);
      rebuildPages();
      renderSwitcher();
      save();
      document.getElementById('save-status').textContent = 'Backup restored';
    }catch(err){
      alert('That file could not be read as a ledger backup.\n\n' + err.message);
    }
    input.value = '';
  };
  reader.onerror = function(){ alert('Could not read that file.'); input.value=''; };
  reader.readAsText(file);
}

/* ---------- init ---------- */
(async function init(){
  await loadData();
  rebuildPages();
  renderSwitcher();
  updateOceanBar();
  setInterval(updateOceanBar, 1000);
  setInterval(()=>{ DATA.chars.forEach(c=>refreshRoutines(c.id)); }, 30000);
})();
