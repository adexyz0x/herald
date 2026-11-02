import { useEffect, useSyncExternalStore } from "react";

export type RouteMatch =
  | { page: "home" }
  | { page: "campaign"; id: number }
  | { page: "review" }
  | { page: "council" }
  | { page: "creator"; accountId: string }
  | { page: "notfound" };

/** Hash routes work on any static host without server rewrites. */
export function parseHash(hash: string): RouteMatch {
  const path = hash.replace(/^#/, "") || "/";
  if (path === "/" || path === "") return { page: "home" };
  const campaign = path.match(/^\/campaigns\/(\d+)$/);
  if (campaign) return { page: "campaign", id: Number(campaign[1]) };
  if (path === "/review") return { page: "review" };
  if (path === "/council") return { page: "council" };
  const creator = path.match(/^\/creators\/(.+)$/);
  if (creator) return { page: "creator", accountId: decodeURIComponent(creator[1]) };
  return { page: "notfound" };
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): RouteMatch {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [hash]);
  return parseHash(hash);
}

export const href = {
  home: "#/",
  campaign: (id: number) => `#/campaigns/${id}`,
  review: "#/review",
  council: "#/council",
  creator: (accountId: string) => `#/creators/${encodeURIComponent(accountId)}`,
};
