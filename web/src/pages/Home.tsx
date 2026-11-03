import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform, type Variants } from "motion/react";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AccountLink, Avatar, BudgetBar, Near, RouteIcon, Seal, When } from "../components/chain";
import { PayoutStory } from "../components/PayoutStory";
import { LiveDot } from "../components/Shell";
import { EmptyState } from "../components/ui";
import { useApp, useChainData, useChainNow } from "../lib/app";
import { formatNear, formatRelative, plural } from "../lib/format";
import { tierFor, type Campaign, type Route, type Submission, type Tier } from "../lib/herald";
import { useProgram } from "../lib/hooks";
import { Figure, ease, formatNearNumber, nearNumber, rise, stagger } from "../lib/motion";
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
  const heroRef = useRef<HTMLElement>(null);
  // The lozenge pattern drifts as the hero scrolls away, a little slower than the page.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], [0, 90]);

  const campaigns = program.data?.campaigns ?? [];
  const lead = campaigns.find((c) => c.status === "Active");
  const recentPaid = (program.data?.submissions ?? [])
    .filter((s) => s.status === "Paid" && s.paid_at_ms)
    .sort((a, b) => (b.paid_at_ms ?? 0) - (a.paid_at_ms ?? 0))
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-16 sm:gap-20">
      <section ref={heroRef} className="tabard overflow-hidden px-6 pt-10 pb-6 sm:px-10 sm:pt-12 sm:pb-7 lg:px-14 lg:pt-16 lg:pb-8">
        <motion.div aria-hidden="true" className="tabard-diaper pointer-events-none absolute inset-x-0 -top-28 -bottom-28 -z-10" style={{ y: drift }} />
        {/* Once, on arrival: a band of light crosses the field, like light catching gilt. */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/2 -z-10 w-1/2 bg-[linear-gradient(100deg,transparent,rgb(255_255_255/0.08),transparent)]"
          initial={{ x: "0%" }}
          animate={{ x: "400%" }}
          transition={{ delay: 1, duration: 1.7, ease: [0.4, 0, 0.2, 1] }}
        />
        <TabardTrim />
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-14">
          <motion.div className="flex flex-col gap-6" variants={stagger(0.08)} initial="hidden" animate="show">
            <motion.p variants={rise} className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12.5px] text-on-tabard-soft">
              <LiveDot className="bg-gold" />
              Ambassador and creator payouts on NEAR
            </motion.p>
            <h1 className="font-display text-[clamp(40px,5.8vw,74px)] leading-[1.02] tracking-[-0.01em] text-on-tabard">
              {HEADLINE.map((line, i) => {
                const last = i === HEADLINE.length - 1;
                return (
                  <span key={line} className={last ? "relative block w-fit" : "block"}>
                    <span className="block overflow-hidden pb-[0.06em]">
                      <motion.span className="foil-glint relative block" data-glint={line} variants={lineUp}>
                        {line}
                      </motion.span>
                    </span>
                    {last && <Swash />}
                  </span>
                );
              })}
            </h1>
            <motion.p variants={rise} className="max-w-[54ch] text-[17px] leading-relaxed text-on-tabard-soft">
              Herald runs ambassador and creator payouts from your DAO's treasury. Proven creators are paid automatically, newcomers get one reviewer, and big asks go to a vote. Every payout is public, and every bit of trust is earned.
            </motion.p>
            <motion.div variants={rise} className="flex flex-wrap gap-3">
              {lead && (
                <a
                  href={href.campaign(lead.id)}
                  className="foil inline-flex h-11 items-center gap-2 rounded-md bg-gold px-5 text-[15px] font-semibold text-on-gold shadow-[0_10px_26px_-12px_rgb(0_0_0/0.6)] transition-[filter,transform] duration-150 hover:brightness-105 focus-visible:shadow-[0_0_0_3px_rgb(255_255_255/0.75)] active:scale-[0.97]"
                >
                  Open {lead.title}
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </a>
              )}
              {/* Holds the button's place while campaigns load, so the row doesn't jump. */}
              {!program.data && <span aria-hidden="true" className="h-11 w-60 rounded-md bg-white/10" />}
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
        <ChainRibbon campaigns={program.data?.campaigns} submissions={program.data?.submissions} />
      </section>

      <section aria-label="Program totals" className="-mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card sm:-mt-8 sm:grid-cols-4">
        <Stat label="Paid to creators" dot="bg-paid">
          {stats.data ? <Figure value={nearNumber(stats.data.total_paid)} format={(n) => `${formatNearNumber(n)} NEAR`} /> : "…"}
        </Stat>
        <Stat label="Payouts" dot="bg-gold">
          {stats.data ? <Figure value={stats.data.payouts} /> : "…"}
        </Stat>
        <Stat label="Creators" dot="bg-accent">
          {stats.data ? <Figure value={stats.data.creators} /> : "…"}
        </Stat>
        <Stat label="Campaigns" dot="bg-dao">
          {stats.data ? <Figure value={stats.data.campaigns} /> : "…"}
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
            body: "The contract has no admin methods. Only a campaign's DAO can change it, through its own votes.",
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

