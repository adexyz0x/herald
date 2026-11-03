import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { AccountLink, Avatar, Near, RankBadge, When } from "../components/chain";
import { SubmissionRow, type RowContext } from "../components/SubmissionRow";
import { ActionButton, Button, EmptyState, ExternalLink, Field, Modal, PageHeader, Panel, SectionTitle, inputBase, inputClass } from "../components/ui";
import { useApp, useChainData, useChainNow } from "../lib/app";
import { formatNear, parseNear, toNear } from "../lib/format";
import { ruleLines, type Campaign, type Deliverable, type HeraldClient, type Rules, type Submission } from "../lib/herald";
import { useDaoContext, useProgram, type DaoContext } from "../lib/hooks";
import { Figure, ease, formatNearNumber, nearNumber, rowMotion } from "../lib/motion";
import { href } from "../lib/router";
import {
  actionLabel,
  heraldAction,
  heraldCallKind,
  proposalEndsMs,
  proposalTimeMs,
  type HeraldAction,
  type Proposal,
  type ProposalStatus,
} from "../lib/sputnik";

type Preset = "standard" | "fast";

const PRESETS: Record<Preset, { label: string; blurb: string; rules: Rules }> = {
  standard: {
    label: "Standard",
    blurb: "For a live program. A day-long public window on automatic payouts.",
    rules: {
      trusted_after: 3,
      core_after: 10,
      auto_limit_trusted: toNear(10),
      auto_limit_core: toNear(50),
      reviewer_limit: toNear(100),
      challenge_period_sec: 86_400,
      max_open_per_creator: 3,
      slash_points: 3,
    },
  },
  fast: {
    label: "Fast demo",
    blurb: "Lower limits and a 3 minute window, so you can watch payouts land.",
    rules: {
      trusted_after: 2,
      core_after: 5,
      auto_limit_trusted: toNear(4),
      auto_limit_core: toNear(8),
      reviewer_limit: toNear(15),
      challenge_period_sec: 180,
      max_open_per_creator: 3,
      slash_points: 3,
    },
  },
};

/** Gas the DAO attaches to each Herald call, in TGas. */
const CALL_GAS = { create_campaign: 150, top_up: 50, close_campaign: 100 };
/** Herald keeps 1 NEAR minimum budget after storage; this leaves room for storage. */
const MIN_LAUNCH_BUDGET = toNear(1.1);
const ACCOUNT_ID = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

interface HeraldProposal {
  proposal: Proposal;
  action: HeraldAction;
}

