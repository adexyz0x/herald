import { Account, type KeyPairString } from "near-api-js";
import type { Persona } from "./config";
import type { Call } from "./herald";

/** Who is acting in the app. Local demos act as seeded personas; testnet uses a connected wallet. */
export type Actor =
  | { kind: "persona"; accountId: string; name: string; persona: Persona }
  | { kind: "wallet"; accountId: string; name: string }
  | { kind: "guest"; accountId: null; name: string };

export type Executor = (call: Call) => Promise<unknown>;

/** Signs and sends with a local persona's sandbox key. */
export function personaExecutor(rpcUrl: string, persona: Persona): Executor {
  const account = new Account(persona.accountId, rpcUrl, persona.secretKey as KeyPairString);
  return async (call) =>
    account.callFunction({
      contractId: call.contractId,
      methodName: call.methodName,
      args: call.args,
      deposit: call.deposit ?? "0",
      gas: call.gas,
      waitUntil: "FINAL",
    });
}
