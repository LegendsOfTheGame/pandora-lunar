/* ---------- ocean fishing (global, character-independent) ----------
   Drawn by Vue, like the Relics panel. It shows the same text with the same classes
   as the old textContent version, so style.css needs no change. It loads after
   vendor/vue.global.prod.js. The footer carousel (FootSlot in app.js) draws it. */
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
function fmtOceanClock(ms){
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = n => String(n).padStart(2,'0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const OceanBar = {
  setup(){
    // clockNow is app.js's shared one-second clock; setup runs after app.js loads.
    const st = Vue.computed(() => oceanState(new Date(clockNow.value)));
    const label = Vue.computed(() => st.value.open ? 'Ocean Fishing · registration open' : 'Ocean Fishing · next boarding');
    const time = Vue.computed(() => fmtOceanClock(st.value.msLeft) + (st.value.open ? ' left' : ''));
    const npc = Vue.computed(() => st.value.open
      ? '· Dryskthota, Limsa Lominsa Lower Decks (3.0, 12.7)'
      : '· ' + new Date(st.value.at).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}));
    return {st, label, time, npc};
  },
  template: `
    <div class="ocean-bar" id="ocean-bar" :class="{registering: st.open}">
      <span class="oc-label">{{ label }}</span>
      <span class="oc-time">{{ time }}</span>
      <span class="oc-npc">{{ npc }}</span>
    </div>`
};
