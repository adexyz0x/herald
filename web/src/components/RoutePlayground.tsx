import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import { formatDuration, formatNear, plural, toNear } from "../lib/format";
import { autoLimit, previewRoute, type Campaign, type Route, type Tier } from "../lib/herald";
import { ease, glide, quick } from "../lib/motion";
import { RouteIcon } from "./chain";
import { Segmented } from "./ui";

const TIERS = [
  ["Newcomer", "Newcomer"],
  ["Trusted", "Trusted"],
  ["Core", "Core"],
] as const;

/** Each route keeps its color: bronze for automatic, slate for a reviewer, aubergine for the DAO. */
const LANES: { route: Route; title: string; ring: string; ink: string; wash: string }[] = [
  { route: "Auto", title: "Paid automatically", ring: "var(--gold)", ink: "var(--gold-ink)", wash: "var(--gold-wash)" },
  { route: "Reviewer", title: "One reviewer approves", ring: "var(--accent)", ink: "var(--accent-strong)", wash: "var(--accent-wash)" },
  { route: "Dao", title: "The DAO votes", ring: "var(--dao)", ink: "var(--dao-ink)", wash: "var(--dao-wash)" },
];

/** The "Something else" choice: a custom ask instead of a rate-card item. */
const CUSTOM = -1;

/**
 * "Who approves this payout?": pick what a creator made and their rank, and the payout moves to
 * the route the contract would take, under the campaign's live rules (previewRoute mirrors the
 * contract). The sentence under the lanes says why, and is read out when it changes.
 */
