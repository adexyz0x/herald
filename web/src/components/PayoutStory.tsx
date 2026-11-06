import { AnimatePresence, motion, useInView, useScroll, useSpring } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Route, Tier } from "../lib/herald";
import { ease } from "../lib/motion";
import { RankBadge, RouteTag, Seal } from "./chain";

/**
 * "How a payout travels": one creator's path through the three routes, told as a scroll story.
 * The text always stays readable; on wide screens a sticky card beside it changes color and
 * stamps its seal as each step reaches the middle of the screen. The card is illustration
 * only, so it is hidden from screen readers.
 */

type StepTone = "accent" | "gold" | "dao" | "paid";

interface Step {
  tone: StepTone;
  title: string;
  body: string;
  tier: Tier;
  points: number;
  deliverable: string;
  amount: string;
  route?: Route;
  /** When the seal lands, after the step's own detail has played. */
  stampMs: number;
  detail: (play: boolean) => ReactNode;
}

const ring: Record<StepTone, string> = { accent: "var(--accent)", gold: "var(--gold)", dao: "var(--dao)", paid: "var(--paid)" };
const wash: Record<StepTone, string> = { accent: "var(--accent-wash)", gold: "var(--gold-wash)", dao: "var(--dao-wash)", paid: "var(--paid-wash)" };
const deep: Record<StepTone, string> = { accent: "var(--stage-accent)", gold: "var(--stage-gold)", dao: "var(--stage-dao)", paid: "var(--stage-paid)" };

const STEPS: Step[] = [
  {
    tone: "accent",
    title: "A first thread gets a reviewer",
    body: "Dami is new to this DAO, so one reviewer the DAO picked opens the proof link and approves it. The payout lands right away.",
    tier: "Newcomer",
    points: 1,
    deliverable: "X thread",
    amount: "2",
    route: "Reviewer",
    stampMs: 450,
    detail: () => (
      <p className="flex items-center gap-2 text-[13px] text-ink-soft">
        <span className="flex size-5 items-center justify-center rounded-full bg-accent-wash text-accent-strong">
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        Kemi checked the proof and approved it
      </p>
    ),
  },
  {
    tone: "gold",
    title: "Three payouts later, it pays itself",
    body: "Dami is now Trusted. Rate-card work pays automatically after a short public window, and any reviewer can veto it if something's off.",
    tier: "Trusted",
    points: 4,
    deliverable: "X thread",
    amount: "2",
    route: "Auto",
    stampMs: 1500,
    detail: (play) => (
      <div>
        <p className="flex justify-between text-[13px] text-ink-soft">
          <span>Public window</span>
          <span className="font-data">3 min · no veto</span>
        </p>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sunk">
          <motion.span className="block h-full rounded-full bg-gold" initial={{ width: "0%" }} animate={{ width: play ? "100%" : "0%" }} transition={{ duration: 1.3, ease: "linear" }} />
        </span>
      </div>
    ),
  },
  {
    tone: "dao",
    title: "Big asks go to a vote",
    body: "A 25 NEAR launch video is more than one reviewer can approve. Herald writes the DAO proposal, the council votes, and the treasury pays.",
    tier: "Trusted",
    points: 5,
    deliverable: "Launch video",
    amount: "25",
    route: "Dao",
    stampMs: 1150,
    detail: (play) => (
      <div>
        <p className="flex justify-between text-[13px] text-ink-soft">
          <span>Council vote</span>
          <span className="font-data">2 of 2 yes</span>
        </p>
        <span className="mt-2 flex gap-1.5">
          {[0, 1].map((i) => (
            <span key={i} className="block h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
              <motion.span className="block h-full rounded-full bg-dao" initial={{ width: "0%" }} animate={{ width: play ? "100%" : "0%" }} transition={{ delay: 0.2 + i * 0.45, duration: 0.4, ease }} />
            </span>
          ))}
        </span>
      </div>
    ),
  },
  {
    tone: "paid",
    title: "The record keeps it honest",
    body: "Every payout adds a point with this DAO, and a veto takes points away. Trust earned here never unlocks automatic payouts anywhere else.",
    tier: "Trusted",
    points: 5,
    deliverable: "5 paid deliverables",
    amount: "33",
    stampMs: 0,
    detail: (play) => (
      <ul className="flex flex-col gap-2 text-[13px]">
        {(
          [
            ["+1", "X thread", "Reviewer"],
            ["+1", "X thread", "Auto"],
            ["+1", "Launch video", "Dao"],
          ] as const
        ).map(([delta, what, route], i) => (
          <motion.li
            key={i}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -8 }}
            animate={play ? { opacity: 1, x: 0 } : { opacity: 0, x: -8 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.3, ease }}
          >
            <span className="w-9 rounded-sm bg-paid-wash py-0.5 text-center font-data text-paid-ink">{delta}</span>
            <span className="flex-1 text-ink">{what}</span>
            <RouteTag route={route} />
          </motion.li>
        ))}
        <li className="mt-1 text-ink-faint">A veto would cost 3 points. Core comes after 10.</li>
      </ul>
    ),
  },
];

