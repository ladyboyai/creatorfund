import { parseNear } from './rpc.ts';

export interface CampaignDraft {
  title: string;
  creator: string | null;
  approvers: string[];
  milestones: { title: string; amountNear: string; requiredApprovals: number }[];
}

/** Mirrors the contract's rules so users get a clear message before signing. Returns an error or null. */
export function validateCampaign(d: CampaignDraft): string | null {
  if (!d.title.trim()) return 'Title is required';
  if (d.title.length > 100) return 'Title is too long (max 100)';
  if (d.milestones.length < 1 || d.milestones.length > 10) return 'Use 1 to 10 milestones';
  if (d.approvers.length < 1) return 'Add at least one approver';
  if (d.approvers.length > 5) return 'At most 5 approvers';
  if (new Set(d.approvers).size !== d.approvers.length) return 'Duplicate approver';
  if (d.creator && d.approvers.includes(d.creator)) return 'You cannot be your own approver';
  for (const a of d.approvers) {
    if (!/^[a-z0-9._-]{2,64}$/.test(a)) return `"${a}" is not a valid NEAR account id`;
  }
  for (const [i, m] of d.milestones.entries()) {
    if (!m.title.trim()) return `Milestone ${i + 1}: title required`;
    try { if (BigInt(parseNear(m.amountNear)) <= 0n) return `Milestone ${i + 1}: amount must be > 0`; }
    catch { return `Milestone ${i + 1}: enter a NEAR amount like 2.5`; }
    if (!Number.isInteger(m.requiredApprovals) || m.requiredApprovals < 1) return `Milestone ${i + 1}: needs at least 1 approval`;
    if (m.requiredApprovals > d.approvers.length) return `Milestone ${i + 1}: more approvals than approvers`;
  }
  return null;
}
