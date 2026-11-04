import {
  AnimatePresence,
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from "motion/react";
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { AccountLink, Avatar, BudgetBar, Near, RankBadge, RouteIcon, Seal, When } from "../components/chain";
import { PayoutStory } from "../components/PayoutStory";
import { RoutePlayground } from "../components/RoutePlayground";
import { LiveDot } from "../components/Shell";
import { EmptyState, LinkButton } from "../components/ui";
import { useApp, useChainData, useChainNow } from "../lib/app";
import { formatDuration, formatNear, formatRelative, plural } from "../lib/format";
import { tierFor, type Campaign, type Route, type Submission, type Tier } from "../lib/herald";
import { useProgram } from "../lib/hooks";
import { Figure, ease, formatNearNumber, nearNumber, rise, stagger } from "../lib/motion";
import { href } from "../lib/router";

/** The headline, line by line, so each line can rise out of its own mask. */
const HEADLINE = ["Pay the people", "who carry your", "message."];

const lineUp: Variants = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.8, ease } },
};

export function Home() {
  const { herald, config } = useApp();
  const reduce = useReducedMotion();
  const stats = useChainData(() => herald.stats(), []);
  const program = useProgram();
  const playRef = useRef<HTMLElement>(null);

  const campaigns = program.data?.campaigns ?? [];
  const lead = campaigns.find((c) => c.status === "Active");
  const recentPaid = (program.data?.submissions ?? [])
    .filter((s) => s.status === "Paid" && s.paid_at_ms)
    .sort((a, b) => (b.paid_at_ms ?? 0) - (a.paid_at_ms ?? 0))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-20 sm:gap-24">
      <section className="relative isolate overflow-x-clip pt-2 sm:pt-6 lg:pt-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <motion.div className="flex flex-col gap-7" variants={stagger(0.08)} initial="hidden" animate="show">
            <h1 className="font-display text-[clamp(46px,6.2vw,80px)] leading-[0.98] font-normal tracking-[-0.025em] text-ink">
              {HEADLINE.map((line) => (
                <span key={line} className="block overflow-hidden pb-[0.08em]">
                  <motion.span className="block" variants={lineUp}>
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p variants={rise} className="max-w-[50ch] text-[17px] leading-relaxed text-ink-soft">
              Herald runs ambassador and creator payouts from your DAO's treasury. Proven creators are paid automatically, newcomers get one reviewer, and big asks go to a vote. Every payout is public, and every bit of trust is earned.
            </motion.p>
            <motion.div variants={rise} className="flex flex-wrap items-center gap-3">
              {lead ? (
                <LinkButton href={href.campaign(lead.id)} variant="primary" size="lg" className="foil">
                  Open {lead.title}
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </LinkButton>
              ) : (
                // Holds the button's place while campaigns load, so the row doesn't jump.
                !program.data && <span aria-hidden="true" className="shimmer h-12 w-64 rounded-md" />
              )}
              <button
                type="button"
                onClick={() => playRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" })}
                className="inline-flex h-12 items-center rounded-md border border-line-strong bg-surface px-6 text-[15px] font-medium text-ink shadow-card transition-[border-color,transform] duration-150 hover:border-ink-faint active:scale-[0.97]"
              >
                How payouts are approved
              </button>
            </motion.div>
            <motion.p variants={rise} className="flex items-center gap-2.5 text-[13px] text-ink-faint">
              <LiveDot />
              {config.network === "local" ? "Running on a private local chain with demo data." : "Live on NEAR testnet. Every payout here is an on-chain transaction."}
            </motion.p>
          </motion.div>

          <ReceiptStage items={recentPaid} campaigns={campaigns} loading={!program.data} />
        </div>
        <ChainRibbon campaigns={program.data?.campaigns} submissions={program.data?.submissions} />
      </section>

      <section aria-label="Program totals" className="-mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line shadow-card sm:-mt-8 sm:grid-cols-4">
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

      {(lead || !program.data) && (
        <section ref={playRef} className="scroll-mt-28">
          <div className="max-w-[640px]">
            <h2 className="font-display text-[clamp(32px,3.8vw,48px)] leading-[1.05] tracking-[-0.015em]">Who approves this payout?</h2>
            <p className="mt-3 text-[16px] text-ink-soft">
              Pick what a creator made and how far they've come. The answer comes from the live rules of {lead ? lead.title : "the campaign"}, the same ones the contract enforces.
            </p>
          </div>
          <div className="mt-10">{lead ? <RoutePlayground campaign={lead} /> : <div aria-hidden="true" className="shimmer h-[380px] rounded-xl" />}</div>
        </section>
      )}

      <section>
        <div className="max-w-[640px]">
          <h2 className="font-display text-[clamp(32px,3.8vw,48px)] leading-[1.05] tracking-[-0.015em]">How a payout travels</h2>
          <p className="mt-3 text-[16px] text-ink-soft">
            Follow one creator through all three routes. The DAO funds a campaign once, and every payout after that takes the route the creator has earned.
          </p>
        </div>
        <div className="mt-12">
          <PayoutStory />
        </div>
      </section>

      <section>
        <h2 className="font-display text-[clamp(32px,3.8vw,48px)] leading-[1.05] tracking-[-0.015em]">Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No campaigns yet" body="A council member launches the first one from the Council page. The DAO votes, and the budget moves in." />
          </div>
        ) : (
          <ul className="mt-6 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
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

/** True on devices with a mouse or trackpad, where the receipt can follow the pointer. */
function useFinePointer(): boolean {
  const query = "(hover: hover) and (pointer: fine)";
  const [fine, setFine] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setFine(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return fine;
}

/**
 * The receipt on its engraved ground. With a mouse, the card leans toward the pointer and the
 * engraving drifts the other way, so it feels like paper held up to the light. Visitors who ask
 * for less motion, and touch screens, get a still card.
 */
function ReceiptStage({ items, campaigns, loading }: { items: Submission[]; campaigns: Campaign[]; loading: boolean }) {
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const follow = fine && !reduce;
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const spring = { stiffness: 140, damping: 20, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [5, -5]), spring);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-7, 7]), spring);
  const driftX = useSpring(useTransform(px, [-0.5, 0.5], [16, -16]), spring);
  const driftY = useSpring(useTransform(py, [-0.5, 0.5], [12, -12]), spring);
  const glowX = useTransform(px, [-0.5, 0.5], [0, 100]);
  const glowY = useTransform(py, [-0.5, 0.5], [0, 100]);
  const glow = useMotionTemplate`radial-gradient(420px circle at ${glowX}% ${glowY}%, color-mix(in srgb, var(--gold) 13%, transparent), transparent 65%)`;
  const [lit, setLit] = useState(false);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!follow) return;
    const box = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - box.left) / box.width - 0.5);
    py.set((e.clientY - box.top) / box.height - 0.5);
    setLit(true);
  };
  const leave = () => {
    px.set(0);
    py.set(0);
    setLit(false);
  };

  return (
    <div className="relative mx-auto w-full max-w-[480px] py-4 lg:py-10" onPointerMove={move} onPointerLeave={leave}>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[min(680px,128vw)] -translate-x-1/2 -translate-y-1/2"
        style={{ x: driftX, y: driftY }}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 1.4, ease }}
      >
        <Guilloche />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.8, ease }}
        style={{ rotateX, rotateY, transformPerspective: 1100 }}
      >
        <ReceiptCard items={items} campaigns={campaigns} loading={loading} glow={follow && lit ? glow : undefined} />
      </motion.div>
    </div>
  );
}