/** A gold swash drawn under the last line of the headline, once the line has risen. */
function Swash() {
  return (
    <svg
      viewBox="0 0 300 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-[0.1em] left-[0.02em] h-[0.2em] w-[92%] overflow-visible"
    >
      <motion.path
        d="M3 11C70 4 160 2.5 297 7.5"
        fill="none"
        stroke="var(--tincture-or)"
        strokeWidth="4"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.95, duration: 0.8, ease }}
      />
    </svg>
  );
}

/** The trim's two halves, from the top center down each side to the bottom center. */
function trimPaths(w: number, h: number, r: number): [string, string] {
  const m = w / 2;
  return [
    `M${m} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${m}`,
    `M${m} 0H${r}A${r} ${r} 0 0 0 0 ${r}V${h - r}A${r} ${r} 0 0 0 ${r} ${h}H${m}`,
  ];
}

/** The tabard's gold hairline. On arrival it traces itself from the top center down both sides. */
function TabardTrim() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <svg ref={ref} aria-hidden="true" className="pointer-events-none absolute top-[10px] left-[10px] -z-10 h-[calc(100%-20px)] w-[calc(100%-20px)] overflow-visible">
      {size &&
        trimPaths(size.w, size.h, 14).map((d, i) => (
          <motion.path
            key={i}
            d={d}
            fill="none"
            stroke="var(--tincture-or)"
            strokeOpacity={0.55}
            strokeWidth={1}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2, duration: 1.6, ease }}
          />
        ))}
    </svg>
  );
}

type ChainEvent = { key: string; at: number } & (
  | { kind: "paid"; sub: Submission }
  | { kind: "vetoed"; sub: Submission }
  | { kind: "tier"; creator: string; tier: Tier }
  | { kind: "launched"; campaign: Campaign }
);

/**
 * Everything the program has done, newest first: payouts and how they were approved, vetoes,
 * creators earning a rank, and campaigns the DAO launched. Ranks are replayed the way the
 * contract scores them: a point per payout, minus the slash for a veto, per DAO.
 */
function chainEvents(campaigns: Campaign[], submissions: Submission[]): ChainEvent[] {
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  const events: ChainEvent[] = campaigns.map((c) => ({ key: `c${c.id}`, at: c.created_at_ms, kind: "launched", campaign: c }));
  const scored = submissions
    .filter((s) => (s.status === "Paid" && s.paid_at_ms) || (s.status === "Vetoed" && s.decided_at_ms))
    .sort((a, b) => (a.paid_at_ms ?? a.decided_at_ms ?? 0) - (b.paid_at_ms ?? b.decided_at_ms ?? 0));
  const points = new Map<string, number>();
  for (const s of scored) {
    const rules = byId.get(s.campaign_id)?.rules;
    const at = s.paid_at_ms ?? s.decided_at_ms ?? 0;
    const who = `${s.dao}|${s.creator}`;
    const before = points.get(who) ?? 0;
    const after = Math.max(0, before + (s.status === "Paid" ? 1 : -(rules?.slash_points ?? 0)));
    points.set(who, after);
    events.push({ key: `s${s.id}`, at, kind: s.status === "Paid" ? "paid" : "vetoed", sub: s });
    if (rules) {
      const was = tierFor(rules, before);
      const now = tierFor(rules, after);
      if (now !== was && after > before) events.push({ key: `t${s.id}`, at: at + 1, kind: "tier", creator: s.creator, tier: now });
    }
  }
  return events.sort((a, b) => b.at - a.at).slice(0, 12);
}

/** On the tabard, each route keeps its tincture, lightened so it reads on azure. */
const ribbonTint: Record<Route, string> = { Auto: "var(--on-tabard-gold)", Reviewer: "var(--on-tabard-soft)", Dao: "var(--on-tabard-dao)" };

