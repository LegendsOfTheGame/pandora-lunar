# Raphael crafting solver (built)

The files in this folder are a WebAssembly build of the Raphael crafting solver.

- Source: https://github.com/KonaeAkira/raphael-rs
- Commit: `723b17ea7d1a719bba212944ebd357fe36b4ac08` (game data for patch 7.55)
- Licence: Apache License 2.0. The full text is in `LICENSE` in this folder.
- Website: https://www.raphael-xiv.com/

## Changes

We did not change the Raphael source code. We use three of its crates without
changes: `raphael-sim`, `raphael-solver` and `raphael-data`. Our own wrapper,
`tools/craft-solver/src/lib.rs`, adds two functions:

- `recipes(job)` lists the recipes of one crafter.
- `solve(...)` runs the solver for one recipe and one set of stats.

The build is single-threaded. GitHub Pages cannot send the COOP and COEP
headers that the multithreaded build needs.

## Rebuild

Run `tools/craft-solver/build.sh`. Do not edit the files in this folder by hand.

The Raphael team gave permission on 16 November 2026 to use their code under
the Apache licence.
