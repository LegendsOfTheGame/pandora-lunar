# Pandora Lunar — full code review

Reviewed commit: `a9ea464` (main, 13 November 2026). Branch for any fixes: `claude/fable-review`.
Reviewer: Claude (session started from the TimeMemoriaV3 review session). No code was changed.

## How to read this report

- Each finding has an ID. Use the IDs to pick fixes, for example "fix B1–B8 and P1".
- The ID letter is the severity:
  - **B — bug.** Something that is wrong for a user now.
  - **P — performance.** Work that makes the page slower than it needs to be.
  - **E — efficiency.** Dead code, duplicate code or duplicate data. No user effect, but extra weight and extra places to keep in step.
  - **M — minor.** Accessibility, robustness, out-of-date help text, small visual problems.
  - **N — nit.** Typos, formatting, comments, naming, a comma out of place.
- Line numbers are for commit `a9ea464`.
- "Verified" means I tested it in a browser on a local static server (`localhost:8791`, serving this worktree). The other findings come from reading the code.
- I did not hand-review `vendor/vue.global.prod.js` or the generated data files. Section 12 covers only how those files load and how big they are.

## Counts

| Severity | Count |
|---|---|
| B — bug | 14 |
| P — performance | 16 |
| E — efficiency | 26 |
| M — minor | 52 |
| N — nit | 100 |
| **Total** | **208** |

## Fix status (14 November 2026)

Haven chose "bugs + performance". The fixes are in the worktree on `claude/fable-review`, not committed yet, and tested on a local server with a real Tales of Milestones export (no console errors).

- **Fixed and tested:** B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, B13, B14.
- **B12 — not a bug, withdrawn.** The "clean" regex is `/^[-]\s*/` written with the real private-use characters. My editor showed them as nothing, so I read it as `[-]`. It already strips the game's icons. N32 is withdrawn for the same reason.
- **Fixed:** P1, P2 (also covers P10 and P15), P3, P4, P5, P6, P8, P9, P11, P12, P13, P14, P16.
- **P7 — not done.** Faster loading needs a build step or a change to the data generators, which are outside this repository.
- **Measured** (same export, two characters, before → after): DOM elements 34,246 → 7,313; full page rebuild 176 ms → 83 ms; a routine sub-check tick about 30 ms → about 19 ms. Opening Collections now costs about 60 ms the first time, because the list is drawn when it is opened instead of at start-up.
- **Behaviour changes to know about:**
  - Only the page on screen is drawn. Another character's page is drawn when you open it.
  - In Journey, each frame is drawn the first time it is opened, then kept.
  - A collapsed section keyed on the old heading text (for example "Quest categories") opens once, because its saved key changed (B7).
  - The pre-commit hook now stamps only the staged copy of `index.html` (B13).

## The top items

1. **B1** — The expansion card that shows when you pick a route station never appears. It looks for an element that Layout D removed. Verified.
2. **B2** — The Ocean Fishing clock uses the wrong time format ("00:29:58" instead of "29:58"). Two files define a global `fmtClock`; the second one wins. Verified.
3. **B3** — New quest-total corrections never reach existing characters, because a one-time flag blocks them. The comments say to add a line for each patch; that line would do nothing.
4. **B5** — The All / Owned / Missing chips in Collections lose their highlight whenever you change area. Dead code in `applyTab` removes the class.
5. **B6** — The "Next Steps" and "Routines" headings lose their flex layout, so their buttons drop under the title. Verified.
6. **P1** — Collections draws every row of every list (about 4,550 table rows) for every character, all at once, and works out availability for each mount and minion on every redraw. This is the largest DOM cost on the page.
7. **P2** — `ownedSet()` rebuilds a `Set` from the whole quest list on every call. One click on a Challenge Log "+" button rebuilds it about 170 times.
8. **P4** — The Next Steps planner scans the whole 855 KB quest graph again every time the routine list redraws (every tick of a sub-check, every hide or unhide).
9. **E3** — About 80 lines of CSS and a dozen JS functions are left over from Layouts A and B and are no longer used.
10. **B9** — The Challenge Log ⓘ lists in `app.js` have drifted from the game data in `challenge-log.js` (wrong names such as "Craft Up a Storm" twice).

---

## 1. `app.js` (6,431 lines)

### Bugs

