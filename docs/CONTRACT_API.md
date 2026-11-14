# Contract API (NEAR only, amounts are yoctoNEAR strings)

Change methods
- `create_campaign(metadata, milestones, approvers)` payable, attach >= 0.1 NEAR (kept for storage). Milestones sum to target, each needs >= 1 approval and at most as many as there are approvers. Creator cannot be an approver.
- `fund_campaign(campaign_id)` payable, min 0.01 NEAR, cannot push total above target, creator cannot fund own campaign.
- `unlock_milestone(campaign_id, milestone_index, evidence)` creator only, in order. Stores evidence. Locked once any approval exists.
- `approve_milestone(campaign_id, milestone_index)` approvers only, needs evidence. Unlocks when approvals >= required.
- `claim_payout(campaign_id)` creator only. Pays unlocked milestone amounts, capped at total raised, minus already paid. Rolls back if the transfer fails.
- `cancel_campaign(campaign_id)` creator only. Unlocked funds stay claimable; the rest is refundable.
- `claim_refund(campaign_id)` backer, cancelled campaigns only. Pro rata share of unreleased funds.

Views: `get_campaign`, `get_campaigns`, `get_campaigns_by_creator`, `get_contributions`, `get_payout_info`, `get_contract_stats`, `get_owner`.

Known limits: evidence is free text the contract cannot verify; the creator chooses approvers; no deadline or dispute process (a creator who vanishes locks unreleased funds); no USDC or cross-chain funding; unaudited.
