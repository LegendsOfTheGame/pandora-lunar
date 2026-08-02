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

updateOceanBar();
setInterval(updateOceanBar, 1000);
