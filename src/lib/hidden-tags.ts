import { uniqueTags } from "@/lib/tag-suggestions";

const HIDDEN_TAGS_STORAGE_KEY = "bocchisns_hidden_tags";

export function readHiddenTags() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const saved = localStorage.getItem(HIDDEN_TAGS_STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return uniqueTags(parsed.map((tag) => String(tag).trim()).filter(Boolean));
  } catch {
    return [];
  }
}

export function writeHiddenTags(tags: string[]) {
  const normalized = uniqueTags(tags.map((tag) => tag.trim()).filter(Boolean));
  try {
    localStorage.setItem(HIDDEN_TAGS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
  return normalized;
}
