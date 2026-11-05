/* ---- Relics ----
   Two frames, Weapons and Tools, with one collapsible panel per relic line. A panel
   counts items, the same way as FFXIV Collect's relic pages: one item for each job at
   each counted stage. The grid has one row per stage and one column per job.

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
          <thead><tr><th scope="col">Stage</th><th v-for="j in line.jobs" :key="j" scope="col" :title="jobName(j)">{{ j }}</th></tr></thead>
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

const RelicsPanel = {
  components: {RelicLinePanel},
  props: {c: Object, kind: String, tick: Number},
  setup(props){
    const open = Vue.reactive({});
    // DATA is not reactive, so the tick makes this run again after an import.
    const held = Vue.computed(() => (props.tick, heldRelics(props.c)));
    const lines = Vue.computed(() => relicLinesOfKind(props.kind).map(code => relicLineView(code, held.value || {})));
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
      <div class="jr-note" style="margin-top:10px">Each job counts the highest stage held and every stage before it. Tales of Milestones reads the armoury chest, bags, saddlebag, retainers and glamour dresser. It does not read the Armoire or what a retainer has equipped, so a weapon there is not counted.</div>
    </template>`
};
