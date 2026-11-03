import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { BudgetBar, Near, RankBadge, RouteTag, Seal, When } from "../components/chain";
import { SubmissionRow } from "../components/SubmissionRow";
import { Button, EmptyState, ExternalLink, Field, LinkButton, PageHeader, Panel, SectionTitle, Segmented, inputClass } from "../components/ui";
import { useApp, useChainData } from "../lib/app";
import { formatDuration, formatNear, parseNear } from "../lib/format";
import { useDaoContext } from "../lib/hooks";
import { OPEN_STATUSES, previewRoute, ruleLines, type Campaign, type Route, type TierView } from "../lib/herald";
import { CountUp, formatNearNumber, nearNumber } from "../lib/motion";
import { href } from "../lib/router";

type Filter = "All" | "Open" | "Paid" | "Declined";
const FILTERS = [
  ["All", "All"],
  ["Open", "Open"],
  ["Paid", "Paid"],
  ["Declined", "Declined"],
] as const;

export function CampaignPage({ id }: { id: number }) {
  const { herald, actor, config } = useApp();
  const campaign = useChainData(() => herald.campaign(id), [id]);
  const submissions = useChainData(() => herald.campaignSubmissions(id), [id]);
  const daoCtx = useDaoContext();
  const tier = useChainData(() => (actor.accountId ? herald.tier(id, actor.accountId) : Promise.resolve(null)), [id, actor.accountId]);
  const [filter, setFilter] = useState<Filter>("All");

  const c = campaign.data;
  const list = useMemo(() => {
    const all = [...(submissions.data ?? [])].sort((a, b) => b.created_at_ms - a.created_at_ms);
    if (filter === "Open") return all.filter((s) => OPEN_STATUSES.includes(s.status) || s.status === "Approved");
    if (filter === "Paid") return all.filter((s) => s.status === "Paid");
    if (filter === "Declined") return all.filter((s) => s.status === "Rejected" || s.status === "Vetoed");
    return all;
  }, [submissions.data, filter]);

  if (campaign.loading && !c) return <p className="text-ink-faint">Loading campaign…</p>;
  if (!c) {
    return <EmptyState title="Campaign not found" body="It may not exist on this network yet." action={<LinkButton href={href.home}>All campaigns</LinkButton>} />;
  }

  const ctx = daoCtx.data
    ? { council: daoCtx.data.council, bond: daoCtx.data.bond, openVotes: daoCtx.data.openVotes }
    : { council: [], bond: "0", openVotes: new Set<number>() };
  const me = actor.accountId;
  const isReviewer = Boolean(me && c.reviewers.includes(me));
  const isCouncil = Boolean(me && ctx.council.includes(me));
  const counts = {
    pending: submissions.data?.filter((s) => s.status === "Pending").length ?? 0,
    challenge: submissions.data?.filter((s) => s.status === "Challenge").length ?? 0,
  };
  // Creators see which route each deliverable would take for them right now.
  const forYou = actor.kind !== "guest" && !isReviewer && !isCouncil && tier.data && !tier.data.banned ? tier.data : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={c.title}
        tone="gold"
        back={
          <a href={href.home} className="text-[13px] text-ink-faint transition-colors hover:text-ink">
            ← All campaigns
          </a>
        }
        aside={
          <div className="flex items-center gap-3">
            <span className={`rounded-sm px-2 py-1 text-[12.5px] font-medium ${c.status === "Active" ? "bg-paid-wash text-paid-ink" : "bg-sunk text-ink-soft"}`}>{c.status}</span>
            <ExternalLink href={c.brief_url} className="text-sm">
              Read the brief
            </ExternalLink>
          </div>
        }
      >
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-soft">
              <span>
                Funded by <span className="font-medium text-ink">{c.dao === config.dao ? config.daoName : c.dao}</span>
              </span>
              <span className="font-data text-[12.5px] text-ink-faint">{c.dao}</span>
              <span aria-hidden="true">·</span>
              <span>
                Launched <When ms={c.created_at_ms} />
              </span>
            </p>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Panel title="Budget" tone="gold">
            <p className="mb-4 flex flex-wrap items-baseline gap-x-2">
              <span className="font-data text-[34px] leading-none text-ink">
                <CountUp value={nearNumber(c.available)} format={formatNearNumber} />
              </span>
              <span className="text-sm text-ink-soft">NEAR available to pay out</span>
            </p>
            <BudgetBar budget={c.budget} paid={c.paid} reserved={c.reserved} />
            <p className="mt-3 text-[13px] text-ink-faint">Reserved funds cover payouts in their challenge window or waiting on a retry. Closing the campaign returns everything unreserved to the DAO.</p>
          </Panel>

          <div className="grid gap-8 md:grid-cols-2">
            <Panel title="Rate card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[12.5px] text-ink-faint">
                    <th className="pb-2 font-medium">Deliverable</th>
                    {forYou && <th className="pb-2 font-medium">For you</th>}
                    <th className="pb-2 text-right font-medium">Pays</th>
                  </tr>
                </thead>
                <tbody>
                  {c.rate_card.map((line) => (
                    <tr key={line.name} className="border-t border-line">
                      <td className="py-2.5">{line.name}</td>
                      {forYou && (
                        <td className="py-2.5">
                          <RouteTag route={previewRoute(c.rules, forYou.tier, BigInt(line.amount), false)} />
                        </td>
                      )}
                      <td className="py-2.5 text-right">
                        <Near value={line.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Rules">
              <RulesList campaign={c} />
            </Panel>
          </div>

          <section className="flex flex-col gap-3">
            <SectionTitle title="Activity" count={list.length} tone="accent" action={<Segmented label="Filter activity" options={FILTERS} value={filter} onChange={setFilter} />} />
            <div className="rounded-lg border border-line bg-surface px-5 shadow-card">
              {list.length === 0 ? (
                <div className="py-5">
                  <EmptyState title="Nothing here yet" body={filter === "All" ? "Submitted work shows up here the moment it's on chain." : "No submissions match this filter."} />
                </div>
              ) : (
                <ul>
                  <AnimatePresence initial={false}>
                    {list.map((s) => (
                      <SubmissionRow key={s.id} sub={s} campaign={c} ctx={ctx} />
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          {actor.kind === "guest" ? (
            <Panel title="Join this campaign" tone="accent">
              <p className="text-sm text-ink-soft">
                {config.network === "local"
                  ? "Choose who you are with the switcher at the top: a creator to submit work, a reviewer to approve it, or a council member to run the DAO side."
                  : "Connect a NEAR wallet at the top to submit work. Reviewers and council members connect the same way."}
              </p>
            </Panel>
          ) : isReviewer ? (
            <Panel title="You review this campaign" tone="accent">
              <p className="text-sm text-ink-soft">
                {counts.pending} waiting for review, {counts.challenge} in a challenge window you can veto.
              </p>
              <div className="mt-4">
                <LinkButton href={href.review} variant="primary" size="sm">
                  Open review queue
                </LinkButton>
              </div>
            </Panel>
          ) : isCouncil ? null : (
            <>
              {tier.data && <StandingCard tier={tier.data} campaign={c} />}
              {c.status === "Active" && me !== c.dao && (
                <SubmitForm campaign={c} tier={tier.data ?? null} open={submissions.data?.filter((s) => s.creator === me && OPEN_STATUSES.includes(s.status)).length ?? 0} />
              )}
            </>
          )}
          {isCouncil && (
            <Panel title="You're on the council" tone="dao">
              <p className="text-sm text-ink-soft">Top-ups and closing this campaign go through DAO votes, and so do payouts above the reviewer limit. Council members vote on payouts, so they don't submit work here.</p>
              <div className="mt-4">
                <LinkButton href={href.council} size="sm">
                  Go to Council
                </LinkButton>
              </div>
            </Panel>
          )}
          {c.status === "Closed" && (
            <Panel title="This campaign is closed">
              <p className="text-sm text-ink-soft">The DAO closed it and took back the unreserved budget. Payouts already in a challenge window can still be paid.</p>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function RulesList({ campaign }: { campaign: Campaign }) {
  return (
    <ul className="flex flex-col gap-2.5 text-[14px] text-ink-soft">
      {ruleLines(campaign.rules).map((t) => (
        <li key={t} className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" />
          {t}
        </li>
      ))}
    </ul>
  );
}

function StandingCard({ tier, campaign }: { tier: TierView; campaign: Campaign }) {
  const { displayName } = useApp();
  const next = tier.next_tier_at;
  const progress = next ? Math.min(100, Math.round((tier.points / next) * 100)) : 100;
  return (
    <Panel title="Your standing" tone={tier.tier === "Core" ? "gold" : "accent"}>
      <div className="flex items-center justify-between">
        <RankBadge tier={tier.tier} />
        <span className="font-data text-sm text-ink-soft">{tier.points} pts</span>
      </div>
      {tier.banned ? (
        <p className="mt-3 rounded-md bg-veto-wash px-3 py-2 text-sm text-veto-ink">You're banned from this DAO's campaigns. Only a DAO vote can lift it.</p>
      ) : (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
            <span className={`block h-full ${tier.tier === "Core" ? "bg-gold" : "bg-accent"}`} style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-ink-faint">
            {next ? `${next - tier.points} more paid deliverable${next - tier.points === 1 ? "" : "s"} to ${tier.tier === "Newcomer" ? "Trusted" : "Core"}.` : "Top rank with this DAO."}{" "}
            {BigInt(tier.auto_limit) > 0n ? `Automatic payouts up to ${formatNear(tier.auto_limit)} NEAR.` : `Reviews on every deliverable for now.`}
          </p>
        </>
      )}
      <p className="mt-3 text-[12.5px] text-ink-faint">Your record with {displayName(campaign.dao)}. It doesn't carry over to other DAOs.</p>
    </Panel>
  );
}

const ROUTE_COPY: Record<Route, (campaign: Campaign) => string> = {
  Auto: (c) => `Paid automatically after ${formatDuration(c.rules.challenge_period_sec)} in public. Any reviewer can veto it until then.`,
  Reviewer: () => "One reviewer checks it. You're paid the moment it's approved.",
  Dao: () => "This needs a DAO vote. A council member opens it, and you're paid when it passes.",
};

function SubmitForm({ campaign, tier, open }: { campaign: Campaign; tier: TierView | null; open: number }) {
  const { herald, execute } = useApp();
  const [line, setLine] = useState<number | "custom">(0);
  const [custom, setCustom] = useState("");
  const [proof, setProof] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ custom?: string; proof?: string; note?: string }>({});
  const [busy, setBusy] = useState(false);

  const isCustom = line === "custom";
  const amount = isCustom ? parseNear(custom) : campaign.rate_card[line]?.amount;
  const route = amount ? previewRoute(campaign.rules, tier?.tier ?? "Newcomer", BigInt(amount), isCustom) : null;
  const full = open >= campaign.rules.max_open_per_creator;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!/^https:\/\/\S+$/.test(proof.trim()) || proof.trim().length > 300) next.proof = "Paste the https:// link to your post, video or event page.";
    if (isCustom && !amount) next.custom = "Enter an amount in NEAR, like 12.5.";
    if (amount && BigInt(amount) > BigInt(campaign.available)) next.custom = `The campaign has ${formatNear(campaign.available)} NEAR left.`;
    if (note.length > 280) next.note = "Keep the note under 280 characters.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !amount) return;
    setBusy(true);
    const payout = isCustom ? { custom: amount } : { line: line as number };
    const result = await execute(herald.submit(campaign.id, payout, proof.trim(), note.trim()), {
      success: route === "Auto" ? "Submitted. Your payout is scheduled." : "Submitted. It's in the queue.",
    });
    setBusy(false);
    if (result !== undefined) {
      setProof("");
      setNote("");
      setCustom("");
    }
  }

  return (
    <Panel title="Submit your work" tone="gold">
      {tier?.banned ? (
        <p className="text-sm text-ink-soft">Banned creators can't submit to this DAO's campaigns.</p>
      ) : full ? (
        <p className="text-sm text-ink-soft">You have {open} open submissions, the most this campaign allows. Submit again once one is decided.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Deliverable">
            {({ id }) => (
              <select id={id} className={inputClass} value={line} onChange={(e) => setLine(e.target.value === "custom" ? "custom" : Number(e.target.value))}>
                {campaign.rate_card.map((l, i) => (
                  <option key={l.name} value={i}>
                    {l.name} · {formatNear(l.amount)} NEAR
                  </option>
                ))}
                <option value="custom">Something else (custom amount)</option>
              </select>
            )}
          </Field>
          {isCustom && (
            <Field label="Amount in NEAR" error={errors.custom} hint="Custom amounts always get a human decision.">
              {({ id, describedBy, invalid }) => (
                <input id={id} inputMode="decimal" className={`${inputClass} font-data`} value={custom} onChange={(e) => setCustom(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} placeholder="12.5" />
              )}
            </Field>
          )}
          <Field label="Proof link" error={errors.proof} hint="The public post, video or event page.">
            {({ id, describedBy, invalid }) => (
              <input id={id} type="url" className={inputClass} value={proof} onChange={(e) => setProof(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} placeholder="https://x.com/you/status/1849…" />
            )}
          </Field>
          <Field label="Note (optional)" error={errors.note}>
            {({ id, describedBy, invalid }) => (
              <input id={id} className={inputClass} value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} aria-describedby={describedBy} aria-invalid={invalid} placeholder="Thread on how the payout routes work" />
            )}
          </Field>
          {route && (
            <div className="flex items-center gap-3 rounded-md bg-sunk px-3 py-3">
              <Seal route={route} size={44} decorative />
              <p className="text-[13px] text-ink-soft">{ROUTE_COPY[route](campaign)}</p>
            </div>
          )}
          <Button type="submit" variant="primary" busy={busy}>
            Submit for {amount ? `${formatNear(amount)} NEAR` : "payment"}
          </Button>
          <p className="text-[12px] text-ink-faint">You attach 0.05 NEAR for storage. Whatever isn't used comes straight back.</p>
        </form>
      )}
    </Panel>
  );
}

