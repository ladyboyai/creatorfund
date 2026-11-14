import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/contract';
import { formatNear } from '../lib/rpc';
import { CONFIG, NETWORK_LABEL, IS_TESTNET } from '../config';
import { Card, Notice } from '../components/ui';

export function Home() {
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.getStats, enabled: !!CONFIG.contractId, retry: false });
  return (
    <div className="space-y-10">
      <section className="bg-gradient-to-br from-near-600 to-near-900 text-white rounded-3xl p-8 sm:p-12">
        <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
          Fund creators.<br /><span className="text-near-200">Pay out only when work is shown and approved.</span>
        </h1>
        <p className="text-near-100 max-w-2xl mb-6">
          Backers send NEAR into an escrow contract. The creator submits evidence for each milestone.
          Approvers chosen up front must sign off before that milestone&apos;s share can be withdrawn.
          If the creator cancels, the unreleased money goes back to backers.
        </p>
        <div className="flex gap-3 flex-wrap">
          <Link to="/create" className="px-5 py-3 bg-white text-near-700 rounded-lg font-semibold">Launch a campaign</Link>
          <Link to="/campaigns" className="px-5 py-3 border border-near-300 rounded-lg font-semibold">Browse campaigns</Link>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-4 text-center">
        <Card><div className="text-3xl font-bold text-near-600">{stats.data?.total_campaigns ?? '-'}</div><div className="text-gray-500">Campaigns</div></Card>
        <Card><div className="text-3xl font-bold text-near-600">{stats.data ? formatNear(stats.data.total_raised) : '-'}</div><div className="text-gray-500">NEAR backed ({IS_TESTNET ? 'testnet' : 'demo chain'})</div></Card>
      </div>

      <section className="grid sm:grid-cols-4 gap-4">
        {[
          ['1. Create', 'Set a target, split it into milestones, name your approvers.'],
          ['2. Fund', 'Backers attach NEAR. Funding can never exceed the target.'],
          ['3. Prove', 'Creator posts evidence. Approvers sign off. Evidence is locked once approved.'],
          ['4. Withdraw', 'Only unlocked milestones, only what was raised. Cancel = pro rata refunds.'],
        ].map(([t, d]) => (
          <Card key={t}><div className="font-semibold mb-1">{t}</div><div className="text-sm text-gray-600">{d}</div></Card>
        ))}
      </section>

      <Notice>
        Demo, unaudited. Currently reading from: {NETWORK_LABEL}. NEAR only (no USDC, no cross-chain funding yet). The contract cannot check that evidence is true;
        approvers decide that, and the creator picks the approvers.
      </Notice>
      {!CONFIG.contractId && <Notice tone="error">No contract configured. Set VITE_CONTRACT_ID after deploying (see docs/DEPLOY.md).</Notice>}
    </div>
  );
}
