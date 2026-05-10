"use client";

const DEBUG_LOG_KEY = "bocchisns_debug_logs";
const MAX_LOG_ENTRIES = 250;

type DebugLogDetails = Record<string, unknown>;

function sanitizeDetails(details: DebugLogDetails | undefined) {
  if (!details) return undefined;

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (value instanceof Blob) {
        return [key, { blobType: value.type, blobSize: value.size }];
      }
      return [key, value];
    }),
  );
}

export function debugLog(event: string, details?: DebugLogDetails) {
  if (typeof window === "undefined") return;

  const entry = {
    at: new Date().toISOString(),
    event,
    details: sanitizeDetails(details),
  };

  try {
    const current = JSON.parse(localStorage.getItem(DEBUG_LOG_KEY) || "[]") as unknown[];
    const next = [...current, entry].slice(-MAX_LOG_ENTRIES);
    localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(next));
  } catch {
    // Logging must never affect the app flow.
  }

  console.info("[BocchiDebug]", JSON.stringify(entry));
}
