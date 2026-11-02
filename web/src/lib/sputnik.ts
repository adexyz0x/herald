import type { Call, ProposalInput } from "./herald";
import { gas } from "./herald";
import type { Rpc } from "./rpc";

export type ProposalStatus = "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved" | "Failed";

/** The subset of a Sputnik DAO proposal the app uses. */
export interface Proposal {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: ProposalStatus;
  /** Approve, reject and remove totals per role. */
  vote_counts: Record<string, [number | string, number | string, number | string]>;
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  /** Nanoseconds. */
  submission_time: string;
}

interface VotePolicy {
  weight_kind: string;
  quorum: string;
  /** A ratio like [1, 2] (more than half), or a fixed number of votes. */
  threshold: [number, number] | string;
}

export interface Policy {
  roles: {
    name: string;
    kind: "Everyone" | { Group: string[] } | { Member: string };
    vote_policy?: Record<string, VotePolicy>;
  }[];
  default_vote_policy: VotePolicy;
  proposal_bond: string;
  /** Nanoseconds. */
  proposal_period: string;
}

export class SputnikClient {
  constructor(
    readonly rpc: Rpc,
    readonly daoId: string,
  ) {}

  policy() {
    return this.rpc.view<Policy>(this.daoId, "get_policy");
  }

  async proposals(): Promise<Proposal[]> {
    const last = await this.rpc.view<number>(this.daoId, "get_last_proposal_id");
    const all: Proposal[] = [];
    for (let from = 0; from < last; from += 100) {
      all.push(...(await this.rpc.view<Proposal[]>(this.daoId, "get_proposals", { from_index: from, limit: 100 })));
    }
    return all.reverse();
  }

  proposal(id: number) {
    return this.rpc.view<Proposal>(this.daoId, "get_proposal", { id });
  }

  balance() {
    return this.rpc.balance(this.daoId);
  }

  addProposal(proposal: ProposalInput, bond: string): Call {
    return {
      contractId: this.daoId,
      methodName: "add_proposal",
      args: { proposal },
      deposit: bond,
      gas: gas(50),
    };
  }

  vote(id: number, approve: boolean, kind: Record<string, unknown>): Call {
    return {
      contractId: this.daoId,
      methodName: "act_proposal",
      args: { id, action: approve ? "VoteApprove" : "VoteReject", proposal: kind },
      gas: gas(300),
    };
  }
}

export function councilMembers(policy: Policy): string[] {
  for (const role of policy.roles) {
    if (role.name === "council" && typeof role.kind === "object" && "Group" in role.kind) {
      return role.kind.Group;
    }
  }
  return [];
}

/**
 * Council votes a function-call proposal needs to pass. Mirrors Sputnik's rule: a ratio threshold
 * needs more than that share of the council, a fixed threshold needs that many votes.
 */
export function votesNeeded(policy: Policy): number {
  const council = policy.roles.find((r) => r.name === "council");
  const members = councilMembers(policy).length;
  const rule = council?.vote_policy?.call ?? policy.default_vote_policy;
  if (Array.isArray(rule.threshold)) {
    const [num, den] = rule.threshold;
    return Math.min(Math.floor((num * members) / den) + 1, members);
  }
  return Math.min(Number(rule.threshold), members);
}

export function proposalTimeMs(proposal: Proposal): number {
  return Number(BigInt(proposal.submission_time) / 1_000_000n);
}

export function proposalEndsMs(proposal: Proposal, policy: Policy): number {
  return Number((BigInt(proposal.submission_time) + BigInt(policy.proposal_period)) / 1_000_000n);
}

/** Base64 of UTF-8 text. `btoa` alone breaks on characters outside Latin-1, like curly quotes. */
function toBase64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(data: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
}

/** Builds a FunctionCall proposal kind that calls Herald, in the shape Sputnik expects. */
export function heraldCallKind(
  heraldId: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit: string,
  tgas: number,
): Record<string, unknown> {
  return {
    FunctionCall: {
      receiver_id: heraldId,
      actions: [
        {
          method_name: methodName,
          args: toBase64(JSON.stringify(args)),
          deposit,
          gas: gas(tgas),
        },
      ],
    },
  };
}

export interface HeraldAction {
  method: string;
  args: Record<string, unknown>;
  deposit: string;
}

/** Reads the Herald method and arguments out of a FunctionCall proposal, if it targets Herald. */
export function heraldAction(proposal: Proposal, heraldId: string): HeraldAction | null {
  const call = (proposal.kind as { FunctionCall?: { receiver_id: string; actions: { method_name: string; args: string; deposit: string }[] } })
    .FunctionCall;
  if (!call || call.receiver_id !== heraldId || call.actions.length === 0) return null;
  const action = call.actions[0];
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(fromBase64(action.args));
  } catch {
    args = {};
  }
  return { method: action.method_name, args, deposit: action.deposit };
}

/** What a Herald proposal does, in a few words. */
export function actionLabel(action: HeraldAction): string {
  switch (action.method) {
    case "create_campaign":
      return "Launch a campaign";
    case "dao_approve":
      return "Pay a creator";
    case "dao_reject":
      return "Decline a payout";
    case "top_up":
      return "Top up a campaign";
    case "update_campaign":
      return "Change a campaign";
    case "close_campaign":
      return "Close a campaign";
    case "dao_set_ban":
      return action.args.banned ? "Ban a creator" : "Lift a ban";
    default:
      return action.method;
  }
}
