import { DEFAULT_POST_CARD_SECTION_ORDER, type PostCardSection } from "@/lib/post-card-layout";
import { uniqueTags, type TagSuggestion } from "@/lib/tag-suggestions";
import type { OgpFetchState, OgpPreview, Post, PostMediaOrderItem, PostMediaRef, PostSource, PostType } from "@/types/post";

const BACKUP_APP = "hollog";
const BACKUP_VERSION = 1;

type ThemeMode = "system" | "light" | "dark";

export type HollogBackupSettings = {
  themeMode: ThemeMode;
  hidePostedInSourceTabs: boolean;
  hiddenTags: string[];
  systemTaggingEnabled: boolean;
  tagSuggestions: TagSuggestion[];
  postCardSectionOrder: PostCardSection[];
};

export type HollogBackupPostV1 = Omit<Post, "imageBlob" | "imageBlobs" | "thumbnailBlobs"> & {
  legacyImageCount?: number;
  thumbnailCount?: number;
};

export type HollogBackupV1 = {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  notes: string[];
  settings: HollogBackupSettings;
  posts: HollogBackupPostV1[];
};

export type ParsedHollogBackup = {
  backup: HollogBackupV1;
  posts: Post[];
  invalidPostCount: number;
};

type UnknownRecord = Record<string, unknown>;

const VALID_POST_TYPES = new Set<PostType>(["post", "clip", "posted"]);
const VALID_POST_SOURCES = new Set<PostSource>(["manual", "share", "web", "x"]);
const VALID_MEDIA_KINDS = new Set<PostMediaRef["kind"]>(["image", "video"]);
const VALID_MEDIA_STORAGES = new Set<PostMediaRef["storage"]>(["device-reference", "app-local-copy"]);
const VALID_CARD_SECTIONS = new Set<PostCardSection>(DEFAULT_POST_CARD_SECTION_ORDER);
const VALID_THEME_MODES = new Set<ThemeMode>(["system", "light", "dark"]);

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown) {
  const text = asString(value).trim();
  return text || undefined;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item).trim()).filter(Boolean);
}

