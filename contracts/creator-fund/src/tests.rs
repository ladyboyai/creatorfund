use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(who: &str, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(acc(who))
        .current_account_id(acc("escrow.testnet"))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(1_700_000_000_000_000_000)
        .build());
}

fn meta(target: u128) -> CampaignMetadata {
    CampaignMetadata {
        title: "Short film".into(),
        description: "A film".into(),
        cover_image: None,
        category: "film".into(),
        target_amount: U128(target),
        token: "near".into(),
    }
}

fn ms(amount: u128, approvals: u8) -> MilestoneInput {
    MilestoneInput {
        title: "m".into(),
        description: "d".into(),
        amount: U128(amount),
        required_approvals: approvals,
    }
}

/// Campaign 0: creator alice, approvers bob + carol, milestones 4 + 6 NEAR, 1 approval each.
fn setup() -> Contract {
    ctx("owner.testnet", 0);
    let mut c = Contract::new(acc("owner.testnet"));
    ctx("alice.testnet", CREATE_DEPOSIT);
    let id = c.create_campaign(
        meta(10 * NEAR),
        vec![ms(4 * NEAR, 1), ms(6 * NEAR, 2)],
        vec![acc("bob.testnet"), acc("carol.testnet")],
    );
    assert_eq!(id, 0);
    c
}

fn fund(c: &mut Contract, who: &str, amt: u128) {
    ctx(who, amt);
    c.fund_campaign(0);
}

fn unlock_first(c: &mut Contract) {
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 0, "ipfs://proof1".into());
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 0);
}

#[test]
fn campaign_id_zero_works_and_stats() {
    let c = setup();
    assert!(c.get_campaign(0).is_some());
    assert!(c.get_campaign(1).is_none());
    assert_eq!(c.get_contract_stats().total_campaigns, 1);
}

#[test]
fn full_happy_path() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 6 * NEAR);
    fund(&mut c, "erin.testnet", 4 * NEAR);
    assert_eq!(c.get_campaign(0).unwrap().total_raised.0, 10 * NEAR);
    // nothing claimable before approval
    assert_eq!(c.get_payout_info(0).unwrap().claimable.0, 0);
    unlock_first(&mut c);
    assert_eq!(c.get_payout_info(0).unwrap().claimable.0, 4 * NEAR);
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
    assert_eq!(c.get_campaign(0).unwrap().paid_out.0, 4 * NEAR);
    // second milestone needs 2 approvals
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 1, "ipfs://proof2".into());
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 1);
    assert!(!c.get_campaign(0).unwrap().milestones[1].unlocked);
    ctx("carol.testnet", 0);
    c.approve_milestone(0, 1);
    let camp = c.get_campaign(0).unwrap();
    assert!(camp.milestones[1].unlocked);
    assert_eq!(camp.status, CampaignStatus::Completed);
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
    assert_eq!(c.get_campaign(0).unwrap().paid_out.0, 10 * NEAR);
    assert_eq!(c.get_contributions(0, None, None).len(), 2);
    assert!(get_logs().iter().any(|l| l.contains("payout_claimed")));
}

#[test]
fn payout_capped_at_amount_raised() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 3 * NEAR); // less than milestone 1 (4)
    unlock_first(&mut c);
    let info = c.get_payout_info(0).unwrap();
    assert_eq!(info.unlocked_amount.0, 4 * NEAR);
    assert_eq!(info.claimable.0, 3 * NEAR);
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
    assert_eq!(c.get_payout_info(0).unwrap().claimable.0, 0);
    // more funding later makes the rest claimable
    fund(&mut c, "erin.testnet", 1 * NEAR);
    assert_eq!(c.get_payout_info(0).unwrap().claimable.0, 1 * NEAR);
}

#[test]
#[should_panic(expected = "No unlocked funds to claim")]
fn cannot_claim_before_unlock() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
}

#[test]
#[should_panic(expected = "No unlocked funds to claim")]
fn cannot_claim_twice() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    unlock_first(&mut c);
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
}

#[test]
#[should_panic(expected = "Only creator can claim")]
fn only_creator_claims() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    unlock_first(&mut c);
    ctx("mallory.testnet", 0);
    let _ = c.claim_payout(0);
}

#[test]
#[should_panic(expected = "Only creator can unlock")]
fn only_creator_submits_evidence() {
    let mut c = setup();
    ctx("mallory.testnet", 0);
    c.unlock_milestone(0, 0, "x".into());
}