- **B1** — `app.js:3004-3005` (and `2982-3020`). `renderStationCard` looks for `#page-<id> .char-header` and returns when it is not there. Layout D removed the char header from `CharPage` (name and MSQ moved to Settings). So no page has `.char-header`, and the StationCard (the picked expansion's quest count) never renders. **Verified.**
  **Fix:** Add a fixed box to the top of `CharPage` (for example `<div class="station-card" :id="cid+'-station-card'"></div>`) and mount the card there. Or remove the feature. Also remove the stale comment at `2274-2278` and the `.char-header` CSS (see E3).

- **B2** — `app.js:2861` and `ocean.js:16`. Both files declare a global `function fmtClock`. Classic scripts share one global scope, and `app.js` loads later, so its version replaces the one in `ocean.js` with no error. The Ocean Fishing bar shows "00:29:58" (or "1d 2h 03m") instead of the intended "29:58" / "1:42:10". **Verified.**
  **Fix:** Rename one of them (for example `fmtOceanClock` in `ocean.js`), or keep one shared formatter.

- **B3** — `app.js:2003` with `1292`. `applyQuestTotalFixes` runs only while `c.questTotalFixesApplied` is false, and it sets that flag. The comment at `1274-1275` says "Add a line per figure when a patch moves one". A line added later never reaches a character that already has the flag. This is the same design fault that the comment at `1162-1174` describes and fixed for `SEED_SCHEDULE_FIXES`.
  **Fix:** Record fixes by id (`c.questTotalFixesDone = [...]`), as `applySeedScheduleFixes` does. Or run the list on every load (the `from` guard protects typed values).

- **B4** — `app.js:2247` (`addCharacter`) and `2263` (`removeCharacter`). They push `newCharacter('')` without `normalizeCharacter`. `newCharacter` (`1941-1975`) does not create `itemJobsOff`, `itemsAhead` or `itemsHq`; only `normalizeCharacter` (`2013-2015`) adds them. On a new character, as soon as a crafter or gatherer level is above 0, `QuestItems` reads `c.itemJobsOff[j]` (`4954`) and throws a `TypeError`. `itemsHq` is also `undefined`, so "Mark items HQ" shows off instead of the default on. A reload repairs it.
  **Fix:** Add `itemJobsOff: {}, itemsAhead: false, itemsHq: true` to `newCharacter`, or wrap the new character in `normalizeCharacter`.

- **B5** — `app.js:3583`, with `journey.js:217`. `applyTab` runs `page.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab))`. No real tab buttons exist any more, but the Collections filter chips (All / Owned / Missing) use the class `tab-btn` and have no `data-tab`. Every area change removes `active` from the selected chip. Vue does not put it back, because its own class value did not change.
  **Fix:** Delete the `.tab-btn` loop in `applyTab`. Optionally give the chips their own class (see M38).

- **B6** — `style.css:863-864` against `style.css:157-166`, affecting `app.js:2321-2322`. The rule `[data-frame].frame-on{display:block}` (specificity 0,2,0) beats `.section h2{display:flex}` (0,1,1). The "Next Steps" and "Routines" headings carry `data-frame`, so when they are shown they become `display:block` and the hint and buttons drop under the title. `style.css:1515` handles only the hidden state. **Verified** (computed `display: block`).
  **Fix:** Add `.section h2[data-frame].frame-on{display:flex}`.

- **B7** — `app.js:5779-5784`. `sectionKey` builds the saved collapse key from the first three words of the `h2` text. That text includes live content: the "Quest categories" heading contains the plugin-mode hint ("via Tales…" or "manual entry…"), so the key changes when the plugin mode changes, and a saved collapse is lost. Also, the routines section has two `h2` elements (`2321-2322`). `initCollapsible` attaches the toggle to the first one (Next Steps), which is hidden in the routine frames, so those frames have no visible collapse button. The second `h2` is moved into `.sec-body`.
  **Fix:** Give each section a fixed key (`data-sec="quests"` and so on) and use that. Attach the toggle to the visible heading.

- **B8** — `app.js:5851-5852`. `importData` replaces `DATA` before it checks the backup. A backup with `"chars": []` makes `normalizeData` throw at `DATA.chars[0].id`. The alert shows, but `DATA` is left half replaced (no characters), and the page stays broken until a reload. Any later `scheduleSave` would write that broken state.
  **Fix:** Check `parsed.chars.length > 0`, normalize a temporary object, and assign `DATA` only after that succeeds.

- **B9** — `app.js:853-960` (`CHALLENGE_LOG`) against `challenge-log.js` (`CHALLENGE_NOTES`, generated from the game's ContentsNote sheet). The hand-written list (dated patch 7.51) has drifted:
  - `881-882`: both entries are named "Craft Up a Storm". The game names are "Crafting Up a Storm" and "Crafting Up a Storm (HQ)".
  - `946-947`: "elementals"; the game says "sprites".
  - `932-933`: "encounters"; the game says "critical encounters".
  - `855`: "(or Alliance Raids)" is not in the game text.
  - The game's "Other" category now also has Soul Survivor I–III and Master Class I–II. So `1035-1036` ("it is Island Sanctuary and nothing else") and the counts "80 challenges" (`846`, `1028-1032`) are out of date.
  **Fix:** Build the ⓘ list from `CHALLENGE_NOTES`, grouped by category, and delete `CHALLENGE_LOG`. This also removes about 100 lines of duplicate data.

- **B10** — `app.js:5447-5449`. `renderGatedNote` names "next at X" from every row that `isGated()` matches. But `routineLock` (`1859-1875`) skips the patch gate when the plugin's unlock data answers. So the note can name a patch for a row that is not locked by a patch.
  **Fix:** Take the next patch only from locks whose `reason === 'patch'`.

- **B11** — `app.js:2625` and `app.js:5411`. The two time-zone / hunt-row switches are `<span role="switch" tabindex="0">` with only `@click`. A keyboard user can focus them but cannot change them (Space and Enter do nothing).
  **Fix:** Use `<button type="button" role="switch" :aria-checked=...>`, or add `@keydown.space.prevent` and `@keydown.enter`.

### Performance

- See **P2** in section 2 (`journey.js:112`, `ownedSet`). In `app.js` the main callers are: `4104` (once per society row, 20 per redraw), `2756-2775` (every rail meter), `2684`, `3114`, `3218`, `3223`.

- **P3** — `app.js:2846-2851` (`renderNav`) and `3142-3158` (`renderRail`). Every click (area, frame, station, toggle) runs `renderRail`, which works out every area meter: `todayMeter`, `weeklyMeter`, `seasonalMeter`, `relicsMeter`, `jobsMeter`, `dutiesMeter` (`Object.keys(TM_DUTIES)` filtered each time), `collectionsMeter` (walks every collection list). It also calls `activeAreaFrame` → `AREAS.today.frames` → `framesFor('routines')`, which runs `isLocked` on every routine once, plus once more per section through `sectionMeter`, plus `currentEvents()` and `seasonalMeter` again. `renderFrameRow` and `renderSpot` repeat parts of this.
  **Fix:** Work out the meters once per `renderNav` call, or cache them per character and clear the cache when data changes.

- **P5** — `app.js:2475-2489` (`CharPages`, `rebuildPages`) and `5721-5755` (`renderChar`). Every character (up to 8) gets a full page with about 22 Vue apps, all drawn at start-up and again on add, remove and import. Hidden pages are only `display:none`. With Collections (P1) and Journey also drawn for every frame, this multiplies all other costs by the number of characters.
  **Fix (larger change):** Draw the active character's page first and other pages when they are first opened.

- **P6** — Timers. One-second intervals: `2882` (spot clocks), `3060` (one `EventList` per character page, hidden pages too), `3378` (Evercold bar), `3406` (reset bar), `3480` (footer), `ocean.js:26`. Also `3478` (footer rotation, 5 s), `3537` (60 s) and `6428` (30 s, refreshes routines for every character). The reset bar's computed (`3408-3430`) runs the full lock check on every routine every second.
  **Fix:** Use one shared `now` ref driven by one interval. Skip hidden pages. Pause while `document.hidden`. Work out the reset bar's list of due routines when data changes, and only the countdown every second.

- **P8** — `app.js:5435` and nearby. `routineLock` runs for every routine three or more times per `renderRoutines` (snapshot, `routineLive`, `renderGatedNote`, then the rail through `refreshNav`). `schedById` (`1295`) is a linear search called for every routine in these paths. `routineGroups` (`1440-1449`) calls `activityGroup` for each group and item, which searches every group again.
  **Fix:** Work out locks once per render. Make `schedById` a `Map`. Build a `seedKey → group` map once.

- **P9** — `app.js:5761-5771` (`onMainInput`) runs on every keystroke in many inputs: `collectAllInputs` (every input of every character, about 150 `getElementById` calls each), then seven redraws, two of which are the same `bumpQuests`. `save()` (`2093-2101`) calls `collectAllInputs` again.
  **Fix:** Collect only the character being edited, remove the duplicate bump (see E14), and let `save()` skip the sweep when the caller has just done it.

- **P11** — Redraws for every character where only the visible one changes: `pickStation` (`2974`, Collections and Journey for all), `onRedAlertClassChange` (`4745`), `toggleHuntRows` (`1418-1419`), `toggleZoneStyle` (`2581-2582`). `applyTmImport` (`6409`) rebuilds every page, then the page reloads on close anyway.
  **Fix:** Redraw the active character now and the others when they are opened.

- **P12** — `app.js:2880`. `tickSpotClocks` replaces the `innerHTML` of the four spot clocks every second (new nodes each tick).
  **Fix:** Create the nodes once and update `textContent`, or make the clocks a small Vue app.

- **P13** — `app.js:759-784` (`hubQuestsFor`, `roleQuestsFor`) build and spread new objects on every call, although the result depends only on the job. They are called from `jobLive` for all 34 jobs on every keystroke (`5078`).
  **Fix:** Cache the result per job in a `Map`.

### Efficiency (dead or duplicate code)

- **E1** — Dead functions and code paths (nothing calls them):
  - `1935` `jsStr()`.
  - `3159` `goSection()`.
  - `3346` `openTools()`.
  - `3125`, `3129` `visibleRoutineCount()`, `visibleJobCount()` — used only by `RAIL_SECTIONS`, whose `label`, `group`, `ico` and `count` fields nothing reads (`5753` reads only `.key`).
  - `3571-3573` the `.theme-switch button` loop in `applyTheme` (no such element).
  - `3583` the `.tab-btn` loop in `applyTab` (see B5).
  - `3574`, `3576` the `#theme-sel` and `#time-sel` parts of the selectors (no such ids).
  - `5853` clearing `data-collapsible-ready` on sections that `rebuildPages` replaces in the next line.
  **Fix:** Remove them. Reduce `RAIL_SECTIONS` to a list of keys.

- **E2** — Ids written in templates that no code reads (left from the old `innerHTML` renderer): `-jqcell-`, `-jqrow-`, `-jqpanel-`, `-jqbtn-` (`5043-5046`), `-ccap-` / `-craftmark-` / `-gathermark-` (`markId`, `5042`, `5059`, `5064`), `-rt-due-`, `-rt-item-`, `-rt-hidebtn-` (`5266`, `5272`, `5275`), `-custom-item-` (`5165`), `-msqbtn` (`3848`), `-msqrow` (`3905`), `-msqcheck` (`3882`), `-qpct-` (`3851`), `-msqexppct-` (`3867`). Several contain spaces (see M12).
  **Fix:** Remove them.

- **E4** — The same routine object is built in three places: `seedRoutines` (`1069-1071`), `seededRoutine` (`1076-1077`) and `backfillSeedRoutines` (`1146`). `addRoutine` (`5517`) builds a fourth shape without `hidden` and `seedKey`.
  **Fix:** One `makeRoutine(row)` function.

- **E5** — The routine visibility test `(c.showGated || !isLocked(r, c)) && (c.showHidden || !r.hidden)` is copied five times: `2725`, `3127`, `3180`, `3413`, `5366`.
  **Fix:** One `isRoutineShown(r, c)` function.

- **E6** — The 12 hunt routine keys are written three times: `ACTIVITY_GROUPS` (`1334-1337`), `HUNT_DAILY_KEYS` / `HUNT_WEEKLY_KEYS` (`1356-1359`) and `HUNT_SHORT` (`1360-1365`).
  **Fix:** One table of `[key, short name, daily|weekly]`, with the others derived from it.

- **E7** — Level caps and targets are typed in several places: `2230 + 800 + 300` (`2708`), `'2,230'`, `'800'`, `'300'` (`3628-3630`), and the cap text in `2335`. Trade targets `300` / `100` appear at `3619`, `3730-3731`, `3771`, `3773` although `TRADE_MENTOR_TARGETS` exists (`3700`). The level sums are written twice (`2706`, `3611-3613`).
  **Fix:** Derive the caps from `COMBAT_JOBS` once (`LEVEL_CAPS`), and use the constants everywhere.

- **E8** — The six quest sub-category keys are written three times: `SUB_CATS` (`809`), `QUEST_SUBS` (`6229`, with labels) and `QUEST_SUBS` (`6333`).
  **Fix:** Use `SUB_CATS` in the import.

- **E9** — `ROLE_QUESTS.shb.melee` and `ROLE_QUESTS.shb.ranged` (`690-691`) are the same array written twice. `['shb','ew','dt']` is typed twice (`762`, `776`).
  **Fix:** One shared constant for each.

- **E11** — Three countdown formatters with three different formats: `fmtDue` (`1498`, "6h 41m"), `fmtClock` (`2861`, "06:41:12") and `fmtCountdown` (`3356`, "6:41:12"), plus a fourth in `ocean.js` (see B2).
  **Fix:** Keep one formatter with an option for the style.

- **E12** — Two id → name tables for allied societies: `TM_SOCIETY_IDS` (`303`) and `TM_SOCIETY_NAMES` (`5924`). The different spellings are on purpose, but nothing says which table is for what.
  **Fix:** Add a one-line comment to each, or keep only one table with both spellings.

- **E13** — `framesFor('societies')` (`3205-3209`) and `SocietyList` (`4127-4129`) repeat the same expansion filter.
  **Fix:** One helper.

- **E14** — `updateMsqCheckNote` and `updateQuestPercents` (`3964-3966`) only call `bumpQuests`. `onTotalInput` (`3826-3828`) and `onMainInput` (`5766-5768`) call both, so the table redraws twice.
  **Fix:** Remove the two wrappers and call `bumpQuests` once.

- **E15** — `questItemJobs` (`4914-4918`) and `jobSnapshot` (`5050-5051`) define the same `show` helper. `questItemsForJob` runs three times per job per redraw (`4917`, `4921`, `4956`).
  **Fix:** One helper; compute the per-job list once.

### Minor

- **M1** — `app.js:1509-1525`. The `AudioContext` is created inside a timer tick, which is not a user gesture, and `resume()` is never called. Under browser autoplay rules it can stay "suspended", so the reset sounds are silent. The `try/catch` does not see this.
  **Fix:** Create or resume the context in `toggleResetSound` (a click) and call `audioCtx.resume()` in `beep`.

- **M2** — `app.js:3646-3647`. The tank row names the achievement "No Sleep Till Tuliyollal" (the wiki says it is awarded for the quest "Dreams of a New Day"). The healer row names the quest "An Antidote for Anarchy". `planner-vue.js:64` uses "Dreams of a New Day".
  **Fix:** Use the quest name in both rows.

- **M3** — `app.js:2360`. The Red Alerts source link goes through the link shortener `linkly.link/2ugww`. It hides the destination, can stop working or point elsewhere, and is an extra third-party hop on a site that says nothing leaves the browser.
  **Fix:** Link to the wiki page directly.

- **M4** — `app.js:5855-5856`. After a backup is restored, `applyTheme()`, `applyRoutineEdit()` and the collapsed-rail state are not applied. The restored theme and settings show only after a reload.
  **Fix:** Call the same set-up steps as `init` (`6419-6423`).

- **M5** — `app.js:2179`. The rail's character `<select>` appears only when there are two or more characters. With one character there is no way to add a second one from the rail; only Settings → Character has the button. The help text says to use the list in the rail (see M30).
  **Fix:** Always show the select when `canAdd` is true, or put a "+ Add a character" button in the rail.

- **M6** — `app.js:5834`. `URL.revokeObjectURL` runs immediately after `a.click()`. In some browsers (older Safari and Firefox) this can cancel the download.
  **Fix:** Revoke in a `setTimeout`.

- **M7** — `app.js:3546-3552`. When another tab saves, this tab cancels its pending save and reloads. Text typed in this tab during the last 500 ms is lost without a message. The comment accepts this; it is listed so that the choice is visible.

- **M8** — `app.js:2789`, `3149`, `3160`. `try { … } catch(e) { return [] / null / false }` hides every error in frames and meters. A real bug then shows only as a missing meter.
  **Fix:** Add `console.error(e)` in each `catch`.

- **M9** — `app.js:6417-6431`. The `async` start-up function has no `catch`. Any error during start-up becomes an unhandled rejection, and the user sees a half-drawn page with no message.
  **Fix:** Wrap the body and show a short message in `#save-status`.

- **M10** — `app.js:2705-2708`, `3611-3613`, `6318`. Job levels from a backup or an import are stored as sent; `normalizeCharacter` never makes them numbers. A string such as `"90"` makes `a + b` join text, and the meter becomes `NaN`.
  **Fix:** In `normalizeCharacter`, convert each job level with `num()`, and use `num()` in the import.

- **M11** — `app.js:2080`. `chars.slice(0, MAX_CHARS)` drops characters 9 and up from a hand-edited backup without a message. They are deleted at the next save.
  **Fix:** Warn in the restore dialog.

- **M12** — `app.js:4886` and `5043-5046`. Ids are built from job names with spaces ("Dark Knight", "White Mage", "Black Mage", "Red Mage", "Blue Mage"), for example `cid-jq-Dark Knight-3`. An HTML id must not contain spaces. `getElementById` still works, but CSS and `querySelector('#…')` do not.
  **Fix:** Use a slug of the job name.

- **M13** — `app.js:4521-4525`. `String(cosmicToolName(...))` writes the word "null" on screen for a class that has no tool names. The comment says this copies the old HTML.
  **Fix:** Fall back to the class name.

- **M14** — `app.js:4494-4502`. A tool at its final stage may match no column, because there is no next upgrade to "need". The panel then says "The research totals match no stage … A later patch can add stages." This needs a test with a fully upgraded tool.
  **Fix (if confirmed):** Treat "all `needed` values are 0 or missing" as the last stage.

- **M15** — `app.js:4856-4858` and `5124-5128`. The job quest checklist toggles by array index and relies on a stable sort. `toggleJobQuestDone` reads the checkbox back from the DOM by id; if it is missing, it throws.
  **Fix:** Pass the quest name and `$event.target.checked`.

- **M16** — `app.js:5559-5562`. `subsOf()` writes `item.subs` while the row is being drawn, without a save. For a schedule of kind `cooldown`, `lastResetInstant` returns 0, so `at` never changes and the sub-checks never clear if a user moves such a row to "18h from last click".
  **Fix:** Use `lastDone`-based expiry for cooldown kinds, and do not write during render.

- **M17** — `app.js:3778`, `3819`, `4402`, `5723-5730`, `5708-5714`. `getElementById(...)` is used without a null check, while nearby functions do check.
  **Fix:** Add the checks, or pass the values from the event.

- **M18** — Inputs and controls with no accessible name (the visible text is in another cell or span): playtime inputs (`2310-2311`), duty and commendation inputs (`2403-2404`), trade inputs (`2411-2412`), notes textarea (`2425`), quest table inputs (`3849-3850`, `3864-3866`), society rank select and points input (`4150`, `4155`), job level inputs (`5040`), custom tracker inputs (`5167-5170`), routine edit controls (`5269-5271`), the import target select (`6019`), the Hunt master checkbox (`1403`).
  **Fix:** Add `aria-label` (for example `:aria-label="r.name + ' rank'"`) or wrap in a `<label>`.

- **M19** — Icon-only buttons named only by `title` or by a symbol: ⓘ (`5273-5274`, also no `aria-expanded`), ◉ / ○ (`5275`), × (`5172`, `5276`), the mute button 🔔 / 🔕 (`3501-3502`, no `aria-pressed`), the footer dots (`3515`, empty, no `aria-current`), the collapse buttons + / − (`5797-5807`, no `aria-expanded`), the hunt show / hide buttons (`4345`, no `aria-expanded`), the Challenge Log on / off button (`5401`, no `aria-pressed`).
  **Fix:** Add `aria-label` and the matching state attribute.

- **M20** — `app.js:4886`, `5288`. Checkboxes in the job quest and Custom Delivery lists are not inside a `<label>`, so clicking the quest name does nothing and screen readers read no name.
  **Fix:** Wrap each row in a `<label>`.

- **M21** — `app.js:3282`. The frame buttons have `role="tab"` inside `role="tablist"`, but no `aria-controls`, no roving `tabindex` and no arrow-key handling. The tab pattern is half done.
  **Fix:** Finish the pattern, or drop the roles and use `aria-current="true"` on the active button.

- **M22** — `app.js:3496`. The footer rotation stops on mouse hover only. It does not stop on keyboard focus, and there is no pause control (WCAG 2.2.2).
  **Fix:** Add `@focusin` / `@focusout` to the hold, or a pause button.

- **M23** — `app.js:2947`. A `div` with `tabindex="0"` and `aria-label` but no role; most screen readers ignore the label.
  **Fix:** Add `role="group"` (or `region`).

- **M24** — `app.js:4976`. `aria-label` on a plain `<span>` (the key icon) is ignored.
  **Fix:** Add `role="img"`.

- **M25** — `app.js:3794` (`fmtTmTimestamp`) uses the browser's locale (12-hour in en-US). The comment at `2600` says every time on the page is "day first on a 24 hour clock" (`en-GB`, `hour12:false`). `ocean.js:33` has the same problem.
  **Fix:** Use `'en-GB'` with `hour12:false`.

- **M26** — `app.js:1022-1024`, `1339`. `dancing-mad` and `aac-m4` stay in `ACTIVITY_GROUPS` for old hidden rows, but `windurst` does not, so an old Windurst row falls into "Other".
  **Fix:** Add `windurst` to "Raids and tomestones".

- **M27** — `app.js:316`. `validRanksFor` throws on an unknown name (destructuring `undefined`).
  **Fix:** Return `[]` when the society is not found.

- **M28** — `app.js:153`. Melt is in "Eastern Shroud"; `136` uses the correct zone name "East Shroud".
  **Fix:** "East Shroud".

- **M29** — `app.js:220`. The Burfurlur condition is garbled from the wiki's icon text: "in clear skies Clear Skies/fair skies Fair Skies daytime".
  **Fix:** "Use a Tiny Troll minion on spawn points during Clear Skies or Fair Skies, in the daytime."

### Nits

- **N1** — `226`: "dies in and Endwalker area" → "dies in an Endwalker area".
- **N2** — `4371`: "an S rank on a 84-132 hour one" → "an 84–132 hour one".
- **N3** — `858`, `887`: descriptions without a final full stop ("Complete 10 guildhests", "Catch 10 large-sized fish").
- **N4** — `881-882`: "Items" with a capital I.
- **N5** — `944-947`: "equal to, or higher than" has a stray comma; `930` has none.
- **N6** — `160` uses escaped double quotes for a FATE name (`\"Cerf's Up\"`); `183` and `244` use single quotes. `179` uses "&", the rest "and". `126` puts "(3 hours 20 minutes)" after the full stop.
- **N7** — `122-260`: the `ELITE_MARKS` inner arrays start at column 0 and use trailing commas; the other tables are indented and have none.
- **N8** — `488-489`, `493`, `504` and others: the level-80 quest is pushed onto the end of a long line instead of the three-per-line pattern. `555` has one entry alone on its line.
- **N9** — `841`: the `cooldown18h` entry is not column-aligned with the other schedules. `5312`, `5314`, `5320`: `CUSTOM_DELIVERY_CLIENTS` alignment broken (`{id:'ameliance',exp:` with no space).
- **N10** — `4260-4262`: a one-entry object with a trailing comma; other object literals in the file have none.
- **N11** — `5269`: two elements on one physical line (`</span>      <input …`). Also `String(schedLabel(...))`: `String()` is not needed.
- **N12** — `831`: the date is written `2027-02-23`; the other comments use day-first dates.
- **N13** — `846`, `1030`: "patch 7.51" while the rest of the data says 7.56 / 7.58 (see B9).
- **N14** — `1305`, `1318-1326`: comments still name an "Other" section (now "Cooldowns"), and `1318-1326` describes the old Daily-only grouping, which `1327-1332` replaced. `5520` and `5643` say "Daily/Weekly/Monthly/Other".
- **N15** — `1331`: "Twelve of the fifty-five seeded routines"; `DEFAULT_ROUTINES` has 52.
- **N16** — `2641`: "The rail lists seven areas"; `AREAS` has nine (Next Steps, Story, Relics, Jobs, Duties, Collections, World, Elsewhere, Settings).
- **N17** — `3344-3345`: "The import panel lives inside the backup page" — the import is now a `<dialog>`.
- **N18** — `3351-3352`: "The count comes from the DOM" — it comes from `FOOT_FIXED` and the events (`3458`).
- **N19** — `3557-3558`: the theme comment says Poetic / Midnight / Daylight; the UI names are Lunar night / Crystarium / Light.
- **N20** — `4101`: the comment says `validRanksFor` "can list rank 8 twice"; no society has its own cap at 8 (all are 4 or 7). The `Set` is harmless.
- **N21** — `4849-4850`: "No sourced list yet (Viper, Pictomancer, Beastmaster)"; all three have lists now (`574`, `633`, `650`).
- **N22** — `5665-5670`: two stacked comments; the first is the pre-Vue explanation.
- **N23** — `6055-6064`: a comment about class and job quests sits above `tmReadCounts` (collectables). It belongs above `tmClassQuestTicks`.
- **N24** — `1758`: the label "Doman Enclave is Complete - OPTIONAL" uses a hyphen-minus where the rest of the page uses an em dash, and all capitals.
- **N25** — `3624`: "3 req'd" — write "3 required".
- **N26** — `3626` against `3739`: the Trade Mentor overall figure has one decimal on the dashboard and three in the panel; the parts have two.
- **N27** — `2453`, `index.html:34`, `index.html:87`: "8 characters" is typed by hand; `MAX_CHARS` exists.
- **N28** — Unused parameters or variables: `1996`, `1999`, `2043` (`label`, `exp`), `4223` and `4231` (`name`), `5564` (`on`), `5646` and `5651` (`id`).
- **N29** — `2006`: `parseInt` without a radix.
- **N30** — `2068`, `2093`: `async` on functions that never `await`.
- **N31** — `311` (`rankInfo`): `.find` on each call; `SOCIETY_RANKS[rank - 1]` is enough. `4068`: `ALLIED_SOCIETIES.find` for each row.
- **N32** — `4109`: the regex `/^[-]\s*/` uses a one-character class; `/^-\s*/` is the same (but see B12 in section 3).
- **N33** — `4307-4319`: arrow parameters in brackets here (`(rank) =>`) and without them elsewhere; the inner `block(…)` parameter `marks` hides the outer `marks`.
- **N34** — `4330-4333`: `HuntList` calls `getChar` (an array search) about 150 times per redraw; use one computed.
- **N35** — `4399`: `huntDashView` is worked out twice per `renderHuntDash`.
- **N36** — `4532`: `cosmicTypeList(full)` built twice. `4756-4757`: no singular ("in 1 Red Alert variants", "1 variants").
- **N37** — `4616-4733`: the `RED_ALERTS` entries use a three-space indent for `variants:[`, unlike the rest.
- **N38** — `2569-2571` (`tz`): `a` is worked out even when there is no second time, and `localClock(utcAt(h, m))` runs twice.
- **N39** — `2592`, `2596`: `new Date()` made three times in one call. `2858`: `spotAgo` shows "NaN days ago" for a bad date. `2862`: six declarations on one line.
- **N40** — `3283`: the count is joined to the label with an em dash and no space ("Daily—12").
- **N41** — Inline `style=""` in templates where a class would do: `2308-2313`, `2402-2412`, `3849-3851`, `3863-3867`, `3882`, `3902`, `3905`, `4155`, `4973`, `4981`, `5040-5043`, `5407`.
- **N42** — `2458-2459`: inline `onchange=""` inside a Vue template; the rest of the template uses `@change`. The `aria-label` repeats the wrapping `<label>` text.
- **N43** — `3010`, `5795`: DOM nodes are inserted or moved by hand inside a Vue-rendered tree. It works only because `CharPage` never re-renders.
- **N44** — `3575`: `applyTheme()` also calls `applyRoutineEdit()`, which has nothing to do with the theme.
- **N45** — `3385`, `3388`: the Evercold date text repeats `EVERCOLD_UTC`.
- **N46** — `3506`: `:key="e.name"`; two running events with the same title would collide. Use name plus start time.
- **N47** — `3905`: the row has both a `v-if` inside and a `:style` display toggle on `msqOpen()`, which runs twice per row. `5403`: an empty `<template v-if="s.collapsed"></template>` used as a placeholder branch.
- **N48** — `3903`, `4147`, `5400`: keys include `state.tick`, so every row remounts on each full render. This is on purpose for `v-once`; listed so that the cost is known.
- **N49** — `5912` uses a straight apostrophe ("isn't"), `5991` a curly one ("Doesn’t").
- **N50** — `6052`: a local variable `pct` hides the global `pct()` function.
- **N51** — General: about 600 top-level functions and constants share the global scope across `app.js`, `journey.js` and the `*-vue.js` files, with no `'use strict'`. B2 is one result. A duplicate `const` would stop a whole file at load time.

---

## 2. `journey.js` (600 lines)

### Bugs

- See **B5** (the chips at `journey.js:217`).

### Performance

- **P1** — `journey.js:174-224` (`CollectionsPanel`). It draws every row of every list — 2,750 FFXIV Collect rows, 1,517 fish and 289 spearfish, about 4,550 `<tr>` and 23,000 nodes — for each character with an import, all in the DOM at once. Hidden frames are only `display:none`. Each redraw also runs `itemAvail` → `srcState` (several regular expressions, and `availFeed()` maps the whole events feed again) for every mount and minion row. `renderCollections` runs for every character on every route-station pick (`app.js:2974`).
  **Fix:** Draw only the list whose frame is on, and only for the active character. Work out availability once per item per page load.

- **P2** — `journey.js:112`. `ownedSet(c, key)` makes a new `Set` from the whole list on every call. `questsDone` holds thousands of ids. It is called dozens of times per click: 20 times per society redraw, in every rail meter, in frame counts, about 34 times in `RelicsByJob`, and about 170 times per Challenge Log redraw (see section 6).
  **Fix:** Cache the `Set` in a `WeakMap` keyed by the list array. An import replaces the arrays, so the cache clears itself.

- **P14** — `journey.js:483-594` (`JourneyPanel`). Every frame (questlines, five relic views, seasonal, all duties, exploration, mount speed) is drawn for every character, all at once.
  **Fix:** Draw only the active frame.

- **P16** — `journey.js:459-466` (`relicsMeter`). On every rail redraw it parses the relic string again and builds every weapon cell, including the tooltip text, only to count them.
  **Fix:** Count without building cells, or cache per import.

### Efficiency

- **E16** — `journey.js:375`: `relicLineCodes()` is never called.
- **E17** — `journey.js:86-87`, `290-296`: `speedZones()` maps and sorts the whole table on every call and is called twice in a row. Build it once.
- **E18** — `journey.js:141-142`: `availFeed()` maps the whole feed again on every call, and `runningNow` calls it for each source.

### Minor

- **M32** — `journey.js:168-169`. `collOwnFilter` is one global value for every character and every list, and it is not saved. `setCollFilter` redraws only one character, so other characters' lists show the old filter until their next redraw.
- **M33** — `journey.js:219`. The first column header (✓) is empty. Add hidden text such as "Owned".
- **M34** — `journey.js:510`. `TM_WORLD` is used without a `typeof` check; `CURRENT_ZONES` (`525`) has one.
- **M35** — `journey.js:381`, `476`. `RELIC_STAGES[code]` is used without a check; `375` checks `typeof RELIC_STAGES`.

### Nits

- **N52** — `journey.js:317-318`: "Weapons and Tools frames" — there are also Armor, GARO and By job now.
- **N53** — `journey.js:342-344`: `RELIC_JOBS` is changed after the literal; `FG = EX = …` is a chained assignment.
- **N54** — `journey.js:77-78`: the label map is rebuilt on each call; `forEach(k => label[k.key] = k.label)` returns an assignment.
- **N55** — `journey.js:147-157`: several statements per line and one-line `if` bodies; the inner `k` hides the outer one.
- **N56** — `journey.js:189-193`: `ORDER` is rebuilt for every list; `owned.has(r[0])` runs three times per row.
- **N57** — `journey.js:500`: nested assignment `((byExp[exp] = …)[type] = …).push(…)` is hard to read.
- **N58** — `journey.js:524-530`: an IIFE inside an object literal on one 300-character line; the arrow parameter `c` hides the character `c`. `EXN` uses "SB" where comments elsewhere use "StB".
- **N59** — `journey.js:213`, `555`, `564`, `566`: inline styles. `581`: the gemstone cap "1,500" is typed by hand.
- **N60** — `journey.js:229`, `599`: these renderers settle frames only when their tab is active; the other renderers always do.
- **N61** — `journey.js:253`: `rel="noopener noreferrer"` here, `rel="noopener"` everywhere else.

---

## 3. `relics-vue.js` (207 lines)

### Bugs

- **B12** — `relics-vue.js:48` (`rjClean`), `planner-vue.js:27` (`plClean`), `challenge-vue.js:58` (`clClean`), `app.js:4109`. They strip only a leading "-". The quest names in `relic-unlocks.js` and `tribes.js` start with the game's private-use icons ` ` and ` ` (for example " Make It a Manderville", " Reaching for Cloud Nine"). These show as an empty box in "Start with …" and "Unlock with …".
  **Fix:** One shared `cleanQuestName()` with `/^[--]\s*/`.

### Performance

- **P10** — `relics-vue.js:81-86`, `94-95`. `rows` calls `rjState` for all 34 jobs; each runs the full `rjView` (with `ownedSet(c,'questsDone')`) and `rjLevel` twice. `159`: `startDone` rebuilds `ownedSet` for each card.
  **Fix:** Build the done set once per redraw and pass it in.

### Efficiency

- **E19** — The same "clean" function exists four times (see B12); `clClean` is never called. `RJ_EXP` (`47`), `PL_EXP` (`planner-vue.js:13`), `EXN` (`journey.js:524`) and the values of `HUNT_SHORT` (`app.js:1360`) are four copies of the expansion short names. `RJ_ROLES` (`41-42`) lists every job by role again although `COMBAT_JOBS` has the roles.
- **E20** — `relics-vue.js:69-71`: `rjTiers(k)` runs three times in one branch.

### Minor

- **M36** — `relics-vue.js:8`, `90`, `99`. The comment says open panels reset on reload, but `RelicsByJob` saves the picked job in its own `localStorage` key `lunar-relic-job`. That key is outside `ledger-data`, so it is not in backups and restores.
  **Fix:** Store it in `DATA.ui`.
- **M37** — `relics-vue.js:104`, `1453-1455` (CSS). The job buttons show their state by colour only (green, yellow, red). Add a text or shape cue for colour-blind users.

### Nits

- **N62** — `relics-vue.js:24`: `aria-label` on a plain `<span>` is ignored.
- **N63** — `relics-vue.js:30`: `setup` comes after `template`; other components put `setup` first.
- **N64** — `relics-vue.js:91`, `154`, `191`: the comma operator `(props.tick, heldRelics(...))` registers a dependency; the other components use a `props.state.tick;` statement.
- **N65** — `relics-vue.js:121-122`, `175`: "NOT YET · NEEDS LV" and "NOT STARTED" typed in capitals; use `text-transform`.
- **N66** — `relics-vue.js:55-58`, `92`, `98`: long one-line functions.
- **N67** — `relics-vue.js:205`: inline style.

---

## 4. `planner-vue.js` (131 lines)

### Performance

- **P4** — `planner-vue.js:28-92` (`plView`). It filters the whole quest graph (`G.filter(available)`), rebuilds the done sets, and for each job genre filters the whole graph again (`82`). `plView` runs through `renderNextSteps` on every `renderRoutines` — every sub-check tick, hide, unhide, schedule change and gated toggle — and for every character at start-up.
  **Fix:** Cache the result per character, keyed on `tmCollections.asOf` (it changes only on import).

### Efficiency

- **E21** — `planner-vue.js:21`. `plGraph` builds `kids` (a child map over the whole 855 KB graph) and nothing uses it (`29` does not take it).
  **Fix:** Remove it.

### Minor

- **M52** — `planner-vue.js:123`. `:href="e.url"` when `url` is empty links to the page itself. Use `v-if`.
- **M39** — `planner-vue.js:71`. Duty names come from `DUTIES` unchanged, so a card can start with a small letter ("the Thousand Maws of Toto-Rak"). `tools/tm-export-tables` capitalises the same names for `TM_DUTIES`.

### Nits

- **N68** — `planner-vue.js:36-91`: rows are read by magic indexes (`r[2]`, `r[3]`, `r[5]` … `r[18]`, `d[2]` … `d[10]`). Name the columns (`const QG = {ID: 0, NAME: 1, …}`).
- **N69** — `planner-vue.js:48-51`, `65`, `76-77`, `79`, `81-83`: several statements per line and one-line `for` loops.
- **N70** — `planner-vue.js:69` (and `challenge-vue.js:71`): the numbers `65536` and `131072` have no explanation. Add a named constant (quest row id offset).
- **N71** — `planner-vue.js:77`: the relic step puts the job abbreviation into `exp`, so it shows as an expansion pill with class `exp-PLD`.
- **N72** — `planner-vue.js:116`: "READY" / "WAITING" typed in capitals. `122`: "No events running." — the list also shows announced events. `112`: `:key="i"` on cards that can change order.

---

## 5. `ocean.js` (42 lines)

- See **B2** (`ocean.js:16`, the shadowed `fmtClock`) and **M25** (`ocean.js:33`, browser-locale time).
- **N73** — `ocean.js:2-4`: the comment refers to "the old textContent version"; this history is no longer useful.

---

## 6. `challenge-vue.js` (176 lines)

### Performance

- **P15** — `challenge-vue.js:69-73`, `115`, `128`. `clOpen()` calls `ownedSet(c,'questsDone')` for every row. The view checks all about 85 rows, then each category again for its hidden count, so one redraw builds the `Set` about 170 times. A redraw happens on every + or − click.
  **Fix:** Build the done set once per view.

### Minor

- **M40** — `challenge-vue.js:174`. The footer says "The plugin can read these counts", but the Ledger import (`applyTmImport`) never reads Challenge Log counts. The text suggests an import will fill them.
- **M41** — `challenge-vue.js:153`. The section buttons have no `aria-current` for the active section.

### Nits

- **N74** — `challenge-vue.js:61-67`: `clState` changes `c.challengeLog` (a new week clears the counts) inside a computed during render; `65` calls `clWeek()` twice.
- **N75** — `challenge-vue.js:28-50`, `53`, `97-102`: dense one-line loops and several statements per line.
- **N76** — `challenge-vue.js:56`: `clLinkedAny` scans every link list on each call (from `clTyped`, once per row per redraw). Build a `Set` once.
- **N77** — `challenge-vue.js:133`: "Tuesday 08:00 UTC" is typed again; `RESET_SCHEDULES` has it. `137`: `getChar` may return null.
- **N78** — `challenge-vue.js:142-146`: `mark()` runs on every scroll event (layout reads for each section) and only on mount, so `on` can become stale after rows move. Throttle with `requestAnimationFrame` and run it again after updates.

---

## 7. `index.html` (207 lines)

### Performance

- **P7** — `index.html:187-205`. 19 classic `<script>` tags load in sequence, about 1.94 MB of JavaScript before compression (about 390 KB gzipped), all parsed on every load. `quest-graph.js` alone is 855 KB. The Vue build compiles about 40 template strings at run time. There is no cache-busting query, so after a deploy a browser can mix a new `index.html` with an old `app.js` for up to 10 minutes (GitHub Pages `max-age=600`). See also section 12.
  **Fix (within the no-build rule):** Add `defer` to every script, and a version query (`app.js?v=…`) that the build-stamp step updates. Consider loading `quest-graph.js` as JSON with `fetch` + `JSON.parse` (faster to parse than an object literal).

### Efficiency

- **E22** — `index.html:43`, `152-160`, and `app.js:2466-2468`. The import and backup buttons exist in three places: the rail, the `#tools-panel` page, and Settings → Backup and import. Now that Settings has them, `#tools-panel` and the rail icon `#ico-tools` may not be needed. This is a design choice for Haven.

### Minor

- **M30** — The "How this works" text is out of date in several places:
  - `73`: "seven areas: Daily, Story, Jobs, Duties, Collections, World and Elsewhere" — the rail now has Next Steps, Story, Relics, Jobs, Duties, Collections, World, Elsewhere and Settings.
  - `76`: "Only the pane scrolls" — the window scrolls.
  - `85`: "Open the character list at the top of the rail. Select + Add a character" — with one character the list is not shown (see M5).
  - `88`: "click Remove character at the top of the pane" — it is now "Remove this character" in Settings → Character.
  - `97`: "The Routines section has five frames" — there are six with Next Steps.
  - `102`: "Type your MSQ progress in the box next to your character's name" — the box is in Settings → Character.
  - `143`: themes "Poetic, Midnight and Daylight" in "the list at the right of the bar at the top of the page" — the themes are Lunar night, Crystarium and Light, in Settings → Display.
  - `146`: "Today → Events" — the area is "Next Steps".
- **M31** — `index.html:31`, `35`. `<nav class="rail">` contains `<nav class="areas">`. The outer landmark has no label and holds things that are not navigation (character block, import, backup, Ko-fi).
  **Fix:** Make the outer element `<aside aria-label="Sidebar">` or a `div`.
- **M42** — `index.html:47`, `48`, `52`. Icon buttons are named by their symbol (⭳, ?, ‹); `title` is only a description. Add `aria-label`. `&#11123;` (U+2B73) is missing from many default fonts and can show as an empty box.
- **M43** — `index.html:178`. The import textarea has only a placeholder, no accessible name. Add `aria-labelledby="tm-dlg-title"` or `aria-label`.
- **M44** — No favicon. Every load requests `/favicon.ico` and gets a 404.

### Nits

- **N79** — `index.html:11-13`: the comment says "the two challenge pages are not built yet"; the Apex page is live and linked in the Challenges menu.
- **N80** — `index.html:47`, `48`, `52`, `154`, `155`: buttons without `type="button"`; the other buttons have it.
- **N81** — `index.html:52`: a button with the class `spacer`.
- **N82** — No `<meta name="description">` and no `<noscript>` message.

---

## 8. `style.css` (1,601 lines)

### Bugs

- See **B6** (`863-864`, the heading layout).

### Efficiency

- **E3** — Dead selectors (no element or script uses the class): `.masthead` (8 rules), `.fc-link` (3), `.switch-btn` (7), `.seal` (2), `.switch-label` (3), `.add-char-btn` (5), `.char-name-group` (3), `.patch-box` (2), `.two-col` (4), `.tabbar` (3), `.rail-brand` (7), `.rail-group` (3), `.rail-item` (12), `.rail-theme` (4), `.theme-switch` (6), `.char-header` (7), `.tm-import-panel` (the dialog is `.tm-dlg`; `609-613`, `728`, `766`, `1401`, `1570`, `1601`), `.wrap` (`38`), `.sitebar .who` (`1109`, `1277`, `1358`), `.sitebar select` (`1117`, `1278`, `1359`). About 80 lines. (Keep `.tab-btn`, `.exp-*`, `.rank-s` and `.rank-a`; they are used or built in JS.)
  **Fix:** Remove them.
- **E10** — Old theme blocks: `701-738` (old Midnight) and `745-776` (old Daylight) are mostly replaced by the 12 November blocks at `1556-1601`. Leftovers still apply: the old `--rose` and `--sage` in Crystarium, the 3 px radii (`729`, `730`, `1242`), the 7 px radii (`767`, `768`), and the `.tab-btn.active` fills (see M38). `1540` and `1545` set `--text-faint` values that `1582` and `1592` replace.
  **Fix:** Delete the old blocks and keep only what is wanted in the new ones.
- **E23** — The "two-up columns with a gold rule between rows" block is written five times: `365-377`, `383-390`, `432-439`, `444-451`, `492-499` (and the one-column versions `391-394`, `398-401`, `454-457`, `502-505`, `535-538`).
  **Fix:** One shared class (for example `.two-up`) replaces about 60 lines.
- **E24** — Overrides appended instead of edited in place: `1541-1544` re-declare `.section`, `.subhead`, `.routine-subhead` and `.pane-body` (the first values at `150-156`, `344`, `214`, `849` are dead). `1129` re-declares `.rail .switcher` (`833`). `978-1007` and `1206-1216` are two "collapsed rail" blocks. `1296` (`.rail #rail-nav`) repeats `.rail .areas` for the same element. `928-937` overrides nearly all of the base `.ocean-bar` (`39-45`).
- **E25** — Conflicting media blocks: the `@media (max-width:600px)` "phone layout" at `1009-1028` is almost all overridden by the later drawer block (`1264-1347`, same specificity, later wins). The `@media (max-width:820px)` block at `1218-1229` sets `.sitebar{position:static}` with the comment "the site bar scrolls away", but `1270-1271` make it sticky again, and the fixed drawer replaces `.rail{top:auto;height:auto}`.
  **Fix:** Merge each width into one block.

### Minor

- **M38** — `731-738`, `771-776`. The leftover `.tab-btn.active` fills now apply to the Collections filter chips. The text is white on `#7fd6e6` in Crystarium (contrast 1.66:1) and white on `#b8933f` in Light (2.88:1). Both fail WCAG AA (4.5:1).
  **Fix:** Remove the old rules (E10) and give the chips their own class.
- **M45** — `:root` (Lunar night) and Crystarium set no `color-scheme`; only Light sets it (`1560`). Native controls (select popups, scrollbars, number spinners) draw in light mode on the dark themes.
  **Fix:** `:root{color-scheme:dark}` and `:root[data-theme="daylight"]{color-scheme:light}`.
- **M46** — `953-956`. Inactive footer dots are `--line` on `--panel`, 1.21:1. Controls need 3:1 (WCAG 1.4.11).

### Nits

- **N83** — `31`: `zoom:1` has no effect; `803-808` say ":root carries zoom:1.3" and divide by `--zoom:1`. Remove `zoom`, `--zoom` and the divisions.
- **N84** — `32`, `1446-1447`, `1516`, `1526`: several declarations or rules on one line inside multi-line code.
- **N85** — `228`, `233`: `!important` on `.routine-req` and `.patch-input` (specificity fights).
- **N86** — `246-247`: identical rules for `.routine-item.gated` and `.routine-item.user-hidden`; use one selector list.
- **N87** — `359-364`: two stacked comments; the first belongs to `.society-group{max-width:660px}` at `402`. `636-637`: the comment about "the character header" is stale. `795-796`: "only the pane scrolls" is wrong.
- **N88** — `378`, `440`, `453`, `501`: `break-inside:avoid` has no effect on grid items. `1471`: `flex-basis` on a grid item has no effect.
- **N89** — `592`: the generic `.dot` (save note) also matches the route `.stn .dot` (overridden at `1172`). Use a more specific name.
- **N90** — `1041`: `box-sizing:border-box` repeats the global `*` rule.
- **N91** — `1446-1447`, `1580-1584`: custom properties declared in the middle and at the end of the file; keep them with the others at the top.

---

## 9. `.githooks/pre-commit`

- **B13** — `pre-commit:10`. `git add index.html` stages the whole file. In a partial commit (`git add -p`), any unstaged changes in `index.html` go into the commit without the author knowing.
  **Fix:** Stamp only when `index.html` is already staged, and stamp the staged copy (for example with `git show :index.html | sed … | git update-index --cacheinfo …`), or stash the unstaged part first.
- **M47** — The hook stamps the wall-clock time; the workflow stamps the commit's committer date (`%cd`). If the minute changes between them, or after an amend or rebase, the workflow makes an extra bot commit.
- **N92** — `sed -i` with no suffix is GNU-only (fine on Git Bash; fails on macOS).

## 10. `.github/workflows/*.yml`

- **M48** — `collection-lists.yml`, `events-feed.yml`: a plain `git push` with no `pull --rebase` and no retry. If Haven or the other bot pushes during the run, the job fails red.
  **Fix:** `git pull --rebase` before `git push`, with one retry.
- **M49** — Neither data workflow sets `timeout-minutes`; a hung download would hold a runner for the 6-hour default.
- **N93** — `build-stamp.yml` uses `actions/checkout@v5`; the other two use `@v4`.
- **N94** — Bot commits made with `GITHUB_TOKEN` do not start `build-stamp.yml`, so "Last updated" does not move when only data refreshes. This may be what Haven wants; listed so that it is a known choice.

## 11. `tools/`

- **B14** — `tools/build_events_feed.py:43-46`. The "no change" check is `json.dumps(events) in old` (a text search). If the feed returns no events, `"[]"` is found in almost any old file, so the empty list is never written and ended events stay on the site.
  **Fix:** Parse the old file's JSON and compare the lists.
- **M50** — `tools/build_collection_lists.py:51-53`. `patch_key` crashes (`None.group`) on a patch text that does not start with digits.
- **M51** — `tools/go-worker/src/index.js:24-27`. `HEAD` requests are allowed and also add a click. Count only `GET`. `stats()` (`58-62`) throws if `STATS_KEY` is set but `DB` is not bound.
- **N95** — `tools/build_collection_lists.py:61`: `GlassesStyle?…&limit=1000` reads one page only; more than 1,000 rows would be cut off without a message.
- **N96** — `tools/build_jobquest_items.py:56`: the SQLite connection is never closed.
- **N97** — `tools/tm-export-tables/Program.cs:22`, `41`, `63`: the Quest sheet is read three times; one loop would do. `40`, `53`: the tuple's `Festival` field is never used. `.csproj`: Lumina comes both from NuGet (7.6.1) and from a Dalamud dev-hook DLL path, which is fragile on another PC.
- **N98** — `tools/build_collection_lists.py:28`, `build_events_feed.py:25`: the User-Agent includes `legendmemoria.org`. Check this against your own rule about names and handles in outbound traffic.

## 12. Generated data files — load and size only

| File | Size | Gzipped | Declared as |
|---|---|---|---|
| `quest-graph.js` | 855 KB | 126 KB | `window.QUEST_GRAPH` |
| `collection-lists.js` | 196 KB | 55 KB | `const` |
| `tm-export-tables.js` | 158 KB | 46 KB | `const` |
| `vendor/vue.global.prod.js` (3.5.13) | 158 KB | 57 KB | — |
| `collection-extra.js` | 71 KB | 16 KB | `const` |
| `duties.js` | 54 KB | 10 KB | `window.DUTIES` |
| `jobquest-items.js` | 32 KB | 11 KB | `const` |
| `challenge-log.js` | 10 KB | 3 KB | `window.CHALLENGE_NOTES` |
| `currents.js`, `relic-stages.js`, `tribes.js`, `relic-unlocks.js`, `events-feed.js` | < 5 KB each | | mixed |

- All load on every visit (see P7). `quest-graph.js` is used only by the Next Steps planner, but Next Steps is the front door, so it is needed early. Loading it as JSON would parse faster.
- **N99** — Some files declare `window.X = …` and others `const X = …`. `journey.js:33` has to work around this ("A top-level const is not a property of globalThis"). Pick one style.
- **N100** — The generators for `quest-graph.js`, `duties.js`, `challenge-log.js`, `tribes.js`, `currents.js` and `collection-extra.js` are not in this repository (`quest-graph.js` calls itself a "Scratch quest graph"). Note where each generator lives, so the files can be rebuilt after a patch.

---

## Vue 3 usage — summary

Checked against the Vue 3 documentation (reactivity, `computed`, `v-for` keys, template expressions, re-render cost):

- **Reactivity model.** `DATA` is a plain object, and each box gets a `Vue.reactive({})` state with a `tick` counter that forces `computed` to run again. This works and is consistent. The cost is that every `tick` rebuilds the whole view of that box, and several `:key="… + state.tick"` lists remount every row (N48). Many performance findings (P1, P3, P4, P8) come from the computeds doing full work on each tick.
- **Side effects in `computed`.** `clState` (`challenge-vue.js:61-67`) and `subsOf` (`app.js:5559-5562`) write data during render. Vue's documentation says computed getters should be free of side effects (N74, M16).
- **`v-for` keys.** Mostly stable ids. Index keys at `planner-vue.js:112` (cards that reorder), `app.js:6010` (diff rows, fine), and name keys that could collide at `app.js:3506` (N46).
- **E26 — App lifecycle.** `boxState` (`app.js:4022-4034`) unmounts an old app only when the same id is asked for again. After `rebuildPages`, apps for removed characters stay mounted on detached nodes with their state. This is a small memory leak.
  **Fix:** After each rebuild, unmount and delete every `vueBoxes` entry whose `box` is no longer in the document.
- **Template expressions.** Some templates call functions that do real work for each row (`p(r.key)`, `msqOpen()` twice per row, `done(m.id)` about 150 times per hunt redraw). Move them into one computed per box.
- **Runtime compiler.** The global build compiles about 40 templates at start-up. Without a build step this is expected; it is part of the load cost in P7.

## Fix groups (suggested order)

1. Quick, safe bug fixes: B1, B2, B4, B5, B6, B8, B10, B11, B12, B14, plus M2, M4, M13, M28, M29 and the typos N1–N5.
2. Data and migration: B3, B9.
3. Performance, smallest first: P2 and P15 (one `WeakMap`), P4 (cache per import), P8, P13, P16, P6, P3, then P1 and P14 (draw only the active list or frame) and P5 (draw only the active page).
4. Clean-up: E1–E26 and the dead CSS.
5. Accessibility: B11, M18–M24, M38, M42, M43, M45, M46.
6. Help text: M30, M40.
