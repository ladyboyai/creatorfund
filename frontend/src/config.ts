export const CONFIG = {
  networkId: 'testnet' as const,
  rpcUrl: import.meta.env.VITE_NEAR_RPC || 'https://rpc.testnet.near.org',
  explorerUrl: 'https://testnet.nearblocks.io',
  // Set after you deploy the contract yourself (see docs/DEPLOY.md). No default on purpose.
  contractId: (import.meta.env.VITE_CONTRACT_ID as string | undefined) || '',
};

const rpc = (import.meta.env.VITE_NEAR_RPC as string | undefined) || 'https://rpc.testnet.near.org';
/** Human label for the chain the UI is actually reading from. */
export const NETWORK_LABEL = /testnet/.test(rpc) ? 'NEAR testnet' : /mainnet|near\.org$/.test(rpc) && !/testnet/.test(rpc) ? 'NEAR mainnet' : 'local sandbox chain (demo data, not testnet)';
export const IS_TESTNET = /testnet/.test(rpc);
