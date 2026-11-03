import { animate, useReducedMotion, type Transition, type Variants } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Herald's motion rules. UI responses run 150 to 250ms; the one choreographed moment (the home
 * hero) runs under a second. Nothing waits on scroll to become visible, so screenshots and
 * screen readers always see the whole page.
 */

/** Quick start, soft landing. Used for everything that settles into place. */
export const ease = [0.2, 0.7, 0.2, 1] as const;

export const quick: Transition = { duration: 0.2, ease };

/** For things that slide between positions, like the active-tab pill. */
export const glide: Transition = { type: "spring", stiffness: 420, damping: 36 };

/** For the seal hitting the page. */
export const stampSpring: Transition = { type: "spring", stiffness: 520, damping: 22, mass: 0.9 };

/** Children appear one after another. */
export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Rise a few pixels into place. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
};

/** List rows entering and leaving live lists. */
export const rowMotion = {
  layout: "position" as const,
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease } },
  exit: { opacity: 0, x: 12, transition: { duration: 0.18, ease } },
};

/**
 * A number that counts to its value when it first renders and glides when the value changes,
 * so a payout landing visibly moves the totals.
 */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const current = useRef(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      current.current = value;
      setShown(value);
      return;
    }
    const first = current.current === 0;
    const controls = animate(current.current, value, {
      duration: first ? 1.1 : 0.6,
      ease,
      onUpdate: (v) => {
        current.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value, reduce]);

  // The count finishes in about a second, before anyone could read a value mid-way.
  return <span className={className}>{format(shown)}</span>;
}

/** NEAR amount in yoctoNEAR as a plain number of NEAR, for counting animations. */
export function nearNumber(yocto: string | bigint): number {
  return Number(BigInt(yocto) / 10n ** 20n) / 10_000;
}

export const formatNearNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
