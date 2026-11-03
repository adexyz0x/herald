import { AnimatePresence } from "motion/react";
import type { CSSProperties } from "react";
import { Avatar, Near, RankBadge, RouteTag, When } from "../components/chain";
import { SubmissionRow, type RowContext } from "../components/SubmissionRow";
import { EmptyState, LinkButton, Panel, SectionTitle } from "../components/ui";
import { useApp, useChainData } from "../lib/app";
import { formatNear } from "../lib/format";
import { Figure, formatNearNumber, nearNumber } from "../lib/motion";
import { OPEN_STATUSES, autoLimit, tierFor, type Campaign, type Reputation, type Submission } from "../lib/herald";
import { useDaoContext, useProgram } from "../lib/hooks";
import { href } from "../lib/router";

interface Entry {
  sub: Submission;
  kind: "Paid" | "Vetoed" | "Rejected";
  delta: number;
  /** Points with that DAO right after this entry. */
  balance: number;
  at: number;
}

/** Replays a creator's decided work into a points ledger, the same way the contract scores it. */
function ledger(subs: Submission[], campaigns: Map<number, Campaign>): Entry[] {
  const events: Omit<Entry, "balance">[] = [];
  for (const sub of subs) {
    if (sub.status === "Paid") events.push({ sub, kind: "Paid", delta: 1, at: sub.paid_at_ms ?? sub.created_at_ms });
    if (sub.status === "Vetoed") events.push({ sub, kind: "Vetoed", delta: -(campaigns.get(sub.campaign_id)?.rules.slash_points ?? 0), at: sub.decided_at_ms ?? sub.created_at_ms });
    if (sub.status === "Rejected") events.push({ sub, kind: "Rejected", delta: 0, at: sub.decided_at_ms ?? sub.created_at_ms });
  }
  events.sort((a, b) => a.at - b.at);
  const points = new Map<string, number>();
  const entries = events.map((e) => {
    const balance = Math.max(0, (points.get(e.sub.dao) ?? 0) + e.delta);
    points.set(e.sub.dao, balance);
    return { ...e, balance };
  });
  return entries.reverse();
}

