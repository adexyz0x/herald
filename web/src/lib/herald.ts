import type { Rpc } from "./rpc";

/** Types mirror the contract's JSON exactly (contract/src/types.rs). Amounts are yoctoNEAR strings. */
export interface Deliverable {
  name: string;
  amount: string;
}

export interface Rules {
  trusted_after: number;
  core_after: number;
  auto_limit_trusted: string;
  auto_limit_core: string;
  reviewer_limit: string;
  challenge_period_sec: number;
  max_open_per_creator: number;
  slash_points: number;
}

export type CampaignStatus = "Active" | "Closed";
export type Tier = "Newcomer" | "Trusted" | "Core";
export type Route = "Auto" | "Reviewer" | "Dao";
export type SubmissionStatus =
  | "Pending"
  | "Challenge"
  | "AwaitingDao"
  | "Approved"
  | "Paid"
  | "Rejected"
  | "Vetoed";

export interface Campaign {
  id: number;
  dao: string;
  title: string;
  brief_url: string;
  rate_card: Deliverable[];
  reviewers: string[];
  rules: Rules;
  budget: string;
  reserved: string;
  paid: string;
  status: CampaignStatus;
  created_at_ms: number;
  submission_count: number;
  payout_count: number;
  available: string;
}

export interface Submission {
  id: number;
  campaign_id: number;
  dao: string;
  creator: string;
  deliverable: string;
  custom: boolean;
  amount: string;
  proof_url: string;
  note: string;
  tier_at_submit: Tier;
  route: Route;
  status: SubmissionStatus;
  created_at_ms: number;
  challenge_ends_at_ms: number | null;
  decided_by: string | null;
  decided_at_ms: number | null;
  reason: string | null;
  paid_at_ms: number | null;
}

export interface Reputation {
  points: number;
  paid_count: number;
  slashed_count: number;
  total_earned: string;
  banned: boolean;
  paid_submissions: number[];
  slashed_submissions: number[];
}

export interface TierView {
  tier: Tier;
  points: number;
  banned: boolean;
  next_tier_at: number | null;
  auto_limit: string;
}

export interface Stats {
  campaigns: number;
  submissions: number;
  creators: number;
  payouts: number;
  total_paid: string;
}

export interface ProposalInput {
  description: string;
  kind: Record<string, unknown>;
}

/** A contract call, ready for the signer. */
export interface Call {
  contractId: string;
  methodName: string;
  args: Record<string, unknown>;
  deposit?: string;
  gas?: string;
}

const TGAS = 1_000_000_000_000n;
export const gas = (tgas: number) => (BigInt(tgas) * TGAS).toString();
/** Storage deposit for a submission. Whatever isn't used is refunded by the contract. */
export const SUBMIT_DEPOSIT = (10n ** 22n * 5n).toString(); // 0.05 NEAR

export class HeraldClient {
  constructor(
    readonly rpc: Rpc,
    readonly contractId: string,
  ) {}

  stats() {
    return this.rpc.view<Stats>(this.contractId, "get_stats");
  }
  campaign(campaignId: number) {
    return this.rpc.view<Campaign | null>(this.contractId, "get_campaign", { campaign_id: campaignId });
  }
  campaigns() {
    return this.rpc.view<Campaign[]>(this.contractId, "get_campaigns", { from_index: 0, limit: 100 });
  }
  submission(submissionId: number) {
    return this.rpc.view<Submission | null>(this.contractId, "get_submission", { submission_id: submissionId });
  }
  async campaignSubmissions(campaignId: number): Promise<Submission[]> {
    const all: Submission[] = [];
    for (let from = 0; ; from += 100) {
      const page = await this.rpc.view<Submission[]>(this.contractId, "get_campaign_submissions", {
        campaign_id: campaignId,
        from_index: from,
        limit: 100,
      });
      all.push(...page);
      if (page.length < 100) return all;
    }
  }
  async creatorSubmissions(accountId: string): Promise<Submission[]> {
    const all: Submission[] = [];
    for (let from = 0; ; from += 100) {
      const page = await this.rpc.view<Submission[]>(this.contractId, "get_creator_submissions", {
        account_id: accountId,
        from_index: from,
        limit: 100,
      });
      all.push(...page);
      if (page.length < 100) return all;
    }
  }
  reputation(dao: string, accountId: string) {
    return this.rpc.view<Reputation>(this.contractId, "get_reputation", { dao, account_id: accountId });
  }
  tier(campaignId: number, accountId: string) {
    return this.rpc.view<TierView>(this.contractId, "get_tier", { campaign_id: campaignId, account_id: accountId });
  }
  daoProposal(submissionId: number) {
    return this.rpc.view<ProposalInput | null>(this.contractId, "get_dao_proposal", { submission_id: submissionId });
  }

  submit(campaignId: number, payout: { line: number } | { custom: string }, proofUrl: string, note: string): Call {
    return {
      contractId: this.contractId,
      methodName: "submit",
      args: {
        campaign_id: campaignId,
        deliverable_index: "line" in payout ? payout.line : null,
        custom_amount: "custom" in payout ? payout.custom : null,
        proof_url: proofUrl,
        note,
      },
      deposit: SUBMIT_DEPOSIT,
      gas: gas(50),
    };
  }
  approve(id: number): Call {
    return this.decision("approve", { submission_id: id });
  }
  reject(id: number, reason: string): Call {
    return this.decision("reject", { submission_id: id, reason });
  }
  veto(id: number, reason: string, fraud: boolean): Call {
    return this.decision("veto", { submission_id: id, reason, fraud });
  }
  escalate(id: number): Call {
    return this.decision("escalate", { submission_id: id });
  }
  finalize(id: number): Call {
    return this.decision("finalize", { submission_id: id });
  }
  claim(id: number): Call {
    return this.decision("claim", { submission_id: id });
  }
  private decision(methodName: string, args: Record<string, unknown>): Call {
    return { contractId: this.contractId, methodName, args, gas: gas(100) };
  }
}

/** Mirrors the contract's tier rule. */
export function tierFor(rules: Rules, points: number): Tier {
  if (points >= rules.core_after) return "Core";
  if (points >= rules.trusted_after) return "Trusted";
  return "Newcomer";
}

export function autoLimit(rules: Rules, tier: Tier): bigint {
  if (tier === "Core") return BigInt(rules.auto_limit_core);
  if (tier === "Trusted") return BigInt(rules.auto_limit_trusted);
  return 0n;
}

/** Mirrors the contract's routing, so creators see what happens before they submit. */
export function previewRoute(rules: Rules, tier: Tier, amount: bigint, custom: boolean): Route {
  if (!custom && amount <= autoLimit(rules, tier)) return "Auto";
  if (amount <= BigInt(rules.reviewer_limit)) return "Reviewer";
  return "Dao";
}

export const OPEN_STATUSES: SubmissionStatus[] = ["Pending", "Challenge", "AwaitingDao"];
