export const TAG_SUGGESTIONS_STORAGE_KEY = "bocchisns_custom_tags";
const TAG_SUGGESTIONS_MIGRATED_KEY = "bocchisns_tag_suggestions_migrated";

export const DEFAULT_TAG_SUGGESTIONS = ["idea", "memo", "design", "reference", "todo", "music", "art"];

export function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  const nextTags: string[] = [];

  tags.forEach((tag) => {
    const trimmed = tag.trim().replace(/^#/, "");
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    nextTags.push(trimmed);
  });

  return nextTags;
}

export function readTagSuggestions() {
  if (typeof window === "undefined") return DEFAULT_TAG_SUGGESTIONS;

  try {
    const saved = localStorage.getItem(TAG_SUGGESTIONS_STORAGE_KEY);
    if (!saved) {
      return DEFAULT_TAG_SUGGESTIONS;
    }

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return DEFAULT_TAG_SUGGESTIONS;

    if (localStorage.getItem(TAG_SUGGESTIONS_MIGRATED_KEY) !== "true") {
      const migratedTags = uniqueTags([...DEFAULT_TAG_SUGGESTIONS, ...parsed]);
      localStorage.setItem(TAG_SUGGESTIONS_STORAGE_KEY, JSON.stringify(migratedTags));
      localStorage.setItem(TAG_SUGGESTIONS_MIGRATED_KEY, "true");
      return migratedTags;
    }

    return uniqueTags(parsed);
  } catch {
    return DEFAULT_TAG_SUGGESTIONS;
  }
}

export function writeTagSuggestions(tags: string[]) {
  const nextTags = uniqueTags(tags);

  try {
    localStorage.setItem(TAG_SUGGESTIONS_STORAGE_KEY, JSON.stringify(nextTags));
    localStorage.setItem(TAG_SUGGESTIONS_MIGRATED_KEY, "true");
  } catch {}

  return nextTags;
}
