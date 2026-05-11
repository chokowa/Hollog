export const TAG_SUGGESTIONS_STORAGE_KEY = "bocchisns_custom_tags";
export const SYSTEM_TAGGING_ENABLED_STORAGE_KEY = "bocchisns_system_tagging_enabled";
const TAG_SUGGESTIONS_MIGRATED_KEY = "bocchisns_tag_suggestions_migrated";

export const DEFAULT_TAG_SUGGESTIONS = ["idea", "memo", "design", "reference", "todo", "music", "art"];

export type TagSuggestion = {
  name: string;
  isSystem: boolean;
};

type SystemTagRule = {
  tag: string;
  patterns: string[];
};

export const SYSTEM_TAG_RULES: SystemTagRule[] = [
  { tag: "YouTube", patterns: ["youtube.com", "youtu.be"] },
  { tag: "X", patterns: ["x.com", "twitter.com"] },
  { tag: "Amazon", patterns: ["amazon.co.jp", "amzn.to", "amzn.asia"] },
  { tag: "Vimeo", patterns: ["vimeo.com"] },
  { tag: "TikTok", patterns: ["tiktok.com"] },
  { tag: "Instagram", patterns: ["instagram.com"] },
  { tag: "Facebook", patterns: ["facebook.com"] },
  { tag: "楽天", patterns: ["rakuten.co.jp"] },
  { tag: "メルカリ", patterns: ["mercari.com"] },
  { tag: "GitHub", patterns: ["github.com"] },
  { tag: "Qiita", patterns: ["qiita.com"] },
  { tag: "Zenn", patterns: ["zenn.dev"] },
  { tag: "Stack Overflow", patterns: ["stackoverflow.com"] },
  { tag: "Google Maps", patterns: ["google.com/maps", "goo.gl/maps"] },
  { tag: "note", patterns: ["note.com"] },
  { tag: "Medium", patterns: ["medium.com"] },
  { tag: "Yahoo!ニュース", patterns: ["yahoo.co.jp/news"] },
];

const SYSTEM_TAG_NAMES = SYSTEM_TAG_RULES.map((rule) => rule.tag);

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

export function uniqueTagSuggestions(tags: TagSuggestion[]) {
  const suggestions = new Map<string, TagSuggestion>();

  tags.forEach((tag) => {
    const name = tag.name.trim().replace(/^#/, "");
    if (!name) return;

    const current = suggestions.get(name);
    suggestions.set(name, {
      name,
      isSystem: current ? current.isSystem && tag.isSystem : tag.isSystem,
    });
  });

  return Array.from(suggestions.values());
}

function parseStoredTagSuggestions(parsed: unknown): TagSuggestion[] | null {
  if (!Array.isArray(parsed)) return null;

  return parsed.flatMap((item) => {
    if (typeof item === "string") {
      return [{ name: item, isSystem: false }];
    }

    if (
      item
      && typeof item === "object"
      && "name" in item
      && typeof item.name === "string"
    ) {
      return [{ name: item.name, isSystem: Boolean("isSystem" in item && item.isSystem) }];
    }

    return [];
  });
}

export function readTagSuggestionCatalog() {
  const defaults = uniqueTagSuggestions([
    ...DEFAULT_TAG_SUGGESTIONS.map((name) => ({ name, isSystem: false })),
    ...SYSTEM_TAG_NAMES.map((name) => ({ name, isSystem: true })),
  ]);

  if (typeof window === "undefined") return defaults;

  try {
    const saved = localStorage.getItem(TAG_SUGGESTIONS_STORAGE_KEY);
    if (!saved) {
      return defaults;
    }

    const parsed = parseStoredTagSuggestions(JSON.parse(saved));
    if (!parsed) return defaults;

    const migratedTags = uniqueTagSuggestions([...defaults, ...parsed]);
    if (localStorage.getItem(TAG_SUGGESTIONS_MIGRATED_KEY) !== "true") {
      localStorage.setItem(TAG_SUGGESTIONS_STORAGE_KEY, JSON.stringify(migratedTags));
      localStorage.setItem(TAG_SUGGESTIONS_MIGRATED_KEY, "true");
    }

    return migratedTags;
  } catch {
    return defaults;
  }
}

export function readTagSuggestions() {
  return readTagSuggestionCatalog().filter((tag) => !tag.isSystem).map((tag) => tag.name);
}

export function writeTagSuggestions(tags: string[]) {
  const nextCatalog = uniqueTagSuggestions([
    ...tags.map((name) => ({ name, isSystem: false })),
    ...SYSTEM_TAG_NAMES.map((name) => ({ name, isSystem: true })),
  ]);

  try {
    localStorage.setItem(TAG_SUGGESTIONS_STORAGE_KEY, JSON.stringify(nextCatalog));
    localStorage.setItem(TAG_SUGGESTIONS_MIGRATED_KEY, "true");
  } catch {}

  return nextCatalog.filter((tag) => !tag.isSystem).map((tag) => tag.name);
}

export function writeTagSuggestionCatalog(tags: TagSuggestion[]) {
  const nextTags = uniqueTagSuggestions(tags);

  try {
    localStorage.setItem(TAG_SUGGESTIONS_STORAGE_KEY, JSON.stringify(nextTags));
    localStorage.setItem(TAG_SUGGESTIONS_MIGRATED_KEY, "true");
  } catch {}

  return nextTags;
}

export function readSystemTaggingEnabled() {
  if (typeof window === "undefined") return true;

  try {
    return localStorage.getItem(SYSTEM_TAGGING_ENABLED_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeSystemTaggingEnabled(enabled: boolean) {
  try {
    localStorage.setItem(SYSTEM_TAGGING_ENABLED_STORAGE_KEY, String(enabled));
  } catch {}

  return enabled;
}

export function getSystemTagsForUrl(url: string) {
  const normalizedUrl = url.trim().toLowerCase();
  if (!normalizedUrl) return [];

  return SYSTEM_TAG_RULES
    .filter((rule) => rule.patterns.some((pattern) => normalizedUrl.includes(pattern.toLowerCase())))
    .map((rule) => rule.tag);
}

export function getVisibleTagSuggestions(
  catalog: TagSuggestion[],
  input: string,
  selectedTags: string[],
) {
  const query = input.trim().toLowerCase();
  const selected = new Set(selectedTags);

  return catalog
    .filter((tag) => query || !tag.isSystem)
    .filter((tag) => tag.name.toLowerCase().includes(query))
    .filter((tag) => !selected.has(tag.name))
    .map((tag) => tag.name);
}
