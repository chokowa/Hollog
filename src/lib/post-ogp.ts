import type { OgpFetchState, OgpPreview, Post } from "@/types/post";

export const MAX_AUTO_OGP_ATTEMPTS = 3;
const OGP_AUTO_RETRY_DELAYS_MS = [30_000, 5 * 60_000];

export function mergeOgpPreview(base?: OgpPreview, next?: OgpPreview | null) {
  if (!base && !next) return undefined;
  if (!base) return next ?? undefined;
  if (!next) return base;
  return {
    title: next.title || base.title,
    description: next.description || base.description,
    image: next.image || base.image,
    siteName: next.siteName || base.siteName,
  } satisfies OgpPreview;
}

export function isOgpIncomplete(post: Pick<Post, "url" | "ogp">) {
  if (!post.url) return false;
  return !post.ogp?.title || !post.ogp?.image;
}

export function canAutoRetryOgp(post: Pick<Post, "url" | "ogp" | "ogpFetch">, now = Date.now()) {
  if (!isOgpIncomplete(post)) return false;

  const attemptCount = post.ogpFetch?.attemptCount ?? 0;
  if (attemptCount >= MAX_AUTO_OGP_ATTEMPTS || post.ogpFetch?.status === "exhausted") {
    return false;
  }

  if (!post.ogpFetch?.nextRetryAt) return true;
  const nextRetryAtMs = Date.parse(post.ogpFetch.nextRetryAt);
  return Number.isNaN(nextRetryAtMs) || nextRetryAtMs <= now;
}

export function buildNextOgpFetchState(
  post: Pick<Post, "url" | "ogp" | "ogpFetch">,
  nextOgp: OgpPreview | undefined,
  now = new Date(),
): OgpFetchState {
  const attemptCount = (post.ogpFetch?.attemptCount ?? 0) + 1;
  const nowIso = now.toISOString();

  if (!isOgpIncomplete({ url: post.url, ogp: nextOgp })) {
    return {
      attemptCount,
      lastAttemptAt: nowIso,
      nextRetryAt: null,
      status: "complete",
    };
  }

  if (attemptCount >= MAX_AUTO_OGP_ATTEMPTS) {
    return {
      attemptCount,
      lastAttemptAt: nowIso,
      nextRetryAt: null,
      status: "exhausted",
    };
  }

  const retryDelay = OGP_AUTO_RETRY_DELAYS_MS[Math.min(attemptCount - 1, OGP_AUTO_RETRY_DELAYS_MS.length - 1)] ?? 0;
  return {
    attemptCount,
    lastAttemptAt: nowIso,
    nextRetryAt: new Date(now.getTime() + retryDelay).toISOString(),
      status: "pending",
    };
}

export function resetOgpFetchState(): OgpFetchState {
  return {
    attemptCount: 0,
    nextRetryAt: null,
    status: "pending",
  };
}
