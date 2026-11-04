import { AnimatePresence, motion } from "motion/react";
import { useId } from "react";
import { useApp, useChainNow } from "../lib/app";
import { formatCountdown, formatDate, formatNear, formatRelative } from "../lib/format";
import type { Route, SubmissionStatus, Tier } from "../lib/herald";
import { ease, quick, stampSpring } from "../lib/motion";
import { href } from "../lib/router";

export function Near({ value, className = "" }: { value: string | bigint; className?: string }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      <span className="font-data">{formatNear(value)}</span> <span className="text-ink-faint">NEAR</span>
    </span>
  );
}

const avatarTones = [
  "bg-accent-wash text-accent-strong",
  "bg-gold-wash text-gold-ink",
  "bg-dao-wash text-dao-ink",
  "bg-paid-wash text-paid-ink",
  "bg-veto-wash text-veto-ink",
];

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({ accountId, size = 32 }: { accountId: string; size?: number }) {
  const { displayName } = useApp();
  const name = displayName(accountId);
  const initials = name.replace(/\.(testnet|near)$/, "").slice(0, 2);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold uppercase ${avatarTones[hash(accountId) % avatarTones.length]}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}

export function AccountLink({ accountId, showId = false }: { accountId: string; showId?: boolean }) {
  const { displayName, config } = useApp();
  const name = displayName(accountId);
  const isDao = accountId === config.dao;
  const label = (
    <>
      <span className="font-medium text-ink transition-colors">{name}</span>
      {showId && name !== accountId && <span className="font-data text-[12px] text-ink-faint">{accountId}</span>}
    </>
  );
  if (isDao) return <span className="inline-flex flex-col leading-tight">{label}</span>;
  return (
    <a href={href.creator(accountId)} className="inline-flex flex-col leading-tight hover:[&>span:first-child]:text-accent">
      {label}
    </a>
  );
}

/** Each route owns a color: bronze for automatic, slate for a reviewer, aubergine for the DAO. */
const routeStyle: Record<Route, { ring: string; ink: string; wash: string; label: string; around: string }> = {
  Auto: { ring: "var(--gold)", ink: "var(--gold-ink)", wash: "var(--gold-wash)", label: "Auto", around: "PAID · AUTO APPROVAL · PAID · AUTO APPROVAL · " },
  Reviewer: { ring: "var(--accent)", ink: "var(--accent-strong)", wash: "var(--accent-wash)", label: "Reviewer", around: "PAID · REVIEWER APPROVAL · PAID · REVIEWER · " },
  Dao: { ring: "var(--dao)", ink: "var(--dao-ink)", wash: "var(--dao-wash)", label: "DAO vote", around: "PAID · DAO VOTE · PAID · DAO VOTE · PAID · DAO · " },
};

export function RouteIcon({ route }: { route: Route }) {
  if (route === "Auto") return <path d="M13 2 4 14h7l-1 8 9-12h-7z" />;
  if (route === "Reviewer")
    return (
      <>
        <circle cx="9" cy="7" r="4" />
        <path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4" />
      </>
    );
  return <path d="M3 10h18L12 4 3 10Zm2 0v8m4.5-8v8m5-8v8M19 10v8M3 20h18" />;
}

/**
 * Herald's signature element: every payout is stamped with the route that approved it,
 * like the seal on a herald's message. When `stamp` is set it lands with a spring and
 * leaves a ring of ink.
 */
