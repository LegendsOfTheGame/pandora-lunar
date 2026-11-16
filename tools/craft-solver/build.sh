#!/bin/sh
# Builds the crafting solver into vendor/raphael/.
# Needs: Rust stable with the wasm32-unknown-unknown target, and
# wasm-bindgen-cli at the same version as the wasm-bindgen line in Cargo.toml
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli --version 0.2.130 --locked
set -e
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --no-typescript --out-dir ../../vendor/raphael \
  target/wasm32-unknown-unknown/release/craft_solver.wasm
ls -l ../../vendor/raphael