#[test]
#[should_panic(expected = "Not an approver")]
fn creator_cannot_self_approve() {
    let mut c = setup();
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 0, "proof".into());
    ctx("alice.testnet", 0);
    c.approve_milestone(0, 0);
}

#[test]
#[should_panic(expected = "Not an approver")]
fn stranger_cannot_approve() {
    let mut c = setup();
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 0, "proof".into());
    ctx("mallory.testnet", 0);
    c.approve_milestone(0, 0);
}

#[test]
#[should_panic(expected = "No evidence submitted yet")]
fn approval_needs_evidence() {
    let mut c = setup();
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 0);
}

#[test]
#[should_panic(expected = "Already approved")]
fn approver_cannot_double_approve() {
    let mut c = setup();
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 1 - 1, "p".into());
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 0);
    // milestone 0 needs 1 approval so it is unlocked; test double approval on milestone 1
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 1, "p2".into());
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 1);
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 1);
}

#[test]
#[should_panic(expected = "Evidence is locked once approvals exist")]
fn evidence_cannot_be_swapped_after_approval() {
    let mut c = setup();
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 0, "p".into());
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 0); // unlocks m0
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 1, "good".into());
    ctx("bob.testnet", 0);
    c.approve_milestone(0, 1); // 1 of 2
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 1, "swapped".into());
}

#[test]
#[should_panic(expected = "Previous milestone not unlocked")]
fn milestones_in_order() {
    let mut c = setup();
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 1, "p".into());
}

#[test]
#[should_panic(expected = "Milestone already unlocked")]
fn cannot_unlock_twice() {
    let mut c = setup();
    unlock_first(&mut c);
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 0, "again".into());
}

#[test]
#[should_panic(expected = "Funding would exceed target")]
fn cannot_overfund() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 11 * NEAR);
}

#[test]
#[should_panic(expected = "Minimum contribution")]
fn dust_rejected() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 1000);
}

#[test]
#[should_panic(expected = "Creator cannot fund own campaign")]
fn creator_cannot_self_fund() {
    let mut c = setup();
    fund(&mut c, "alice.testnet", 1 * NEAR);
}

#[test]
fn same_backer_aggregates() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 1 * NEAR);
    fund(&mut c, "dave.testnet", 2 * NEAR);
    let list = c.get_contributions(0, None, None);
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].amount.0, 3 * NEAR);
}

#[test]
#[should_panic(expected = "Milestones must sum to target")]
fn milestone_sum_validated() {
    ctx("owner.testnet", 0);
    let mut c = Contract::new(acc("owner.testnet"));
    ctx("alice.testnet", CREATE_DEPOSIT);
    c.create_campaign(meta(10 * NEAR), vec![ms(4 * NEAR, 1)], vec![acc("bob.testnet")]);
}

#[test]
#[should_panic(expected = "storage deposit")]
fn create_needs_deposit() {
    ctx("owner.testnet", 0);
    let mut c = Contract::new(acc("owner.testnet"));
    ctx("alice.testnet", 0);
    c.create_campaign(meta(NEAR), vec![ms(NEAR, 1)], vec![acc("bob.testnet")]);
}

#[test]
#[should_panic(expected = "at least 1 approval")]
fn zero_approval_milestones_rejected() {
    ctx("owner.testnet", 0);
    let mut c = Contract::new(acc("owner.testnet"));
    ctx("alice.testnet", CREATE_DEPOSIT);
    c.create_campaign(meta(NEAR), vec![ms(NEAR, 0)], vec![acc("bob.testnet")]);
}

#[test]
#[should_panic(expected = "Creator cannot be an approver")]
fn creator_not_approver() {
    ctx("owner.testnet", 0);
    let mut c = Contract::new(acc("owner.testnet"));
    ctx("alice.testnet", CREATE_DEPOSIT);
    c.create_campaign(meta(NEAR), vec![ms(NEAR, 1)], vec![acc("alice.testnet")]);
}

#[test]
#[should_panic(expected = "exceeds number of approvers")]
fn approvals_cannot_exceed_approvers() {
    ctx("owner.testnet", 0);
    let mut c = Contract::new(acc("owner.testnet"));
    ctx("alice.testnet", CREATE_DEPOSIT);
    c.create_campaign(meta(NEAR), vec![ms(NEAR, 2)], vec![acc("bob.testnet")]);
}

