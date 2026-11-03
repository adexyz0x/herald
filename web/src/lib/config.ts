export type Role = "council" | "reviewer" | "creator";

/** A demo identity on the local chain. Keys are throwaway sandbox keys. */
export interface Persona {
  accountId: string;
  name: string;
  role: Role;
  secretKey: string;
}

/** A public name for a real account on a public network, from public/profiles.json. */
export interface Profile {
  name: string;
  /** Who they are, said honestly: shown next to their name where roles matter. */
  note?: string;
}

export interface AppConfig {
  network: "local" | "testnet";
  rpcUrl: string;
  herald: string;
  dao: string;
  daoName: string;
  personas: Persona[];
  profiles: Record<string, Profile>;
  explorerUrl?: string;
}

/** Display names for real accounts. Optional: without the file, account IDs are shown. */
async function loadProfiles(): Promise<Record<string, Profile>> {
  try {
    const res = await fetch("/profiles.json", { cache: "no-store" });
    return res.ok ? ((await res.json()) as Record<string, Profile>) : {};
  } catch {
    return {};
  }
}

/**
 * Testnet builds read their settings from VITE_* variables. Local builds read the file that
 * `cargo run --example demo` writes, so the app always matches the running chain.
 */
export async function loadConfig(): Promise<AppConfig> {
  const env = import.meta.env;
  if (env.VITE_NETWORK === "testnet") {
    return {
      network: "testnet",
      rpcUrl: env.VITE_RPC_URL ?? "https://test.rpc.fastnear.com",
      herald: env.VITE_HERALD_CONTRACT,
      dao: env.VITE_DAO_ACCOUNT,
      daoName: env.VITE_DAO_NAME ?? env.VITE_DAO_ACCOUNT,
      personas: [],
      profiles: await loadProfiles(),
      explorerUrl: "https://testnet.nearblocks.io",
    };
  }
  const res = await fetch("/local-demo.json", { cache: "no-store" });
  if (!res.ok) throw new Error("local-demo-missing");
  return { profiles: {}, ...((await res.json()) as Omit<AppConfig, "profiles">) };
}
