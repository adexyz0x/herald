import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../lib/app";
import type { Role } from "../lib/config";
import { href, type RouteMatch } from "../lib/router";
import { Avatar } from "./chain";

const roleLabel: Record<Role, string> = { council: "Council", reviewer: "Reviewer", creator: "Creator" };

export function Wordmark() {
  return (
    <a href={href.home} className="flex items-center gap-2.5" aria-label="Herald home">
      <svg viewBox="0 0 64 64" className="size-8" aria-hidden="true">
        <circle cx="32" cy="32" r="29" fill="var(--accent)" />
        <circle cx="32" cy="32" r="22" fill="none" stroke="var(--page)" strokeWidth="2" strokeDasharray="3 3" />
        <path d="M22 20v24M42 20v24M22 32h20" stroke="var(--page)" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[26px] leading-none tracking-tight text-ink">Herald</span>
    </a>
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

  if (config.network !== "local") {
    return (
      <span className="text-[13px] text-ink-faint" title="Wallet connection ships with the testnet build">
        Wallet coming with testnet
      </span>
    );
  }

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
        className="flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface pr-3 pl-1.5 text-left transition-colors hover:border-ink-faint"
      >
        {current ? <Avatar accountId={current.accountId} size={28} /> : <span className="size-7 rounded-full border border-dashed border-line-strong" aria-hidden="true" />}
        <span className="flex flex-col leading-tight">
          <span className="text-[11.5px] text-ink-faint">Viewing as</span>
          <span className="text-[13px] font-semibold text-ink">{current ? `${current.name} · ${roleLabel[current.role]}` : "Guest"}</span>
        </span>
        <svg viewBox="0 0 24 24" className="size-4 text-ink-faint" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="rise-in absolute right-0 z-40 mt-2 w-[min(300px,calc(100vw-32px))] rounded-lg border border-line bg-surface p-2">
          <p className="px-2 pt-1 pb-2 text-[12.5px] text-ink-faint">Act as anyone in the demo program. Each one signs with their own key on the local chain.</p>
          {groups.map((role) => (
            <div key={role} className="py-1">
              <p className="px-2 py-1 text-[12px] font-semibold text-ink-soft">{roleLabel[role]}</p>
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
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunk aria-[checked=true]:bg-accent-wash"
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
            className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-[13px] text-ink-soft hover:bg-sunk"
          >
            Browse as a guest
          </button>
        </div>
      )}
    </div>
  );
}

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
      <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-6 px-4 py-3 sm:px-6">
          <Wordmark />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <a
                key={item.label}
                href={item.to}
                aria-current={item.active ? "page" : undefined}
                className="rounded-md px-3 py-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-[inset_0_0_0_1px_var(--line)]"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-soft sm:inline-flex">
              <span className="size-1.5 rounded-full bg-paid" aria-hidden="true" />
              {config.network === "local" ? "Local chain" : "NEAR testnet"}
            </span>
            <ActorMenu />
          </div>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          {nav.map((item) => (
            <a
              key={item.label}
              href={item.to}
              aria-current={item.active ? "page" : undefined}
              className="shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-soft aria-[current=page]:bg-surface aria-[current=page]:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-4 py-6 text-[13px] text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>Herald runs on NEAR and plugs into Sputnik DAO and Trezu treasuries. No admin key.</span>
          {config.network === "local" && <span>Demo data on a private local chain. All names are fictional.</span>}
        </div>
      </footer>
    </div>
  );
}
