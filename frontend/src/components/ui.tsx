import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { formatNear } from '../lib/rpc';
import type { Campaign } from '../lib/contract';
import { NETWORK_LABEL, IS_TESTNET } from '../config';
import { useWallet } from '../lib/wallet-context';

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'ghost' | 'danger' }) {
  const { tone = 'primary', className, ...rest } = props;
  return (
    <button
      {...rest}
      className={clsx(
        'px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        tone === 'primary' && 'bg-near-600 text-white hover:bg-near-700',
        tone === 'ghost' && 'border border-gray-300 text-gray-700 hover:bg-gray-50',
        tone === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('bg-white rounded-2xl border border-gray-100 shadow-sm p-6', className)}>{children}</div>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={clsx('rounded-lg p-3 text-sm border',
      tone === 'info' && 'bg-yellow-50 border-yellow-200 text-yellow-900',
      tone === 'error' && 'bg-red-50 border-red-200 text-red-800',
      tone === 'ok' && 'bg-green-50 border-green-200 text-green-800')}>
      {children}
    </div>
  );
}

export function Progress({ raised, target }: { raised: string; target: string }) {
  const pct = Number(target) > 0 ? Math.min(100, Number((BigInt(raised) * 10000n) / BigInt(target)) / 100) : 0;
  return (
    <div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-near-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {formatNear(raised)} of {formatNear(target)} NEAR ({pct.toFixed(1)}%)
      </div>
    </div>
  );
}

export function CampaignCard({ c }: { c: Campaign }) {
  const done = c.milestones.filter((m) => m.unlocked).length;
  return (
    <Link to={`/campaign/${c.id}`} className="block">
      <Card className="hover:border-near-300 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs px-2 py-0.5 rounded-full bg-near-50 text-near-700">{c.metadata.category || 'campaign'}</span>
          <span className="text-xs text-gray-500">{c.status}</span>
        </div>
        <h3 className="font-semibold text-gray-900">{c.metadata.title}</h3>
        <p className="text-sm text-gray-500 line-clamp-2 mb-4">{c.metadata.description}</p>
        <Progress raised={c.total_raised} target={c.metadata.target_amount} />
        <div className="text-xs text-gray-500 mt-2">{done}/{c.milestones.length} milestones approved</div>
      </Card>
    </Link>
  );
}

export function WalletButton() {
  const { accountId, connect, disconnect } = useWallet();
  return accountId ? (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium truncate max-w-[160px]">{accountId}</span>
      <Button tone="ghost" onClick={disconnect}>Disconnect</Button>
    </div>
  ) : (
    <Button onClick={connect}>Connect wallet</Button>
  );
}

export function useErr() {
  return (e: unknown) => (e instanceof Error ? e.message : String(e));
}

export function NetworkBadge() {
  return (
    <span className={clsx('text-xs px-2 py-1 rounded-full border whitespace-nowrap',
      IS_TESTNET ? 'bg-green-50 border-green-200 text-green-800' : 'bg-yellow-50 border-yellow-300 text-yellow-900')}>
      Network: {NETWORK_LABEL}
    </span>
  );
}
