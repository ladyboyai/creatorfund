#!/usr/bin/env bash
# Builds the contract wasm and makes it loadable by the local sandbox and testnet VMs.
# Needs: rust (+ wasm32-unknown-unknown target), node (for binaryen via tests/integration).
set -euo pipefail
cd "$(dirname "$0")/.."
(cd contracts/creator-fund && RUSTFLAGS="-C link-arg=-s" cargo build --release --target wasm32-unknown-unknown)
W=contracts/creator-fund/target/wasm32-unknown-unknown/release/ladyboyai.wasm
B=tests/integration/node_modules/binaryen/bin/wasm-opt
# New rustc emits wasm features older NEAR VMs reject; lower them to plain MVP wasm.
$B $W --enable-sign-ext --enable-bulk-memory --enable-nontrapping-float-to-int --enable-mutable-globals --enable-multivalue --enable-reference-types \
  --signext-lowering --llvm-nontrapping-fptoint-lowering --llvm-memory-copy-fill-lowering -o /tmp/ladyboyai-lowered.wasm
$B /tmp/ladyboyai-lowered.wasm --mvp-features -Oz -o tests/integration/ladyboyai.wasm
echo "built tests/integration/ladyboyai.wasm"
