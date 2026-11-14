import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { WalletProvider } from './lib/wallet-context';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 10000, refetchOnWindowFocus: false } } });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