export function Seal({
  route,
  size = 72,
  stamp = false,
  delayMs = 0,
  decorative = false,
}: {
  route: Route;
  size?: number;
  stamp?: boolean;
  delayMs?: number;
  /** Hide from assistive tech when nearby text already says the same thing. */
  decorative?: boolean;
}) {
  const style = routeStyle[route];
  const id = `seal-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const delay = delayMs / 1000;
  return (
    <motion.svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      overflow="visible"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Paid by ${style.label.toLowerCase()} approval`}
      className="seal shrink-0"
      initial={stamp ? { opacity: 0, scale: 1.5, rotate: -24 } : false}
      animate={{ opacity: 1, scale: 1, rotate: -8 }}
      transition={{ ...stampSpring, delay, opacity: { duration: 0.12, delay } }}
    >
      <defs>
        <path id={id} d="M50 50 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0" />
      </defs>
      {stamp && (
        <motion.circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={style.ring}
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: [0, 0.6, 0], scale: [0.94, 1.02, 1.42] }}
          transition={{ delay: delay + 0.14, duration: 0.75, ease }}
        />
      )}
      <circle cx="50" cy="50" r="46" fill="var(--surface)" stroke={style.ring} strokeWidth="3" />
      <circle cx="50" cy="50" r="40" fill={style.wash} />
      <circle cx="50" cy="50" r="27" fill="var(--surface)" stroke={style.ring} strokeWidth="1" strokeDasharray="2.5 2.5" />
      <g className="seal-ring">
        <text fill={style.ink} fontSize="8.2" fontFamily="var(--font-data)" letterSpacing="1.2">
          <textPath href={`#${id}`}>{style.around}</textPath>
        </text>
      </g>
      <svg x="36" y="36" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={style.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <RouteIcon route={route} />
      </svg>
    </motion.svg>
  );
}

type StampTone = "veto" | "dao" | "ink";
const stampColor: Record<StampTone, string> = { veto: "var(--veto)", dao: "var(--dao)", ink: "var(--ink-faint)" };

/**
 * A decision, stamped like the seal on a payout: VETOED in oxblood, PASSED in aubergine, REJECTED in
 * gray. With `stamp` it slams down and leaves a ring of ink. It is decorative, since a chip or
 * text nearby always says the same thing in words.
 */
export function Stamp({ label, tone, stamp = false, delayMs = 0 }: { label: string; tone: StampTone; stamp?: boolean; delayMs?: number }) {
  const color = stampColor[tone];
  const delay = delayMs / 1000;
  return (
    <motion.span
      aria-hidden="true"
      className="relative inline-flex shrink-0 rounded-[6px] border-2 p-[2px] select-none"
      style={{ borderColor: color, color }}
      initial={stamp ? { opacity: 0, scale: 1.9, rotate: -18 } : false}
      animate={{ opacity: 1, scale: 1, rotate: -7 }}
      transition={{ ...stampSpring, delay, opacity: { duration: 0.1, delay } }}
    >
      {stamp && (
        <motion.span
          className="absolute -inset-[3px] rounded-[8px] border-2"
          style={{ borderColor: color }}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.92, 1.04, 1.3] }}
          transition={{ delay: delay + 0.12, duration: 0.7, ease }}
        />
      )}
      <span
        className="rounded-[3px] border py-[4px] pr-[0.4rem] pl-2 font-data text-[11.5px] leading-none font-semibold tracking-[0.18em] uppercase"
        style={{ borderColor: `color-mix(in srgb, ${color} 55%, transparent)` }}
      >
        {label}
      </span>
    </motion.span>
  );
}

export function RouteTag({ route }: { route: Route }) {
  const style = routeStyle[route];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft">
      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke={style.ring} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <RouteIcon route={route} />
      </svg>
      {style.label}
    </span>
  );
}

export function Countdown({ endsAtMs }: { endsAtMs: number }) {
  const now = useChainNow();
  const left = endsAtMs - now;
  if (left <= 0) return <span>ready to pay</span>;
  const urgent = left < 10_000;
  return (
    <motion.span
      className="font-data"
      aria-label={`${Math.ceil(left / 1000)} seconds left`}
      animate={urgent ? { opacity: [1, 0.45, 1] } : { opacity: 1 }}
      transition={urgent ? { duration: 1, repeat: Infinity } : quick}
    >
      {formatCountdown(left)}
    </motion.span>
  );
}

/** "Pays in 02:41", then "Ready to pay" once the public window has closed. */
function PaysIn({ endsAtMs }: { endsAtMs: number }) {
  const now = useChainNow();
  if (endsAtMs <= now) return <>Ready to pay</>;
  return (
    <>
      Pays in <Countdown endsAtMs={endsAtMs} />
    </>
  );
}

