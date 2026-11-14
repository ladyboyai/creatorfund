import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/contract';
import { CampaignCard, Notice, useErr } from '../components/ui';

export function Campaigns() {
  const q = useQuery({ queryKey: ['campaigns'], queryFn: api.getCampaigns, retry: false });
  const err = useErr();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Campaigns</h1>
      {q.isLoading && <p className="text-gray-500">Loading...</p>}
      {q.error && <Notice tone="error">{err(q.error)}</Notice>}
      {q.data && q.data.length === 0 && <p className="text-gray-500">No campaigns yet.</p>}
      <div className="grid sm:grid-cols-2 gap-4">{q.data?.map((c) => <CampaignCard key={c.id} c={c} />)}</div>
    </div>
  );
}
