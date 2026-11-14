// Starts a local sandbox chain, deploys the contract, seeds one campaign, prints RPC + contract id, then stays alive.
import pkg from 'near-workspaces';
import fs from 'node:fs';
const { Worker } = pkg;
const y = (x) => (BigInt(Math.round(x * 1e6)) * 10n ** 18n).toString();
const worker = await Worker.init();
const root = worker.rootAccount;
const contract = await root.createSubAccount('escrow', { initialBalance: y(20) });
await contract.deploy(new URL('./ladyboyai.wasm', import.meta.url).pathname);
await contract.call(contract, 'new', { owner: root.accountId });
const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => root.createSubAccount(n, { initialBalance: y(50) })));
await alice.call(contract, 'create_campaign', {
  metadata: { title: 'Short film: The Last Ferry', description: 'A 12 minute film about the last night ferry in Rayong.', category: 'film', target_amount: y(10), token: 'near' },
  milestones: [{ title: 'Script and cast', description: 'Final script, cast confirmed', amount: y(4), required_approvals: 1 }, { title: 'Shoot and edit', description: 'Final cut delivered', amount: y(6), required_approvals: 2 }],
  approvers: [bob.accountId, 'carol.test.near'],
}, { attachedDeposit: y(0.1) });
await dave.call(contract, 'fund_campaign', { campaign_id: 0 }, { attachedDeposit: y(6) });
await alice.call(contract, 'unlock_milestone', { campaign_id: 0, milestone_index: 0, evidence: 'https://example.com/script-v3.pdf (demo data)' });
await bob.call(contract, 'approve_milestone', { campaign_id: 0, milestone_index: 0 });
fs.writeFileSync('/tmp/demo.json', JSON.stringify({ rpc: worker.config.rpcAddr, contract: contract.accountId }));
console.log('ready');
setInterval(() => {}, 1000);
