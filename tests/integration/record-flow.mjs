// Drives the REAL contract on a local sandbox chain step by step and screenshots the real UI after each step.
import pkg from 'near-workspaces';
import fs from 'node:fs';
import { execSync, spawn } from 'node:child_process';
const { Worker } = pkg;
const y = (x) => (BigInt(Math.round(x * 1e6)) * 10n ** 18n).toString();
const worker = await Worker.init();
const root = worker.rootAccount;
const contract = await root.createSubAccount('escrow', { initialBalance: y(20) });
await contract.deploy(new URL('./ladyboyai.wasm', import.meta.url).pathname);
await contract.call(contract, 'new', { owner: root.accountId });
const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => root.createSubAccount(n, { initialBalance: y(50) })));
const rpc = worker.config.rpcAddr;
execSync(`cd ../../frontend && VITE_NEAR_RPC=${rpc} VITE_CONTRACT_ID=${contract.accountId} npx vite build --outDir /tmp/demo-dist`, { stdio: 'ignore' });
const srv = spawn('python3', ['/tmp/spa.py'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1000));
fs.mkdirSync('/tmp/frames', { recursive: true });
const shot = (name, path = 'campaign/0') => execSync(`google-chrome --headless=new --no-sandbox --disable-web-security --user-data-dir=/tmp/cpv --window-size=1000,820 --virtual-time-budget=6000 --screenshot=/tmp/frames/${name}.png http://127.0.0.1:4173/${path}`, { stdio: 'ignore' });
const bal = async (a) => (Number(BigInt((await a.balance()).available.toString()) / 10n ** 21n) / 1000).toFixed(2);
const log = [];
const step = async (name, fn, path) => { await fn(); shot(name, path); log.push(name); console.log('step', name); };
await step('01-campaigns-empty', async () => {}, 'campaigns');
await step('02-created', () => alice.call(contract, 'create_campaign', {
  metadata: { title: 'Short film: The Last Ferry', description: 'A 12 minute film about the last night ferry in Rayong.', category: 'film', target_amount: y(10), token: 'near' },
  milestones: [{ title: 'Script and cast', description: 'Final script, cast confirmed', amount: y(4), required_approvals: 1 }, { title: 'Shoot and edit', description: 'Final cut delivered', amount: y(6), required_approvals: 2 }],
  approvers: [bob.accountId, carol.accountId] }, { attachedDeposit: y(0.1) }));
await step('03-funded', async () => { await dave.call(contract, 'fund_campaign', { campaign_id: 0 }, { attachedDeposit: y(6) }); await root.call(contract, 'fund_campaign', { campaign_id: 0 }, { attachedDeposit: y(4) }).catch(() => {}); });
await step('04-evidence', () => alice.call(contract, 'unlock_milestone', { campaign_id: 0, milestone_index: 0, evidence: 'https://example.com/script-v3.pdf (demo data)' }));
// attacker attempts, real rejections
let rejected = 0;
for (const [who, m, a] of [[alice, 'approve_milestone', { campaign_id: 0, milestone_index: 0 }], [dave, 'claim_payout', { campaign_id: 0 }]]) {
  try { await who.call(contract, m, a); } catch { rejected++; }
}
fs.writeFileSync('/tmp/frames/rejected.txt', String(rejected));
await step('05-approved', () => bob.call(contract, 'approve_milestone', { campaign_id: 0, milestone_index: 0 }));
const before = await bal(alice);
await step('06-paid', () => alice.call(contract, 'claim_payout', { campaign_id: 0 }));
fs.writeFileSync('/tmp/frames/balances.json', JSON.stringify({ before, after: await bal(alice) }));
srv.kill();
await worker.tearDown();
console.log('done', log.join(','));
process.exit(0);
