/** Minimal NEAR JSON-RPC client for reads. Writes go through `signer.ts`. */
export class Rpc {
  constructor(readonly url: string) {}

  private async request<T>(method: string, params: unknown): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "herald", method, params }),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.data ?? body.error.message ?? "RPC error");
    return body.result as T;
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

  /** The chain's current time in milliseconds. */
  async chainTimeMs(): Promise<number> {
    const block = await this.request<{ header: { timestamp_nanosec: string } }>("block", {
      finality: "optimistic",
    });
    return Number(BigInt(block.header.timestamp_nanosec) / 1_000_000n);
  }
}
