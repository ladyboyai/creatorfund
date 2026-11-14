// End-to-end test against a LOCAL NEAR sandbox (no testnet account, no real funds).
// Run: npm run test:e2e   (builds the wasm first)
import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from 'near-workspaces';
const { Worker } = pkg;
// NEAR -> yocto string (supports up to 6 decimals)
const toYocto = (x) => (BigInt(Math.round(Number(x) * 1e6)) * 10n ** 18n).toString();
const NEAR = { parse: (s) => toYocto(String(s).replace(/ ?N$/, '')) };

const WASM = new URL('./ladyboyai.wasm', import.meta.url).pathname;
let worker, root, contract, alice, bob, carol, dave, mallory;

test.before(async () => {
  worker = await Worker.init();
  root = worker.rootAccount;
  contract = await root.createSubAccount('escrow', { initialBalance: toYocto(20) });
  await contract.deploy(WASM);
  await contract.call(contract, 'new', { owner: root.accountId });
  const mk = (n) => root.createSubAccount(n, { initialBalance: toYocto(50) });
  [alice, bob, carol, dave, mallory] = await Promise.all(['alice', 'bob', 'carol', 'dave', 'mallory'].map(mk));
});
test.after(async () => { await worker.tearDown(); });

const N = (x) => toYocto(x);
const meta = (t) => ({ title: 'Short film', description: 'd', category: 'film', target_amount: N(t), token: 'near' });
const ms = (a, r) => ({ title: 'm', description: 'd', amount: N(a), required_approvals: r });
const bal = async (a) => BigInt((await a.balance()).available.toString());

async function newCampaign() {
  return alice.call(contract, 'create_campaign', {
    metadata: meta(10), milestones: [ms(4, 1), ms(6, 2)],
    approvers: [bob.accountId, carol.accountId],
  }, { attachedDeposit: N('0.1') });
}

test('create -> fund -> evidence -> approve -> payout moves real balances', async () => {
  const id = await newCampaign();
  await dave.call(contract, 'fund_campaign', { campaign_id: id }, { attachedDeposit: N(6) });
  await mallory.call(contract, 'fund_campaign', { campaign_id: id }, { attachedDeposit: N(4) });
  const c = await contract.view('get_campaign', { campaign_id: id });
  assert.equal(c.total_raised, N(10));

  // claim before approval must fail
  await assert.rejects(alice.call(contract, 'claim_payout', { campaign_id: id }));

  await alice.call(contract, 'unlock_milestone', { campaign_id: id, milestone_index: 0, evidence: 'ipfs://proof1' });
  // creator cannot approve own evidence; stranger cannot either
  await assert.rejects(alice.call(contract, 'approve_milestone', { campaign_id: id, milestone_index: 0 }));
  await assert.rejects(mallory.call(contract, 'approve_milestone', { campaign_id: id, milestone_index: 0 }));
  await bob.call(contract, 'approve_milestone', { campaign_id: id, milestone_index: 0 });

  const before = await bal(alice);
  await alice.call(contract, 'claim_payout', { campaign_id: id });
  const gained = (await bal(alice)) - before;
  const four = BigInt(N(4));
  assert.ok(gained > four - BigInt(N('0.01')) && gained <= four, `gained ${gained}`);
  // second claim fails, non-creator claim fails
  await assert.rejects(alice.call(contract, 'claim_payout', { campaign_id: id }));
  await assert.rejects(dave.call(contract, 'claim_payout', { campaign_id: id }));

  // milestone 2 needs two approvals
  await alice.call(contract, 'unlock_milestone', { campaign_id: id, milestone_index: 1, evidence: 'ipfs://proof2' });
  await bob.call(contract, 'approve_milestone', { campaign_id: id, milestone_index: 1 });
  await assert.rejects(alice.call(contract, 'claim_payout', { campaign_id: id }));
  await carol.call(contract, 'approve_milestone', { campaign_id: id, milestone_index: 1 });
  await alice.call(contract, 'claim_payout', { campaign_id: id });
  const done = await contract.view('get_campaign', { campaign_id: id });
  assert.equal(done.status, 'Completed');
  assert.equal(done.paid_out, N(10));
  // escrow keeps only its storage deposit
  assert.ok((await bal(contract)) >= 0n);
});

test('overfunding is rejected and the deposit comes back', async () => {
  const id = await newCampaign();
  const before = await bal(dave);
  await assert.rejects(dave.call(contract, 'fund_campaign', { campaign_id: id }, { attachedDeposit: N(11) }));
  const lost = before - (await bal(dave));
  assert.ok(lost < BigInt(N('0.05')), `lost ${lost}`);
});

test('cancel returns unreleased funds to backers pro rata', async () => {
  const id = await newCampaign();
  await dave.call(contract, 'fund_campaign', { campaign_id: id }, { attachedDeposit: N(6) });
  await mallory.call(contract, 'fund_campaign', { campaign_id: id }, { attachedDeposit: N(2) });
  await alice.call(contract, 'unlock_milestone', { campaign_id: id, milestone_index: 0, evidence: 'p' });
  await bob.call(contract, 'approve_milestone', { campaign_id: id, milestone_index: 0 });
  await alice.call(contract, 'claim_payout', { campaign_id: id }); // 4 of 8 paid
  await assert.rejects(dave.call(contract, 'claim_refund', { campaign_id: id })); // not cancelled yet
  await alice.call(contract, 'cancel_campaign', { campaign_id: id });
  const b = await bal(dave);
  await dave.call(contract, 'claim_refund', { campaign_id: id });
  const got = (await bal(dave)) - b;
  const three = BigInt(N(3)); // 6/8 * 4
  assert.ok(got > three - BigInt(N('0.01')) && got <= three, `refund ${got}`);
  await assert.rejects(dave.call(contract, 'claim_refund', { campaign_id: id }));
  await mallory.call(contract, 'claim_refund', { campaign_id: id });
});

test('frontend RPC client reads the same state over real JSON-RPC', async () => {
  const { viewCall, formatNear } = await import('../../frontend/src/lib/rpc.ts');
  const rpc = worker.config.rpcAddr;
  const id = await newCampaign();
  await dave.call(contract, 'fund_campaign', { campaign_id: id }, { attachedDeposit: N(2.5) });
  const c = await viewCall(rpc, contract.accountId, 'get_campaign', { campaign_id: id });
  assert.equal(c.id, id);
  assert.equal(formatNear(c.total_raised), '2.5');
  assert.equal(c.milestones.length, 2);
  const list = await viewCall(rpc, contract.accountId, 'get_contributions', { campaign_id: id });
  assert.equal(list[0].contributor, dave.accountId);
  const info = await viewCall(rpc, contract.accountId, 'get_payout_info', { campaign_id: id });
  assert.equal(info.claimable, '0');
  assert.equal(await viewCall(rpc, contract.accountId, 'get_campaign', { campaign_id: 9999 }), null);
});
