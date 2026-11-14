import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getSelector, signIn, signOut } from './wallet';

interface Ctx { accountId: string | null; connect: () => void; disconnect: () => void }
const WalletCtx = createContext<Ctx>({ accountId: null, connect: () => {}, disconnect: () => {} });

export function WalletProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  useEffect(() => {
    let sub: { unsubscribe: () => void } | undefined;
    getSelector().then((s) => {
      setAccountId(s.store.getState().accounts.find((a) => a.active)?.accountId ?? null);
      sub = s.store.observable.subscribe((st) =>
        setAccountId(st.accounts.find((a) => a.active)?.accountId ?? null));
    }).catch((e) => console.error('wallet init failed', e));
    return () => sub?.unsubscribe();
  }, []);
  return (
    <WalletCtx.Provider value={{
      accountId,
      connect: () => { signIn().catch((e) => alert(String(e))); },
      disconnect: () => { signOut().then(() => setAccountId(null)).catch(() => {}); },
    }}>
      {children}
    </WalletCtx.Provider>
  );
}
export const useWallet = () => useContext(WalletCtx);
