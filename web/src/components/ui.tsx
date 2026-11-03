import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { toastDuration, useApp } from "../lib/app";
import { ease, glide, quick } from "../lib/motion";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.14)] hover:bg-accent-strong",
  secondary: "border border-line-strong bg-surface text-ink shadow-card hover:border-ink-faint",
  danger: "border border-veto/50 bg-veto-wash text-veto-ink hover:border-veto",
  ghost: "text-ink-soft hover:bg-sunk hover:text-ink",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
};
/** Shared by buttons and button-styled links: color changes ease, presses sink slightly. */
const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]";

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={`${buttonBase} disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** A link that looks like a button, for navigation. */
export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} className={`${buttonBase} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </a>
  );
}

/** Runs an async action and shows a spinner on the button while it signs and lands. */
export function ActionButton({
  run,
  children,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  run: () => Promise<unknown>;
  variant?: Variant;
  size?: Size;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...rest}
      busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </Button>
  );
}

export function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export type Tone = "accent" | "gold" | "dao" | "paid" | "veto" | "ink";

const toneDot: Record<Tone, string> = {
  accent: "bg-accent",
  gold: "bg-gold",
  dao: "bg-dao",
  paid: "bg-paid",
  veto: "bg-veto",
  ink: "bg-ink-faint",
};
const toneVar: Record<Tone, string> = {
  accent: "var(--accent)",
  gold: "var(--gold)",
  dao: "var(--dao)",
  paid: "var(--paid)",
  veto: "var(--veto)",
  ink: "var(--ink-faint)",
};

export function Panel({
  title,
  action,
  tone,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  /** A tincture rule along the top edge, for panels that belong to one route or role. */
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative overflow-hidden rounded-lg border border-line bg-surface shadow-card ${className}`}>
      {tone && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: toneVar[tone] }} />}
      {(title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Section heading with a tincture dot, a live count and one line of explanation. */
export function SectionTitle({ title, count, hint, tone = "ink", action }: { title: string; count?: number; hint?: string; tone?: Tone; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2.5 text-lg font-semibold">
          <span className={`size-2 rounded-full ${toneDot[tone]}`} aria-hidden="true" />
          {title}
          {count != null && <span className="rounded-full bg-sunk px-2 py-px font-data text-[12.5px] font-normal text-ink-soft">{count}</span>}
        </h2>
        {hint && <p className="mt-1 max-w-[70ch] text-[13.5px] text-ink-soft">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Page title block with a soft wash of the page's tincture behind it. */
export function PageHeader({ title, tone, back, aside, children }: { title: ReactNode; tone: Tone; back?: ReactNode; aside?: ReactNode; children?: ReactNode }) {
  return (
    <header className="relative isolate">
      <div className="page-wash" style={{ "--wash-tone": toneVar[tone] } as CSSProperties} aria-hidden="true" />
      {back}
      <div className={`flex flex-wrap items-end justify-between gap-4 ${back ? "mt-3" : ""}`}>
        <div className="min-w-0">
          {/* The title rises out of its own mask, like the home headline. */}
          <h1 className="font-display text-[clamp(34px,4.6vw,56px)] leading-[1.05] tracking-[-0.005em]">
            <span className="block overflow-hidden pb-[0.06em]">
              <motion.span className="block" initial={{ y: "105%" }} animate={{ y: "0%" }} transition={{ duration: 0.65, ease }}>
                {title}
              </motion.span>
            </span>
          </h1>
          {children}
        </div>
        {aside}
      </div>
    </header>
  );
}

/** A small set of mutually exclusive choices, with the selection gliding between them. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void }) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className="flex rounded-md border border-line bg-surface p-0.5 shadow-card">
      {options.map(([option, text]) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={`relative rounded-[5px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${selected ? "text-page" : "text-ink-soft hover:text-ink"}`}
          >
            {selected && <motion.span layoutId={`segmented-${id}`} className="absolute inset-0 rounded-[5px] bg-ink" transition={glide} aria-hidden="true" />}
            <span className="relative">{text}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-[12.5px] text-ink-faint">
          {hint}
        </p>
      )}
      <AnimatePresence initial={false}>
        {error && (
          <motion.p id={errorId} className="text-[12.5px] text-veto-ink" initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={quick}>
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Text field styling without a width, for fields that sit side by side. */
export const inputBase =
  "h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150 hover:border-ink-faint focus:border-accent aria-[invalid=true]:border-veto";
export const inputClass = `${inputBase} w-full`;

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(520px,calc(100vw-32px))] overflow-visible bg-transparent p-0 text-ink backdrop:bg-[rgb(8_10_18/0.55)] backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.22, ease }}
          className="rounded-lg border border-line bg-surface shadow-pop"
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="font-display text-2xl leading-tight">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-sm p-1 text-ink-faint transition-colors hover:text-ink" aria-label="Close">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="px-5 py-5">{children}</div>
        </motion.div>
      )}
    </dialog>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong bg-surface/60 px-5 py-6">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="max-w-[52ch] text-sm text-ink-soft">{body}</p>
      {action}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const success = t.tone === "success";
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 420, damping: 30 } }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.18, ease } }}
              className={`pointer-events-auto relative flex w-full max-w-[420px] items-start gap-3 overflow-hidden rounded-md border bg-surface px-4 py-3 text-sm text-ink shadow-pop ${success ? "border-paid/40" : "border-veto/40"}`}
            >
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${success ? "bg-paid-wash text-paid-ink" : "bg-veto-wash text-veto-ink"}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  {success ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M12 7v6M12 17h.01" />}
                </svg>
              </span>
              <span className="flex-1">{t.text}</span>
              <button type="button" onClick={() => dismissToast(t.id)} className="text-ink-faint transition-colors hover:text-ink" aria-label="Dismiss">
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <motion.span
                aria-hidden="true"
                className={`absolute bottom-0 left-0 h-[2px] ${success ? "bg-paid" : "bg-veto"}`}
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: toastDuration(t.tone) / 1000, ease: "linear" }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-accent underline decoration-accent/30 underline-offset-2 transition-colors hover:decoration-accent ${className}`}
    >
      {children}
      <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true">
        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
