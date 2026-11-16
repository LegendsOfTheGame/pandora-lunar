// The Ledger's crafting solver: Raphael (Apache-2.0, KonaeAkira/raphael-rs)
// behind two wasm-bindgen functions. The worker (craft-solver-worker.js)
// calls them; the page never loads this file directly.
//
// Output is JSON written by hand, to keep serde out of the download.
use raphael_data::{CrafterStats, Locale, RECIPES, RLVLS, get_game_settings, get_item_name, hq_percentage, macro_name};
use raphael_sim::SimulationState;
use raphael_solver::{AtomicFlag, MacroSolver, SolverSettings};
use wasm_bindgen::prelude::*;

fn json_str(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Every recipe of one crafter (job 0 = CRP ... 7 = CUL, the same order as
/// CRAFT_JOBS in app.js), as JSON [[recipeId, "Item name", jobLevel], ...].
/// jobLevel is 0 for a recipe that scales with the crafter's level.
#[wasm_bindgen]
pub fn recipes(job: u8) -> String {
    let mut rows = Vec::new();
    for (id, r) in RECIPES.entries() {
        if r.job_id != job {
            continue;
        }
        let Some(name) = get_item_name(r.item_id, false, Locale::EN) else { continue };
        let level = if r.max_level_scaling != 0 { 0 } else { RLVLS[r.recipe_level as usize].job_level };
        rows.push(format!("[{},{},{}]", id, json_str(&name), level));
    }
    format!("[{}]", rows.join(","))
}

/// Solves one recipe for the given stats (without food or potion, no HQ
/// materials). Returns JSON with the final state and the steps, or
/// {"error": "..."}.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn solve(
    recipe_id: u32,
    craftsmanship: u16,
    control: u16,
    cp: u16,
    level: u8,
    manipulation: bool,
    heart_and_soul: bool,
    quick_innovation: bool,
) -> String {
    let Some(recipe) = RECIPES.get(recipe_id).copied() else {
        return format!("{{\"error\":{}}}", json_str(&format!("No recipe {recipe_id}")));
    };
    let stats = CrafterStats { craftsmanship, control, cp, level, manipulation, heart_and_soul, quick_innovation };
    let s = get_game_settings(recipe, None, stats, None, None);
    let mut solver = MacroSolver::new(
        SolverSettings { simulator_settings: s, allow_non_max_quality_solutions: true },
        Box::new(|_| {}),
        Box::new(|_| {}),
        AtomicFlag::new(),
    );
    let actions = match solver.solve() {
        Ok(a) => a,
        Err(e) => return format!("{{\"error\":{}}}", json_str(&format!("{e:?}"))),
    };
    let Ok(f) = SimulationState::from_macro(&s, &actions) else {
        return "{\"error\":\"The solution does not simulate.\"}".to_string();
    };
    let steps: Vec<String> = actions
        .iter()
        .map(|a| format!("[{},{}]", json_str(macro_name(*a, Locale::EN)), a.time_cost()))
        .collect();
    format!(
        "{{\"progress\":{},\"maxProgress\":{},\"quality\":{},\"maxQuality\":{},\"durability\":{},\"maxDurability\":{},\"cp\":{},\"maxCp\":{},\"hq\":{},\"steps\":[{}]}}",
        f.progress, s.max_progress, f.quality, s.max_quality, f.durability, s.max_durability,
        f.cp, s.max_cp, hq_percentage(f.quality, s.max_quality).unwrap_or(0), steps.join(",")
    )
}