/** One wave around a ring. Copies of it, each turned a little, weave like a banknote's engraving. */
function ringWave(radius: number, depth: number, waves: number): string {
  const steps = waves * 12;
  let d = "";
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = radius + depth * Math.sin(waves * t);
    d += `${i ? "L" : "M"}${(r * Math.cos(t)).toFixed(2)} ${(r * Math.sin(t)).toFixed(2)}`;
  }
  return `${d}Z`;
}

const BANDS = [
  { radius: 262, depth: 13, waves: 40, strands: 9, opacity: 0.5 },
  { radius: 196, depth: 22, waves: 24, strands: 8, opacity: 0.42 },
  { radius: 124, depth: 17, waves: 14, strands: 7, opacity: 0.34 },
].map((band) => ({ ...band, d: ringWave(band.radius, band.depth, band.waves) }));

/** Guilloché in bronze, turning about once every four minutes. Decoration only. */
function Guilloche() {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg
      viewBox="-300 -300 600 600"
      className="guilloche-turn size-full"
      fill="none"
      stroke="var(--gold)"
      strokeWidth="0.6"
      style={{ maskImage: "radial-gradient(closest-side, #000 70%, transparent)" }}
    >
      <circle r="291" strokeOpacity="0.55" />
      <circle r="285" strokeOpacity="0.3" />
      {BANDS.map((band, i) => (
        <g key={band.radius} strokeOpacity={band.opacity}>
          <path id={`${id}-${i}`} d={band.d} />
          {Array.from({ length: band.strands - 1 }, (_, k) => (
            <use key={k} href={`#${id}-${i}`} transform={`rotate(${(360 / band.waves / band.strands) * (k + 1)})`} />
          ))}
        </g>
      ))}
      <circle r="88" strokeOpacity="0.3" />
    </svg>
  );
}

