import type { Call, ProposalInput } from "./herald";
import { gas } from "./herald";
import type { Rpc } from "./rpc";

/** The subset of a Sputnik DAO proposal the app uses. */
export interface Proposal {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: "InProgress" | "Approved" | "Rejected" | "Removed" | "Expired" | "Moved" | "Failed";
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<string, "Approve" | "Reject" | "Remove">;
  submission_time: string;
}

export interface Policy {
  roles: { name: string; kind: "Everyone" | { Group: string[] } | { Member: string } }[];
  proposal_bond: string;
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
          args: btoa(JSON.stringify(args)),
          deposit,
          gas: gas(tgas),
        },
      ],
    },
  };
}

/** Reads the Herald method and arguments out of a FunctionCall proposal, if it targets Herald. */
export function heraldAction(
  proposal: Proposal,
  heraldId: string,
): { method: string; args: Record<string, unknown>; deposit: string } | null {
  const call = (proposal.kind as { FunctionCall?: { receiver_id: string; actions: { method_name: string; args: string; deposit: string }[] } })
    .FunctionCall;
  if (!call || call.receiver_id !== heraldId || call.actions.length === 0) return null;
  const action = call.actions[0];
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(atob(action.args));
  } catch {
    args = {};
  }
  return { method: action.method_name, args, deposit: action.deposit };
}