function StoryCard({ step, play, compact = false }: { step: Step; play: boolean; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-line bg-surface shadow-pop ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-paid-wash text-[15px] font-semibold text-paid-ink">DA</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-medium text-ink">Dami</span>
            <RankBadge tier={step.tier} size="sm" />
            <span className="font-data text-[12.5px] text-ink-faint">
              {step.points} {step.points === 1 ? "pt" : "pts"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {step.deliverable} · <span className="font-data text-ink">{step.amount}</span> NEAR{step.route ? "" : " earned"}
          </p>
          {step.route && (
            <p className="mt-1">
              <RouteTag route={step.route} />
            </p>
          )}
        </div>
        {step.route && <Seal route={step.route} size={compact ? 54 : 68} stamp={play} delayMs={step.stampMs} decorative />}
      </div>
      <div className="mt-4 border-t border-line pt-4">{step.detail(play)}</div>
    </div>
  );
}

/** The illustration area: a stage in a deep shade of the step being read, so the light card stands out on the page. */
function StageFrame({ step, index, children }: { step: Step; index: number; children: ReactNode }) {
  return (
    <div className="stage relative overflow-hidden rounded-xl p-4 shadow-pop transition-[background-color] duration-500 sm:p-8" style={{ backgroundColor: deep[step.tone] } as CSSProperties}>
      <p className="relative mb-4 flex items-center gap-2 font-data text-[12.5px] text-page">
        <span className="size-2 rounded-full bg-page" />
        Step {index + 1} of {STEPS.length}
        <span className="ml-auto flex gap-1">
          {STEPS.map((s, i) => (
            <span key={s.title} className={`h-1 w-5 rounded-full transition-colors duration-500 ${i <= index ? "bg-page" : "bg-page/25"}`} />
          ))}
        </span>
      </p>
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * Wide screens: one sticky stage. Each step's card is dealt onto it from a small deck, and the
 * deck behind holds one card for every step still to come.
 */
function StickyStage({ index }: { index: number }) {
  const step = STEPS[index];
  const remaining = STEPS.length - 1 - index;
  return (
    <StageFrame step={step} index={index}>
      <div className="relative isolate">
        {STEPS.slice(1).map((s, k) => (
          <motion.div
            key={s.title}
            className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card"
            style={{ zIndex: -1 - k, transformOrigin: "50% 100%" }}
            initial={false}
            animate={{ opacity: k < remaining ? 1 : 0, y: (k + 1) * 8, scale: 1 - (k + 1) * 0.04 }}
            transition={{ duration: 0.45, ease }}
          />
        ))}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 34, rotate: -2.5, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, rotate: 1.5, scale: 0.98, transition: { duration: 0.2, ease } }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            <StoryCard step={step} play />
          </motion.div>
        </AnimatePresence>
      </div>
    </StageFrame>
  );
}

function StepText({ step, index, active, onActive }: { step: Step; index: number; active: boolean; onActive: (index: number) => void }) {
  const ref = useRef<HTMLLIElement>(null);
  // A step becomes the current one when it crosses the middle of the screen.
  const centered = useInView(ref, { margin: "-45% 0px -45% 0px" });
  const seen = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  useEffect(() => {
    if (centered) onActive(index);
  }, [centered, index, onActive]);

  return (
    <li ref={ref} className="relative flex flex-col gap-5 pl-12 lg:min-h-[48vh] lg:justify-center">
      {/* The marker of the step being read glows in its tincture, and pings once as it lights. */}
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border-2 font-data text-[13px] transition-[border-color,color,background-color,box-shadow] duration-300 lg:top-1/2 lg:-translate-y-1/2"
        style={{
          borderColor: active ? ring[step.tone] : "var(--line-strong)",
          color: active ? "var(--ink)" : "var(--ink-faint)",
          backgroundColor: active ? wash[step.tone] : "var(--page)",
          boxShadow: active ? `0 0 0 5px color-mix(in srgb, ${ring[step.tone]} 15%, transparent), 0 0 24px color-mix(in srgb, ${ring[step.tone]} 40%, transparent)` : "none",
        }}
      >
        {active && (
          <motion.span
            className="absolute -inset-[2px] rounded-full border-2"
            style={{ borderColor: ring[step.tone] }}
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        )}
        {index + 1}
      </span>
      <div className="lg:-mt-1">
        <h3 className={`text-xl font-semibold transition-colors duration-300 ${active ? "text-ink" : "text-ink-soft"}`}>{step.title}</h3>
        <p className={`mt-2 max-w-[46ch] text-[16px] leading-relaxed transition-colors duration-300 ${active ? "text-ink-soft" : "text-ink-faint"}`}>{step.body}</p>
      </div>
      {/* On narrow screens each step carries its own card. It replays (seal and all) when it first scrolls into view. */}
      <div className="lg:hidden" aria-hidden="true">
        <StageFrame step={step} index={index}>
          <StoryCard key={seen ? "played" : "waiting"} step={step} play={seen} compact />
        </StageFrame>
      </div>
    </li>
  );
}

export function PayoutStory() {
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ["start 55%", "end 55%"] });
  // The path down the left fills with the reader, smoothed so it glides rather than jumps.
  const fill = useSpring(scrollYProgress, { stiffness: 160, damping: 30, restDelta: 0.001 });

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
      <ol ref={listRef} className="relative flex flex-col gap-12 lg:gap-0">
        <span aria-hidden="true" className="absolute top-4 bottom-4 left-[15px] w-[2px] rounded-full bg-line lg:top-[24vh] lg:bottom-[24vh]" />
        <motion.span
          aria-hidden="true"
          className="absolute top-4 bottom-4 left-[15px] w-[2px] origin-top rounded-full lg:top-[24vh] lg:bottom-[24vh]"
          style={{ scaleY: fill, background: "linear-gradient(var(--accent), var(--gold), var(--dao), var(--paid))" }}
        />
        {STEPS.map((step, i) => (
          <StepText key={step.title} step={step} index={i} active={active === i} onActive={setActive} />
        ))}
      </ol>
      <div className="hidden lg:block" aria-hidden="true">
        <div className="sticky top-[max(104px,calc(50vh_-_190px))]">
          <StickyStage index={active} />
        </div>
      </div>
    </div>
  );
}
