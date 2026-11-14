import { useState } from 'react';
import { api, type MilestoneForm } from '../lib/contract';
import { parseNear, formatNear } from '../lib/rpc';
import { useWallet } from '../lib/wallet-context';
import { Button, Card, Notice, useErr } from '../components/ui';
import { validateCampaign } from '../lib/validate';

const blank = (): MilestoneForm => ({ title: '', description: '', amountNear: '', requiredApprovals: 1 });
const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm';

export function CreateCampaign() {
  const { accountId, connect } = useWallet();
  const err = useErr();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('film');
  const [approvers, setApprovers] = useState('');
  const [milestones, setMilestones] = useState<MilestoneForm[]>([blank()]);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const targetNear = (() => {
    try { return (milestones.reduce((s, m) => s + BigInt(parseNear(m.amountNear || '0')), 0n)); } catch { return null; }
  })();
  const approverList = approvers.split(/[\s,]+/).filter(Boolean);

  const submit = async () => {
    const problem = validateCampaign({ title, creator: accountId, approvers: approverList, milestones });
    if (problem) return setMsg({ tone: 'error', text: problem });
    setBusy(true); setMsg(null);
    try {
      await api.createCampaign({
        title, description, category, approvers: approverList, milestones,
      });
      setMsg({ tone: 'ok', text: 'Submitted. Your wallet may redirect to approve it. Then see Campaigns.' });
    } catch (e) { setMsg({ tone: 'error', text: err(e) }); } finally { setBusy(false); }
  };

  const setM = (i: number, patch: Partial<MilestoneForm>) =>
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Create a campaign</h1>
      <Notice>Creating costs a 0.1 NEAR storage deposit (kept by the contract). The target is the sum of your milestones.</Notice>
      <Card className="space-y-3">
        <input className={input} placeholder="Title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={input} placeholder="What are you making?" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className={input} placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <div>
          <input className={input} placeholder="Approver accounts, comma separated (e.g. bob.testnet, carol.testnet)" value={approvers} onChange={(e) => setApprovers(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">Up to 5. They must sign off on each milestone. You cannot approve your own work.</p>
        </div>
      </Card>

      {milestones.map((m, i) => (
        <Card key={i} className="space-y-3">
          <div className="font-semibold text-sm">Milestone {i + 1}</div>
          <input className={input} placeholder="Title" value={m.title} onChange={(e) => setM(i, { title: e.target.value })} />
          <input className={input} placeholder="What counts as done?" value={m.description} onChange={(e) => setM(i, { description: e.target.value })} />
          <div className="flex gap-3">
            <input className={input} placeholder="Amount (NEAR)" value={m.amountNear} onChange={(e) => setM(i, { amountNear: e.target.value })} />
            <input className={input} type="number" min={1} max={5} value={m.requiredApprovals} onChange={(e) => setM(i, { requiredApprovals: Number(e.target.value) })} title="Approvals required" />
          </div>
          {milestones.length > 1 && <Button tone="ghost" onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}>Remove</Button>}
        </Card>
      ))}
      <div className="flex items-center justify-between">
        <Button tone="ghost" disabled={milestones.length >= 10} onClick={() => setMilestones((ms) => [...ms, blank()])}>Add milestone</Button>
        <div className="text-sm text-gray-600">Target: {targetNear === null ? '?' : formatNear(targetNear)} NEAR</div>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {accountId ? <Button onClick={submit} disabled={busy}>{busy ? 'Sending...' : 'Create campaign'}</Button> : <Button onClick={connect}>Connect wallet to create</Button>}
    </div>
  );
}
