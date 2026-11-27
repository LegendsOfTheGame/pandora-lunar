/* ---------- All Worlds maintenance lockout ----------
   The window comes from events-feed.js (EVENTS_FEED.maintenance), which
   tools/build_events_feed.py copies every hour from ffxiv-latest-news. Times are
   UTC seconds in the feed.

   During the window Lunar does not start: app.js skips init() and its timers when
   MAINT_LOCKED is true, and this file draws one full-screen page instead. Saved
   data stays in localStorage, unchanged.

   When the countdown reaches zero, the page checks once by itself, and a
   "Check again" button lets the visitor repeat the check:
   1. Read LatestNews.json from ffxiv-latest-news directly, past the cache.
      That feed is ours, and only Lunar and Tales of Milestones read it. A direct
      read skips the hourly copy job, so an extension shows about 5 minutes
      (raw.githubusercontent.com's cache) after ffxiv-latest-news commits it.
      If that read fails, read Lunar's own copy, events-feed.js.
      The Date header of this page's own host gives the server's clock, so a
      wrong PC clock does not decide the result.
   2. A later end in the fresh feed (an extension): show the new end, stay closed.
   3. Otherwise: download the page and its files again past the cache, then
      reload. This is what Ctrl+F5 does; a page cannot press Ctrl+F5 itself.

   The lockout at load still uses events-feed.js, which the page loads anyway.

   Test on localhost only: ?maint-test=SECONDS fakes a window that started one
   minute ago and ends in SECONDS. */

function maintFromFeed(feed){
  const m = feed && feed.maintenance;
  if(!m || !Number.isFinite(m.start) || !Number.isFinite(m.end)) return null;
  return {title: m.title || 'All Worlds Maintenance', url: m.url || '', from: m.start * 1000, to: m.end * 1000};
}
let MAINT = maintFromFeed(typeof EVENTS_FEED !== 'undefined' ? EVENTS_FEED : null);
(function maintTestWindow(){
  const host = location.hostname;
  if(host !== 'localhost' && host !== '127.0.0.1') return;
  const secs = Number(new URLSearchParams(location.search).get('maint-test'));
  if(!secs) return;
  const now = Date.now();
  MAINT = {title: 'All Worlds Maintenance (test)', url: MAINT ? MAINT.url : '', from: now - 60000, to: now + secs * 1000};
})();

function maintInWindow(now){ return !!MAINT && MAINT.from <= now && now < MAINT.to; }
/* Read once, at load. app.js reads it to decide whether to start. */
const MAINT_LOCKED = maintInWindow(Date.now());

/* Theme and time settings come straight from localStorage, because app.js never
   loads DATA while the page is locked. */
function maintUi(){
  try{ return (JSON.parse(localStorage.getItem('ledger-data') || 'null') || {}).ui || {}; }catch(e){ return {}; }
}
function maintFmtTime(ms, ui){
  const d = new Date(ms);
  const day = {day: 'numeric', month: 'short'};
  if(ui.timeMode !== 'local')
    return `${d.toLocaleDateString('en-GB', Object.assign({timeZone: 'UTC'}, day))} ${d.toISOString().slice(11, 16)} UTC`;
  let zone = '';
  try{ const p = new Intl.DateTimeFormat(undefined, {timeZoneName: 'short'}).formatToParts(d).find(x => x.type === 'timeZoneName'); zone = p ? p.value : ''; }catch(e){}
  return `${d.toLocaleDateString('en-GB', day)} ${d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', hour12: false})} ${zone}`.trim();
}
function maintFmtLeft(ms){
  const t = Math.max(0, Math.floor(ms / 1000)), p = n => String(n).padStart(2, '0');
  const h = Math.floor(t / 3600);
  return `${h}h ${p(Math.floor(t % 3600 / 60))}m ${p(t % 60)}s`;
}

/* The same as Ctrl+F5: fetch the page, its scripts and its stylesheets with
   cache "reload", which puts fresh copies in the browser cache, then reload. */
async function maintHardRefresh(){
  const urls = new Set([location.href.split('#')[0]]);
  document.querySelectorAll('script[src]').forEach(s => urls.add(s.src));
  document.querySelectorAll('link[rel="stylesheet"]').forEach(l => urls.add(l.href));
  await Promise.all([...urls].map(u => fetch(u, {cache: 'reload'}).catch(() => null)));
  // A test window must not come back on the reload.
  const url = new URL(location.href);
  if(url.searchParams.has('maint-test')){ url.searchParams.delete('maint-test'); location.replace(url.href); }
  else location.reload();
}

/* Returns 'extended' when the fresh feed moves the end later, 'open' when the
   window is over (the page then reloads), or 'failed' when the fetch fails. */
const MAINT_SOURCE = 'https://raw.githubusercontent.com/LegendsOfTheGame/ffxiv-latest-news/main/LatestNews.json';

