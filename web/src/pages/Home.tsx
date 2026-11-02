import { useRef } from "react";
import { AccountLink, Avatar, BudgetBar, Near, RankBadge, Seal, When } from "../components/chain";
import { Button, EmptyState, LinkButton } from "../components/ui";
import { useApp, useChainData } from "../lib/app";
import { formatNear, plural } from "../lib/format";
import { useProgram } from "../lib/hooks";
import type { Route } from "../lib/herald";
import { href } from "../lib/router";

const ROUTES: { route: Route; title: string; body: string }[] = [
  {
    route: "Auto",
    title: "Automatic, in public",
    body: "Trusted and Core creators are paid for rate-card work without waiting on anyone. Each payout first sits in a public window where any reviewer can veto it.",
  },
  {
    route: "Reviewer",
    title: "One reviewer",
    body: "Newcomers, custom amounts and anything above a creator's automatic limit need one reviewer the DAO appointed. Approval pays out on the spot.",
  },
  {
    route: "Dao",
    title: "A real DAO vote",
    body: "Anything above the reviewer limit becomes a normal Sputnik DAO proposal. Herald writes the proposal, the council votes, the DAO pays.",
  },
];

export function Home() {
  const { herald, config } = useApp();
  const stats = useChainData(() => herald.stats(), []);
  const program = useProgram();
  const howRef = useRef<HTMLElement>(null);

  const campaigns = program.data?.campaigns ?? [];
  const lead = campaigns.find((c) => c.status === "Active");
  const recentPaid = (program.data?.submissions ?? [])
    .filter((s) => s.status === "Paid" && s.paid_at_ms)
    .sort((a, b) => (b.paid_at_ms ?? 0) - (a.paid_at_ms ?? 0))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <h1 className="rise-in font-display text-[clamp(42px,6.2vw,76px)] leading-[1.02] tracking-[-0.01em] text-ink">
            Pay the people who carry your message.
          </h1>
          <p className="rise-in max-w-[56ch] text-[17px] leading-relaxed text-ink-soft" style={{ animationDelay: "90ms" }}>
            Herald runs ambassador and creator payouts from your DAO's treasury. Proven creators are paid automatically, newcomers get one reviewer, and big asks go to a vote. Every payout is public, and every bit of trust is earned.
          </p>
          <div className="rise-in flex flex-wrap gap-3" style={{ animationDelay: "160ms" }}>
            {lead && (
              <LinkButton href={href.campaign(lead.id)} variant="primary">
                Open {lead.title}
              </LinkButton>
            )}
            <Button onClick={() => howRef.current?.scrollIntoView({ behavior: "smooth" })}>How payouts are approved</Button>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">Latest payouts</h2>
            <span className="text-[12.5px] text-ink-faint">{config.daoName}</span>
          </div>
          {recentPaid.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No payouts yet" body="The first approved deliverable will be stamped here." />
            </div>
          ) : (
            <ul>
              {recentPaid.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
                  <Avatar accountId={s.creator} size={34} />
                  <div className="min-w-0 flex-1">
                    <AccountLink accountId={s.creator} />
                    <p className="truncate text-[13px] text-ink-soft">{s.custom && s.note ? s.note : s.deliverable}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <Near value={s.amount} className="text-sm font-medium" />
                    {s.paid_at_ms && <When ms={s.paid_at_ms} />}
                  </div>
                  <Seal route={s.route} size={50} stamp delayMs={250 + i * 140} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-label="Program totals" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        {[
          { label: "Paid to creators", value: stats.data ? `${formatNear(stats.data.total_paid)} NEAR` : "…" },
          { label: "Payouts", value: stats.data?.payouts ?? "…" },
          { label: "Creators", value: stats.data?.creators ?? "…" },
          { label: "Campaigns", value: stats.data?.campaigns ?? "…" },
        ].map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 bg-surface px-5 py-4">
            <span className="text-[13px] text-ink-faint">{stat.label}</span>
            <span className="font-data text-[26px] leading-tight text-ink">{stat.value}</span>
          </div>
        ))}
      </section>

      <section ref={howRef} className="scroll-mt-24">
        <h2 className="font-display text-[clamp(30px,3.6vw,44px)] leading-tight">Three routes. One treasury.</h2>
        <p className="mt-3 max-w-[62ch] text-[16px] text-ink-soft">
          The DAO funds a campaign once. After that, every payout takes the cheapest route the creator has earned, and every decision is stamped with the route that made it.
        </p>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {ROUTES.map((r, i) => (
            <li key={r.route} className="flex flex-col gap-4 border-t-2 border-ink pt-5">
              <div className="flex items-center justify-between">
                <span className="font-data text-[13px] text-ink-faint">Route {i + 1}</span>
                <Seal route={r.route} size={64} />
              </div>
              <h3 className="text-lg font-semibold">{r.title}</h3>
              <p className="text-[15px] leading-relaxed text-ink-soft">{r.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid gap-6 rounded-lg bg-sunk px-6 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <h3 className="text-lg font-semibold">Trust is earned, one DAO at a time</h3>
            <p className="mt-2 max-w-[60ch] text-[15px] text-ink-soft">
              Every paid deliverable adds a point with that DAO. Enough points make a creator Trusted, then Core, and their automatic limit grows. A veto costs points, and fraud gets a ban. Trust earned with one community never unlocks automatic payouts in another.
            </p>
          </div>
          <div className="flex flex-wrap gap-5">
            <RankBadge tier="Newcomer" />
            <RankBadge tier="Trusted" />
            <RankBadge tier="Core" />
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-[clamp(30px,3.6vw,44px)] leading-tight">Campaigns</h2>
        </div>
        {campaigns.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No campaigns yet" body="A council member launches the first one from the Council page. The DAO votes, and the budget moves in." />
          </div>
        ) : (
          <ul className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
            {campaigns.map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <a href={href.campaign(c.id)} className="grid gap-3 px-5 py-4 transition-colors hover:bg-sunk sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[16px] font-semibold text-ink">{c.title}</span>
                      <span className={`rounded-sm px-1.5 py-0.5 text-[11.5px] font-medium ${c.status === "Active" ? "bg-paid-wash text-paid-ink" : "bg-sunk text-ink-soft"}`}>{c.status}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-faint">
                      {plural(c.rate_card.length, "deliverable")} · {plural(c.reviewers.length, "reviewer")} · {plural(c.payout_count, "payout")}
                    </p>
                  </div>
                  <BudgetBar budget={c.budget} paid={c.paid} reserved={c.reserved} compact />
                  <span className="text-[13px] text-ink-soft sm:text-right">
                    <Near value={c.available} /> left
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 border-t border-line pt-10 md:grid-cols-3">
        {[
          { title: "Plugs into your treasury", body: "Works with any Sputnik DAO, including Trezu treasuries. The DAO only ever moves a capped campaign budget." },
          { title: "No admin key", body: "Nobody can change a campaign except the DAO, through its own votes. Not even the people who built Herald." },
          { title: "Public by default", body: "Every payout, veto and reputation point is recorded on NEAR and linked to the work behind it." },
        ].map((item) => (
          <div key={item.title}>
            <h3 className="text-[15px] font-semibold">{item.title}</h3>
            <p className="mt-1.5 text-[14.5px] text-ink-soft">{item.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
