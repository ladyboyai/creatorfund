import { CONFIG } from '../config';
import { viewCall, parseNear } from './rpc';
import { callMethod } from './wallet';

export type CampaignStatus = 'Active' | 'Completed' | 'Cancelled';

export interface Milestone {
  index: number;
  title: string;
  description: string;
  amount: string; // yocto
  evidence: string | null;
  unlocked: boolean;
  unlocked_at: number | null;
  required_approvals: number;
  approvals: string[];
}

export interface Campaign {
  id: number;
  creator: string;
  metadata: {
    title: string;
    description: string;
    cover_image: string | null;
    category: string;
    target_amount: string;
    token: string;
  };
  approvers: string[];
  milestones: Milestone[];
  total_raised: string;
  paid_out: string;
  status: CampaignStatus;
  created_at: number;
  updated_at: number;
}

export interface Contribution {
  campaign_id: number;
  contributor: string;
  amount: string;
  refunded: boolean;
  created_at: number;
}

export interface PayoutInfo {
  unlocked_amount: string;
  entitled: string;
  paid_out: string;
  claimable: string;
}

export interface MilestoneForm {
  title: string;
  description: string;
  amountNear: string;
  requiredApprovals: number;
}

const GAS = '100000000000000'; // 100 TGas
const view = <T,>(method: string, args: object = {}) => {
  if (!CONFIG.contractId) throw new Error('VITE_CONTRACT_ID is not set. Deploy the contract first (docs/DEPLOY.md).');
  return viewCall<T>(CONFIG.rpcUrl, CONFIG.contractId, method, args);
};

export const api = {
  getCampaign: (id: number) => view<Campaign | null>('get_campaign', { campaign_id: id }),
  getCampaigns: () => view<Campaign[]>('get_campaigns', { from_index: 0, limit: 50 }),
  getCampaignsByCreator: (creator: string) => view<Campaign[]>('get_campaigns_by_creator', { creator }),
  getContributions: (id: number) => view<Contribution[]>('get_contributions', { campaign_id: id }),
  getPayoutInfo: (id: number) => view<PayoutInfo | null>('get_payout_info', { campaign_id: id }),
  getStats: () => view<{ total_campaigns: number; total_raised: string }>('get_contract_stats'),

  createCampaign(p: {
    title: string; description: string; category: string;
    milestones: MilestoneForm[]; approvers: string[];
  }) {
    return callMethod('create_campaign', {
      metadata: {
        title: p.title, description: p.description, cover_image: null,
        category: p.category, target_amount: p.milestones.reduce((t, m) => t + BigInt(parseNear(m.amountNear)), 0n).toString(), token: 'near',
      },
      milestones: p.milestones.map((m) => ({
        title: m.title, description: m.description,
        amount: parseNear(m.amountNear), required_approvals: m.requiredApprovals,
      })),
      approvers: p.approvers,
    }, GAS, parseNear('0.1'));
  },
  fund: (id: number, amountNear: string) =>
    callMethod('fund_campaign', { campaign_id: id }, GAS, parseNear(amountNear)),
  submitEvidence: (id: number, index: number, evidence: string) =>
    callMethod('unlock_milestone', { campaign_id: id, milestone_index: index, evidence }, GAS),
  approve: (id: number, index: number) =>
    callMethod('approve_milestone', { campaign_id: id, milestone_index: index }, GAS),
  claimPayout: (id: number) => callMethod('claim_payout', { campaign_id: id }, GAS),
  cancel: (id: number) => callMethod('cancel_campaign', { campaign_id: id }, GAS),
  claimRefund: (id: number) => callMethod('claim_refund', { campaign_id: id }, GAS),
};
