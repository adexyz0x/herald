import { AnimatePresence, motion, type Variants } from "motion/react";
import { useRef, type ReactNode } from "react";
import { AccountLink, Avatar, BudgetBar, Near, Seal, When } from "../components/chain";
import { PayoutStory } from "../components/PayoutStory";
import { LiveDot } from "../components/Shell";
import { EmptyState } from "../components/ui";
import { useApp, useChainData } from "../lib/app";
import { plural } from "../lib/format";
import type { Submission } from "../lib/herald";
import { useProgram } from "../lib/hooks";
import { CountUp, ease, formatNearNumber, nearNumber, rise, stagger } from "../lib/motion";
import { href } from "../lib/router";

/** The headline, line by line, so each line can rise out of its own mask. */
const HEADLINE = ["Pay the people", "who carry your", "message."];

const lineUp: Variants = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.75, ease } },
};

export function Home() {
  const { herald } = useApp();
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
      <section className="tabard overflow-hidden px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-14">
          <motion.div className="flex flex-col gap-6" variants={stagger(0.08)} initial="hidden" animate="show">
            <motion.p variants={rise} className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12.5px] text-on-tabard-soft">
              <LiveDot className="bg-gold" />
              Ambassador and creator payouts on NEAR
            </motion.p>
            <h1 className="font-display text-[clamp(40px,5.8vw,74px)] leading-[1.02] tracking-[-0.01em] text-on-tabard">
              {HEADLINE.map((line) => (
                <span key={line} className="block overflow-hidden pb-[0.06em]">
                  <motion.span className="block" variants={lineUp}>
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p variants={rise} className="max-w-[54ch] text-[17px] leading-relaxed text-on-tabard-soft">
              Herald runs ambassador and creator payouts from your DAO's treasury. Proven creators are paid automatically, newcomers get one reviewer, and big asks go to a vote. Every payout is public, and every bit of trust is earned.
            </motion.p>
            <motion.div variants={rise} className="flex flex-wrap gap-3">
              {lead && (
                <a
                  href={href.campaign(lead.id)}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-gold px-5 text-[15px] font-semibold text-on-gold shadow-[0_10px_26px_-12px_rgb(0_0_0/0.6)] transition-[filter,transform] duration-150 hover:brightness-105 focus-visible:shadow-[0_0_0_3px_rgb(255_255_255/0.75)] active:scale-[0.97]"
                >
                  Open {lead.title}
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              )}
              <button
                type="button"
                onClick={() => howRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="inline-flex h-11 items-center rounded-md border border-white/25 px-5 text-[15px] font-medium text-on-tabard transition-[background-color,transform] duration-150 hover:bg-white/10 focus-visible:shadow-[0_0_0_3px_rgb(255_255_255/0.75)] active:scale-[0.97]"
              >
                How payouts are approved
              </button>
            </motion.div>
          </motion.div>

          <LatestPayouts items={recentPaid} loading={!program.data} />
        </div>
      </section>

      <section aria-label="Program totals" className="-mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:-mt-8 sm:grid-cols-4">
        <Stat label="Paid to creators" dot="bg-paid">
          {stats.data ? <CountUp value={nearNumber(stats.data.total_paid)} format={(n) => `${formatNearNumber(n)} NEAR`} /> : "…"}
        </Stat>
        <Stat label="Payouts" dot="bg-gold">
          {stats.data ? <CountUp value={stats.data.payouts} /> : "…"}
        </Stat>
        <Stat label="Creators" dot="bg-accent">
          {stats.data ? <CountUp value={stats.data.creators} /> : "…"}
        </Stat>
        <Stat label="Campaigns" dot="bg-dao">
          {stats.data ? <CountUp value={stats.data.campaigns} /> : "…"}
        </Stat>
      </section>

      <section ref={howRef} className="scroll-mt-28">
        <div className="max-w-[640px]">
          <h2 className="font-display text-[clamp(30px,3.6vw,44px)] leading-tight">How a payout travels</h2>
          <p className="mt-3 text-[16px] text-ink-soft">
            Follow one creator through all three routes. The DAO funds a campaign once, and every payout after that takes the route the creator has earned.
          </p>
        </div>
        <div className="mt-12">
          <PayoutStory />
        </div>
      </section>

      <section>
        <h2 className="font-display text-[clamp(30px,3.6vw,44px)] leading-tight">Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No campaigns yet" body="A council member launches the first one from the Council page. The DAO votes, and the budget moves in." />
          </div>
        ) : (
          <ul className="mt-6 overflow-hidden rounded-lg border border-line bg-surface shadow-card">
            {campaigns.map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <a href={href.campaign(c.id)} className="group relative grid gap-3 px-5 py-4 transition-colors duration-150 hover:bg-sunk/60 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
                  <span aria-hidden="true" className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${c.status === "Active" ? "bg-paid" : "bg-line-strong"}`} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[16px] font-semibold text-ink transition-colors group-hover:text-accent">{c.title}</span>
                      <span className={`rounded-sm px-1.5 py-0.5 text-[11.5px] font-medium ${c.status === "Active" ? "bg-paid-wash text-paid-ink" : "bg-sunk text-ink-soft"}`}>{c.status}</span>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-faint">
                      {plural(c.rate_card.length, "deliverable")} · {plural(c.reviewers.length, "reviewer")} · {plural(c.payout_count, "payout")}
                    </p>
                  </div>
                  <BudgetBar budget={c.budget} paid={c.paid} reserved={c.reserved} compact />
                  <span className="flex items-center gap-3 text-[13px] text-ink-soft sm:justify-end">
                    <span>
                      <Near value={c.available} /> left
                    </span>
                    <svg viewBox="0 0 24 24" className="size-4 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-6 border-t border-line pt-10 md:grid-cols-3">
        {[
          {
            title: "Plugs into your treasury",
            body: "Works with any Sputnik DAO, including Trezu treasuries. The DAO only ever moves a capped campaign budget.",
            tone: "bg-gold-wash text-gold-ink",
            icon: <path d="M3 10h18L12 4 3 10Zm2 0v8m4.5-8v8m5-8v8M19 10v8M3 20h18" />,
          },
          {
            title: "No admin key",
            body: "Nobody can change a campaign except the DAO, through its own votes. Not even the people who built Herald.",
            tone: "bg-accent-wash text-accent-strong",
            icon: (
              <>
                <circle cx="8" cy="15" r="4" />
                <path d="m10.8 12.2 8.7-8.7M17 6l2.5 2.5M15 8l2 2" />
              </>
            ),
          },
          {
            title: "Public by default",
            body: "Every payout, veto and reputation point is recorded on NEAR and linked to the work behind it.",
            tone: "bg-dao-wash text-dao-ink",
            icon: (
              <>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            ),
          },
        ].map((item) => (
          <div key={item.title} className="flex gap-4">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-md ${item.tone}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                {item.icon}
              </svg>
            </span>
            <div>
              <h3 className="text-[15px] font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-[14.5px] text-ink-soft">{item.body}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, dot, children }: { label: string; dot: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 bg-surface px-5 py-4">
      <span className="flex items-center gap-2 text-[13px] text-ink-faint">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </span>
      <span className="font-data text-[24px] leading-tight text-ink sm:text-[26px]">{children}</span>
    </div>
  );
}

/**
 * The live feed in the hero. On first load the card slides in and each seal stamps down in
 * turn; after that, a new payout slides in at the top and stamps on its own.
 */
function LatestPayouts({ items, loading }: { items: Submission[]; loading: boolean }) {
  const { config } = useApp();
  const firstIds = useRef<Set<number> | null>(null);
  if (firstIds.current === null && items.length > 0) firstIds.current = new Set(items.map((s) => s.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.7, ease }}
      className="relative rounded-lg bg-surface text-ink shadow-pop"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-[15px] font-semibold">Latest payouts</h2>
        <span className="flex items-center gap-2 text-[12.5px] text-ink-faint">
          <LiveDot />
          {config.daoName}
        </span>
      </div>
      {loading ? (
        <ul aria-label="Loading payouts">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex animate-pulse items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
              <span className="size-[34px] rounded-full bg-sunk" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="h-3 w-24 rounded bg-sunk" />
                <span className="h-2.5 w-36 rounded bg-sunk" />
              </span>
              <span className="size-[50px] rounded-full bg-sunk" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No payouts yet" body="The first approved deliverable will be stamped here." />
        </div>
      ) : (
        <ul>
          <AnimatePresence initial={false}>
            {items.map((s, i) => {
              const fromFirstLoad = firstIds.current?.has(s.id) ?? false;
              return (
                <motion.li
                  key={s.id}
                  layout="position"
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.35, ease }}
                  className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
                >
                  <Avatar accountId={s.creator} size={34} />
                  <div className="min-w-0 flex-1">
                    <AccountLink accountId={s.creator} />
                    <p className="truncate text-[13px] text-ink-soft">{s.custom && s.note ? s.note : s.deliverable}</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <Near value={s.amount} className="text-sm font-medium" />
                    {s.paid_at_ms && <When ms={s.paid_at_ms} />}
                  </div>
                  <Seal route={s.route} size={50} stamp delayMs={fromFirstLoad ? 650 + i * 150 : 150} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </motion.div>
  );
}
