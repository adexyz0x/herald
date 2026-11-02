import { useApp, useChainData } from "./app";
import type { Campaign, Submission } from "./herald";
import { councilMembers, heraldAction, votesNeeded, type Policy, type Proposal } from "./sputnik";

export interface DaoContext {
  policy: Policy;
  proposals: Proposal[];
  council: string[];
  bond: string;
  /** Council votes a Herald proposal needs to pass. */
  needed: number;
  /** Submission ids with an open `dao_approve` vote. */
  openVotes: Set<number>;
}

export function useDaoContext() {
  const { dao, config } = useApp();
  return useChainData<DaoContext>(async () => {
    const [policy, proposals] = await Promise.all([dao.policy(), dao.proposals()]);
    const openVotes = new Set<number>();
    for (const p of proposals) {
      if (p.status !== "InProgress") continue;
      const action = heraldAction(p, config.herald);
      if (action?.method === "dao_approve") openVotes.add(Number(action.args.submission_id));
    }
    return { policy, proposals, council: councilMembers(policy), bond: policy.proposal_bond, needed: votesNeeded(policy), openVotes };
  }, []);
}

export interface ProgramData {
  campaigns: Campaign[];
  submissions: Submission[];
}

/** Every campaign and every submission. Small programs fit in a few view calls. */
export function useProgram() {
  const { herald } = useApp();
  return useChainData<ProgramData>(async () => {
    const campaigns = await herald.campaigns();
    const lists = await Promise.all(campaigns.map((c) => herald.campaignSubmissions(c.id)));
    return { campaigns, submissions: lists.flat() };
  }, []);
}