export function CreatorPage({ accountId }: { accountId: string }) {
  const { herald, config, actor, displayName } = useApp();
  const subs = useChainData(() => herald.creatorSubmissions(accountId), [accountId]);
  const program = useProgram();
  const daoCtx = useDaoContext();
  const daos = [...new Set((subs.data ?? []).map((s) => s.dao))];
  const records = useChainData(async () => {
    const list = await Promise.all(daos.map((dao) => herald.reputation(dao, accountId)));
    return new Map(daos.map((dao, i) => [dao, list[i]]));
  }, [accountId, daos.join(",")]);

  if (subs.loading && !subs.data) return <p className="text-ink-faint">Loading the record…</p>;

  const mine = subs.data ?? [];
  const campaigns = program.data?.campaigns ?? [];
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const reviews = campaigns.filter((c) => c.reviewers.includes(accountId));
  const onCouncil = Boolean(daoCtx.data?.council.includes(accountId));
  const decisions = (program.data?.submissions ?? [])
    .filter((s) => s.decided_by === accountId)
    .sort((a, b) => (b.decided_at_ms ?? 0) - (a.decided_at_ms ?? 0));
  const open = mine.filter((s) => OPEN_STATUSES.includes(s.status) || s.status === "Approved").sort((a, b) => b.created_at_ms - a.created_at_ms);
  const entries = ledger(mine, campaignById);
  const paid = mine.filter((s) => s.status === "Paid");
  const earned = paid.reduce((sum, s) => sum + BigInt(s.amount), 0n);
  const vetoed = mine.filter((s) => s.status === "Vetoed").length;
  const first = mine.reduce<number | null>((min, s) => (min == null || s.created_at_ms < min ? s.created_at_ms : min), null);
  const isMe = actor.accountId === accountId;
  const rowCtx: RowContext = daoCtx.data
    ? { council: daoCtx.data.council, bond: daoCtx.data.bond, openVotes: daoCtx.data.openVotes }
    : { council: [], bond: "0", openVotes: new Set() };

  const roles = [
    mine.length > 0 && first != null && (
      <span key="creator">
        Creator, first submission <When ms={first} />
      </span>
    ),
    reviews.length > 0 && <span key="reviewer">Reviewer for {reviews.map((c) => c.title).join(", ")}</span>,
    onCouncil && <span key="council">Council member of {config.daoName}</span>,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <div className="relative isolate flex flex-wrap items-center gap-5">
        <div className="page-wash" style={{ "--wash-tone": "var(--paid)" } as CSSProperties} aria-hidden="true" />
        <Avatar accountId={accountId} size={72} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[clamp(34px,4.6vw,52px)] leading-[1.05]">{displayName(accountId)}</h1>
            {isMe && <span className="rounded-sm bg-accent-wash px-2 py-0.5 text-[12.5px] font-medium text-accent-strong">This is you</span>}
          </div>
          <p className="mt-1 font-data text-[13px] text-ink-faint">{accountId}</p>
          {roles.length > 0 && <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">{roles}</p>}
        </div>
      </div>

      {mine.length === 0 && reviews.length === 0 && !onCouncil ? (
        <EmptyState
          title="No record yet"
          body={`${displayName(accountId)} hasn't submitted work to a Herald campaign. Every payout, veto and point they earn will show up here.`}
          action={
            <LinkButton href={href.home} size="sm">
              See campaigns
            </LinkButton>
          }
        />
      ) : (
        <>
          {mine.length > 0 && (
            <section aria-label="Totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:grid-cols-4">
              {[
                { label: "Earned", dot: "bg-paid", value: <Figure value={nearNumber(earned)} format={(n) => `${formatNearNumber(n)} NEAR`} /> },
                { label: "Paid deliverables", dot: "bg-gold", value: <Figure value={paid.length} /> },
                { label: "Open now", dot: "bg-accent", value: open.length },
                { label: "Vetoed", dot: "bg-veto", value: vetoed },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col gap-1 bg-surface px-5 py-4">
                  <span className="flex items-center gap-2 text-[13px] text-ink-faint">
                    <span className={`size-2 rounded-full ${stat.dot}`} aria-hidden="true" />
                    {stat.label}
                  </span>
                  <span className="font-data text-[24px] leading-tight text-ink">{stat.value}</span>
                </div>
              ))}
            </section>
          )}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-10">
              {open.length > 0 && (
                <section className="flex flex-col gap-3">
                  <SectionTitle title="Open submissions" tone="accent" count={open.length} />
                  <div className="rounded-lg border border-line bg-surface px-5 shadow-card">
                    <ul>
                      <AnimatePresence initial={false}>
                        {open.map((s) => {
                          const campaign = campaignById.get(s.campaign_id);
                          return campaign ? <SubmissionRow key={s.id} sub={s} campaign={campaign} ctx={rowCtx} showCampaign /> : null;
                        })}
                      </AnimatePresence>
                    </ul>
                  </div>
                </section>
              )}

              {mine.length > 0 && (
                <section className="flex flex-col gap-3">
                  <SectionTitle title="Points ledger" tone="paid" hint="One point for every paid deliverable. Vetoes take points away. Rejections cost nothing." />
                  <div className="rounded-lg border border-line bg-surface px-5 shadow-card">
                    {entries.length === 0 ? (
                      <p className="py-5 text-sm text-ink-faint">Nothing decided yet.</p>
                    ) : (
                      <ul>
                        {entries.map((e) => (
                          <LedgerRow key={`${e.sub.id}-${e.kind}`} entry={e} campaign={campaignById.get(e.sub.campaign_id)} />
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}

              {decisions.length > 0 && (
                <section className="flex flex-col gap-3">
                  <SectionTitle title="Decisions on the record" tone="accent" count={decisions.length} hint="Reviewers answer for their calls too. Every approval, rejection and veto is public." />
                  <div className="rounded-lg border border-line bg-surface px-5 shadow-card">
                    <ul>
                      {decisions.map((s) => (
                        <DecisionRow key={s.id} sub={s} campaign={campaignById.get(s.campaign_id)} />
                      ))}
                    </ul>
                  </div>
                </section>
              )}
            </div>

            <aside className="flex flex-col gap-6">
              {daos.map((dao) => (
                <RecordCard key={dao} dao={dao} record={records.data?.get(dao)} campaigns={campaigns.filter((c) => c.dao === dao && c.status === "Active")} />
              ))}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function RecordCard({ dao, record, campaigns }: { dao: string; record?: Reputation; campaigns: Campaign[] }) {
  const { displayName } = useApp();
  return (
    <Panel title={`Record with ${displayName(dao)}`} tone={record?.banned ? "veto" : "paid"}>
      {!record ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <span className="flex items-baseline gap-1.5">
              <span className="font-data text-[34px] leading-none text-ink">
                <Figure value={record.points} />
              </span>
              <span className="text-sm text-ink-soft">points</span>
            </span>
            {record.banned && <span className="rounded-sm bg-veto-wash px-2 py-0.5 text-[12.5px] font-medium text-veto-ink">Banned</span>}
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1.5 text-[13.5px]">
            <dt className="text-ink-soft">Paid deliverables</dt>
            <dd className="text-right font-data text-ink">{record.paid_count}</dd>
            <dt className="text-ink-soft">Earned</dt>
            <dd className="text-right">
              <Near value={record.total_earned} />
            </dd>
            <dt className="text-ink-soft">Vetoes</dt>
            <dd className="text-right font-data text-ink">{record.slashed_count}</dd>
          </dl>
          {campaigns.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="mb-2.5 text-[12.5px] font-medium text-ink-soft">Rank by campaign</p>
              <ul className="flex flex-col gap-3">
                {campaigns.map((c) => {
                  const tier = tierFor(c.rules, record.points);
                  const limit = autoLimit(c.rules, tier);
                  return (
                    <li key={c.id} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <a href={href.campaign(c.id)} className="truncate text-[13.5px] text-ink hover:text-accent">
                          {c.title}
                        </a>
                        <RankBadge tier={tier} size="sm" />
                      </div>
                      <p className="text-[12.5px] text-ink-faint">{limit > 0n ? `Automatic payouts up to ${formatNear(limit)} NEAR` : "Every deliverable is reviewed"}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="text-[12.5px] text-ink-faint">Points only count with this DAO. Trust earned elsewhere never unlocks automatic payouts here.</p>
        </div>
      )}
    </Panel>
  );
}

function Delta({ value }: { value: number }) {
  const tone = value > 0 ? "bg-paid-wash text-paid-ink" : value < 0 ? "bg-veto-wash text-veto-ink" : "bg-sunk text-ink-faint";
  return <span className={`inline-flex w-11 justify-center rounded-sm py-0.5 font-data text-[13px] ${tone}`}>{value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0"}</span>;
}

function LedgerRow({ entry, campaign }: { entry: Entry; campaign?: Campaign }) {
  const { displayName } = useApp();
  const { sub, kind } = entry;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line py-3 last:border-b-0">
      <Delta value={entry.delta} />
      <div className="min-w-0">
        <p className="truncate text-sm">
          <span className="font-medium text-ink">{sub.deliverable}</span>
          {campaign && (
            <a href={href.campaign(campaign.id)} className="text-ink-faint hover:text-ink">
              {" "}
              · {campaign.title}
            </a>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-ink-soft">
          {kind === "Paid" && (
            <>
              <span>
                Paid <Near value={sub.amount} />
              </span>
              <RouteTag route={sub.route} />
            </>
          )}
          {kind === "Vetoed" && (
            <span>
              Vetoed{sub.decided_by && ` by ${displayName(sub.decided_by)}`}: “{sub.reason}”
            </span>
          )}
          {kind === "Rejected" && <span>Rejected: “{sub.reason}”. No points lost.</span>}
          <When ms={entry.at} />
        </p>
      </div>
      <span className="font-data text-[13px] text-ink-soft">{entry.balance} pts</span>
    </li>
  );
}

function DecisionRow({ sub, campaign }: { sub: Submission; campaign?: Campaign }) {
  const { displayName } = useApp();
  const verb = sub.status === "Vetoed" ? "Vetoed" : sub.status === "Rejected" ? "Rejected" : "Approved";
  const tone = verb === "Approved" ? "text-paid-ink" : verb === "Vetoed" ? "text-veto-ink" : "text-ink-soft";
  return (
    <li className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0">
      <p className="text-sm text-ink">
        <span className={`font-medium ${tone}`}>{verb}</span> {displayName(sub.creator)}'s {sub.custom ? "custom request" : sub.deliverable} · <Near value={sub.amount} />
      </p>
      <p className="flex flex-wrap gap-x-2 text-[12.5px] text-ink-faint">
        {campaign && <span>{campaign.title}</span>}
        {sub.reason && verb !== "Approved" && <span>“{sub.reason}”</span>}
        {sub.decided_at_ms && <When ms={sub.decided_at_ms} />}
      </p>
    </li>
  );
}