const chip: Record<SubmissionStatus, { text: string; cls: string }> = {
  Pending: { text: "Waiting for review", cls: "bg-accent-wash text-accent-strong" },
  Challenge: { text: "Pays automatically", cls: "bg-gold-wash text-gold-ink" },
  AwaitingDao: { text: "Waiting for DAO vote", cls: "bg-dao-wash text-dao-ink" },
  Approved: { text: "Payout to retry", cls: "border border-gold text-gold-ink" },
  Paid: { text: "Paid", cls: "bg-paid-wash text-paid-ink" },
  Rejected: { text: "Rejected", cls: "bg-sunk text-ink-soft" },
  Vetoed: { text: "Vetoed", cls: "bg-veto-wash text-veto-ink" },
};

/** Status of a submission. When it changes, the old chip fades out and the new one rises in. */
export function StatusChip({ status, endsAtMs }: { status: SubmissionStatus; endsAtMs?: number | null }) {
  const c = chip[status];
  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        key={status}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={quick}
        className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[12.5px] font-medium whitespace-nowrap ${c.cls}`}
      >
        {status === "Challenge" && endsAtMs != null ? <PaysIn endsAtMs={endsAtMs} /> : c.text}
      </motion.span>
    </AnimatePresence>
  );
}

const tierChevrons: Record<Tier, number> = { Newcomer: 1, Trusted: 2, Core: 3 };

/** Rank as stacked chevrons. Core, the top rank, is struck in bronze. */
export function RankBadge({ tier, size = "md" }: { tier: Tier; size?: "sm" | "md" }) {
  const count = tierChevrons[tier];
  const dim = size === "sm" ? "size-3" : "size-4";
  const lit = tier === "Core" ? "text-gold" : "text-accent";
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${size === "sm" ? "text-[12.5px]" : "text-sm"} text-ink`}>
      <span className="inline-flex flex-col -space-y-1.5" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <svg key={i} viewBox="0 0 24 24" className={`${dim} ${3 - i <= count ? lit : "text-line-strong"}`} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 15 7-7 7 7" />
          </svg>
        ))}
      </span>
      {tier}
    </span>
  );
}

/** Budget as one bar: paid in moss, reserved in bronze, the rest empty. Fills in when it appears. */
export function BudgetBar({ budget, paid, reserved, compact = false }: { budget: string; paid: string; reserved: string; compact?: boolean }) {
  const total = BigInt(budget);
  const pct = (part: string) => (total > 0n ? Number((BigInt(part) * 10000n) / total) / 100 : 0);
  const available = total - BigInt(paid) - BigInt(reserved);
  return (
    <div className="flex flex-col gap-2.5">
      <div
        className={`flex w-full overflow-hidden rounded-full bg-sunk ${compact ? "h-1.5" : "h-2.5"}`}
        role="img"
        aria-label={`${formatNear(paid)} NEAR paid, ${formatNear(reserved)} NEAR reserved, ${formatNear(available)} NEAR available of ${formatNear(budget)} NEAR`}
      >
        <motion.span className="h-full bg-paid" initial={{ width: 0 }} animate={{ width: `${pct(paid)}%` }} transition={{ duration: 0.9, ease }} />
        <motion.span className="h-full bg-gold" initial={{ width: 0 }} animate={{ width: `${pct(reserved)}%` }} transition={{ duration: 0.9, ease, delay: 0.12 }} />
      </div>
      {!compact && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          <Legend tone="bg-paid" label="Paid" value={paid} />
          <Legend tone="bg-gold" label="Reserved" value={reserved} />
          <Legend tone="bg-sunk border border-line-strong" label="Available" value={available.toString()} />
          <div className="flex items-center gap-1.5 text-ink-faint">
            <dt>of</dt>
            <dd>
              <Near value={budget} />
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function Legend({ tone, label, value }: { tone: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${tone}`} aria-hidden="true" />
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-ink">
        <Near value={value} />
      </dd>
    </div>
  );
}

/** A moment on chain, said relative to the chain's clock, with the exact time on hover. */
export function When({ ms }: { ms: number }) {
  const now = useChainNow(15_000);
  return (
    <time dateTime={new Date(ms).toISOString()} title={formatDate(ms)} className="font-data text-[12.5px] text-ink-faint">
      {formatRelative(ms, now)}
    </time>
  );
}
