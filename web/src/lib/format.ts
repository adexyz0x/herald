const YOCTO_PER_NEAR = 10n ** 24n;

/** Formats yoctoNEAR for people: 2, 2.5, 0.05. Never more than 2 decimals. */
export function formatNear(yocto: string | bigint, decimals = 2): string {
  const value = typeof yocto === "bigint" ? yocto : BigInt(yocto);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const scale = 10n ** BigInt(decimals);
  const rounded = (abs * scale + YOCTO_PER_NEAR / 2n) / YOCTO_PER_NEAR;
  const whole = rounded / scale;
  const frac = (rounded % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  const text = Number(whole).toLocaleString("en-US") + (frac ? `.${frac}` : "");
  return negative ? `-${text}` : text;
}

/** NEAR amount typed by a person, as yoctoNEAR. Returns null if it isn't a positive number. */
export function parseNear(input: string): string | null {
  const clean = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  const yocto = BigInt(whole) * YOCTO_PER_NEAR + BigInt(frac.padEnd(24, "0").slice(0, 24));
  return yocto > 0n ? yocto.toString() : null;
}

export function toNear(near: number): string {
  return (BigInt(Math.round(near * 1000)) * (YOCTO_PER_NEAR / 1000n)).toString();
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  if (seconds % 60 === 0) return `${seconds / 60} minute${seconds === 60 ? "" : "s"}`;
  return `${seconds} seconds`;
}

/** Short, readable account label: "cleo.test.near" stays as is; long implicit IDs are shortened. */
export function shortAccount(accountId: string): string {
  return accountId.length > 28 ? `${accountId.slice(0, 10)}…${accountId.slice(-8)}` : accountId;
}

/** Pulls the human message out of a contract panic or RPC error. */
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const panic = raw.match(/panicked: ([^"\\]+?)(?:["\\}]|$)/);
  if (panic) return panic[1].trim();
  const exec = raw.match(/ExecutionError\("?([^")]+)/);
  if (exec) return exec[1].replace(/^Smart contract panicked: /, "").trim();
  return raw.length > 180 ? `${raw.slice(0, 180)}…` : raw;
}
