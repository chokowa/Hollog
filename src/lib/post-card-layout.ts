export type PostCardSection = "url" | "preview" | "media" | "body" | "meta";
type StoredPostCardSection = PostCardSection | "link";

export const POST_CARD_SECTION_LABELS: Record<PostCardSection, string> = {
  url: "URL",
  preview: "プレビュー",
  media: "画像",
  body: "本文",
  meta: "時間/タグ",
};

export const DEFAULT_POST_CARD_SECTION_ORDER: PostCardSection[] = ["url", "preview", "media", "body", "meta"];

const POST_CARD_SECTION_ORDER_STORAGE_KEY = "bocchisns_post_card_section_order";

function normalizeSectionOrder(value: unknown): PostCardSection[] {
  if (!Array.isArray(value)) return DEFAULT_POST_CARD_SECTION_ORDER;

  const validSections = new Set<StoredPostCardSection>([...DEFAULT_POST_CARD_SECTION_ORDER, "link"]);
  const nextOrder = value.flatMap((section): PostCardSection[] => {
    if (!validSections.has(section)) return [];
    if (section === "link") return ["url", "preview"];
    return [section];
  });
  DEFAULT_POST_CARD_SECTION_ORDER.forEach((section) => {
    if (!nextOrder.includes(section)) nextOrder.push(section);
  });

  return nextOrder;
}

export function readPostCardSectionOrder() {
  if (typeof window === "undefined") return DEFAULT_POST_CARD_SECTION_ORDER;
  try {
    const saved = localStorage.getItem(POST_CARD_SECTION_ORDER_STORAGE_KEY);
    return saved ? normalizeSectionOrder(JSON.parse(saved)) : DEFAULT_POST_CARD_SECTION_ORDER;
  } catch {
    return DEFAULT_POST_CARD_SECTION_ORDER;
  }
}

export function writePostCardSectionOrder(order: PostCardSection[]) {
  const normalized = normalizeSectionOrder(order);
  try {
    localStorage.setItem(POST_CARD_SECTION_ORDER_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
  return normalized;
}
