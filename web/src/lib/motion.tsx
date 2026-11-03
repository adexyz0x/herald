import { motion, type Transition, type Variants } from "motion/react";

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
 * A figure that settles into place when it appears and whenever it changes. It always shows the
 * real value, never an in-between count, so a screenshot or a screen reader can't catch a wrong
 * number on a payments screen.
 */
export function Figure({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const text = format(value);
  return (
    <motion.span
      key={text}
      className={`inline-block ${className}`}
      initial={{ opacity: 0.25, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease }}
    >
      {text}
    </motion.span>
  );
}

/** NEAR amount in yoctoNEAR as a plain number of NEAR, for figures. */
export function nearNumber(yocto: string | bigint): number {
  return Number(BigInt(yocto) / 10n ** 20n) / 10_000;
}

export const formatNearNumber = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
