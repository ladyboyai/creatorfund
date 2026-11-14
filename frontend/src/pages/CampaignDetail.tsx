import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Campaign, type Milestone } from '../lib/contract';
import { formatNear } from '../lib/rpc';
import { useWallet } from '../lib/wallet-context';
import { Button, Card, Notice, Progress, useErr } from '../components/ui';
import { NETWORK_LABEL, IS_TESTNET } from '../config';

export function CampaignDetail() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { accountId, connect } = useWallet();
  const qc = useQueryClient();
  const err = useErr();
  const [amount, setAmount] = useState('1');
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const campaign = useQuery({ queryKey: ['campaign', id], queryFn: () => api.getCampaign(id), enabled: Number.isInteger(id), retry: false });
  const payout = useQuery({ queryKey: ['payout', id], queryFn: () => api.getPayoutInfo(id), enabled: Number.isInteger(id), retry: false });
  const backers = useQuery({ queryKey: ['backers', id], queryFn: () => api.getContributions(id), enabled: Number.isInteger(id), retry: false });

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ tone: 'ok', text: `${label}: sent. Refreshing...` });
      setTimeout(() => qc.invalidateQueries(), 2500);
    } catch (e) { setMsg({ tone: 'error', text: err(e) }); }
  };

  if (campaign.isLoading) return <p className="text-gray-500">Loading...</p>;
  if (campaign.error) return <Notice tone="error">{err(campaign.error)}</Notice>;
  const c = campaign.data as Campaign | null | undefined;
  if (!c) return <Notice tone="error">Campaign {idParam} not found.</Notice>;

  const isCreator = accountId === c.creator;
  const isApprover = !!accountId && c.approvers.includes(accountId);
  const mine = backers.data?.find((b) => b.contributor === accountId);
  const paidThrough = (camp: Campaign, idx: number) =>
    BigInt(camp.paid_out) >= camp.milestones.slice(0, idx + 1).reduce((t, x) => t + BigInt(x.amount), 0n);
  const nextIdx = c.milestones.findIndex((m) => !m.unlocked);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-gray-500 mb-1">{c.metadata.category} - {c.status} - by {c.creator}</div>
        <h1 className="text-2xl font-bold">{c.metadata.title}</h1>
        <p className="text-gray-600 mt-2 whitespace-pre-wrap">{c.metadata.description}</p>
      </div>

      <Card className="space-y-3">
        <Progress raised={c.total_raised} target={c.metadata.target_amount} />
        {payout.data && (
          <div className="text-sm text-gray-600">
            Unlocked and claimable by creator: <b>{formatNear(payout.data.claimable)}</b> NEAR - already paid out: {formatNear(payout.data.paid_out)} NEAR
          </div>
        )}
        <div className="text-xs text-gray-500">Approvers: {c.approvers.join(', ')}</div>
      </Card>

      {!IS_TESTNET && <Notice>Demo data on a {NETWORK_LABEL}. Nothing here is on NEAR testnet or mainnet.</Notice>}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {c.status === 'Active' && !isCreator && (
        <Card className="space-y-2">
          <div className="font-semibold">Back this campaign</div>
          <div className="flex gap-2">
            <input className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="self-center text-sm text-gray-500">NEAR (min 0.01)</span>
            {accountId
              ? <Button onClick={() => run('Funding', () => api.fund(id, amount))}>Fund</Button>
              : <Button onClick={connect}>Connect wallet</Button>}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold">Milestones</h2>
        {c.milestones.map((m: Milestone) => (
          <Card key={m.index} className="space-y-2">
            <div className="flex justify-between gap-2">
              <div className="font-medium">{m.index + 1}. {m.title}</div>
              <div className="text-sm text-gray-600">{formatNear(m.amount)} NEAR</div>
            </div>
            <div className="text-sm text-gray-600">{m.description}</div>
            <div className="text-xs text-gray-500">
              {m.unlocked ? (paidThrough(c, m.index) ? 'Approved and paid out' : 'Approved, unlocked (not yet paid out)') : m.index === nextIdx ? 'Current' : 'Locked'} - approvals {m.approvals.length}/{m.required_approvals}
            </div>
            {m.evidence && <div className="text-xs bg-gray-50 rounded p-2 break-all">Evidence (as submitted, not verified by the contract): {m.evidence}</div>}
            {c.status === 'Active' && m.index === nextIdx && (
              <div className="flex gap-2 flex-wrap">
                {isCreator && m.approvals.length === 0 && (
                  <Button onClick={() => {
                    const ev = window.prompt('Evidence (link or short description, max 500 chars)');
                    if (ev) run('Evidence', () => api.submitEvidence(id, m.index, ev));
                  }}>{m.evidence ? 'Replace evidence' : 'Submit evidence'}</Button>
                )}
                {isApprover && m.evidence && !m.approvals.includes(accountId!) && (
                  <Button tone="ghost" onClick={() => run('Approval', () => api.approve(id, m.index))}>Approve</Button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {isCreator && (
        <Card className="flex gap-2 flex-wrap">
          <Button disabled={!payout.data || payout.data.claimable === '0'} onClick={() => run('Payout', () => api.claimPayout(id))}>
            Claim payout ({payout.data ? formatNear(payout.data.claimable) : '0'} NEAR)
          </Button>
          {c.status === 'Active' && (
            <Button tone="danger" onClick={() => window.confirm('Cancel? Unreleased funds become refundable to backers.') && run('Cancel', () => api.cancel(id))}>Cancel campaign</Button>
          )}
        </Card>
      )}
      {c.status === 'Cancelled' && mine && !mine.refunded && (
        <Card><Button onClick={() => run('Refund', () => api.claimRefund(id))}>Claim my refund</Button></Card>
      )}

      <div className="text-sm text-gray-500">
        {backers.data?.length ?? 0} backer(s){backers.data?.slice(0, 5).map((b) => ` - ${b.contributor}: ${formatNear(b.amount)}`).join('')}
      </div>
    </div>
  );
}