/** How long each receipt stays up before the next one. */
const DWELL_MS = 4500;

/** How the payout was approved, in a sentence. */
function receiptLine(sub: Submission, campaign: Campaign | undefined, name: (accountId: string) => string): string {
  if (sub.route === "Auto") {
    return campaign ? `Paid automatically after ${formatDuration(campaign.rules.challenge_period_sec)} in public with no veto.` : "Paid automatically after its public window, with no veto.";
  }
  if (sub.route === "Dao") return "Approved by a DAO vote, then paid from the campaign budget.";
  return sub.decided_by ? `Approved by ${name(sub.decided_by)}, a campaign reviewer, and paid at once.` : "Approved by a campaign reviewer and paid at once.";
}

/**
 * The latest payouts, one receipt at a time. Each one is stamped with the seal of the route that
 * approved it. They turn over on their own, stop while the pointer or focus is on the card, and
 * can be paused or picked from the bars. With reduced motion they don't turn over by themselves.
 */
function ReceiptCard({ items, campaigns, loading, glow }: { items: Submission[]; campaigns: Campaign[]; loading: boolean; glow?: MotionValue<string> }) {
  const { config, displayName } = useApp();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const progress = useMotionValue(0);
  const mountedAt = useRef(performance.now());
  const count = items.length;
  const active = count > 0 ? index % count : 0;
  const sub = items[active];
  const campaign = sub ? campaigns.find((c) => c.id === sub.campaign_id) : undefined;
  const newest = items[0]?.id;

  // A new payout goes straight to the front.
  useEffect(() => {
    setIndex(0);
    progress.set(0);
  }, [newest, progress]);

  useAnimationFrame((_, delta) => {
    if (!playing || hovering || focused || count < 2) return;
    const next = progress.get() + delta / DWELL_MS;
    if (next < 1) {
      progress.set(next);
    } else {
      progress.set(0);
      setIndex((i) => (i + 1) % count);
    }
  });

  const show = (i: number) => {
    setIndex(i);
    progress.set(0);
  };
  // The first seal waits for the card to arrive; later ones land as soon as their receipt shows.
  const stampDelay = performance.now() - mountedAt.current < 1200 ? 750 : 150;

  return (
    <section
      aria-label="Latest payouts"
      className="receipt-edge relative overflow-hidden rounded-xl shadow-pop"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
    >
      {glow && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: glow }} />}
      <header className="relative flex items-center justify-between px-6 pt-5 pb-4 sm:px-7">
        <h2 className="text-[13px] font-semibold text-ink-soft">Payout receipt</h2>
        {sub && <span className="font-data text-[12px] text-ink-faint">No. {String(sub.id).padStart(4, "0")}</span>}
      </header>
      <div aria-hidden="true" className="relative mx-6 h-px opacity-80 sm:mx-7" style={{ background: "var(--gilt)" }} />
      <div className="relative min-h-[262px] px-6 pt-6 pb-6 sm:px-7">
        {loading ? (
          <ReceiptSkeleton />
        ) : !sub ? (
          <p className="text-sm text-ink-soft">No payouts yet. The first approved deliverable will be stamped here.</p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={sub.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.16, ease } }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar accountId={sub.creator} size={42} />
                  <div className="min-w-0">
                    <AccountLink accountId={sub.creator} />
                    <p className="truncate text-[13px] text-ink-soft">{sub.custom && sub.note ? sub.note : sub.deliverable}</p>
                  </div>
                </div>
                <Seal route={sub.route} size={76} stamp delayMs={stampDelay} />
              </div>
              <p className="mt-5 flex items-baseline gap-2.5">
                <span className="font-display text-[clamp(50px,5.6vw,66px)] leading-none tracking-[-0.02em] text-ink">{formatNear(sub.amount)}</span>
                <span className="text-[14px] font-medium text-ink-faint">NEAR</span>
              </p>
              <p className="mt-4 min-h-[3.25em] text-[14.5px] leading-relaxed text-ink-soft">{receiptLine(sub, campaign, displayName)}</p>
              <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-faint">
                <span className="sr-only">Rank when submitted:</span>
                <RankBadge tier={sub.tier_at_submit} size="sm" />
                {campaign && (
                  <>
                    <span aria-hidden="true">·</span>
                    <a href={href.campaign(campaign.id)} className="transition-colors hover:text-accent">
                      {campaign.title}
                    </a>
                  </>
                )}
                {sub.paid_at_ms && (
                  <>
                    <span aria-hidden="true">·</span>
                    <When ms={sub.paid_at_ms} />
                  </>
                )}
              </p>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
      <footer className="relative flex items-center justify-between gap-3 border-t border-line px-6 py-2.5 sm:px-7">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-faint">
          <LiveDot />
          <span className="truncate">{config.daoName}</span>
        </span>
        {count > 1 && (
          <div className="flex items-center">
            <div role="group" aria-label="Choose a payout" className="flex items-center">
              {items.map((s, i) => {
                const on = i === active;
                return (
                  <button key={s.id} type="button" onClick={() => show(i)} aria-label={`Payout ${i + 1} of ${count}`} aria-current={on || undefined} className="group flex h-8 items-center px-1">
                    <span className={`relative block h-[3px] overflow-hidden rounded-full bg-line-strong transition-[width,background-color] duration-300 ${on ? "w-7" : "w-3 group-hover:bg-ink-faint"}`}>
                      {on && <motion.span className="absolute inset-0 origin-left rounded-full bg-ink" style={{ scaleX: playing ? progress : 1 }} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause the payouts" : "Play the payouts"}
              className="ml-1 flex size-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                {playing ? <path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
              </svg>
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}

function ReceiptSkeleton() {
  return (
    <div aria-label="Loading payouts" role="img">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="shimmer size-[42px] rounded-full" />
          <span className="flex flex-col gap-1.5">
            <span className="shimmer h-3 w-24 rounded" />
            <span className="shimmer h-2.5 w-32 rounded" />
          </span>
        </div>
        <span className="shimmer size-[76px] rounded-full" />
      </div>
      <span className="shimmer mt-5 block h-14 w-40 rounded" />
      <span className="shimmer mt-5 block h-3 w-full max-w-[320px] rounded" />
      <span className="shimmer mt-2 block h-3 w-52 rounded" />
    </div>
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

/** Each route keeps its color in the ribbon's words. */
const ribbonTint: Record<Route, string> = { Auto: "var(--gold-ink)", Reviewer: "var(--accent)", Dao: "var(--dao)" };

/** `repeat` marks a copy that only fills out the loop: it is skipped by assistive tech and focus. */
function RibbonItem({ event, now, repeat = false }: { event: ChainEvent; now: number; repeat?: boolean }) {
  const { displayName } = useApp();
  const name = (accountId: string) => (
    <a href={href.creator(accountId)} className="font-semibold text-ink underline-offset-2 hover:underline">
      {displayName(accountId)}
    </a>
  );
  let tint = "var(--ink-soft)";
  let icon: ReactNode;
  let text: ReactNode;
  if (event.kind === "paid") {
    const { sub } = event;
    tint = ribbonTint[sub.route];
    icon = <RouteIcon route={sub.route} />;
    const how = sub.route === "Auto" ? "automatically" : sub.route === "Dao" ? "by DAO vote" : sub.decided_by ? `approved by ${displayName(sub.decided_by)}` : "by a reviewer";
    text = (
      <>
        {name(sub.creator)} was paid <span className="font-data text-ink">{formatNear(sub.amount)}</span> NEAR <span style={{ color: tint }}>{how}</span>
      </>
    );
  } else if (event.kind === "vetoed") {
    tint = "var(--veto-ink)";
    icon = <path d="M6 6l12 12M18 6 6 18" />;
    text = (
      <>
        {name(event.sub.creator)}'s {event.sub.deliverable.toLowerCase()} <span style={{ color: tint }}>was vetoed</span>
      </>
    );
  } else if (event.kind === "tier") {
    tint = event.tier === "Core" ? "var(--gold-ink)" : "var(--accent)";
    icon = <path d="m5 15 7-7 7 7" />;
    text = (
      <>
        {name(event.creator)} <span style={{ color: tint }}>earned {event.tier}</span>
      </>
    );
  } else {
    const { campaign } = event;
    tint = "var(--dao)";
    icon = <path d="M3 10h18L12 4 3 10Zm2 0v8m4.5-8v8m5-8v8M19 10v8M3 20h18" />;
    text = (
      <>
        <a href={href.campaign(campaign.id)} className="font-semibold text-ink underline-offset-2 hover:underline">
          {campaign.title}
        </a>{" "}
        <span style={{ color: tint }}>launched by DAO vote</span> with <span className="font-data text-ink">{formatNear(campaign.budget)}</span> NEAR
      </>
    );
  }
  return (
    <li className="flex shrink-0 items-center gap-2.5 pr-7 text-[13.5px] whitespace-nowrap text-ink-soft" aria-hidden={repeat || undefined} inert={repeat || undefined}>
      <span className="flex size-6 items-center justify-center rounded-full bg-surface ring-1 ring-line" style={{ color: tint }} aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <span>{text}</span>
      <time dateTime={new Date(event.at).toISOString()} className="font-data text-[12px] text-ink-faint">
        {formatRelative(event.at, now)}
      </time>
      {/* A small bronze lozenge between events. */}
      <span aria-hidden="true" className="ml-5 size-[5px] rotate-45 bg-gold/70" />
    </li>
  );
}

/**
 * A ribbon under the hero that proclaims what the program has done on chain. It glides past and
 * stops while the pointer or keyboard focus is on it. The second copy, there only to make the
 * loop seamless, is hidden from assistive tech and can't be focused. While the program loads, the
 * ribbon keeps its height so the page doesn't shift.
 */
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
    <div className="mt-12 flex items-center gap-4 border-y border-line py-4 lg:mt-14">
      <p className="flex shrink-0 items-center gap-2 text-[12.5px] font-medium text-ink">
        <svg viewBox="0 0 24 24" className="size-4 text-gold" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <div className="flex flex-col gap-2.5 bg-surface px-5 py-5">
      <span className="flex items-center gap-2 text-[13px] text-ink-faint">
        <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
        {label}
      </span>
      <span className="font-display text-[30px] leading-none tracking-[-0.01em] text-ink sm:text-[36px]">{children}</span>
    </div>
  );
}
