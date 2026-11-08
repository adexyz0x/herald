import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../lib/app";
import type { Role } from "../lib/config";
import { shortAccount } from "../lib/format";
import { RollingNumber, ease, glide } from "../lib/motion";
import { href, type RouteMatch } from "../lib/router";
import { Avatar } from "./chain";
import { Button } from "./ui";

const roleLabel: Record<Role, string> = { council: "Council", reviewer: "Reviewer", creator: "Creator" };
/** Roles wear the color of what they do: the council votes (aubergine), reviewers review (slate), creators get paid (moss). */
const roleDot: Record<Role, string> = { council: "bg-dao", reviewer: "bg-accent", creator: "bg-paid" };

export function Wordmark() {
  return (
    <a href={href.home} className="flex items-center gap-2.5" aria-label="Herald home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="var(--ink)" />
        <circle className="wordmark-ring" cx="32" cy="32" r="22" fill="none" stroke="var(--tincture-or)" strokeWidth="2" strokeDasharray="3 3" />
        <path d="M22 20v24M42 20v24M22 32h20" stroke="var(--page)" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[26px] leading-none tracking-tight text-ink">Herald</span>
    </a>
  );
}

/** A pulsing dot. With `beat`, it pulses once each time the value changes instead of looping. */
function LiveDot({ className = "bg-paid", beat }: { className?: string; beat?: number }) {
  return (
    <span className="relative flex size-2" aria-hidden="true">
      {beat === undefined ? (
        <motion.span
          className={`absolute inset-0 rounded-full ${className}`}
          animate={{ scale: [1, 2.4], opacity: [0.55, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      ) : (
        <motion.span
          key={beat}
          className={`absolute inset-0 rounded-full ${className}`}
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      )}
      <span className={`relative size-2 rounded-full ${className}`} />
    </span>
  );
}

/** The latest block height, read every four seconds while the tab is visible. */
function useBlockHeight(): number | null {
  const { rpc } = useApp();
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      rpc
        .blockHeight()
        // Public RPC is load-balanced, so a reply can trail the last one; never step backwards.
        .then((h) => !cancelled && setHeight((prev) => (prev == null || h > prev ? h : prev)))
        .catch(() => undefined);
    };
    read();
    const timer = window.setInterval(read, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rpc]);
  return height;
}

/** The network, with the chain's heartbeat: the dot pulses on every new block and the height rolls forward. */
function ChainBadge() {
  const { config } = useApp();
  const height = useBlockHeight();
  const label = config.network === "local" ? "Local chain" : "NEAR testnet";
  return (
    <span className="hidden h-7 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-[12px] text-ink-soft sm:inline-flex">
      <LiveDot beat={height ?? 0} />
      {label}
      {height != null && (
        <span className="hidden items-center border-l border-line pl-2 font-data text-ink xl:inline-flex" title="Latest block">
          <span aria-hidden="true" className="text-ink-faint before:content-['#']" />
          <RollingNumber value={height} />
          <span className="sr-only">Latest block {height}</span>
        </span>
      )}
    </span>
  );
}

function ActorMenu() {
  const { config, actor, setActor } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (config.network !== "local") return <WalletControl />;

  const groups: Role[] = ["council", "reviewer", "creator"];
  const current = actor.kind === "persona" ? actor.persona : null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Viewing as ${current ? `${current.name}, ${roleLabel[current.role]}` : "a guest"}. Change who you act as.`}
        className="flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface pr-3 pl-1.5 text-left shadow-card transition-colors hover:border-ink-faint"
      >
        {current ? <Avatar accountId={current.accountId} size={28} /> : <span className="size-7 rounded-full border border-dashed border-line-strong" aria-hidden="true" />}
        <span className="flex flex-col leading-tight">
          <span className="text-[11.5px] text-ink-faint">Viewing as</span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            {current && <span className={`size-1.5 rounded-full ${roleDot[current.role]}`} aria-hidden="true" />}
            {current ? `${current.name} · ${roleLabel[current.role]}` : "Guest"}
          </span>
        </span>
        <motion.svg viewBox="0 0 24 24" className="size-4 text-ink-faint" aria-hidden="true" animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease }}>
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </motion.svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 z-40 mt-2 w-[min(300px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-2 shadow-pop"
          >
            <p className="px-2 pt-1 pb-2 text-[12.5px] text-ink-faint">Act as anyone in the demo program. Each one signs with their own key on the local chain.</p>
            {groups.map((role) => (
              <div key={role} className="py-1">
                <p className="flex items-center gap-2 px-2 py-1 text-[12px] font-semibold text-ink-soft">
                  <span className={`size-1.5 rounded-full ${roleDot[role]}`} aria-hidden="true" />
                  {roleLabel[role]}
                </p>
                {config.personas
                  .filter((p) => p.role === role)
                  .map((p) => (
                    <button
                      key={p.accountId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={current?.accountId === p.accountId}
                      aria-label={`${p.name}, ${roleLabel[p.role]}, ${p.accountId}`}
                      onClick={() => {
                        setActor({ kind: "persona", accountId: p.accountId, name: p.name, persona: p });
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sunk aria-[checked=true]:bg-accent-wash"
                    >
                      <Avatar accountId={p.accountId} size={26} />
                      <span className="flex flex-col leading-tight">
                        <span className="text-[13px] font-medium text-ink">{p.name}</span>
                        <span className="font-data text-[11.5px] text-ink-faint">{p.accountId}</span>
                      </span>
                    </button>
                  ))}
              </div>
            ))}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={!current}
              onClick={() => {
                setActor({ kind: "guest", accountId: null, name: "Guest" });
                setOpen(false);
              }}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[13px] text-ink-soft transition-colors hover:bg-sunk"
            >
              Browse as a guest
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Public networks: one button to connect a NEAR wallet, then the account and a way out. */
function WalletControl() {
  const { actor, wallet } = useApp();
  if (!wallet) return null;
  if (actor.kind !== "wallet") {
    return (
      <Button variant="primary" size="sm" onClick={wallet.signIn} disabled={!wallet.ready} busy={!wallet.ready}>
        Connect wallet
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface pr-3 pl-1.5 shadow-card">
        <Avatar accountId={actor.accountId} size={28} />
        <span className="max-w-[150px] truncate text-[13px] font-semibold text-ink" title={actor.accountId}>
          {shortAccount(actor.accountId)}
        </span>
      </span>
      <Button size="sm" variant="ghost" onClick={() => void wallet.signOut()}>
        Sign out
      </Button>
    </div>
  );
}

function NavLinks({ items, pillId, compact = false }: { items: { label: string; to: string; active: boolean }[]; pillId: string; compact?: boolean }) {
  return (
    <>
      {items.map((item) => (
        <a
          key={item.label}
          href={item.to}
          aria-current={item.active ? "page" : undefined}
          className={`relative shrink-0 rounded-md font-medium transition-colors duration-150 ${compact ? "px-3 py-1.5 text-[13px]" : "px-3 py-2 text-sm"} ${item.active ? "text-ink" : "text-ink-soft hover:text-ink"}`}
        >
          {item.active && <motion.span layoutId={pillId} className="absolute inset-0 rounded-md bg-surface shadow-card ring-1 ring-line" transition={glide} aria-hidden="true" />}
          <span className="relative">{item.label}</span>
        </a>
      ))}
    </>
  );
}

const LEGEND: { label: string; dot: string }[] = [
  { label: "Automatic", dot: "bg-gold" },
  { label: "Reviewer", dot: "bg-accent" },
  { label: "DAO vote", dot: "bg-dao" },
  { label: "Paid", dot: "bg-paid" },
  { label: "Veto", dot: "bg-veto" },
];

export function Shell({ route, children }: { route: RouteMatch; children: ReactNode }) {
  const { config, actor } = useApp();
  const nav: { label: string; to: string; active: boolean }[] = [
    { label: "Campaigns", to: href.home, active: route.page === "home" || route.page === "campaign" },
    { label: "Review queue", to: href.review, active: route.page === "review" },
    { label: "Council", to: href.council, active: route.page === "council" },
  ];
  if (actor.accountId) {
    nav.push({
      label: "My record",
      to: href.creator(actor.accountId),
      active: route.page === "creator" && route.accountId === actor.accountId,
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
        <div className="gilt-band" aria-hidden="true" />
        <div className="mx-auto flex max-w-[1180px] items-center gap-6 px-4 py-3 sm:px-6">
          <Wordmark />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            <NavLinks items={nav} pillId="nav-pill" />
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ChainBadge />
            <ActorMenu />
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          <NavLinks items={nav} pillId="nav-pill-mobile" compact />
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 px-4 py-6 text-[13px] text-ink-faint sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Herald runs on NEAR and plugs into Sputnik DAO and Trezu treasuries. No admin key.</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {config.network === "local" && <span>Demo data on a private local chain. All names are fictional.</span>}
              <a href="https://x.com/heraldcash" target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">X @heraldcash</a>
              <a href="https://github.com/adexyz0x/herald" target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">GitHub</a>
            </div>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Color key">
            {LEGEND.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${l.dot}`} aria-hidden="true" />
                {l.label}
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}

export { LiveDot };