/** `repeat` marks a copy that only fills out the loop: it is skipped by assistive tech and focus. */
function RibbonItem({ event, now, repeat = false }: { event: ChainEvent; now: number; repeat?: boolean }) {
  const { displayName } = useApp();
  const name = (accountId: string) => (
    <a href={href.creator(accountId)} className="font-semibold text-on-tabard underline-offset-2 hover:underline">
      {displayName(accountId)}
    </a>
  );
  let tint = "var(--on-tabard-soft)";
  let icon: ReactNode;
  let text: ReactNode;
  if (event.kind === "paid") {
    const { sub } = event;
    tint = ribbonTint[sub.route];
    icon = <RouteIcon route={sub.route} />;
    const how = sub.route === "Auto" ? "automatically" : sub.route === "Dao" ? "by DAO vote" : sub.decided_by ? `approved by ${displayName(sub.decided_by)}` : "by a reviewer";
    text = (
      <>
        {name(sub.creator)} was paid <span className="font-data text-on-tabard">{formatNear(sub.amount)}</span> NEAR <span style={{ color: tint }}>{how}</span>
      </>
    );
  } else if (event.kind === "vetoed") {
    tint = "var(--on-tabard-veto)";
    icon = <path d="M6 6l12 12M18 6 6 18" />;
    text = (
      <>
        {name(event.sub.creator)}'s {event.sub.deliverable.toLowerCase()} <span style={{ color: tint }}>was vetoed</span>
      </>
    );
  } else if (event.kind === "tier") {
    tint = event.tier === "Core" ? "var(--on-tabard-gold)" : "var(--on-tabard)";
    icon = <path d="m5 15 7-7 7 7" />;
    text = (
      <>
        {name(event.creator)} <span style={{ color: tint }}>earned {event.tier}</span>
      </>
    );
  } else {
    const { campaign } = event;
    tint = "var(--on-tabard-dao)";
    icon = <path d="M3 10h18L12 4 3 10Zm2 0v8m4.5-8v8m5-8v8M19 10v8M3 20h18" />;
    text = (
      <>
        <a href={href.campaign(campaign.id)} className="font-semibold text-on-tabard underline-offset-2 hover:underline">
          {campaign.title}
        </a>{" "}
        <span style={{ color: tint }}>launched by DAO vote</span> with <span className="font-data text-on-tabard">{formatNear(campaign.budget)}</span> NEAR
      </>
    );
  }
  return (
    <li className="flex shrink-0 items-center gap-2.5 pr-7 text-[13.5px] whitespace-nowrap text-on-tabard-soft" aria-hidden={repeat || undefined} inert={repeat || undefined}>
      <span className="flex size-6 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15" style={{ color: tint }} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <span>{text}</span>
      <time dateTime={new Date(event.at).toISOString()} className="font-data text-[12px] text-on-tabard-soft">
        {formatRelative(event.at, now)}
      </time>
      {/* A small gold lozenge between events, from the tabard's own pattern. */}
      <span aria-hidden="true" className="ml-5 size-[5px] rotate-45 bg-on-tabard-gold/70" />
    </li>
  );
}

/**
 * A ribbon along the foot of the hero that proclaims what the program has done on chain. It
 * glides past and stops while the pointer or keyboard focus is on it. The second copy, there only
 * to make the loop seamless, is hidden from assistive tech and can't be focused.
 */
/** While the program loads (no data yet), the ribbon keeps its height so the page doesn't shift. */
function ChainRibbon({ campaigns, submissions }: { campaigns?: Campaign[]; submissions?: Submission[] }) {
  const now = useChainNow(30_000);
  const reduce = useReducedMotion();
  const loading = !campaigns || !submissions;
  const events = loading ? [] : chainEvents(campaigns, submissions);
  if (!loading && events.length === 0) return null;
  // A short history repeats so the moving loop never shows a gap. Standing still, it doesn't need to.
  const loop = reduce || loading || events.length >= 6 ? events : Array.from({ length: Math.ceil(6 / events.length) }, () => events).flat();
  const items = (copy: number) => loop.map((e, i) => <RibbonItem key={`${copy}-${e.key}-${i}`} event={e} now={now} repeat={copy === 0 && i >= events.length} />);
  return (
    <div className="mt-10 flex items-center gap-4 border-t border-white/15 pt-5 lg:mt-12">
      <p className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium text-on-tabard">
        <svg viewBox="0 0 24 24" className="size-4 text-on-tabard-gold" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 11v2a1 1 0 0 0 1 1h2l6 5V5L6 10H4a1 1 0 0 0-1 1Zm13-2.5a4 4 0 0 1 0 7M18.5 6a7.5 7.5 0 0 1 0 12" />
        </svg>
        <span className="hidden sm:inline">On chain</span>
      </p>
      {loading ? (
        <div className="h-6 min-w-0 flex-1" />
      ) : (
        <motion.div className="marquee min-w-0 flex-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="marquee-track" style={{ "--marquee-duration": `${loop.length * 7}s` } as CSSProperties}>
            <ul className="flex shrink-0 items-center" aria-label="Latest on chain">
              {items(0)}
            </ul>
            <ul className="marquee-copy flex shrink-0 items-center" aria-hidden="true" inert>
              {items(1)}
            </ul>
          </div>
        </motion.div>
      )}
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
            <li key={i} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0">
              <span className="shimmer size-[34px] rounded-full" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="shimmer h-3 w-24 rounded" />
                <span className="shimmer h-2.5 w-36 rounded" />
              </span>
              <span className="shimmer size-[50px] rounded-full" />
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