function createImportPostId(index: number) {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `imported-post-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePostType(value: unknown): PostType {
  return VALID_POST_TYPES.has(value as PostType) ? value as PostType : "post";
}

function sanitizePostedFrom(value: unknown): Post["postedFrom"] {
  return value === "post" || value === "clip" ? value : undefined;
}

function sanitizePostSource(value: unknown): PostSource {
  return VALID_POST_SOURCES.has(value as PostSource) ? value as PostSource : "manual";
}

function sanitizeOgp(value: unknown): OgpPreview | undefined {
  if (!isRecord(value)) return undefined;
  const ogp: OgpPreview = {
    title: optionalString(value.title),
    description: optionalString(value.description),
    image: optionalString(value.image),
    siteName: optionalString(value.siteName),
  };
  return Object.values(ogp).some(Boolean) ? ogp : undefined;
}

function sanitizeOgpFetch(value: unknown): OgpFetchState | undefined {
  if (!isRecord(value)) return undefined;
  const status = value.status === "pending" || value.status === "complete" || value.status === "exhausted"
    ? value.status
    : undefined;

  return {
    attemptCount: typeof value.attemptCount === "number" && Number.isFinite(value.attemptCount)
      ? Math.max(0, Math.floor(value.attemptCount))
      : 0,
    lastAttemptAt: optionalString(value.lastAttemptAt),
    nextRetryAt: value.nextRetryAt === null ? null : optionalString(value.nextRetryAt),
    status,
  };
}

function sanitizeMediaRefs(value: unknown): PostMediaRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const mediaRefs = value.flatMap((item): PostMediaRef[] => {
    if (!isRecord(item)) return [];
    const id = optionalString(item.id);
    const uri = optionalString(item.uri);
    if (!id || !uri) return [];

    const kind = VALID_MEDIA_KINDS.has(item.kind as PostMediaRef["kind"]) ? item.kind as PostMediaRef["kind"] : "image";
    const storage = VALID_MEDIA_STORAGES.has(item.storage as PostMediaRef["storage"])
      ? item.storage as PostMediaRef["storage"]
      : "device-reference";

    return [{
      id,
      kind,
      storage,
      uri,
      mimeType: optionalString(item.mimeType),
      name: optionalString(item.name),
    }];
  });

  return mediaRefs.length > 0 ? mediaRefs : undefined;
}

function sanitizeMediaOrder(value: unknown, mediaRefs?: PostMediaRef[]): PostMediaOrderItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const knownMediaRefIds = new Set((mediaRefs ?? []).map((mediaRef) => mediaRef.id));
  const mediaOrder = value.flatMap((item): PostMediaOrderItem[] => {
    if (!isRecord(item)) return [];
    const source = item.source === "imageBlob" || item.source === "mediaRef" ? item.source : null;
    const id = optionalString(item.id);
    if (!source || !id) return [];
    if (source === "mediaRef" && !knownMediaRefIds.has(id)) return [];
    return [{ source, id }];
  });

  return mediaOrder.length > 0 ? mediaOrder : undefined;
}

function sanitizeTagSuggestions(value: unknown): TagSuggestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TagSuggestion[] => {
    if (typeof item === "string") {
      const name = item.trim().replace(/^#/, "");
      return name ? [{ name, isSystem: false }] : [];
    }
    if (!isRecord(item)) return [];
    const name = optionalString(item.name)?.replace(/^#/, "");
    return name ? [{ name, isSystem: Boolean(item.isSystem) }] : [];
  });
}

function sanitizePostCardSectionOrder(value: unknown): PostCardSection[] {
  if (!Array.isArray(value)) return DEFAULT_POST_CARD_SECTION_ORDER;
  const nextOrder = value.filter((section): section is PostCardSection => VALID_CARD_SECTIONS.has(section as PostCardSection));
  DEFAULT_POST_CARD_SECTION_ORDER.forEach((section) => {
    if (!nextOrder.includes(section)) nextOrder.push(section);
  });
  return nextOrder;
}

function sanitizeThemeMode(value: unknown): ThemeMode {
  return VALID_THEME_MODES.has(value as ThemeMode) ? value as ThemeMode : "system";
}

function sanitizeBackupSettings(value: unknown): HollogBackupSettings {
  const settings = isRecord(value) ? value : {};
  return {
    themeMode: sanitizeThemeMode(settings.themeMode),
    hidePostedInSourceTabs: asBoolean(settings.hidePostedInSourceTabs, false),
    hiddenTags: uniqueTags(asStringArray(settings.hiddenTags)),
    systemTaggingEnabled: asBoolean(settings.systemTaggingEnabled, true),
    tagSuggestions: sanitizeTagSuggestions(settings.tagSuggestions),
    postCardSectionOrder: sanitizePostCardSectionOrder(settings.postCardSectionOrder),
  };
}

function sanitizePost(value: unknown, index: number): Post | null {
  if (!isRecord(value)) return null;

  const id = optionalString(value.id) ?? createImportPostId(index);
  const body = asString(value.body).trim();
  const url = optionalString(value.url);
  const tags = uniqueTags(asStringArray(value.tags));
  const mediaRefs = sanitizeMediaRefs(value.mediaRefs);
  const mediaOrder = sanitizeMediaOrder(value.mediaOrder, mediaRefs);
  const createdAt = optionalString(value.createdAt) ?? new Date().toISOString();
  const updatedAt = optionalString(value.updatedAt) ?? createdAt;

  if (!body && !url && tags.length === 0 && (!mediaRefs || mediaRefs.length === 0)) {
    return null;
  }

  return {
    id,
    type: sanitizePostType(value.type),
    postedFrom: sanitizePostedFrom(value.postedFrom),
    body,
    url,
    ogp: sanitizeOgp(value.ogp),
    ogpFetch: sanitizeOgpFetch(value.ogpFetch),
    imageBlobs: undefined,
    imageBlobIds: undefined,
    thumbnailBlobs: undefined,
    mediaRefs,
    mediaOrder,
    tags,
    source: sanitizePostSource(value.source),
    createdAt,
    updatedAt,
  };
}

function toBackupPost(post: Post): HollogBackupPostV1 {
  const imageBlobs = post.imageBlobs && post.imageBlobs.length > 0
    ? post.imageBlobs
    : post.imageBlob
      ? [post.imageBlob]
      : [];

  return {
    id: post.id,
    type: post.type,
    postedFrom: post.postedFrom,
    body: post.body,
    url: post.url,
    ogp: post.ogp,
    ogpFetch: post.ogpFetch,
    imageBlobIds: post.imageBlobIds,
    mediaRefs: post.mediaRefs,
    mediaOrder: post.mediaOrder,
    tags: post.tags,
    source: post.source,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    legacyImageCount: imageBlobs.length || undefined,
    thumbnailCount: post.thumbnailBlobs?.length || undefined,
  };
}

export function createHollogBackup(posts: Post[], settings: HollogBackupSettings): HollogBackupV1 {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    notes: [
      "This backup includes posts, tags, link previews, app settings, and media reference information.",
      "Image and video files themselves are not included yet.",
    ],
    settings,
    posts: posts.map(toBackupPost),
  };
}

export function parseHollogBackup(value: unknown): ParsedHollogBackup {
  if (!isRecord(value) || value.app !== BACKUP_APP || value.version !== BACKUP_VERSION) {
    throw new Error("Hollogのバックアップファイルではありません。");
  }

  if (!Array.isArray(value.posts)) {
    throw new Error("バックアップ内に投稿データがありません。");
  }

  const posts = value.posts
    .map((post, index) => sanitizePost(post, index))
    .filter((post): post is Post => Boolean(post));

  return {
    backup: {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: optionalString(value.exportedAt) ?? new Date().toISOString(),
      notes: asStringArray(value.notes),
      settings: sanitizeBackupSettings(value.settings),
      posts: value.posts as HollogBackupPostV1[],
    },
    posts,
    invalidPostCount: value.posts.length - posts.length,
  };
}

export function stringifyHollogBackup(backup: HollogBackupV1) {
  return JSON.stringify(backup, null, 2);
}

export function buildHollogBackupFilename(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `hollog-backup-${stamp}.json`;
}
