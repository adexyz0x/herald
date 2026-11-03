import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppConfig, Persona } from "./config";
import { errorMessage } from "./format";
import { HeraldClient, type Call } from "./herald";
import { Rpc } from "./rpc";
import type { Actor } from "./signer";
import { SputnikClient } from "./sputnik";
import type { WalletKit } from "./wallet";

export interface Toast {
  id: number;
  tone: "success" | "error";
  text: string;
}

interface AppState {
  config: AppConfig;
  rpc: Rpc;
  herald: HeraldClient;
  dao: SputnikClient;
  actor: Actor;
  setActor: (actor: Actor) => void;
  /**
   * Signs and sends a call as the current actor, shows the outcome and refreshes data. `success`
   * can be a function that checks the result on chain first; if it throws, its message is shown.
   */
  execute: (call: Call, messages: { success: string | (() => Promise<string>) }) => Promise<unknown | undefined>;
  /** Bumps whenever data should be reloaded. */
  version: number;
  refresh: () => void;
  /** Chain time minus local time, so countdowns follow the chain's clock. */
  chainOffsetMs: number;
  persona: (accountId: string | null | undefined) => Persona | undefined;
  displayName: (accountId: string) => string;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  /** Public networks only: open the wallet picker, or sign out of the connected wallet. */
  wallet: { ready: boolean; signIn: () => void; signOut: () => Promise<void> } | null;
}

const AppContext = createContext<AppState | null>(null);

/** How long a toast stays up. Errors stay longer so there's time to read them. */
export const toastDuration = (tone: Toast["tone"]) => (tone === "error" ? 8000 : 5000);

export function useApp(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp outside AppProvider");
  return value;
}

const ACTOR_KEY = "herald.actor";
const GUEST: Actor = { kind: "guest", accountId: null, name: "Guest" };

function readStoredActor(config: AppConfig): Actor {
  try {
    const stored = window.localStorage.getItem(ACTOR_KEY);
    const persona = config.personas.find((p) => p.accountId === stored);
    if (persona) return { kind: "persona", accountId: persona.accountId, name: persona.name, persona };
  } catch {
    // Storage can be unavailable in private windows; the app works without it.
  }
  return GUEST;
}

