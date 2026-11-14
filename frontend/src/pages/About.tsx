import { Card } from '../components/ui';

export function About() {
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">About</h1>
      <Card className="space-y-2 text-gray-700 text-sm">
        <p>ladyboyai is a milestone escrow for creator funding on NEAR. Money moves only after named approvers sign off on submitted evidence.</p>
        <p><b>What works (tested on a local NEAR sandbox):</b> create a campaign, fund with NEAR, submit evidence, approve, claim payout, cancel, pro rata refunds.</p>
        <p><b>What it does not do:</b> no USDC, no cross-chain funding (NEAR Intents is not integrated), no check that evidence is true, no dispute process, no audit. Built for NEAR testnet but not yet deployed there.</p>
        <p>The creator chooses the approvers, so a backer should only fund campaigns whose approvers they trust.</p>
      </Card>
    </div>
  );
}