/* The source feed: LatestNews.json, which has the same "maintenance" object.
   Returns {maint} (maint can be null), or null when the read fails. */
async function maintReadSource(){
  try{
    const res = await fetch(MAINT_SOURCE, {cache: 'no-store'});
    if(!res.ok) return null;
    return {maint: maintFromFeed(await res.json())};
  }catch(e){ return null; }
}
/* Lunar's own copy, events-feed.js, from the address the page loaded it from.
   On legendmemoria.org/lunar that is the pandora-lunar Pages copy
   (tools/sync_apps.py in legendmemoria), on another host. */
async function maintReadCopy(){
  const tag = [...document.querySelectorAll('script[src]')].find(s => /(^|\/)events-feed\.js(\?|$)/.test(s.getAttribute('src')));
  try{
    const res = await fetch(tag ? tag.src : 'events-feed.js', {cache: 'no-store'});
    if(!res.ok) return null;
    const text = await res.text();
    const a = text.indexOf('{', text.indexOf('const EVENTS_FEED')), b = text.lastIndexOf('}');
    return {maint: maintFromFeed(JSON.parse(text.slice(a, b + 1)))};
  }catch(e){ return null; }
}

async function maintCheck(){
  const read = (await maintReadSource()) || (await maintReadCopy());
  if(!read) return 'failed';
  // A browser hides the Date header of a reply from another host, so the
  // server's clock comes from this page's own host.
  let server = NaN;
  try{ server = Date.parse((await fetch(location.href.split('#')[0], {method: 'HEAD', cache: 'no-store'})).headers.get('Date') || ''); }catch(e){}
  const now = Number.isFinite(server) ? server : Date.now();
  const fresh = read.maint;
  if(fresh && fresh.from <= now && now < fresh.to){
    MAINT = fresh;
    return 'extended';
  }
  await maintHardRefresh();
  return 'open';
}

function drawMaintLock(){
  const ui = maintUi();
  const theme = ui.theme || 'poetic';
  if(theme !== 'poetic') document.documentElement.dataset.theme = theme;
  document.body.classList.add('maint-locked');
  const box = document.createElement('main');
  box.id = 'maint-lock';
  box.innerHTML = `<div class="ml-box">
    <div class="ml-tag">All Worlds Maintenance</div>
    <h1>FINAL FANTASY XIV is in maintenance</h1>
    <p class="ml-sub">Lunar is closed until the maintenance ends. Your saved progress stays in this browser, unchanged.</p>
    <div class="ml-rows">
      <span>Started</span><span id="ml-from"></span>
      <span>Ends</span><span id="ml-to"></span>
      <span id="ml-left-k">Ends in</span><span class="ml-big" id="ml-left"></span>
    </div>
    <p class="ml-note" id="ml-note"></p>
    <div class="ml-check" id="ml-check" hidden>
      <span id="ml-status"></span>
      <button type="button" id="ml-again">Check again</button>
    </div>
    <p class="ml-foot">Square Enix can change the end time. <a id="ml-link" target="_blank" rel="noopener"></a></p>
  </div>`;
  document.body.appendChild(box);

  const $ = id => document.getElementById(id);
  let checking = false, autoChecked = false;
  function paint(){
    $('ml-from').textContent = maintFmtTime(MAINT.from, ui);
    $('ml-to').textContent = maintFmtTime(MAINT.to, ui);
    const link = $('ml-link');
    link.textContent = MAINT.title + ' on the Lodestone';
    if(MAINT.url) link.href = MAINT.url; else link.remove();
  }
  async function check(){
    if(checking) return;
    checking = true;
    $('ml-again').disabled = true;
    $('ml-status').textContent = 'Checking…';
    const r = await maintCheck();
    checking = false;
    $('ml-again').disabled = false;
    if(r === 'extended'){ paint(); $('ml-status').textContent = ''; $('ml-note').textContent = 'Square Enix moved the end time.'; tick(); }
    else if(r === 'failed') $('ml-status').textContent = 'The check did not complete. Lunar may be offline.';
  }
  function tick(){
    const left = MAINT.to - Date.now();
    const over = left <= 0;
    $('ml-left-k').textContent = over ? 'Status' : 'Ends in';
    $('ml-left').textContent = over ? 'The announced end has passed' : maintFmtLeft(left);
    $('ml-left').classList.toggle('ml-big', !over);
    $('ml-check').hidden = !over;
    if(over && !autoChecked){ autoChecked = true; check(); }
    if(!over) autoChecked = false;
  }
  $('ml-again').addEventListener('click', check);
  paint();
  tick();
  setInterval(() => { if(!document.hidden) tick(); }, 1000);
  document.addEventListener('visibilitychange', () => { if(!document.hidden) tick(); });
}
if(MAINT_LOCKED) drawMaintLock();
