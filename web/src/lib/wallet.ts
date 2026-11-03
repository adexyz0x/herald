import { actionCreators } from "@near-js/transactions";
import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupIntearWallet } from "@near-wallet-selector/intear-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";
import type { Call } from "./herald";
import type { Executor } from "./signer";

/** Wallet sign-in for public networks. The local demo signs with persona keys instead. */
export interface WalletKit {
  selector: WalletSelector;
  modal: WalletSelectorModal;
}

const DEFAULT_GAS = 30_000_000_000_000n;

export async function setupWallets(rpcUrl: string, heraldId: string): Promise<WalletKit> {
  const selector = await setupWalletSelector({
    // Wallets read the chain through the same endpoint as the app.
    network: {
      networkId: "testnet",
      nodeUrl: rpcUrl,
      helperUrl: "https://helper.testnet.near.org",
      explorerUrl: "https://testnet.nearblocks.io",
      indexerUrl: "https://testnet-api.kitwallet.app",
    },
    // Meteor first: it runs in the browser, creates testnet accounts, and is where MyNearWallet now
    // sends its users (MyNearWallet stopped approving app connections on 1 November 2026).
    modules: [setupMeteorWallet(), setupIntearWallet()],
  });
  // Signing in adds a limited key for Herald only, so reviewers can approve without a wallet
  // prompt each time. Anything that moves money, or calls the DAO, still asks the wallet.
  const modal = setupModal(selector, {
    contractId: heraldId,
    description: "Connect a NEAR wallet to submit work, review it or vote on the council.",
  });
  return { selector, modal };
}

/** The connected account, if any. */
export function activeAccount(selector: WalletSelector): string | null {
  const accounts = selector.store.getState().accounts;
  return (accounts.find((a) => a.active) ?? accounts[0])?.accountId ?? null;
}

/** Signs a Herald or DAO call with the connected wallet. */
export function walletExecutor(selector: WalletSelector): Executor {
  return async (call: Call) => {
    const wallet = await selector.wallet();
    return wallet.signAndSendTransaction({
      receiverId: call.contractId,
      actions: [actionCreators.functionCall(call.methodName, call.args, BigInt(call.gas ?? DEFAULT_GAS), BigInt(call.deposit ?? "0"))],
    });
  };
}

/**
 * Browser wallets send people to the wallet's site and back. When they return, the result is in
 * the address bar; read it once and clean the URL.
 */
export function takeWalletReturn(): { ok: boolean; message: string } | null {
  const params = new URLSearchParams(window.location.search);
  const hashes = params.get("transactionHashes");
  const errorCode = params.get("errorCode");
  if (!hashes && !errorCode) return null;
  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState(null, "", clean);
  if (errorCode) {
    return { ok: false, message: errorCode === "userRejected" ? "You cancelled in the wallet. Nothing was sent." : `The wallet reported an error: ${errorCode}.` };
  }
  return { ok: true, message: "Done. Your wallet sent the transaction." };
}
