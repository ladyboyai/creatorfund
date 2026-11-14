# Deploying to NEAR testnet (you run this, it needs your own testnet account)

Nothing here has been run for you. Testnet NEAR is free, but you need your own account and keys.

```bash
npm run build:contract                      # produces tests/integration/ladyboyai.wasm
near account create-account sponsor-by-faucet-service ladyboyai-yourname.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near contract deploy ladyboyai-yourname.testnet use-file tests/integration/ladyboyai.wasm \
  with-init-call new json-args '{"owner":"ladyboyai-yourname.testnet"}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  network-config testnet sign-with-keychain send
echo "VITE_CONTRACT_ID=ladyboyai-yourname.testnet" > frontend/.env
npm run build
```
(Command shapes are from near-cli-rs; check `near --help` if your version differs.)
Then open the app, connect MyNearWallet (testnet), and run create, fund, evidence, approve, claim with three accounts.
