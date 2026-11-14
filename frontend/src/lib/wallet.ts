import { setupWalletSelector, type WalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { CONFIG } from '../config';

let selectorPromise: Promise<WalletSelector> | null = null;

export function getSelector(): Promise<WalletSelector> {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: CONFIG.networkId,
      modules: [setupMyNearWallet() as never],
    });
  }
  return selectorPromise;
}

export async function signIn() {
  const selector = await getSelector();
  const wallet = await selector.wallet('my-near-wallet');
  await wallet.signIn({ contractId: CONFIG.contractId, accounts: [] });
}

export async function signOut() {
  const selector = await getSelector();
  const wallet = await selector.wallet();
  await wallet.signOut();
}

export async function callMethod(methodName: string, args: object, gas: string, deposit = '0') {
  if (!CONFIG.contractId) throw new Error('VITE_CONTRACT_ID is not set. Deploy the contract first (docs/DEPLOY.md).');
  const selector = await getSelector();
  const wallet = await selector.wallet();
  return wallet.signAndSendTransaction({
    receiverId: CONFIG.contractId,
    actions: [{ type: 'FunctionCall', params: { methodName, args, gas, deposit } }],
  });
}