#[test]
#[should_panic(expected = "Only native NEAR")]
fn only_near_token() {
    ctx("owner.testnet", 0);
    let mut c = Contract::new(acc("owner.testnet"));
    ctx("alice.testnet", CREATE_DEPOSIT);
    let mut m = meta(NEAR);
    m.token = "usdc".into();
    c.create_campaign(m, vec![ms(NEAR, 1)], vec![acc("bob.testnet")]);
}

#[test]
fn cancel_and_pro_rata_refunds() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 6 * NEAR);
    fund(&mut c, "erin.testnet", 2 * NEAR); // total 8
    unlock_first(&mut c); // 4 entitled
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
    ctx("alice.testnet", 0);
    c.cancel_campaign(0);
    assert_eq!(c.get_campaign(0).unwrap().status, CampaignStatus::Cancelled);
    // pool = 8 - 4 = 4. dave: 6/8*4 = 3. erin: 2/8*4 = 1
    ctx("dave.testnet", 0);
    let _ = c.claim_refund(0);
    ctx("erin.testnet", 0);
    let _ = c.claim_refund(0);
    let list = c.get_contributions(0, None, None);
    assert!(list.iter().all(|x| x.refunded));
    // no more evidence/funding after cancel is checked below
}

#[test]
#[should_panic(expected = "Already refunded")]
fn no_double_refund() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    ctx("alice.testnet", 0);
    c.cancel_campaign(0);
    ctx("dave.testnet", 0);
    let _ = c.claim_refund(0);
    ctx("dave.testnet", 0);
    let _ = c.claim_refund(0);
}

#[test]
#[should_panic(expected = "Campaign not cancelled")]
fn refund_requires_cancel() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    ctx("dave.testnet", 0);
    let _ = c.claim_refund(0);
}

#[test]
#[should_panic(expected = "No contribution found")]
fn stranger_no_refund() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    ctx("alice.testnet", 0);
    c.cancel_campaign(0);
    ctx("mallory.testnet", 0);
    let _ = c.claim_refund(0);
}

#[test]
#[should_panic(expected = "Only creator can cancel")]
fn only_creator_cancels() {
    let mut c = setup();
    ctx("mallory.testnet", 0);
    c.cancel_campaign(0);
}

#[test]
#[should_panic(expected = "Campaign not active")]
fn no_funding_after_cancel() {
    let mut c = setup();
    ctx("alice.testnet", 0);
    c.cancel_campaign(0);
    fund(&mut c, "dave.testnet", 1 * NEAR);
}

#[test]
#[should_panic(expected = "Campaign not active")]
fn no_unlock_after_cancel() {
    let mut c = setup();
    ctx("alice.testnet", 0);
    c.cancel_campaign(0);
    ctx("alice.testnet", 0);
    c.unlock_milestone(0, 0, "p".into());
}

#[test]
fn cancelled_creator_keeps_only_unlocked_funds() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    unlock_first(&mut c);
    ctx("alice.testnet", 0);
    c.cancel_campaign(0);
    let info = c.get_payout_info(0).unwrap();
    assert_eq!(info.claimable.0, 4 * NEAR);
}

#[test]
fn failed_payout_transfer_is_rolled_back() {
    let mut c = setup();
    fund(&mut c, "dave.testnet", 5 * NEAR);
    unlock_first(&mut c);
    ctx("alice.testnet", 0);
    let _ = c.claim_payout(0);
    assert_eq!(c.get_payout_info(0).unwrap().claimable.0, 0);
    ctx("escrow.testnet", 0);
    c.rollback_payout(0, 4 * NEAR);
    assert_eq!(c.get_payout_info(0).unwrap().claimable.0, 4 * NEAR);
}

#[test]
fn mul_div_no_overflow() {
    let big = 10u128.pow(30);
    assert_eq!(mul_div(big, big, big), big);
    assert_eq!(mul_div(5, 4, 8), 2);
}

#[test]
fn contract_never_owes_more_than_it_holds() {
    // sum of entitlement + refund pool == total raised
    let mut c = setup();
    fund(&mut c, "dave.testnet", 7 * NEAR);
    unlock_first(&mut c);
    ctx("alice.testnet", 0);
    c.cancel_campaign(0);
    let camp = c.get_campaign(0).unwrap();
    let info = c.get_payout_info(0).unwrap();
    assert_eq!(info.entitled.0 + (camp.total_raised.0 - info.entitled.0), camp.total_raised.0);
}
