import { useState, type ReactNode } from "react";
import { SubmissionRow, type RowContext } from "../components/SubmissionRow";
import { Panel } from "../components/ui";
import { useApp, useChainNow } from "../lib/app";
import type { Campaign, Submission } from "../lib/herald";
import { useDaoContext, useProgram } from "../lib/hooks";

const decidedAt = (s: Submission) => s.paid_at_ms ?? s.decided_at_ms ?? s.created_at_ms;

export function ReviewPage() {
  const { actor } = useApp();
  const program = useProgram();
  const daoCtx = useDaoContext();
  const now = useChainNow();
  const [scope, setScope] = useState<"mine" | "all">("mine");

  const me = actor.accountId;
  const campaigns = program.data?.campaigns ?? [];
  const mine = me ? campaigns.filter((c) => c.reviewers.includes(me)) : [];
  const scoped = mine.length > 0 && scope === "mine" ? mine : campaigns;
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const inScope = new Set(scoped.map((c) => c.id));
  const subs = (program.data?.submissions ?? []).filter((s) => inScope.has(s.campaign_id));

  const pending = subs.filter((s) => s.status === "Pending").sort((a, b) => a.created_at_ms - b.created_at_ms);
  const inWindow = subs
    .filter((s) => s.status === "Challenge" && (s.challenge_ends_at_ms ?? 0) > now)
    .sort((a, b) => (a.challenge_ends_at_ms ?? 0) - (b.challenge_ends_at_ms ?? 0));
  const ready = subs.filter((s) => (s.status === "Challenge" && (s.challenge_ends_at_ms ?? 0) <= now) || s.status === "Approved");
  const withDao = subs.filter((s) => s.status === "AwaitingDao");
  const decided = subs
    .filter((s) => s.status === "Paid" || s.status === "Rejected" || s.status === "Vetoed")
    .sort((a, b) => decidedAt(b) - decidedAt(a))
    .slice(0, 8);

  const ctx: RowContext = daoCtx.data
    ? { council: daoCtx.data.council, bond: daoCtx.data.bond, openVotes: daoCtx.data.openVotes }
    : { council: [], bond: "0", openVotes: new Set() };

  const list = (items: Submission[]) => items.map((s) => <SubmissionRow key={s.id} sub={s} campaign={byId.get(s.campaign_id) as Campaign} ctx={ctx} showCampaign />);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(34px,4.6vw,56px)] leading-[1.05]">Review queue</h1>
          <p className="mt-2 max-w-[64ch] text-[15px] text-ink-soft">
            {mine.length > 0
              ? `You review ${mine.map((c) => c.title).join(", ")}. Approving pays the creator on the spot. A veto stops an automatic payout and costs the creator reputation.`
              : "Only reviewers the DAO appointed can approve or veto. Everyone can watch every decision, and anyone can send a payout once its public window has closed."}
          </p>
        </div>
        {mine.length > 0 && (
          <div role="group" aria-label="Which campaigns" className="flex rounded-md border border-line bg-surface p-0.5">
            {(
              [
                ["mine", "Campaigns I review"],
                ["all", "All campaigns"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
                className="rounded-[5px] px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:text-ink aria-pressed:bg-ink aria-pressed:text-page"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {program.loading && !program.data ? (
        <p className="text-ink-faint">Loading the queue…</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-10">
            <Section title="Waiting for review" count={pending.length} hint="Oldest first. Newcomers, custom amounts and anything above a creator's automatic limit land here." empty="Nothing is waiting. New submissions appear here the moment they're on chain.">
              {list(pending)}
            </Section>
            <Section title="Open challenge windows" count={inWindow.length} hint="Paid automatically when the timer runs out, unless a reviewer vetoes first. Ending soonest at the top." empty="No automatic payouts are waiting.">
              {list(inWindow)}
            </Section>
            {ready.length > 0 && (
              <Section title="Ready to pay" count={ready.length} hint="Their windows have closed with no veto, or a transfer needs a retry. Anyone can send these.">
                {list(ready)}
              </Section>
            )}
            <Section title="With the DAO" count={withDao.length} hint="Too large for one reviewer. These are paid only if the council votes yes." empty="Nothing is waiting on a DAO vote.">
              {list(withDao)}
            </Section>
            <Section title="Recently decided" count={decided.length} empty="No decisions yet.">
              {list(decided)}
            </Section>
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
            <Panel title="Reviewing well">
              <ol className="flex flex-col gap-3.5 text-[14px] text-ink-soft">
                {[
                  ["Open the proof first.", "Check the post is live, public and on brief before you approve."],
                  ["Stick to the rate card.", "Unusual asks can go to the DAO with “Send to DAO”."],
                  ["Give reasons people can act on.", "Creators see every rejection and veto reason, and so does everyone else."],
                  ["Keep fraud for fraud.", "Marking a veto as fraud bans the creator from every campaign of this DAO."],
                ].map(([lead, rest], i) => (
                  <li key={lead} className="flex gap-3">
                    <span className="font-data text-[12.5px] leading-[1.6] text-ink-faint">{i + 1}</span>
                    <span>
                      <span className="font-medium text-ink">{lead}</span> {rest}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
            <p className="px-1 text-[13px] text-ink-faint">You can't review your own work. Herald checks this on chain, along with every limit on this page.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, hint, empty, children }: { title: string; count: number; hint?: string; empty?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div>
        <h2 className="flex items-baseline gap-2 text-lg font-semibold">
          {title}
          <span className="font-data text-[14px] font-normal text-ink-faint">{count}</span>
        </h2>
        {hint && <p className="mt-0.5 max-w-[70ch] text-[13.5px] text-ink-soft">{hint}</p>}
      </div>
      <div className="rounded-lg border border-line bg-surface px-5">{count === 0 ? <p className="py-5 text-sm text-ink-faint">{empty}</p> : <ul>{children}</ul>}</div>
    </section>
  );
}