export function CouncilPage() {
  const { config, dao, actor } = useApp();
  const daoCtx = useDaoContext();
  const program = useProgram();
  const balance = useChainData(() => dao.balance(), []);
  const d = daoCtx.data;

  if (!d) {
    if (daoCtx.error) return <EmptyState title="Can't read the DAO" body={daoCtx.error} />;
    return <p className="text-ink-faint">Loading the council…</p>;
  }

  const me = actor.accountId;
  const isCouncil = Boolean(me && d.council.includes(me));
  const councilNames = config.personas.filter((p) => d.council.includes(p.accountId)).map((p) => p.name);
  const herald: HeraldProposal[] = d.proposals.flatMap((proposal) => {
    const action = heraldAction(proposal, config.herald);
    return action ? [{ proposal, action }] : [];
  });
  const open = herald.filter((h) => h.proposal.status === "InProgress");
  const decided = herald.filter((h) => h.proposal.status !== "InProgress").slice(0, 10);
  const campaigns = program.data?.campaigns ?? [];
  const submissions = program.data?.submissions ?? [];
  const needsVote = submissions.filter((s) => s.status === "AwaitingDao" && !d.openVotes.has(s.id));
  const rowCtx: RowContext = { council: d.council, bond: d.bond, openVotes: d.openVotes };
  const lookup = { campaigns, submissions };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Council" tone="dao">
        <p className="mt-2 max-w-[68ch] text-[15px] text-ink-soft">
          {config.daoName} is a Sputnik DAO at <span className="font-data text-[13.5px] text-ink">{config.dao}</span>. Herald only ever holds the budgets the DAO votes in, and only the DAO's own proposals can launch, top up or close a campaign.
        </p>
      </PageHeader>

      <section aria-label="Treasury and council" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card lg:grid-cols-4">
        <Fact label="Treasury" dot="bg-gold">
          {balance.data != null ? (
            <span className="font-data text-[20px] leading-tight text-ink sm:text-[24px]">
              <Figure value={nearNumber(balance.data)} format={formatNearNumber} /> <span className="text-ink-faint">NEAR</span>
            </span>
          ) : (
            "…"
          )}
        </Fact>
        <Fact label="Council" dot="bg-dao">
          <span className="flex items-center gap-2">
            <span className="flex -space-x-1.5">
              {d.council.map((m) => (
                <span key={m} className="rounded-full ring-2 ring-surface">
                  <Avatar accountId={m} size={26} />
                </span>
              ))}
            </span>
            <span className="font-data text-[20px] leading-tight text-ink sm:text-[24px]">{d.council.length}</span>
          </span>
        </Fact>
        <Fact label="Votes to pass" dot="bg-dao">
          <span className="font-data text-[20px] leading-tight text-ink sm:text-[24px]">
            {d.needed} <span className="text-[15px] text-ink-faint">of {d.council.length}</span>
          </span>
        </Fact>
        <Fact label="Proposal bond" dot="bg-accent" note="Returned when the vote ends">
          <Near value={d.bond} className="font-data text-[20px] leading-tight text-ink sm:text-[24px]" />
        </Fact>
      </section>

      {!isCouncil && (
        <p className="rounded-md bg-sunk px-4 py-3 text-sm text-ink-soft">
          {actor.kind === "guest"
            ? councilNames.length > 0
              ? `Choose ${councilNames.join(" or ")} in the switcher at the top to vote as a council member.`
              : "Connect a council member's wallet to vote."
            : `You're viewing as ${actor.name}. Only council members vote and file proposals here, but every vote is public.`}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-10">
          <section className="flex flex-col gap-3">
            <SectionTitle title="Open votes" tone="dao" count={open.length} hint="Every Herald proposal the council hasn't finished voting on." />
            {open.length === 0 ? (
              <p className="rounded-lg border border-line bg-surface px-5 py-5 text-sm text-ink-faint shadow-card">No open votes. Payouts above the reviewer limit and new campaigns show up here.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                <AnimatePresence initial={false}>
                  {open.map((h) => (
                    <VoteCard key={h.proposal.id} item={h} ctx={d} isCouncil={isCouncil} lookup={lookup} />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Payouts that need a vote" tone="dao" count={needsVote.length} hint="Above the reviewer limit, or sent up by a reviewer. One click turns each into a ready-made DAO proposal." />
            <div className="rounded-lg border border-line bg-surface px-5 shadow-card">
              {needsVote.length === 0 ? (
                <p className="py-5 text-sm text-ink-faint">Every large payout already has a vote open.</p>
              ) : (
                <ul>
                  <AnimatePresence initial={false}>
                    {needsVote.map((s) => {
                      const campaign = campaigns.find((c) => c.id === s.campaign_id);
                      return campaign ? <SubmissionRow key={s.id} sub={s} campaign={campaign} ctx={rowCtx} showCampaign /> : null;
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Decided" tone="ink" count={decided.length} hint="The latest Herald proposals the DAO has voted through or turned down." />
            <div className="rounded-lg border border-line bg-surface shadow-card">
              {decided.length === 0 ? (
                <p className="px-5 py-5 text-sm text-ink-faint">Nothing decided yet.</p>
              ) : (
                <ul>
                  {decided.map((h) => (
                    <DecidedRow key={h.proposal.id} item={h} lookup={lookup} />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <LaunchForm ctx={d} canPropose={isCouncil} treasury={balance.data ?? null} />
          <ManageCampaigns campaigns={campaigns.filter((c) => c.status === "Active")} ctx={d} canPropose={isCouncil} treasury={balance.data ?? null} />
        </aside>
      </div>
    </div>
  );
}

function Fact({ label, dot, note, children }: { label: string; dot: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-5 py-4">
      <span className="flex items-center gap-2 text-[13px] text-ink-faint">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </span>
      {children}
      {note && <span className="text-[12px] text-ink-faint">{note}</span>}
    </div>
  );
}

interface Lookup {
  campaigns: Campaign[];
  submissions: Submission[];
}

/** One line that says what a proposal does, with the real names and amounts. */
function headline(action: HeraldAction, lookup: Lookup, displayName: (id: string) => string): string {
  const campaign = lookup.campaigns.find((c) => c.id === Number(action.args.campaign_id));
  const sub = lookup.submissions.find((s) => s.id === Number(action.args.submission_id));
  switch (action.method) {
    case "create_campaign":
      return `Launch “${String(action.args.title)}” with ${formatNear(action.deposit)} NEAR`;
    case "dao_approve":
      return sub ? `Pay ${displayName(sub.creator)} ${formatNear(sub.amount)} NEAR for ${sub.custom ? "custom work" : sub.deliverable}` : `Pay submission #${action.args.submission_id}`;
    case "dao_reject":
      return sub ? `Decline ${displayName(sub.creator)}'s ${formatNear(sub.amount)} NEAR request` : `Decline submission #${action.args.submission_id}`;
    case "top_up":
      return `Add ${formatNear(action.deposit)} NEAR to “${campaign?.title ?? `campaign ${action.args.campaign_id}`}”`;
    case "close_campaign":
      return `Close “${campaign?.title ?? `campaign ${action.args.campaign_id}`}” and return what's left`;
    case "dao_set_ban":
      return `${action.args.banned ? "Ban" : "Lift the ban on"} ${displayName(String(action.args.account_id))}`;
    case "update_campaign":
      return `Change the rules of “${campaign?.title ?? `campaign ${action.args.campaign_id}`}”`;
    default:
      return action.method;
  }
}

/** What changed once a vote passed, read back from Herald rather than assumed. */
async function passedMessage(action: HeraldAction, herald: HeraldClient, displayName: (id: string) => string): Promise<string> {
  switch (action.method) {
    case "create_campaign":
      return `Passed. “${String(action.args.title)}” is live.`;
    case "dao_approve": {
      const sub = await herald.submission(Number(action.args.submission_id));
      if (!sub) return "Passed.";
      if (sub.status !== "Paid") return `Passed, but the transfer to ${displayName(sub.creator)} didn't go through. Anyone can retry it from the campaign page.`;
      return `Passed. ${displayName(sub.creator)} was paid ${formatNear(sub.amount)} NEAR.`;
    }
    case "top_up":
      return "Passed. The campaign budget is topped up.";
    case "close_campaign":
      return "Passed. The campaign is closed and the rest is back in the treasury.";
    default:
      return "Passed.";
  }
}

function VoteCard({ item, ctx, isCouncil, lookup }: { item: HeraldProposal; ctx: DaoContext; isCouncil: boolean; lookup: Lookup }) {
  const { actor, dao, herald, execute, displayName } = useApp();
  const now = useChainNow(10_000);
  const { proposal: p, action } = item;
  const approvals = Object.values(p.votes).filter((v) => v === "Approve").length;
  const myVote = actor.accountId ? p.votes[actor.accountId] : undefined;
  const ends = proposalEndsMs(p, ctx.policy);
  const expired = now > ends;
  const deciding = approvals + 1 >= ctx.needed;
  const left = Math.max(0, ctx.needed - approvals - 1);

  const approve = () =>
    execute(dao.vote(p.id, true, p.kind), {
      success: deciding
        ? async () => {
            const after = await dao.proposal(p.id);
            if (after.status === "Failed") throw new Error("The vote passed, but the DAO's call to Herald failed, so nothing changed.");
            return passedMessage(action, herald, displayName);
          }
        : `Vote recorded. ${left} more approval${left === 1 ? "" : "s"} to pass.`,
    });
  const reject = () => execute(dao.vote(p.id, false, p.kind), { success: "Vote recorded." });

  return (
    <motion.li {...rowMotion} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2, ease } }} className="relative overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-dao" />
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-faint">
            <span className="font-data">#{p.id}</span> · {actionLabel(action)} · proposed by {displayName(p.proposer)}
          </p>
          <h3 className="mt-0.5 text-[16px] font-semibold text-ink">{headline(action, lookup, displayName)}</h3>
        </div>
        <Tally approvals={approvals} needed={ctx.needed} />
      </div>

      <div className="grid gap-5 px-5 py-4 md:grid-cols-[minmax(0,1fr)_200px]">
        <div className="min-w-0">
          <ActionDetails action={action} lookup={lookup} />
          <p className="mt-3 border-l-2 border-line-strong pl-3 text-[13px] text-ink-soft">{p.description}</p>
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-ink-soft">Council</p>
          <ul className="flex flex-col gap-2">
            {ctx.council.map((m) => (
              <li key={m} className="flex items-center gap-2 text-[13px]">
                <Avatar accountId={m} size={22} />
                <span className="flex-1 text-ink">{displayName(m)}</span>
                <VoteMark vote={p.votes[m]} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        <span className="text-[12.5px] text-ink-faint">
          {expired ? (
            "Voting period has ended"
          ) : (
            <>
              Voting closes <When ms={ends} />
            </>
          )}
        </span>
        {isCouncil && !expired && !myVote && (
          <div className="flex gap-2">
            <ActionButton size="sm" run={reject}>
              Reject
            </ActionButton>
            <ActionButton size="sm" variant="primary" run={approve}>
              {deciding ? "Approve and pass" : "Approve"}
            </ActionButton>
          </div>
        )}
        {myVote && <span className="text-[13px] text-ink-soft">You voted to {myVote === "Approve" ? "approve" : myVote === "Reject" ? "reject" : "remove"}.</span>}
      </div>
    </motion.li>
  );
}

function Tally({ approvals, needed }: { approvals: number; needed: number }) {
  return (
    <div className="flex flex-col items-end gap-1.5" aria-label={`${approvals} of ${needed} approvals`}>
      <span className="font-data text-[13px] text-ink">
        {approvals} of {needed}
      </span>
      <span className="flex gap-1" aria-hidden="true">
        {Array.from({ length: needed }, (_, i) => (
          <span key={i} className="h-1.5 w-6 overflow-hidden rounded-full bg-sunk">
            <motion.span className="block h-full rounded-full bg-dao" initial={false} animate={{ width: i < approvals ? "100%" : "0%" }} transition={{ duration: 0.5, ease, delay: i * 0.08 }} />
          </span>
        ))}
      </span>
    </div>
  );
}

function VoteMark({ vote }: { vote?: "Approve" | "Reject" | "Remove" }) {
  if (vote === "Approve") return <span className="text-[12.5px] font-medium text-paid-ink">Approved</span>;
  if (vote === "Reject") return <span className="text-[12.5px] font-medium text-veto-ink">Rejected</span>;
  if (vote === "Remove") return <span className="text-[12.5px] font-medium text-veto-ink">Removed</span>;
  return <span className="text-[12.5px] text-ink-faint">Not yet</span>;
}

function ActionDetails({ action, lookup }: { action: HeraldAction; lookup: Lookup }) {
  const { displayName } = useApp();
  if (action.method === "dao_approve" || action.method === "dao_reject") {
    const sub = lookup.submissions.find((s) => s.id === Number(action.args.submission_id));
    if (!sub) return null;
    const campaign = lookup.campaigns.find((c) => c.id === sub.campaign_id);
    return (
      <div className="flex items-start gap-3">
        <Avatar accountId={sub.creator} size={36} />
        <div className="min-w-0 text-sm">
          <div className="flex flex-wrap items-center gap-x-2">
            <AccountLink accountId={sub.creator} />
            <RankBadge tier={sub.tier_at_submit} size="sm" />
          </div>
          <p className="mt-0.5 text-ink-soft">
            <span className="font-medium text-ink">{sub.deliverable}</span>
            {sub.custom && " (custom amount)"} · <Near value={sub.amount} />
          </p>
          {sub.note && <p className="mt-0.5 text-[13px] text-ink-soft">{sub.note}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px]">
            <ExternalLink href={sub.proof_url}>Proof</ExternalLink>
            {campaign && (
              <a href={href.campaign(campaign.id)} className="text-ink-faint hover:text-ink">
                {campaign.title}
              </a>
            )}
          </p>
        </div>
      </div>
    );
  }
  if (action.method === "create_campaign") {
    const lines = (action.args.rate_card as Deliverable[] | undefined) ?? [];
    const reviewers = (action.args.reviewers as string[] | undefined) ?? [];
    return (
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-2 text-[13.5px]">
        <dt className="text-ink-faint">Budget</dt>
        <dd>
          <Near value={action.deposit} />
        </dd>
        <dt className="text-ink-faint">Rate card</dt>
        <dd className="text-ink-soft">{lines.map((l) => `${l.name} ${formatNear(l.amount)}`).join(" · ")}</dd>
        <dt className="text-ink-faint">Reviewers</dt>
        <dd className="text-ink-soft">{reviewers.map(displayName).join(", ")}</dd>
        {typeof action.args.brief_url === "string" && (
          <>
            <dt className="text-ink-faint">Brief</dt>
            <dd className="min-w-0 truncate">
              <ExternalLink href={action.args.brief_url}>{action.args.brief_url.replace(/^https:\/\//, "")}</ExternalLink>
            </dd>
          </>
        )}
      </dl>
    );
  }
  if (action.method === "close_campaign" || action.method === "top_up") {
    const campaign = lookup.campaigns.find((c) => c.id === Number(action.args.campaign_id));
    if (!campaign) return null;
    return (
      <p className="text-[13.5px] text-ink-soft">
        <a href={href.campaign(campaign.id)} className="font-medium text-ink hover:text-accent">
          {campaign.title}
        </a>{" "}
        has <Near value={campaign.available} /> unreserved of <Near value={campaign.budget} />.
      </p>
    );
  }
  return null;
}

const statusChip: Record<ProposalStatus, string> = {
  Approved: "bg-paid-wash text-paid-ink",
  Rejected: "bg-sunk text-ink-soft",
  Failed: "bg-veto-wash text-veto-ink",
  Expired: "bg-sunk text-ink-soft",
  Removed: "bg-sunk text-ink-soft",
  Moved: "bg-sunk text-ink-soft",
  InProgress: "bg-accent-wash text-accent-strong",
};

function DecidedRow({ item, lookup }: { item: HeraldProposal; lookup: Lookup }) {
  const { displayName } = useApp();
  const { proposal: p, action } = item;
  const approvals = Object.values(p.votes).filter((v) => v === "Approve").length;
  const rejections = Object.values(p.votes).filter((v) => v === "Reject").length;
  return (
    <li className="grid gap-x-4 gap-y-1 border-b border-line px-5 py-3.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-[12.5px] text-ink-faint">
          <span className="font-data">#{p.id}</span> · {actionLabel(action)} · <When ms={proposalTimeMs(p)} />
        </p>
        <p className="truncate text-sm text-ink">{headline(action, lookup, displayName)}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-data text-[12.5px] text-ink-faint">
          {approvals} for · {rejections} against
        </span>
        <span className={`rounded-sm px-2 py-0.5 text-[12.5px] font-medium ${statusChip[p.status]}`}>{p.status === "Approved" ? "Passed" : p.status}</span>
      </div>
    </li>
  );
}

interface Line {
  name: string;
  amount: string;
}

function LaunchForm({ ctx, canPropose, treasury }: { ctx: DaoContext; canPropose: boolean; treasury: bigint | null }) {
  const { config, dao, execute } = useApp();
  const reviewerPersonas = config.personas.filter((p) => p.role === "reviewer");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [budget, setBudget] = useState("");
  const [lines, setLines] = useState<Line[]>([{ name: "", amount: "" }]);
  const [picked, setPicked] = useState<string[]>([]);
  const [others, setOthers] = useState("");
  const [preset, setPreset] = useState<Preset>(config.network === "local" ? "fast" : "standard");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!canPropose) {
    return (
      <Panel title="Launch a campaign" tone="dao">
        <p className="text-sm text-ink-soft">A council member writes the brief, rate card and rules. Herald turns it into one DAO proposal, and the budget moves only if the vote passes.</p>
      </Panel>
    );
  }

  const fillExample = () => {
    setTitle("Spaces season");
    setBrief("https://beacon.example/briefs/spaces-season");
    setBudget("40");
    setLines([
      { name: "Space co-host", amount: "4" },
      { name: "Space recap thread", amount: "2" },
    ]);
    setPicked(reviewerPersonas.slice(0, 1).map((p) => p.accountId));
    setErrors({});
  };

  const updateLine = (i: number, patch: Partial<Line>) => setLines((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 80) next.title = "Give the campaign a name, up to 80 characters.";
    if (!/^https:\/\/\S+$/.test(brief.trim()) || brief.trim().length > 300) next.brief = "Link the public brief with an https:// address.";
    const budgetYocto = parseNear(budget);
    if (!budgetYocto || BigInt(budgetYocto) < BigInt(MIN_LAUNCH_BUDGET)) next.budget = "Fund it with at least 1.1 NEAR. About 0.02 NEAR covers storage.";
    else if (treasury != null && BigInt(budgetYocto) + BigInt(ctx.bond) > treasury) next.budget = `The treasury holds ${formatNear(treasury)} NEAR, including the bond for this proposal.`;
    const card = lines.map((l) => ({ name: l.name.trim(), amount: parseNear(l.amount) }));
    if (card.some((l) => !l.name || l.name.length > 40 || !l.amount)) next.lines = "Each deliverable needs a name (up to 40 characters) and an amount in NEAR.";
    else if (new Set(card.map((l) => l.name.toLowerCase())).size !== card.length) next.lines = "Give each deliverable a different name.";
    const reviewers = [...new Set([...picked, ...others.split(/[\s,]+/).map((r) => r.trim().toLowerCase()).filter(Boolean)])];
    if (reviewers.length === 0 || reviewers.length > 10) next.reviewers = "Pick between 1 and 10 reviewers.";
    else if (reviewers.some((r) => !ACCOUNT_ID.test(r))) next.reviewers = "One of those isn't a valid NEAR account, like kemi.near.";
    else if (reviewers.includes(config.dao)) next.reviewers = "The DAO can't review its own campaign. Pick people.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !budgetYocto) return;

    const args = { title: cleanTitle, brief_url: brief.trim(), rate_card: card, reviewers, rules: PRESETS[preset].rules };
    const description = `Launch “${cleanTitle}”: ${formatNear(budgetYocto)} NEAR for ${card.map((l) => l.name).join(", ")}. Brief: ${brief.trim()}`;
    setBusy(true);
    const result = await execute(dao.addProposal({ description, kind: heraldCallKind(config.herald, "create_campaign", args, budgetYocto, CALL_GAS.create_campaign) }, ctx.bond), {
      success: "Proposal filed. The council can vote on it now.",
    });
    setBusy(false);
    if (result !== undefined) {
      setTitle("");
      setBrief("");
      setBudget("");
      setLines([{ name: "", amount: "" }]);
      setPicked([]);
      setOthers("");
      setOpen(false);
    }
  }

  return (
    <Panel
      title="Launch a campaign"
      tone="dao"
      action={
        open &&
        config.network === "local" && (
          <button type="button" onClick={fillExample} className="text-[13px] font-medium text-accent hover:underline">
            Fill an example
          </button>
        )
      }
    >
      {!open && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-ink-soft">Write the brief, rate card and rules once. Herald turns them into one DAO proposal, and the budget moves only if the vote passes.</p>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Start a proposal
          </Button>
        </div>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="form" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease }} className="-m-1 overflow-hidden p-1">
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <Field label="Name" error={errors.title}>
                {({ id, describedBy, invalid }) => <input id={id} className={inputClass} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} placeholder="Spaces season" />}
              </Field>
              <Field label="Brief link" error={errors.brief} hint="What creators should make, and what's off limits.">
                {({ id, describedBy, invalid }) => <input id={id} type="url" className={inputClass} value={brief} onChange={(e) => setBrief(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} placeholder="https://" />}
              </Field>
              <Field label="Budget in NEAR" error={errors.budget} hint={treasury != null ? `The treasury holds ${formatNear(treasury)} NEAR.` : undefined}>
                {({ id, describedBy, invalid }) => <input id={id} inputMode="decimal" className={`${inputClass} font-data`} value={budget} onChange={(e) => setBudget(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} placeholder="40" />}
              </Field>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-medium text-ink">Rate card</legend>
                {lines.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input aria-label={`Deliverable ${i + 1} name`} className={`${inputBase} w-full min-w-0 flex-1`} value={line.name} maxLength={40} onChange={(e) => updateLine(i, { name: e.target.value })} placeholder="X thread" />
                    <input aria-label={`Deliverable ${i + 1} pays, in NEAR`} inputMode="decimal" className={`${inputBase} w-20 shrink-0 font-data`} value={line.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} placeholder="2" />
                    <button
                      type="button"
                      onClick={() => setLines((all) => all.filter((_, j) => j !== i))}
                      disabled={lines.length === 1}
                      aria-label={`Remove deliverable ${i + 1}`}
                      className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-faint hover:bg-sunk hover:text-ink disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
                {errors.lines && <p className="text-[12.5px] text-veto-ink">{errors.lines}</p>}
                {lines.length < 12 && (
                  <button type="button" onClick={() => setLines((all) => [...all, { name: "", amount: "" }])} className="self-start text-[13px] font-medium text-accent hover:underline">
                    Add a deliverable
                  </button>
                )}
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-medium text-ink">Reviewers</legend>
                {reviewerPersonas.map((p) => (
                  <label key={p.accountId} className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="accent-[var(--accent)]"
                      checked={picked.includes(p.accountId)}
                      onChange={(e) => setPicked((all) => (e.target.checked ? [...all, p.accountId] : all.filter((a) => a !== p.accountId)))}
                    />
                    <Avatar accountId={p.accountId} size={22} />
                    <span className="text-ink">{p.name}</span>
                    <span className="font-data text-[12px] text-ink-faint">{p.accountId}</span>
                  </label>
                ))}
                <input aria-label="Other reviewer accounts" className={inputClass} value={others} onChange={(e) => setOthers(e.target.value)} placeholder={reviewerPersonas.length ? "Others, separated by commas" : "kemi.near, marco.near"} />
                {errors.reviewers && <p className="text-[12.5px] text-veto-ink">{errors.reviewers}</p>}
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-[13px] font-medium text-ink">Payout rules</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PRESETS) as Preset[]).map((key) => (
                    <label key={key} className="flex cursor-pointer flex-col gap-1 rounded-md border border-line px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-wash">
                      <span className="flex items-center gap-2 font-medium text-ink">
                        <input type="radio" name="preset" className="accent-[var(--accent)]" checked={preset === key} onChange={() => setPreset(key)} />
                        {PRESETS[key].label}
                      </span>
                      <span className="text-[12.5px] text-ink-soft">{PRESETS[key].blurb}</span>
                    </label>
                  ))}
                </div>
                <ul className="mt-1 flex flex-col gap-1 text-[12.5px] text-ink-soft">
                  {ruleLines(PRESETS[preset].rules).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </fieldset>

              <div className="flex gap-2">
                <Button type="submit" variant="primary" busy={busy} className="flex-1">
                  File the proposal
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
              <p className="text-[12px] text-ink-faint">You put down the {formatNear(ctx.bond)} NEAR bond. The DAO only sends the budget if the vote passes.</p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

function ManageCampaigns({ campaigns, ctx, canPropose, treasury }: { campaigns: Campaign[]; ctx: DaoContext; canPropose: boolean; treasury: bigint | null }) {
  const [modal, setModal] = useState<{ kind: "top_up" | "close"; campaign: Campaign } | null>(null);
  if (!canPropose || campaigns.length === 0) return null;
  return (
    <Panel title="Active campaigns" tone="gold">
      <ul className="flex flex-col divide-y divide-line">
        {campaigns.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <a href={href.campaign(c.id)} className="truncate text-sm font-medium text-ink hover:text-accent">
                {c.title}
              </a>
              <span className="shrink-0 text-[12.5px] text-ink-soft">
                <Near value={c.available} /> left
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setModal({ kind: "top_up", campaign: c })}>
                Top up
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setModal({ kind: "close", campaign: c })}>
                Close
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <TopUpModal campaign={modal?.kind === "top_up" ? modal.campaign : null} ctx={ctx} treasury={treasury} onClose={() => setModal(null)} />
      <CloseModal campaign={modal?.kind === "close" ? modal.campaign : null} ctx={ctx} onClose={() => setModal(null)} />
    </Panel>
  );
}

function TopUpModal({ campaign, ctx, treasury, onClose }: { campaign: Campaign | null; ctx: DaoContext; treasury: bigint | null; onClose: () => void }) {
  const { config, dao, execute } = useApp();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={campaign != null} title="Top up the budget" onClose={onClose}>
      {campaign && (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const yocto = parseNear(amount);
            if (!yocto) return setError("Enter an amount in NEAR, like 25.");
            if (treasury != null && BigInt(yocto) + BigInt(ctx.bond) > treasury) return setError(`The treasury holds ${formatNear(treasury)} NEAR, including the bond.`);
            setBusy(true);
            const description = `Top up “${campaign.title}” with ${formatNear(yocto)} NEAR`;
            const result = await execute(dao.addProposal({ description, kind: heraldCallKind(config.herald, "top_up", { campaign_id: campaign.id }, yocto, CALL_GAS.top_up) }, ctx.bond), {
              success: "Proposal filed. The council can vote on it now.",
            });
            setBusy(false);
            if (result !== undefined) {
              setAmount("");
              onClose();
            }
          }}
        >
          <p className="text-sm text-ink-soft">
            {campaign.title} has <Near value={campaign.available} /> left. This files a DAO proposal; the money moves only if the vote passes.
          </p>
          <Field label="Amount in NEAR" error={error}>
            {({ id, describedBy, invalid }) => (
              <input id={id} inputMode="decimal" className={`${inputClass} font-data`} value={amount} onChange={(e) => (setAmount(e.target.value), setError(null))} aria-describedby={describedBy} aria-invalid={invalid} placeholder="25" />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" busy={busy}>
              File the proposal
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CloseModal({ campaign, ctx, onClose }: { campaign: Campaign | null; ctx: DaoContext; onClose: () => void }) {
  const { config, dao, execute } = useApp();
  return (
    <Modal open={campaign != null} title="Close this campaign" onClose={onClose}>
      {campaign && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            If the vote passes, {campaign.title} stops taking submissions and <Near value={campaign.available} /> goes back to the treasury. Payouts already in their public window still finish.
          </p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <ActionButton
              variant="danger"
              run={async () => {
                const description = `Close “${campaign.title}” and return the unspent budget`;
                const result = await execute(dao.addProposal({ description, kind: heraldCallKind(config.herald, "close_campaign", { campaign_id: campaign.id }, "0", CALL_GAS.close_campaign) }, ctx.bond), {
                  success: "Proposal filed. The council can vote on it now.",
                });
                if (result !== undefined) onClose();
              }}
            >
              File the proposal
            </ActionButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
