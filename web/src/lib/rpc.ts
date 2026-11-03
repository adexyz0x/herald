type RpcReply<T> = { result?: T; error?: { code?: number; message?: string; data?: string } };

/**
 * Minimal NEAR JSON-RPC client for reads. Writes go through `signer.ts`.
 *
 * Public endpoints rate-limit by IP, and an over-limit reply carries no CORS headers, so the
 * browser sees a network error. Given several endpoints, a request that is refused, times out
 * or can't connect moves on to the next one, and the client stays with whichever answered.
 */
export class Rpc {
  private readonly urls: string[];
  private current = 0;

  constructor(urls: string | string[]) {
    this.urls = typeof urls === "string" ? [urls] : urls;
  }

  private async request<T>(method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < this.urls.length; attempt++) {
      const index = (this.current + attempt) % this.urls.length;
      let body: RpcReply<T>;
      try {
        const res = await fetch(this.urls[index], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "herald", method, params }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`RPC endpoint unavailable (${res.status})`);
        body = await res.json();
      } catch (error) {
        lastError = error;
        continue;
      }
      if (body.error?.code === -429) {
        lastError = new Error(body.error.message ?? "Rate limited");
        continue;
      }
      this.current = index;
      if (body.error) throw new Error(body.error.data ?? body.error.message ?? "RPC error");
      return body.result as T;
    }
    throw lastError instanceof Error ? lastError : new Error("No RPC endpoint answered");
  }

  /** Calls a view method and parses its JSON result. */
  async view<T>(contractId: string, methodName: string, args: object = {}): Promise<T> {
    const result = await this.request<{ result?: number[]; error?: string }>("query", {
      request_type: "call_function",
      finality: "optimistic",
      account_id: contractId,
      method_name: methodName,
      args_base64: btoa(JSON.stringify(args)),
    });
    if (result.error || !result.result) throw new Error(result.error ?? "View call failed");
    return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
  }

  /** Account balance in yoctoNEAR. */
  async balance(accountId: string): Promise<bigint> {
    const result = await this.request<{ amount: string }>("query", {
      request_type: "view_account",
      finality: "optimistic",
      account_id: accountId,
    });
    return BigInt(result.amount);
  }

  /** The latest block's height. */
  async blockHeight(): Promise<number> {
    const block = await this.request<{ header: { height: number } }>("block", { finality: "optimistic" });
    return block.header.height;
  }

  /** The chain's current time in milliseconds. */
  async chainTimeMs(): Promise<number> {
    const block = await this.request<{ header: { timestamp_nanosec: string } }>("block", {
      finality: "optimistic",
    });
    return Number(BigInt(block.header.timestamp_nanosec) / 1_000_000n);
  }
}
