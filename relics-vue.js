/* ---- Relics ----
   The first panel drawn by Vue instead of an HTML string. It shows the same thing
   relicLineHTML and relicExpHTML showed, with the same classes, so style.css needs
   no change. It only reads the character: it has no inputs and writes nothing, so the
   saved data and the Time Memoria import format do not change.

   JourneyPanel (journey.js) draws one RelicExpansion per expansion, so this file
   loads before journey.js. vendor/vue.global.prod.js is a pinned copy (3.5.13), so
   the page makes no request to a CDN. */
const RelicLine = {
  props: {code: String, c: Object, held: Object},
  setup(props){
    const line = RELIC_STAGES[props.code], total = line.stages.length;
    const genre = RELIC_GENRE[props.code];
    const ids = genre && TM_QUEST_GENRES[genre] ? TM_QUEST_GENRES[genre].ids : null;
    const done = ownedSet(props.c, 'questsDone');
    const quests = ids ? {g: genre, have: ids.filter(id => done.has(id)).length, total: ids.length} : null;
    const jobs = props.held && props.held[props.code]
      ? Object.keys(props.held[props.code]).sort((a, b) => (TM_JOB_NAMES[a] || a).localeCompare(TM_JOB_NAMES[b] || b))
          .map(j => {
            const s = props.held[props.code][j], il = line.stages[s] && line.stages[s][1];
            return {j, s, il, label: (TM_JOB_NAMES[j] || j) + ' · ' + relicStageName(props.code, j, s)};
          })
      : [];
    return {line, total, quests, jobs, jrPct, wikiUrl, letter: i => String.fromCharCode(65 + i)};
  },
  template: `
    <div class="subhead">{{ line.name }}</div>
    <div v-if="held === null" class="jr-note">Import a newer Tales of Milestones export (Copy everything) to see the stage of each job.</div>
    <div v-else-if="jobs.length" class="jr-grid">
      <div v-for="r in jobs" :key="r.j" class="jr-row" :class="{full: r.s === total - 1}" :title="r.il ? 'Item level ' + r.il : ''">
        <span>{{ r.label }}</span><span class="jr-v">{{ r.s + 1 }} / {{ total }}</span>
        <div class="jr-bar"><i :style="{width: jrPct(r.s + 1, total) + '%'}"></i></div>
      </div>
    </div>
    <div v-else class="jr-note">None held.</div>
    <div v-if="quests" class="jr-grid">
      <div class="jr-row" :class="{full: quests.have === quests.total}">
        <a class="jr-link" :href="wikiUrl(quests.g)" target="_blank" rel="noopener noreferrer" title="Open the wiki page in a new tab">{{ quests.g }}</a>
        <span class="jr-v">{{ quests.have }} / {{ quests.total }}</span>
        <div class="jr-bar"><i :style="{width: jrPct(quests.have, quests.total) + '%'}"></i></div>
      </div>
    </div>
    <details class="relic-stages"><summary class="jr-note">All {{ total }} stages</summary>
      <div class="jr-duties relic-ladder">
        <span v-for="([s, il], i) in line.stages" :key="i" :title="'Stage ' + (i + 1) + (il ? ' · item level ' + il : '')">{{ letter(i) }}. {{ s }}<template v-if="il"> <i class="faint">{{ il }}</i></template></span>
      </div>
    </details>`
};

const RelicExpansion = {
  components: {RelicLine},
  props: {ex: Number, c: Object},
  setup(props){
    return {held: heldRelics(props.c), codes: relicLineCodes().filter(k => RELIC_STAGES[k].ex === props.ex)};
  },
  template: `
    <RelicLine v-for="k in codes" :key="k" :code="k" :c="c" :held="held" />
    <div class="jr-note" style="margin-top:10px">The highest stage held for each job: armoury chest, bags, saddlebag, retainers and glamour dresser. A job with none is not listed. What a retainer has equipped and the Armoire are not read.</div>`
};
