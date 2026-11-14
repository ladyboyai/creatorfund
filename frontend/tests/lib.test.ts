import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNear, formatNear } from '../src/lib/rpc.ts';
import { validateCampaign } from '../src/lib/validate.ts';

test('parseNear / formatNear round trip, no float loss', () => {
  assert.equal(parseNear('1'), '1000000000000000000000000');
  assert.equal(parseNear('0.1'), '100000000000000000000000');
  assert.equal(parseNear('0.000000000000000000000001'), '1');
  assert.equal(formatNear(parseNear('12.3456')), '12.3456');
  assert.equal(formatNear('1500000000000000000000000'), '1.5');
  assert.throws(() => parseNear('abc'));
  assert.throws(() => parseNear('-1'));
  assert.throws(() => parseNear('1e3'));
});

const ok = {
  title: 't', creator: 'alice.testnet', approvers: ['bob.testnet'],
  milestones: [{ title: 'm', amountNear: '2', requiredApprovals: 1 }],
};
test('validateCampaign accepts a good draft', () => assert.equal(validateCampaign(ok), null));
test('validateCampaign mirrors contract rules', () => {
  assert.match(validateCampaign({ ...ok, approvers: ['alice.testnet'] })!, /own approver/);
  assert.match(validateCampaign({ ...ok, approvers: [] })!, /at least one approver/);
  assert.match(validateCampaign({ ...ok, milestones: [{ ...ok.milestones[0], requiredApprovals: 0 }] })!, /at least 1 approval/);
  assert.match(validateCampaign({ ...ok, milestones: [{ ...ok.milestones[0], requiredApprovals: 2 }] })!, /more approvals/);
  assert.match(validateCampaign({ ...ok, milestones: [{ ...ok.milestones[0], amountNear: '0' }] })!, /> 0/);
  assert.match(validateCampaign({ ...ok, milestones: [{ ...ok.milestones[0], amountNear: 'x' }] })!, /NEAR amount/);
  assert.match(validateCampaign({ ...ok, milestones: [] })!, /1 to 10/);
});
