//! ladyboyai: milestone-gated creator funding escrow (NEAR testnet demo).
//!
//! Money model (native NEAR only):
//! - Backers attach NEAR to `fund_campaign`. The contract holds it.
//! - The creator submits evidence for a milestone. Named approvers (chosen at
//!   campaign creation) must approve it. Only then does that milestone's amount
//!   become claimable, in order, and never more than what was actually raised.
//! - The creator can cancel. Unreleased funds are then refundable to backers pro rata.
//!
//! Not implemented on purpose: cross-chain settlement (needs a real verifier, the
//! earlier "manual proof" idea would let anyone claim a settlement) and USDC/FT.
//! Evidence is a free-text string. Approvers judge it. The contract cannot verify it.
//! This is unaudited demo code. Do not put real money in it.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
    PromiseError,
};
use primitive_types::U256;

pub type CampaignId = u64;

pub const TOKEN_NEAR: &str = "near";
/// One-time, non-refundable deposit that pays the contract's storage for a campaign.
pub const CREATE_DEPOSIT: u128 = 100_000_000_000_000_000_000_000; // 0.1 NEAR
/// Minimum backing amount (also covers per-backer storage).
pub const MIN_CONTRIBUTION: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR
pub const MAX_MILESTONES: usize = 10;
pub const MAX_APPROVERS: usize = 5;
const MAX_TITLE: usize = 100;
const MAX_DESC: usize = 2000;
const MAX_EVIDENCE: usize = 500;
const MAX_CATEGORY: usize = 50;
const MAX_URL: usize = 300;

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Debug)]
pub enum CampaignStatus {
    Active,
    Completed,
    Cancelled,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct CampaignMetadata {
    pub title: String,
    pub description: String,
    pub cover_image: Option<String>,
    pub category: String,
    pub target_amount: U128,
    pub token: String,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct MilestoneInput {
    pub title: String,
    pub description: String,
    pub amount: U128,
    pub required_approvals: u8,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Milestone {
    pub index: u8,
    pub title: String,
    pub description: String,
    pub amount: U128,
    pub evidence: Option<String>,
    pub unlocked: bool,
    pub unlocked_at: Option<u64>,
    pub required_approvals: u8,
    pub approvals: Vec<AccountId>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Campaign {
    pub id: CampaignId,
    pub creator: AccountId,
    pub metadata: CampaignMetadata,
    pub approvers: Vec<AccountId>,
    pub milestones: Vec<Milestone>,
    pub total_raised: U128,
    pub paid_out: U128,
    pub status: CampaignStatus,
    pub created_at: u64,
    pub updated_at: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Contribution {
    pub campaign_id: CampaignId,
    pub contributor: AccountId,
    pub amount: U128,
    pub token: String,
    pub refunded: bool,
    pub created_at: u64,
}

#[near(serializers = [json])]
pub struct ContractStats {
    pub total_campaigns: u64,
    pub total_raised: U128,
}

#[near(serializers = [json])]
pub struct PayoutInfo {
    pub unlocked_amount: U128,
    pub entitled: U128,
    pub paid_out: U128,
    pub claimable: U128,
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Campaigns,
    Contributors,
    ContributorList(CampaignId),
    Contributions,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    campaigns: IterableMap<CampaignId, Campaign>,
    contributors: LookupMap<CampaignId, Vector<AccountId>>,
    contributions: LookupMap<(CampaignId, AccountId), Contribution>,
    next_campaign_id: CampaignId,
    total_raised_all: u128,
}

fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    (U256::from(a) * U256::from(b) / U256::from(d)).as_u128()
}

fn emit(event: &str, data: String) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"ladyboyai\",\"version\":\"1.0.0\",\"event\":\"{}\",\"data\":{}}}",
        event, data
    ));
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            campaigns: IterableMap::new(StorageKey::Campaigns),
            contributors: LookupMap::new(StorageKey::Contributors),
            contributions: LookupMap::new(StorageKey::Contributions),
            next_campaign_id: 0,
            total_raised_all: 0,
        }
    }

    // ---------- create ----------

    /// Create a campaign. Attach at least CREATE_DEPOSIT (0.1 NEAR, kept for storage).
    /// Excess attached deposit is refunded. Milestones must sum to target_amount.
    /// `approvers` are the accounts allowed to approve milestones (not the creator).
    #[payable]
    pub fn create_campaign(
        &mut self,
        metadata: CampaignMetadata,
        milestones: Vec<MilestoneInput>,
        approvers: Vec<AccountId>,
    ) -> CampaignId {
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached >= CREATE_DEPOSIT, "Attach at least 0.1 NEAR storage deposit");
        let creator = env::predecessor_account_id();

        require!(metadata.token == TOKEN_NEAR, "Only native NEAR (token 'near') is supported");
        require!(
            !metadata.title.trim().is_empty() && metadata.title.len() <= MAX_TITLE,
            "Title required, max 100 chars"
        );
        require!(metadata.description.len() <= MAX_DESC, "Description too long");
        require!(metadata.category.len() <= MAX_CATEGORY, "Category too long");
        if let Some(c) = &metadata.cover_image {
            require!(c.len() <= MAX_URL, "Cover image reference too long");
        }
        require!(
            !milestones.is_empty() && milestones.len() <= MAX_MILESTONES,
            "Need 1 to 10 milestones"
        );
        require!(approvers.len() <= MAX_APPROVERS, "At most 5 approvers");
        for (i, a) in approvers.iter().enumerate() {
            require!(*a != creator, "Creator cannot be an approver");
            require!(!approvers[..i].contains(a), "Duplicate approver");
        }

        let mut sum: u128 = 0;
        let mut built = Vec::with_capacity(milestones.len());
        for (i, m) in milestones.into_iter().enumerate() {
            require!(m.amount.0 > 0, "Each milestone amount must be > 0");
            require!(
                !m.title.trim().is_empty() && m.title.len() <= MAX_TITLE,
                "Milestone title required, max 100 chars"
            );
            require!(m.description.len() <= MAX_DESC, "Milestone description too long");
            require!(m.required_approvals >= 1, "Each milestone needs at least 1 approval");
            require!(
                (m.required_approvals as usize) <= approvers.len(),
                "required_approvals exceeds number of approvers"
            );
            sum = sum.checked_add(m.amount.0).unwrap_or_else(|| env::panic_str("Amount overflow"));
            built.push(Milestone {
                index: i as u8,
                title: m.title,
                description: m.description,
                amount: m.amount,
                evidence: None,
                unlocked: false,
                unlocked_at: None,
                required_approvals: m.required_approvals,
                approvals: vec![],
            });
        }
        require!(sum == metadata.target_amount.0, "Milestones must sum to target");
        require!(sum >= MIN_CONTRIBUTION, "Target too small");

        let id = self.next_campaign_id;
        self.next_campaign_id += 1;
        let now = env::block_timestamp_ms();
        let campaign = Campaign {
            id,
            creator: creator.clone(),
            metadata,
            approvers,
            milestones: built,
            total_raised: U128(0),
            paid_out: U128(0),
            status: CampaignStatus::Active,
            created_at: now,
            updated_at: now,
        };
        let target = campaign.metadata.target_amount.0;
        self.campaigns.insert(id, campaign);
        self.contributors
            .insert(id, Vector::new(StorageKey::ContributorList(id)));
        emit(
            "campaign_created",
            format!(
                "{{\"campaign_id\":{},\"creator\":\"{}\",\"target_amount\":\"{}\"}}",
                id, creator, target
            ),
        );
        let excess = attached - CREATE_DEPOSIT;
        if excess > 0 {
            let _ = Promise::new(creator).transfer(NearToken::from_yoctonear(excess));
        }
        id
    }

    // ---------- fund ----------

    /// Back a campaign with the attached NEAR. Cannot exceed the target.
    /// Over-target deposits are rejected (panic returns the attached deposit).
    #[payable]
    pub fn fund_campaign(&mut self, campaign_id: CampaignId) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount >= MIN_CONTRIBUTION, "Minimum contribution is 0.01 NEAR");
        let backer = env::predecessor_account_id();
        let mut c = self.must_get(campaign_id);
        require!(c.status == CampaignStatus::Active, "Campaign not active");
        require!(backer != c.creator, "Creator cannot fund own campaign");
        let new_total = c.total_raised.0 + amount;
        require!(new_total <= c.metadata.target_amount.0, "Funding would exceed target");
        c.total_raised = U128(new_total);
        c.updated_at = env::block_timestamp_ms();
        self.campaigns.insert(campaign_id, c);
        self.total_raised_all += amount;

        let key = (campaign_id, backer.clone());
        let now = env::block_timestamp_ms();
        if let Some(existing) = self.contributions.get_mut(&key) {
            existing.amount = U128(existing.amount.0 + amount);
        } else {
            self.contributions.insert(
                key,
                Contribution {
                    campaign_id,
                    contributor: backer.clone(),
                    amount: U128(amount),
                    token: TOKEN_NEAR.to_string(),
                    refunded: false,
                    created_at: now,
                },
            );
            self.contributors
                .get_mut(&campaign_id)
                .unwrap_or_else(|| env::panic_str("Contributor list missing"))
                .push(backer.clone());
        }
        emit(
            "campaign_funded",
            format!(
                "{{\"campaign_id\":{},\"contributor\":\"{}\",\"amount\":\"{}\"}}",
                campaign_id, backer, amount
            ),
        );
    }

    // ---------- milestones ----------

    /// Creator submits evidence for the next milestone. With 0 required approvals
    /// it unlocks immediately; otherwise approvers must approve this exact evidence.
    /// Evidence cannot change once someone approved it.
    pub fn unlock_milestone(&mut self, campaign_id: CampaignId, milestone_index: u8, evidence: String) {
        let mut c = self.must_get(campaign_id);
        require!(env::predecessor_account_id() == c.creator, "Only creator can unlock");
        require!(c.status == CampaignStatus::Active, "Campaign not active");
        let ev = evidence.trim().to_string();
        require!(!ev.is_empty() && ev.len() <= MAX_EVIDENCE, "Evidence required, max 500 chars");
        let i = Self::check_index(&c, milestone_index);
        require!(i == 0 || c.milestones[i - 1].unlocked, "Previous milestone not unlocked");
        {
            let m = &mut c.milestones[i];
            require!(!m.unlocked, "Milestone already unlocked");
            require!(m.approvals.is_empty(), "Evidence is locked once approvals exist");
            m.evidence = Some(ev.clone());
        }
        emit(
            "evidence_submitted",
            format!("{{\"campaign_id\":{},\"milestone_index\":{}}}", campaign_id, milestone_index),
        );
        Self::maybe_unlock(&mut c, i);
        c.updated_at = env::block_timestamp_ms();
        self.campaigns.insert(campaign_id, c);
    }

    /// An approver signs off on the milestone's submitted evidence.
    pub fn approve_milestone(&mut self, campaign_id: CampaignId, milestone_index: u8) {
        let mut c = self.must_get(campaign_id);
        let who = env::predecessor_account_id();
        require!(c.approvers.contains(&who), "Not an approver for this campaign");
        require!(c.status == CampaignStatus::Active, "Campaign not active");
        let i = Self::check_index(&c, milestone_index);
        require!(i == 0 || c.milestones[i - 1].unlocked, "Previous milestone not unlocked");
        {
            let m = &mut c.milestones[i];
            require!(!m.unlocked, "Milestone already unlocked");
            require!(m.evidence.is_some(), "No evidence submitted yet");
            require!(!m.approvals.contains(&who), "Already approved");
            m.approvals.push(who.clone());
        }
        emit(
            "milestone_approved",
            format!(
                "{{\"campaign_id\":{},\"milestone_index\":{},\"approver\":\"{}\"}}",
                campaign_id, milestone_index, who
            ),
        );
        Self::maybe_unlock(&mut c, i);
        c.updated_at = env::block_timestamp_ms();
        self.campaigns.insert(campaign_id, c);
    }

    // ---------- payout ----------

    /// Creator withdraws funds for unlocked milestones, limited to what was raised.
    pub fn claim_payout(&mut self, campaign_id: CampaignId) -> Promise {
        let mut c = self.must_get(campaign_id);
        require!(env::predecessor_account_id() == c.creator, "Only creator can claim");
        let info = Self::payout_info(&c);
        require!(info.claimable.0 > 0, "No unlocked funds to claim");
        // Update state before the transfer (checks-effects-interactions).
        c.paid_out = U128(c.paid_out.0 + info.claimable.0);
        let creator = c.creator.clone();
        self.campaigns.insert(campaign_id, c);
        emit(
            "payout_claimed",
            format!(
                "{{\"campaign_id\":{},\"creator\":\"{}\",\"amount\":\"{}\"}}",
                campaign_id, creator, info.claimable.0
            ),
        );
        Promise::new(creator)
            .transfer(NearToken::from_yoctonear(info.claimable.0))
            .then(Self::ext(env::current_account_id()).on_payout_done(campaign_id, info.claimable))
    }

    #[private]
    pub fn on_payout_done(
        &mut self,
        campaign_id: CampaignId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        if result.is_err() {
            self.rollback_payout(campaign_id, amount.0);
        }
    }

    // ---------- cancel / refund ----------

    /// Creator stops the campaign. Already-unlocked funds stay claimable by the
    /// creator; everything else becomes refundable to backers pro rata.
    pub fn cancel_campaign(&mut self, campaign_id: CampaignId) {
        let mut c = self.must_get(campaign_id);
        require!(env::predecessor_account_id() == c.creator, "Only creator can cancel");
        require!(c.status == CampaignStatus::Active, "Campaign not active");
        c.status = CampaignStatus::Cancelled;
        c.updated_at = env::block_timestamp_ms();
        self.campaigns.insert(campaign_id, c);
        emit("campaign_cancelled", format!("{{\"campaign_id\":{}}}", campaign_id));
    }

    /// Backer takes their share of the unreleased funds from a cancelled campaign.
    pub fn claim_refund(&mut self, campaign_id: CampaignId) -> Promise {
        let c = self.must_get(campaign_id);
        require!(c.status == CampaignStatus::Cancelled, "Campaign not cancelled");
        let who = env::predecessor_account_id();
        let key = (campaign_id, who.clone());
        let contribution = self
            .contributions
            .get_mut(&key)
            .unwrap_or_else(|| env::panic_str("No contribution found"));
        require!(!contribution.refunded, "Already refunded");
        let info = Self::payout_info(&c);
        require!(c.metadata.token == TOKEN_NEAR, "Unsupported token");
        let pool = c.total_raised.0 - info.entitled.0;
        let refund = mul_div(contribution.amount.0, pool, c.total_raised.0);
        require!(refund > 0, "Nothing to refund");
        contribution.refunded = true;
        emit(
            "refund_claimed",
            format!(
                "{{\"campaign_id\":{},\"contributor\":\"{}\",\"amount\":\"{}\"}}",
                campaign_id, who, refund
            ),
        );
        Promise::new(who.clone())
            .transfer(NearToken::from_yoctonear(refund))
            .then(Self::ext(env::current_account_id()).on_refund_done(campaign_id, who))
    }

    #[private]
    pub fn on_refund_done(
        &mut self,
        campaign_id: CampaignId,
        contributor: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        if result.is_err() {
            if let Some(c) = self.contributions.get_mut(&(campaign_id, contributor)) {
                c.refunded = false;
            }
        }
    }

    // ---------- views ----------

    pub fn get_campaign(&self, campaign_id: CampaignId) -> Option<Campaign> {
        self.campaigns.get(&campaign_id).cloned()
    }

    pub fn get_campaigns(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<Campaign> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(20).min(50);
        (from..self.next_campaign_id)
            .take(limit as usize)
            .filter_map(|i| self.campaigns.get(&i).cloned())
            .collect()
    }

    pub fn get_campaigns_by_creator(&self, creator: AccountId) -> Vec<Campaign> {
        self.campaigns
            .iter()
            .filter(|(_, c)| c.creator == creator)
            .map(|(_, c)| c.clone())
            .collect()
    }

    pub fn get_contributions(
        &self,
        campaign_id: CampaignId,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Contribution> {
        let from = from_index.unwrap_or(0) as u32;
        let limit = limit.unwrap_or(50).min(100) as usize;
        match self.contributors.get(&campaign_id) {
            None => vec![],
            Some(list) => list
                .iter()
                .skip(from as usize)
                .take(limit)
                .filter_map(|a| self.contributions.get(&(campaign_id, a.clone())).cloned())
                .collect(),
        }
    }

    pub fn get_payout_info(&self, campaign_id: CampaignId) -> Option<PayoutInfo> {
        self.campaigns.get(&campaign_id).map(Self::payout_info)
    }

    pub fn get_contract_stats(&self) -> ContractStats {
        ContractStats {
            total_campaigns: self.next_campaign_id,
            total_raised: U128(self.total_raised_all),
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }
}

impl Contract {
    fn must_get(&self, id: CampaignId) -> Campaign {
        self.campaigns
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Campaign not found"))
    }

    fn check_index(c: &Campaign, idx: u8) -> usize {
        require!((idx as usize) < c.milestones.len(), "Milestone not found");
        idx as usize
    }

    fn maybe_unlock(c: &mut Campaign, i: usize) {
        let now = env::block_timestamp_ms();
        let m = &mut c.milestones[i];
        if !m.unlocked
            && m.evidence.is_some()
            && m.approvals.len() >= m.required_approvals as usize
        {
            m.unlocked = true;
            m.unlocked_at = Some(now);
            emit(
                "milestone_unlocked",
                format!("{{\"campaign_id\":{},\"milestone_index\":{}}}", c.id, i),
            );
        }
        if c.status == CampaignStatus::Active && c.milestones.iter().all(|m| m.unlocked) {
            c.status = CampaignStatus::Completed;
        }
    }

    fn payout_info(c: &Campaign) -> PayoutInfo {
        let unlocked: u128 = c.milestones.iter().filter(|m| m.unlocked).map(|m| m.amount.0).sum();
        let entitled = unlocked.min(c.total_raised.0);
        PayoutInfo {
            unlocked_amount: U128(unlocked),
            entitled: U128(entitled),
            paid_out: c.paid_out,
            claimable: U128(entitled.saturating_sub(c.paid_out.0)),
        }
    }

    fn rollback_payout(&mut self, campaign_id: CampaignId, amount: u128) {
        if let Some(c) = self.campaigns.get_mut(&campaign_id) {
            c.paid_out = U128(c.paid_out.0.saturating_sub(amount));
        }
    }
}

#[cfg(test)]
mod tests;