export function AppProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  const rpc = useMemo(() => new Rpc(config.rpcUrl), [config.rpcUrl]);
  const herald = useMemo(() => new HeraldClient(rpc, config.herald), [rpc, config.herald]);
  const dao = useMemo(() => new SputnikClient(rpc, config.dao), [rpc, config.dao]);
  const [actor, setActorState] = useState<Actor>(() => readStoredActor(config));
  const [version, setVersion] = useState(0);
  const [chainOffsetMs, setChainOffsetMs] = useState(0);
  const [clockReady, setClockReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const [walletKit, setWalletKit] = useState<WalletKit | null>(null);
  const usesWallet = config.network !== "local";

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const setActor = useCallback((next: Actor) => {
    setActorState(next);
    try {
      if (next.accountId) window.localStorage.setItem(ACTOR_KEY, next.accountId);
      else window.localStorage.removeItem(ACTOR_KEY);
    } catch {
      // Not remembering the choice is fine.
    }
  }, []);

  const pushToast = useCallback((tone: Toast["tone"], text: string) => {
    const id = ++toastId.current;
    setToasts((all) => [...all, { id, tone, text }]);
    window.setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), toastDuration(tone));
  }, []);

  const dismissToast = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const execute = useCallback(
    async (call: Call, messages: { success: string | (() => Promise<string>) }) => {
      if (actor.kind === "guest") {
        pushToast("error", usesWallet ? "Connect your wallet first, at the top of the page." : "Choose who you're acting as first, using the switcher at the top.");
        return undefined;
      }
      try {
        let result: unknown;
        if (actor.kind === "wallet") {
          if (!walletKit) throw new Error("The wallet is still loading. Try again in a moment.");
          const { walletExecutor } = await import("./wallet");
          result = await walletExecutor(walletKit.selector)(call);
          // Browser wallets leave the page to sign; the result is read when the person comes back.
          if (result === undefined) return undefined;
        } else {
          // The signer pulls in near-api-js, so it loads on first use instead of with the page.
          const { personaExecutor } = await import("./signer");
          result = await personaExecutor(config.rpcUrl, actor.persona)(call);
        }
        pushToast("success", typeof messages.success === "string" ? messages.success : await messages.success());
        refresh();
        return result;
      } catch (error) {
        pushToast("error", errorMessage(error));
        refresh();
        return undefined;
      }
    },
    [actor, config.rpcUrl, pushToast, refresh, walletKit, usesWallet],
  );

  // Public networks: connect wallets, follow sign-ins and sign-outs, and report what a wallet
  // redirect brought back.
  useEffect(() => {
    if (!usesWallet) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    import("./wallet")
      .then(async ({ setupWallets, activeAccount, takeWalletReturn }) => {
        const kit = await setupWallets(config.rpcUrl, config.herald);
        if (cancelled) return;
        const follow = () => {
          const accountId = activeAccount(kit.selector);
          setActorState(accountId ? { kind: "wallet", accountId, name: accountId } : GUEST);
        };
        follow();
        const subscription = kit.selector.store.observable.subscribe(follow);
        unsubscribe = () => subscription.unsubscribe();
        setWalletKit(kit);
        const returned = takeWalletReturn();
        if (returned) {
          pushToast(returned.ok ? "success" : "error", returned.message);
          refresh();
        }
      })
      .catch((error) => !cancelled && pushToast("error", `Couldn't load wallets: ${errorMessage(error)}`));
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [usesWallet, config.rpcUrl, config.herald, pushToast, refresh]);

  const wallet = useMemo(
    () =>
      usesWallet
        ? {
            ready: walletKit != null,
            signIn: () => walletKit?.modal.show(),
            signOut: async () => {
              if (!walletKit) return;
              const w = await walletKit.selector.wallet();
              await w.signOut();
            },
          }
        : null,
    [usesWallet, walletKit],
  );

  // Live data: refresh while the tab is visible. Public RPC endpoints get a gentler pace.
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") refresh();
      },
      usesWallet ? 10_000 : 5000,
    );
    return () => window.clearInterval(timer);
  }, [refresh, usesWallet]);

  // Sync with the chain's clock; the local sandbox can run ahead of real time.
  useEffect(() => {
    let cancelled = false;
    const sync = () =>
      rpc
        .chainTimeMs()
        .then((chainMs) => !cancelled && setChainOffsetMs(chainMs - Date.now()))
        .catch(() => undefined)
        .finally(() => !cancelled && setClockReady(true));
    sync();
    const timer = window.setInterval(sync, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [rpc]);

  const persona = useCallback(
    (accountId: string | null | undefined) => config.personas.find((p) => p.accountId === accountId),
    [config.personas],
  );
  const displayName = useCallback(
    (accountId: string) => {
      if (accountId === config.dao) return config.daoName;
      return persona(accountId)?.name ?? config.profiles[accountId]?.name ?? accountId;
    },
    [config.dao, config.daoName, config.profiles, persona],
  );

  const value: AppState = {
    config,
    rpc,
    herald,
    dao,
    actor,
    setActor,
    execute,
    version,
    refresh,
    chainOffsetMs,
    persona,
    displayName,
    toasts,
    dismissToast,
    wallet,
  };
  return <AppContext.Provider value={value}>{clockReady ? children : null}</AppContext.Provider>;
}

/**
 * Loads chain data and reloads it whenever the app refreshes. Keeps showing the last result while
 * reloading, so live screens don't flicker.
 */
export function useChainData<T>(load: () => Promise<T>, deps: unknown[]): { data?: T; error?: string; loading: boolean } {
  const { version } = useApp();
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ data, loading: false }))
      .catch((error) => !cancelled && setState((prev) => ({ ...prev, error: errorMessage(error), loading: false })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return state;
}

/** The chain's "now", ticking every second. */
export function useChainNow(intervalMs = 1000): number {
  const { chainOffsetMs } = useApp();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now + chainOffsetMs;
}