export function RoutePlayground({ campaign }: { campaign: Campaign }) {
  const { rules, rate_card: rateCard } = campaign;
  const id = useId();
  const [choice, setChoice] = useState(rateCard.length > 0 ? 0 : CUSTOM);
  const [ask, setAsk] = useState(12);
  const [tier, setTier] = useState<Tier>("Trusted");
  const custom = choice === CUSTOM || !rateCard[choice];
  const amount = custom ? BigInt(toNear(ask)) : BigInt(rateCard[choice].amount);
  const route = previewRoute(rules, tier, amount, custom);

  const laneRule: Record<Route, string> = {
    Auto: `Rate-card work from Trusted creators up to ${formatNear(rules.auto_limit_trusted)} NEAR, and Core up to ${formatNear(rules.auto_limit_core)}.`,
    Reviewer: `Everything else up to ${formatNear(rules.reviewer_limit)} NEAR, including all newcomer work.`,
    Dao: `Anything over ${formatNear(rules.reviewer_limit)} NEAR.`,
  };
  const tierHint: Record<Tier, string> = {
    Newcomer: `Fewer than ${plural(rules.trusted_after, "paid deliverable")} so far.`,
    Trusted: `${plural(rules.trusted_after, "paid deliverable")} or more.`,
    Core: `${plural(rules.core_after, "paid deliverable")} or more.`,
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10">
      <div className="flex flex-col gap-8 rounded-xl border border-line bg-surface p-5 shadow-card sm:p-7">
        <fieldset>
          <legend className="text-[14px] font-semibold text-ink">What did they make?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {rateCard.map((item, i) => (
              <Choice key={item.name} group={id} selected={!custom && choice === i} onSelect={() => setChoice(i)} label={item.name} amount={`${formatNear(item.amount)} NEAR`} />
            ))}
            <Choice group={id} selected={custom} onSelect={() => setChoice(CUSTOM)} label="Something else" />
          </div>
          <AnimatePresence initial={false}>
            {custom && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={quick} className="overflow-hidden">
                <div className="flex flex-col gap-2 pt-5">
                  <label htmlFor={`${id}-ask`} className="flex items-baseline justify-between gap-3 text-[13px] text-ink-soft">
                    How much are they asking for?
                    <output htmlFor={`${id}-ask`} className="font-data text-[14px] text-ink">
                      {formatNear(toNear(ask))} NEAR
                    </output>
                  </label>
                  <input
                    id={`${id}-ask`}
                    type="range"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={ask}
                    onChange={(e) => setAsk(Number(e.target.value))}
                    aria-valuetext={`${formatNear(toNear(ask))} NEAR`}
                    className="w-full accent-gold"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </fieldset>
        <div>
          <p className="text-[14px] font-semibold text-ink">How far have they come?</p>
          <div className="mt-3 w-fit">
            <Segmented label="Creator rank" options={TIERS} value={tier} onChange={setTier} />
          </div>
          <p className="mt-2.5 text-[12.5px] text-ink-faint">{tierHint[tier]}</p>
        </div>
      </div>

      <div>
        <ol aria-label="Routes" className="flex flex-col gap-2.5">
          {LANES.map((lane) => {
            const active = lane.route === route;
            return (
              <li key={lane.route} aria-current={active || undefined} className="relative rounded-lg border border-line bg-surface">
                {active && (
                  <motion.span
                    layoutId={`${id}-lane`}
                    aria-hidden="true"
                    className="absolute -inset-px rounded-lg border shadow-card"
                    style={{ background: lane.wash, borderColor: lane.ring }}
                    transition={glide}
                  />
                )}
                <div className="relative flex items-center gap-4 px-4 py-4 sm:px-5">
                  <motion.span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full border"
                    style={{ color: lane.ink, borderColor: active ? lane.ring : "var(--line-strong)", background: active ? "var(--surface)" : "transparent" }}
                    animate={{ scale: active ? 1.06 : 1 }}
                    transition={glide}
                  >
                    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <RouteIcon route={lane.route} />
                    </svg>
                  </motion.span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink">{lane.title}</p>
                    <p className="mt-0.5 text-[13px] text-ink-soft">{laneRule[lane.route]}</p>
                  </div>
                  {active && (
                    <motion.span
                      layoutId={`${id}-token`}
                      transition={glide}
                      className="receipt-edge flex shrink-0 items-baseline gap-1 rounded-md px-2.5 py-1.5 shadow-card"
                    >
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={amount.toString()}
                          className="font-display text-[19px] leading-none text-ink"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2, ease }}
                        >
                          {formatNear(amount)}
                        </motion.span>
                      </AnimatePresence>
                      <span className="text-[11.5px] font-medium text-ink-faint">NEAR</span>
                    </motion.span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p aria-live="polite" className="mt-5 max-w-[60ch] text-[15px] leading-relaxed text-ink">
          {reason(campaign, tier, amount, custom, route)}
        </p>
      </div>
    </div>
  );
}

/** One deliverable to pick. The selection glides between choices, like the rank switch. */
function Choice({ group, selected, onSelect, label, amount }: { group: string; selected: boolean; onSelect: () => void; label: string; amount?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`relative inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors duration-150 ${selected ? "border-transparent text-page" : "border-line-strong bg-surface text-ink hover:border-ink-faint"}`}
    >
      {selected && <motion.span layoutId={`${group}-choice`} aria-hidden="true" className="absolute -inset-px rounded-full bg-ink" transition={glide} />}
      <span className="relative">{label}</span>
      {amount && <span className={`relative font-data text-[12px] ${selected ? "text-page/75" : "text-ink-faint"}`}>{amount}</span>}
    </button>
  );
}

/** Why the payout takes its route, in the campaign's own numbers. */
function reason(campaign: Campaign, tier: Tier, amount: bigint, custom: boolean, route: Route): string {
  const { rules } = campaign;
  const who = campaign.reviewers.length > 1 ? `One of the campaign's ${campaign.reviewers.length} reviewers` : "The campaign's reviewer";
  if (route === "Auto") {
    return `${tier} creators are paid automatically for rate-card work up to ${formatNear(autoLimit(rules, tier))} NEAR. It waits ${formatDuration(rules.challenge_period_sec)} in public first, and a reviewer can veto it in that time.`;
  }
  if (route === "Dao") {
    return `${formatNear(amount)} NEAR is more than the ${formatNear(rules.reviewer_limit)} NEAR one reviewer can approve, so Herald writes a DAO proposal. It pays when the council's vote passes.`;
  }
  if (custom) return `Custom asks always get a person's eye. ${who} approves it, and it pays at once.`;
  if (tier === "Newcomer") return `Newcomers are reviewed until they have ${plural(rules.trusted_after, "paid deliverable")}. ${who} approves it, and it pays at once.`;
  return `That's over the ${formatNear(autoLimit(rules, tier))} NEAR automatic limit for ${tier} creators, so a person checks it. ${who} approves it, and it pays at once.`;
}
