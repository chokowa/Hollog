"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePosts, type ImportConflictChoice, type ImportPostsPreview } from "@/hooks/use-posts";
import { AppHeader } from "@/components/app-header";
import { PostFeed } from "@/components/post-feed";
import { BottomNav } from "@/components/bottom-nav";
import { CalendarView, type CalendarFilter } from "@/components/calendar-view";
import { ComposerModal } from "@/components/composer-modal";
import { PostDetail } from "@/components/post-detail";
import { ShareImport } from "@/components/share-import";
import { SettingsView } from "@/components/settings-view";
import { BackupImportReview } from "@/components/backup-import-review";
import { TagManagerView } from "@/components/tag-manager-view";
import { ImageViewer } from "@/components/ui/image-viewer";
import { SwipeConfirmSheet } from "@/components/ui/swipe-confirm-sheet";
import { useTheme } from "@/hooks/use-theme";
import { copyTextToClipboard } from "@/lib/clipboard";
import { compressLargeInlineImage, formatImageSize } from "@/lib/image-compression";
import { createThumbnailBlobs } from "@/lib/image-thumbnails";
import { MAX_INLINE_IMAGE_SIZE_BYTES, validateImageFile } from "@/lib/image-validation";
import {
  buildHollogBackupFilename,
  createHollogBackup,
  parseHollogBackup,
  stringifyHollogBackup,
  type HollogBackupSettings,
  type ParsedHollogBackup,
} from "@/lib/hollog-backup";
import {
  copyNativeImageToClipboard,
  openNativeJsonFile,
  pickNativeImages,
  readNativeClipboardImages,
  readNativeClipboardText,
  saveNativeImages,
  saveNativeJsonFile,
  type NativePickedMedia,
  type NativeSaveMediaItem,
} from "@/lib/native-media-picker";
import { fetchOgpPreview } from "@/lib/ogp-preview";
import { readPostCardSectionOrder, writePostCardSectionOrder, type PostCardSection } from "@/lib/post-card-layout";
import { buildNextOgpFetchState, canAutoRetryOgp, isOgpIncomplete, mergeOgpPreview, resetOgpFetchState } from "@/lib/post-ogp";
import { createImageBlobId, normalizeImageBlobIds, normalizeMediaOrder } from "@/lib/post-media";
import { postTypeLabels } from "@/lib/post-labels";
import { readSystemTaggingEnabled, readTagSuggestionCatalog, uniqueTagSuggestions, writeSystemTaggingEnabled, writeTagSuggestionCatalog } from "@/lib/tag-suggestions";
import type { TagContextAction } from "@/components/ui/tag-context-menu";
import type { InlineImageSource } from "@/components/ui/post-composer";
import type { ImageOriginRect, ImageViewerRoute } from "@/types/navigation";
import type { OgpPreview, Post, PostMediaRef, PostType } from "@/types/post";

type ActiveView = "home" | "calendar" | "post" | "profile" | "detail" | "share" | "settings" | "tag-manager";
type AppHistoryState = {
  bocchiSns: true;
  view: ActiveView;
  postId?: string | null;
  composer?: "new" | "edit" | null;
  activeTag?: string | null;
  imageViewer?: ImageViewerRoute | null;
};

type NativeSharePayload = {
  shareKey?: string;
  text?: string;
  subject?: string;
  title?: string;
  htmlText?: string;
  sourceUrl?: string;
  previewImageUrl?: string;
  clipText?: string;
  images?: Array<{
    name?: string;
    type?: string;
    dataUrl?: string;
    previewDataUrl?: string;
    fileUri?: string;
    uri?: string;
    id?: string;
    kind?: "image" | "video";
    storage?: "device-reference" | "app-local-copy";
  }>;
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

function extractSharedUrl(...values: string[]) {
  for (const value of values) {
    URL_PATTERN.lastIndex = 0;
    const match = URL_PATTERN.exec(value);
    if (match?.[0]) {
      return canonicalizeSharedUrl(match[0].replace(/[)、。,\].!?]+$/, ""));
    }
  }
  return "";
}

function removeSharedUrls(value: string) {
  URL_PATTERN.lastIndex = 0;
  return value.replace(URL_PATTERN, "").replace(/\s+/g, " ").trim();
}

function canonicalizeSharedUrl(value: string) {
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (key === "igsh" || key === "fbclid" || key === "gclid" || key.startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function getShareSiteName(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") return "YouTube";
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "Instagram";
    if (hostname === "x.com" || hostname === "twitter.com") return "X";
    if (hostname === "amazon.co.jp" || hostname.endsWith(".amazon.co.jp") || hostname === "amzn.asia") return "Amazon";
    return hostname;
  } catch {
    return "";
  }
}

function buildIntentPreview({
  url,
  title,
  description,
  image,
}: {
  url: string;
  title: string;
  description: string;
  image: string;
}): OgpPreview | undefined {
  const siteName = getShareSiteName(url);
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  const cleanImage = image.trim();
  if (!cleanTitle && !cleanDescription && !cleanImage) return undefined;

  return {
    title: cleanTitle || undefined,
    description: cleanDescription && cleanDescription !== cleanTitle ? cleanDescription : undefined,
    image: cleanImage || undefined,
    siteName: siteName || undefined,
  };
}

type SharedImagePreview = {
  id: string;
  name: string;
  type: string;
  previewUrl: string;
  mediaRef?: PostMediaRef;
};

type PendingShareImport = {
  url: string;
  memo: string;
  ogp?: OgpPreview;
  images: SharedImagePreview[];
  imageBlobs: Blob[];
  mediaRefs: PostMediaRef[];
};

const NATIVE_SHARE_DEDUP_WINDOW_MS = 10000;
const CONSUMED_NATIVE_SHARE_TTL_MS = 10 * 60 * 1000;
const CONSUMED_NATIVE_SHARE_STORAGE_KEY = "bocchisns_consumed_native_share_keys";

type AppToast = {
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

type CalendarState = {
  selectedDateKey: string | null;
  visibleMonthKey: string | null;
  activeFilter: CalendarFilter;
  activeTags: string[];
};

type TagManagerIntent = {
  tag: string;
  untaggedOnly: boolean;
  token: string;
};

type TagDeleteIntent = {
  tag: string;
  count: number;
};

type PendingBackupImport = {
  parsed: ParsedHollogBackup;
  preview: ImportPostsPreview;
  choices: Record<string, ImportConflictChoice>;
};

function dataUrlToBlob(dataUrl: string, fallbackType: string) {
  const [header, base64Data] = dataUrl.split(",");
  if (!header || !base64Data) return null;

  const mimeMatch = header.match(/data:([^;]+)/);
  const type = mimeMatch?.[1] || fallbackType;
  const binary = window.atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("画像を読み込めませんでした。"));
    reader.readAsDataURL(blob);
  });
}

function getOrderedPostImageItem(post: Post, index: number) {
  const imageBlobs = post.imageBlobs && post.imageBlobs.length > 0
    ? post.imageBlobs
    : post.imageBlob
      ? [post.imageBlob]
      : [];
  const imageBlobIds = normalizeImageBlobIds(imageBlobs, post.imageBlobIds) ?? imageBlobs.map(createImageBlobId);
  const mediaRefs = post.mediaRefs ?? [];
  const orderedItems = normalizeMediaOrder({
    imageBlobs,
    imageBlobIds,
    mediaRefs,
    mediaOrder: post.mediaOrder,
  }) ?? [
    ...imageBlobIds.map((id) => ({ source: "imageBlob" as const, id })),
    ...mediaRefs.map((mediaRef) => ({ source: "mediaRef" as const, id: mediaRef.id })),
  ];
  const target = orderedItems[index];
  if (!target) return null;

  if (target.source === "imageBlob") {
    const blobIndex = imageBlobIds.indexOf(target.id);
    const blob = blobIndex >= 0 ? imageBlobs[blobIndex] : null;
    return blob ? { kind: "blob" as const, blob, index: blobIndex } : null;
  }

  const mediaRef = mediaRefs.find((item) => item.id === target.id && item.kind === "image");
  return mediaRef ? { kind: "mediaRef" as const, mediaRef } : null;
}

async function saveJsonTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const file = new File([blob], fileName, { type: "application/json" });
  const shareNavigator = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (shareNavigator.share && shareNavigator.canShare?.({ files: [file] })) {
    await shareNavigator.share({
      files: [file],
      title: "Hollogバックアップ",
      text: "Hollogのバックアップです。",
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getImageExtensionFromType(type?: string) {
  if (type === "image/png") return ".png";
  if (type === "image/webp") return ".webp";
  if (type === "image/gif") return ".gif";
  return ".jpg";
}

function sharedImageToPreview(image: NonNullable<NativeSharePayload["images"]>[number], index: number): SharedImagePreview | null {
  const name = image.name || `shared-image-${index + 1}`;
  const type = image.type || "image/jpeg";
  const uri = image.uri || image.fileUri;
  if (uri) {
    const mediaRef: PostMediaRef = {
      id: image.id || `${uri}-${index}`,
      kind: image.kind || "image",
      storage: image.storage || (image.fileUri ? "app-local-copy" : "device-reference"),
      uri,
      mimeType: type,
      name,
    };

    return {
      id: mediaRef.id,
      name,
      type,
      previewUrl: image.previewDataUrl || Capacitor.convertFileSrc(uri),
      mediaRef,
    };
  }

  if (image.dataUrl) {
    return {
      id: `${name}-${type}-${index}-${image.dataUrl.length}`,
      name,
      type,
      previewUrl: image.dataUrl,
    };
  }

  return null;
}

function appendPendingTag(tagsText: string, pendingTag?: string) {
  const trimmed = pendingTag?.trim().replace(/^#/, "");
  if (!trimmed) return tagsText;

  const currentTags = tagsText.split(",").map((tag) => tag.trim()).filter(Boolean);
  if (currentTags.includes(trimmed)) return tagsText;

  return [...currentTags, trimmed].join(", ");
}

function nativeMediaToRefs(items: NativePickedMedia[], prefix: string): PostMediaRef[] {
  return items.map((item, index) => ({
    id: item.id || `${prefix}-media-${Date.now()}-${index + 1}`,
    kind: item.kind || "image",
    storage: item.storage || "device-reference",
    uri: item.uri,
    mimeType: item.mimeType,
    name: item.name,
  }));
}

async function nativePreviewBlobsToThumbnails(items: NativePickedMedia[]) {
  const previewBlobs = items
    .map((item) => item.previewDataUrl ? dataUrlToBlob(item.previewDataUrl, item.mimeType || "image/jpeg") : null)
    .filter((blob): blob is Blob => Boolean(blob));
  return previewBlobs.length > 0 ? await createThumbnailBlobs(previewBlobs) : undefined;
}

function parseSharedPayload(payload: NativeSharePayload): PendingShareImport {
  const text = payload.text?.trim() ?? "";
  const subject = payload.subject?.trim() ?? "";
  const title = payload.title?.trim() ?? "";
  const htmlText = payload.htmlText?.trim() ?? "";
  const sourceUrl = payload.sourceUrl?.trim() ?? "";
  const previewImageUrl = payload.previewImageUrl?.trim() ?? "";
  const clipText = payload.clipText?.trim() ?? "";
  const url = extractSharedUrl(sourceUrl, text, clipText, htmlText, subject, title, previewImageUrl);
  const textMemo = url ? removeSharedUrls(text || clipText) : text || clipText;
  const memoParts = [
    subject || title,
    textMemo,
  ].filter(Boolean);

  const images = (payload.images ?? [])
    .map((image, index) => sharedImageToPreview(image, index))
    .filter((image): image is SharedImagePreview => Boolean(image));

  return {
    url,
    memo: Array.from(new Set(memoParts)).join("\n"),
    ogp: buildIntentPreview({
      url,
      title: title || subject,
      description: textMemo,
      image: previewImageUrl,
    }),
    images,
    imageBlobs: [],
    mediaRefs: images.map((image) => image.mediaRef).filter((mediaRef): mediaRef is PostMediaRef => Boolean(mediaRef)),
  };
}

function buildNativeShareKey(payload: NativeSharePayload, parsed: PendingShareImport) {
  if (payload.shareKey?.trim()) return payload.shareKey.trim();

  return [
    parsed.url,
    parsed.memo,
    parsed.ogp?.image ?? "",
    (payload.images ?? [])
      .map((image) => [
        image.uri ?? image.fileUri ?? "",
        image.name ?? "",
        image.type ?? "",
        image.dataUrl?.length ?? 0,
        image.previewDataUrl?.length ?? 0,
      ].join(":"))
      .join("|"),
  ].join("\n");
}

function readConsumedNativeShareKeys(now = Date.now()) {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(localStorage.getItem(CONSUMED_NATIVE_SHARE_STORAGE_KEY) ?? "{}") as Record<string, number>;
    const freshEntries = Object.entries(parsed).filter(([, consumedAt]) => (
      typeof consumedAt === "number" && now - consumedAt < CONSUMED_NATIVE_SHARE_TTL_MS
    ));
    const fresh = Object.fromEntries(freshEntries);
    if (freshEntries.length !== Object.keys(parsed).length) {
      localStorage.setItem(CONSUMED_NATIVE_SHARE_STORAGE_KEY, JSON.stringify(fresh));
    }
    return fresh;
  } catch {
    return {};
  }
}

function isConsumedNativeShareKey(shareKey: string, now = Date.now()) {
  return Boolean(readConsumedNativeShareKeys(now)[shareKey]);
}

function rememberConsumedNativeShareKey(shareKey: string, now = Date.now()) {
  if (typeof window === "undefined" || !shareKey) return;

  try {
    const consumedKeys = readConsumedNativeShareKeys(now);
    consumedKeys[shareKey] = now;
    localStorage.setItem(CONSUMED_NATIVE_SHARE_STORAGE_KEY, JSON.stringify(consumedKeys));
  } catch {}
}

export default function Home() {
  const {
    posts,
    visiblePosts,
    hidePostedInSourceTabs,
    setHidePostedInSourceTabs,
    hiddenTags,
    setHiddenTags,
    toggleHiddenTag,
    activeTab,
    setActiveTab,
    activeTag,
    setActiveTag,
    availableTags,
    searchQuery,
    setSearchQuery,
    isBooting,
    isBusy,
    postImageUrlMap,
    postThumbnailUrlMap,
    loadPosts,
    createPost,
    updatePost,
    updatePostStatus,
    updatePostOgp,
    bulkUpdatePostTags,
    deletePostsByTag,
    deletePost,
    restorePost,
    restoreAllTrashedPosts,
    emptyTrash,
    previewImportPosts,
    importPosts,
    fromPost,
    emptyForm,
    buildTweetText,
  } = usePosts();

  // 表示・入力状態
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [imageViewerRoute, setImageViewerRoute] = useState<ImageViewerRoute | null>(null);
  const [imageViewerOriginRect, setImageViewerOriginRect] = useState<ImageOriginRect | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [systemTaggingEnabled, setSystemTaggingEnabledState] = useState(readSystemTaggingEnabled);
  const [postCardSectionOrder, setPostCardSectionOrderState] = useState(readPostCardSectionOrder);
  const [composerValue, setComposerValue] = useState(emptyForm);
  const [shareDraftMediaRefs, setShareDraftMediaRefs] = useState<PostMediaRef[]>([]);
  const [shareDraftThumbnailBlobs, setShareDraftThumbnailBlobs] = useState<Blob[] | undefined>();
  const [imageError, setImageError] = useState<string>("");
  const [toast, setToast] = useState<AppToast | null>(null);
  const [isQuickPosting, setIsQuickPosting] = useState(false);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | null>(null);
  const [pendingShareImport, setPendingShareImport] = useState<PendingShareImport | null>(null);
  const [tagManagerIntent, setTagManagerIntent] = useState<TagManagerIntent | null>(null);
  const [tagDeleteIntent, setTagDeleteIntent] = useState<TagDeleteIntent | null>(null);
  const [calendarState, setCalendarState] = useState<CalendarState>({
    selectedDateKey: null,
    visibleMonthKey: null,
    activeFilter: "all",
    activeTags: [],
  });
  const activeViewRef = useRef<ActiveView>("home");
  const selectedPostIdRef = useRef<string | null>(null);
  const activeTagRef = useRef<string | null>(null);
  const launchedFromShareRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const scrollIntentStartYRef = useRef(0);
  const scrollIntentDirectionRef = useRef<"up" | "down" | null>(null);
  const isTopChromeHiddenRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollChromeTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const quickImageInputRef = useRef<HTMLInputElement | null>(null);
  const quickCameraInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTimelineChromeHiddenRef = useRef<boolean | null>(null);
  const nativeShareDedupRef = useRef<{ key: string; receivedAt: number } | null>(null);
  const activeNativeShareKeyRef = useRef<string | null>(null);
  const ogpRefreshInFlightRef = useRef<Set<string>>(new Set());
  const postsRef = useRef<Post[]>([]);
  const { mode: themeMode, setTheme } = useTheme();

  const selectedPost = posts.find((p) => p.id === selectedPostId);
  const visibleCalendarPosts = useMemo(() => {
    const activePosts = posts.filter((post) => !post.trashedAt);
    if (hiddenTags.length === 0) return activePosts;
    const hiddenTagSet = new Set(hiddenTags);
    return activePosts.filter((post) => !post.tags.some((tag) => hiddenTagSet.has(tag)));
  }, [hiddenTags, posts]);
  const handleCalendarStateChange = useCallback((nextState: { selectedDateKey: string; visibleMonthKey: string }) => {
    setCalendarState((current) => (
      current.selectedDateKey === nextState.selectedDateKey && current.visibleMonthKey === nextState.visibleMonthKey
        ? current
        : { ...current, ...nextState }
    ));
  }, []);
  const handleCalendarFilterChange = useCallback((nextFilterState: { activeFilter: CalendarFilter; activeTags: string[] }) => {
    setCalendarState((current) => (
      current.activeFilter === nextFilterState.activeFilter
        && current.activeTags.length === nextFilterState.activeTags.length
        && current.activeTags.every((tag, index) => tag === nextFilterState.activeTags[index])
        ? current
        : { ...current, ...nextFilterState }
    ));
  }, []);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  const showToast = useCallback((message: string, action?: AppToast["action"]) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, action });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    posts.forEach((post) => {
      post.tags.forEach((tag) => {
        if (tag.trim()) tagSet.add(tag);
      });
    });
    return Array.from(tagSet);
  }, [posts]);

  const setTimelineChromeHidden = useCallback((hidden: boolean) => {
    isTopChromeHiddenRef.current = hidden;
    document.documentElement.dataset.timelineChrome = hidden ? "hidden" : "visible";
  }, []);

  const applyHistoryState = useCallback((state: AppHistoryState | null) => {
    const nextState: AppHistoryState = state?.bocchiSns ? state : { bocchiSns: true, view: "home" };
    setActiveView(nextState.view);
    setSelectedPostId(nextState.postId ?? null);
    setImageViewerRoute(nextState.imageViewer ?? null);
    if (!nextState.imageViewer) {
      setImageViewerOriginRect(null);
    }
    if (nextState.view === "home") {
      setActiveTag(nextState.activeTag ?? null);
    }
    setIsComposerOpen(Boolean(nextState.composer));
    setIsEditorOpen(nextState.composer === "edit");
    if (!nextState.composer) {
      setImageError("");
    }
  }, [setActiveTag]);

  const replaceHistoryState = useCallback((state: AppHistoryState) => {
    window.history.replaceState(state, "", window.location.href);
  }, []);

  const pushHistoryState = useCallback((state: AppHistoryState) => {
    window.history.pushState(state, "", window.location.href);
    applyHistoryState(state);
  }, [applyHistoryState]);

  const moveToHistoryState = useCallback((state: AppHistoryState) => {
    replaceHistoryState(state);
    applyHistoryState(state);
  }, [applyHistoryState, replaceHistoryState]);

  const getCurrentHistoryBase = useCallback((): AppHistoryState => {
    const currentState = window.history.state as AppHistoryState | null;
    const baseState: AppHistoryState = currentState?.bocchiSns
      ? currentState
      : {
          bocchiSns: true,
          view: activeViewRef.current,
          postId: selectedPostIdRef.current,
          activeTag: activeTagRef.current,
        };

    return {
      ...baseState,
      imageViewer: null,
    };
  }, []);

  const openImageViewer = useCallback((route: ImageViewerRoute, originRect?: ImageOriginRect | null) => {
    setImageViewerOriginRect(originRect ?? null);
    pushHistoryState({
      ...getCurrentHistoryBase(),
      imageViewer: route,
    });
  }, [getCurrentHistoryBase, pushHistoryState]);

  const closeImageViewer = useCallback(() => {
    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.bocchiSns && currentState.imageViewer) {
      window.history.back();
      return;
    }
    setImageViewerRoute(null);
    setImageViewerOriginRect(null);
  }, []);

  const openPostDetail = useCallback((postId: string) => {
    pushHistoryState({ bocchiSns: true, view: "detail", postId });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
    });
  }, [pushHistoryState]);

  const scrollViewportToTop = useCallback((behavior: ScrollBehavior = "auto") => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior });
    });
  }, []);

  const resetToHome = useCallback((nextActiveTag: string | null = null) => {
    moveToHistoryState({ bocchiSns: true, view: "home", activeTag: nextActiveTag });
  }, [moveToHistoryState]);

  const clearPendingShare = useCallback(() => {
    setPendingShareImport(null);
    setShareDraftMediaRefs([]);
    setShareDraftThumbnailBlobs(undefined);
    activeNativeShareKeyRef.current = null;
  }, []);

  const rememberActiveNativeShareConsumed = useCallback(() => {
    const shareKey = activeNativeShareKeyRef.current;
    if (!shareKey) return;

    const now = Date.now();
    rememberConsumedNativeShareKey(shareKey, now);
    nativeShareDedupRef.current = { key: shareKey, receivedAt: now };
  }, []);

  const handlePostOgpFetchResult = useCallback(async (
    post: Post,
    fetchedOgp: OgpPreview | null | undefined,
    mode: "merge" | "replace" = "merge",
  ) => {
    if (!post.url) return;
    const latestPost = postsRef.current.find((current) => current.id === post.id) ?? post;
    const resolvedOgp = mode === "replace"
      ? (fetchedOgp ?? latestPost.ogp)
      : mergeOgpPreview(latestPost.ogp, fetchedOgp);
    const nextOgpFetch = buildNextOgpFetchState(latestPost, resolvedOgp);
    const ogpChanged = JSON.stringify(resolvedOgp ?? {}) !== JSON.stringify(latestPost.ogp ?? {});
    const fetchStateChanged = JSON.stringify(nextOgpFetch ?? {}) !== JSON.stringify(latestPost.ogpFetch ?? {});

    if (ogpChanged || fetchStateChanged) {
      await updatePostOgp(latestPost, resolvedOgp, nextOgpFetch);
    }
  }, [updatePostOgp]);

  const queuePostOgpRefresh = useCallback((post: Post, delayMs = 0) => {
    const latestPost = postsRef.current.find((current) => current.id === post.id) ?? post;
    if (!latestPost.url || !canAutoRetryOgp(latestPost) || ogpRefreshInFlightRef.current.has(latestPost.id)) return;

    const nextRetryAtMs = latestPost.ogpFetch?.nextRetryAt ? Date.parse(latestPost.ogpFetch.nextRetryAt) : NaN;
    const effectiveDelay = Number.isNaN(nextRetryAtMs)
      ? delayMs
      : Math.max(delayMs, Math.max(0, nextRetryAtMs - Date.now()));

    ogpRefreshInFlightRef.current.add(latestPost.id);
    window.setTimeout(async () => {
      const currentPost = postsRef.current.find((current) => current.id === latestPost.id);
      if (!currentPost || !currentPost.url || !canAutoRetryOgp(currentPost)) {
        ogpRefreshInFlightRef.current.delete(latestPost.id);
        return;
      }

      try {
        const refreshed = await fetchOgpPreview(currentPost.url);
        await handlePostOgpFetchResult(currentPost, refreshed);
      } catch {
        await handlePostOgpFetchResult(currentPost, null);
      } finally {
        ogpRefreshInFlightRef.current.delete(latestPost.id);
      }
    }, effectiveDelay);
  }, [handlePostOgpFetchResult]);

  const handleRetryPostOgp = useCallback(async (post: Post) => {
    if (!post.url) return;
    if (ogpRefreshInFlightRef.current.has(post.id)) {
      showToast("プレビューを再取得中です。");
      return;
    }

    const resetPost = await updatePostOgp(post, post.ogp, resetOgpFetchState());
    if (!resetPost) {
      showToast("プレビューを再取得できませんでした。");
      return;
    }

    showToast("プレビューを再取得します。");
    ogpRefreshInFlightRef.current.add(resetPost.id);
    try {
      const refreshed = await fetchOgpPreview(resetPost.url!, { bypassCache: true });
      await handlePostOgpFetchResult(resetPost, refreshed, "replace");
    } catch {
      await handlePostOgpFetchResult(resetPost, null, "replace");
    } finally {
      ogpRefreshInFlightRef.current.delete(resetPost.id);
    }
  }, [handlePostOgpFetchResult, showToast, updatePostOgp]);

  const finishShareFlow = useCallback((returnToSource: boolean) => {
    rememberActiveNativeShareConsumed();
    launchedFromShareRef.current = false;
    clearPendingShare();
    replaceHistoryState({ bocchiSns: true, view: "home", activeTag: null });
    applyHistoryState({ bocchiSns: true, view: "home", activeTag: null });
    setTimelineChromeHidden(false);
    scrollViewportToTop("auto");
    window.dispatchEvent(new Event("bocchi:timeline-top"));

    if (Capacitor.isNativePlatform() && returnToSource) {
      window.setTimeout(() => {
        void CapacitorApp.exitApp();
      }, 120);
    }
  }, [applyHistoryState, clearPendingShare, rememberActiveNativeShareConsumed, replaceHistoryState, scrollViewportToTop, setTimelineChromeHidden]);

  const resetToCalendar = useCallback(() => {
    moveToHistoryState({ bocchiSns: true, view: "calendar" });
  }, [moveToHistoryState]);

  const requestTimelineTop = useCallback(() => {
    setActiveTag(null);
    setTimelineChromeHidden(false);
    resetToHome(null);
    scrollViewportToTop("auto");
    window.dispatchEvent(new Event("bocchi:timeline-top"));
  }, [resetToHome, scrollViewportToTop, setActiveTag, setTimelineChromeHidden]);

  const handleTimelineTagChange = useCallback((tag: string | null) => {
    if (activeViewRef.current === "home") {
      if (!tag) {
        moveToHistoryState({ bocchiSns: true, view: "home", activeTag: null });
        return;
      }
      pushHistoryState({ bocchiSns: true, view: "home", activeTag: tag });
      return;
    }
    setActiveTag(tag);
  }, [moveToHistoryState, pushHistoryState, setActiveTag]);

  const goBackOrHome = useCallback(() => {
    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.bocchiSns && (currentState.view !== "home" || currentState.composer || currentState.imageViewer)) {
      window.history.back();
      return;
    }
    resetToHome(null);
  }, [resetToHome]);

  useEffect(() => {
    activeViewRef.current = activeView;
    selectedPostIdRef.current = selectedPostId;
    activeTagRef.current = activeTag;
    if (activeView !== "home") {
      setTimelineChromeHidden(false);
    }
  }, [activeTag, activeView, selectedPostId, setTimelineChromeHidden]);

  useEffect(() => {
    const TOP_REVEAL_Y = 48;
    const HIDE_START_Y = 120;
    const HIDE_AFTER_SCROLL = 44;
    const SHOW_AFTER_SCROLL = 32;
    const MIN_SCROLL_DELTA = 6;
    const SCROLL_CHROME_SETTLE_DELAY = 72; // Set to 0 to restore immediate hide/show.

    const applyTimelineChromeHidden = (hidden: boolean) => {
      pendingTimelineChromeHiddenRef.current = null;
      setTimelineChromeHidden(hidden);
    };

    const scheduleTimelineChromeHidden = (hidden: boolean, delay = SCROLL_CHROME_SETTLE_DELAY) => {
      if (hidden === isTopChromeHiddenRef.current) {
        pendingTimelineChromeHiddenRef.current = null;
        if (scrollChromeTimerRef.current !== null) {
          window.clearTimeout(scrollChromeTimerRef.current);
          scrollChromeTimerRef.current = null;
        }
        return;
      }
      if (pendingTimelineChromeHiddenRef.current === hidden) return;

      pendingTimelineChromeHiddenRef.current = hidden;
      if (scrollChromeTimerRef.current !== null) {
        window.clearTimeout(scrollChromeTimerRef.current);
        scrollChromeTimerRef.current = null;
      }

      if (delay <= 0) {
        applyTimelineChromeHidden(hidden);
        return;
      }

      scrollChromeTimerRef.current = window.setTimeout(() => {
        scrollChromeTimerRef.current = null;
        applyTimelineChromeHidden(hidden);
      }, delay);
    };

    const updateScrollChrome = () => {
      scrollFrameRef.current = null;
      if (activeViewRef.current !== "home") {
        pendingTimelineChromeHiddenRef.current = null;
        if (scrollChromeTimerRef.current !== null) {
          window.clearTimeout(scrollChromeTimerRef.current);
          scrollChromeTimerRef.current = null;
        }
        return;
      }

      const currentY = window.scrollY;
      const previousY = lastScrollYRef.current;
      const delta = currentY - previousY;
      if (Math.abs(delta) < MIN_SCROLL_DELTA) return;

      const direction = delta > 0 ? "down" : delta < 0 ? "up" : scrollIntentDirectionRef.current;

      let nextHidden = isTopChromeHiddenRef.current;
      if (!direction) {
        lastScrollYRef.current = currentY;
        return;
      }

      if (direction !== scrollIntentDirectionRef.current) {
        scrollIntentDirectionRef.current = direction;
        scrollIntentStartYRef.current = previousY;
      }

      const intentDistance = Math.abs(currentY - scrollIntentStartYRef.current);

      if (currentY < TOP_REVEAL_Y) {
        nextHidden = false;
      } else if (direction === "down" && currentY > HIDE_START_Y && intentDistance > HIDE_AFTER_SCROLL) {
        nextHidden = true;
      } else if (direction === "up" && intentDistance > SHOW_AFTER_SCROLL) {
        nextHidden = false;
      }

      if (nextHidden !== isTopChromeHiddenRef.current) {
        scheduleTimelineChromeHidden(nextHidden, currentY < TOP_REVEAL_Y ? 0 : SCROLL_CHROME_SETTLE_DELAY);
        scrollIntentStartYRef.current = currentY;
      }

      lastScrollYRef.current = currentY;
    };

    const handleScroll = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateScrollChrome);
    };

    lastScrollYRef.current = window.scrollY;
    setTimelineChromeHidden(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      if (scrollChromeTimerRef.current !== null) {
        window.clearTimeout(scrollChromeTimerRef.current);
      }
      pendingTimelineChromeHiddenRef.current = null;
    };
  }, [setTimelineChromeHidden]);

  useEffect(() => {
    const initialState = window.history.state as AppHistoryState | null;
    if (!initialState?.bocchiSns) {
      replaceHistoryState({ bocchiSns: true, view: "home", activeTag: null });
    }

    const handlePopState = (event: PopStateEvent) => {
      const nextState = event.state as AppHistoryState | null;
      applyHistoryState(nextState);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyHistoryState, replaceHistoryState]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let isMounted = true;
    let removeListener: (() => void) | null = null;

    void CapacitorApp.addListener("backButton", () => {
      if (activeViewRef.current === "calendar" && document.documentElement.dataset.calendarTagFilter === "open") {
        window.dispatchEvent(new Event("bocchi:calendar-close-tag-filter"));
        return;
      }

      const currentState = window.history.state as AppHistoryState | null;
      if (currentState?.bocchiSns && currentState.composer) {
        window.dispatchEvent(new Event("bocchi:composer-close-request"));
        return;
      }

      if (currentState?.bocchiSns && (currentState.view !== "home" || currentState.imageViewer)) {
        if (currentState.view === "calendar" && !currentState.imageViewer) {
          resetToHome(null);
          scrollViewportToTop("auto");
          return;
        }

        window.history.back();
        return;
      }

      if (activeTagRef.current) {
        moveToHistoryState({ bocchiSns: true, view: "home", activeTag: null });
        return;
      }

      void CapacitorApp.minimizeApp();
    }).then((listener) => {
      if (!isMounted) {
        listener.remove();
        return;
      }
      removeListener = () => listener.remove();
    });

    return () => {
      isMounted = false;
      removeListener?.();
    };
  }, [moveToHistoryState, resetToHome, scrollViewportToTop]);

  useEffect(() => {
    const handleNativeShare = (event: Event) => {
      const customEvent = event as CustomEvent<NativeSharePayload>;
      const payload = customEvent.detail ?? {};
      const nextShare = parseSharedPayload(payload);
      if (!nextShare.url && !nextShare.memo && nextShare.images.length === 0 && nextShare.imageBlobs.length === 0) return;
      const shareKey = buildNativeShareKey(payload, nextShare);
      const now = Date.now();
      const lastShare = nativeShareDedupRef.current;
      if (lastShare?.key === shareKey && now - lastShare.receivedAt < NATIVE_SHARE_DEDUP_WINDOW_MS) {
        nativeShareDedupRef.current = { key: shareKey, receivedAt: now };
        return;
      }
      if (isConsumedNativeShareKey(shareKey, now)) {
        nativeShareDedupRef.current = { key: shareKey, receivedAt: now };
        return;
      }
      nativeShareDedupRef.current = { key: shareKey, receivedAt: now };

      launchedFromShareRef.current = true;
      activeNativeShareKeyRef.current = shareKey;
      setPendingShareImport(nextShare);
      setShareDraftMediaRefs([]);
      setShareDraftThumbnailBlobs(undefined);
      pushHistoryState({ bocchiSns: true, view: "share" });
    };

    window.addEventListener("bocchiShareIntent", handleNativeShare);
    return () => window.removeEventListener("bocchiShareIntent", handleNativeShare);
  }, [pushHistoryState]);

  useEffect(() => {
    if (isEditorOpen && selectedPost) {
      const syncTimer = setTimeout(() => {
        setComposerValue(fromPost(selectedPost));
      }, 0);
      return () => clearTimeout(syncTimer);
    }
    if (isComposerOpen && !isEditorOpen) {
      const syncTimer = setTimeout(() => {
        setComposerValue(emptyForm);
      }, 0);
      return () => clearTimeout(syncTimer);
    }
  }, [emptyForm, fromPost, isComposerOpen, isEditorOpen, selectedPost]);

  const openNewComposer = useCallback(() => {
    setComposerValue(emptyForm);
    setIsEditorOpen(false);
    pushHistoryState({
      bocchiSns: true,
      view: activeViewRef.current,
      postId: selectedPostIdRef.current,
      composer: "new",
    });
  }, [emptyForm, pushHistoryState]);

  const openEditComposer = useCallback((post: Post) => {
    setComposerValue(fromPost(post));
    setIsEditorOpen(true);
    pushHistoryState({
      bocchiSns: true,
      view: activeViewRef.current === "detail" ? "detail" : activeViewRef.current,
      postId: post.id,
      composer: "edit",
    });
  }, [fromPost, pushHistoryState]);

  const closeComposer = useCallback(() => {
    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.bocchiSns && currentState.composer) {
      window.history.back();
      return;
    }
    setIsComposerOpen(false);
    setIsEditorOpen(false);
  }, []);

  const replaceToHome = useCallback(() => {
    resetToHome(null);
    setTimelineChromeHidden(false);
    scrollViewportToTop("auto");
    window.dispatchEvent(new Event("bocchi:timeline-top"));
  }, [resetToHome, scrollViewportToTop, setTimelineChromeHidden]);

  const showQuickPostToast = useCallback((post: Post | null, message: string) => {
    if (!post) {
      showToast("投稿できませんでした。");
      return;
    }

    showToast(message, {
      label: "編集",
      onClick: () => openEditComposer(post),
    });
  }, [openEditComposer, showToast]);

  const setSystemTaggingEnabled = useCallback((enabled: boolean) => {
    setSystemTaggingEnabledState(writeSystemTaggingEnabled(enabled));
  }, []);

  const setPostCardSectionOrder = useCallback((order: PostCardSection[]) => {
    setPostCardSectionOrderState(writePostCardSectionOrder(order));
  }, []);

  const buildBackupSettings = useCallback((): HollogBackupSettings => ({
    themeMode,
    hidePostedInSourceTabs,
    hiddenTags,
    systemTaggingEnabled,
    tagSuggestions: readTagSuggestionCatalog(),
    postCardSectionOrder,
  }), [hiddenTags, hidePostedInSourceTabs, postCardSectionOrder, systemTaggingEnabled, themeMode]);

  const handleExportJson = useCallback(async () => {
    setIsBackupBusy(true);
    try {
      const backup = createHollogBackup(postsRef.current, buildBackupSettings());
      const fileName = buildHollogBackupFilename();
      const content = stringifyHollogBackup(backup);
      if (Capacitor.isNativePlatform()) {
        const result = await saveNativeJsonFile(fileName, content);
        if (result.cancelled) {
          showToast("バックアップ保存をキャンセルしました。");
          return;
        }
      } else {
        await saveJsonTextFile(fileName, content);
      }
      showToast(`${backup.posts.length}件の投稿をバックアップしました。`);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      showToast(name === "AbortError" ? "バックアップ保存をキャンセルしました。" : "バックアップを保存できませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [buildBackupSettings, showToast]);

  const applyBackupImport = useCallback(async (
    parsed: ParsedHollogBackup,
    conflictChoices: Record<string, ImportConflictChoice> = {},
  ) => {
    setIsBackupBusy(true);
    try {
      const result = await importPosts(parsed.posts, { conflictChoices });
      if (!result) {
        showToast("バックアップを復元できませんでした。");
        return;
      }

      const backupSettings = parsed.backup.settings;
      setTheme(backupSettings.themeMode);
      setHidePostedInSourceTabs(backupSettings.hidePostedInSourceTabs);
      setHiddenTags([...hiddenTags, ...backupSettings.hiddenTags]);
      setSystemTaggingEnabled(backupSettings.systemTaggingEnabled);
      setPostCardSectionOrder(backupSettings.postCardSectionOrder);
      writeTagSuggestionCatalog(uniqueTagSuggestions([
        ...readTagSuggestionCatalog(),
        ...backupSettings.tagSuggestions,
      ]));

      const summary = [
        `${result.addedCount}件を新しく追加`,
        result.mergedTagCount > 0 ? `${result.mergedTagCount}件にタグを追加` : "",
        result.duplicateCount > 0 ? `${result.duplicateCount}件は追加なし` : "",
        result.overwrittenCount > 0 ? `${result.overwrittenCount}件をバックアップ内容で更新` : "",
        result.conflictCount > result.overwrittenCount ? `${result.conflictCount - result.overwrittenCount}件は今の内容を保持` : "",
        parsed.invalidPostCount > 0 ? `${parsed.invalidPostCount}件スキップ` : "",
      ].filter(Boolean).join(" / ");
      showToast(summary || "復元する新しい内容はありませんでした。");
      setPendingBackupImport(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "バックアップファイルを読み込めませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [
    hiddenTags,
    importPosts,
    setHiddenTags,
    setHidePostedInSourceTabs,
    setPostCardSectionOrder,
    setSystemTaggingEnabled,
    setTheme,
    showToast,
  ]);

  const handleImportJson = useCallback(async (file: File) => {
    setIsBackupBusy(true);
    try {
      const parsed = parseHollogBackup(JSON.parse(await file.text()));
      const preview = await previewImportPosts(parsed.posts);
      if (!preview) {
        showToast("バックアップ内容を確認できませんでした。");
        return;
      }

      setPendingBackupImport({ parsed, preview, choices: {} });
      showToast(
        preview.conflicts.length > 0
          ? `${preview.conflicts.length}件は内容を確認してください。`
          : "差異はありません。内容を確認して復元できます。",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "バックアップファイルを読み込めませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [previewImportPosts, showToast]);

  const handleImportJsonRequest = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    setIsBackupBusy(true);
    try {
      const opened = await openNativeJsonFile();
      if (opened.cancelled) {
        showToast("復元をキャンセルしました。");
        return;
      }
      if (!opened.content) {
        showToast("バックアップファイルを読み込めませんでした。");
        return;
      }

      const parsed = parseHollogBackup(JSON.parse(opened.content));
      const preview = await previewImportPosts(parsed.posts);
      if (!preview) {
        showToast("バックアップ内容を確認できませんでした。");
        return;
      }

      setPendingBackupImport({ parsed, preview, choices: {} });
      showToast(
        preview.conflicts.length > 0
          ? `${preview.conflicts.length}件は内容を確認してください。`
          : "差異はありません。内容を確認して復元できます。",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "バックアップファイルを読み込めませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [previewImportPosts, showToast]);

  const setBackupImportChoice = useCallback((key: string, choice: ImportConflictChoice) => {
    setPendingBackupImport((current) => current
      ? {
          ...current,
          choices: {
            ...current.choices,
            [key]: choice,
          },
        }
      : current);
  }, []);

  const confirmPendingBackupImport = useCallback(() => {
    if (!pendingBackupImport) return;
    void applyBackupImport(pendingBackupImport.parsed, pendingBackupImport.choices);
  }, [applyBackupImport, pendingBackupImport]);

  const confirmAllPendingBackupImport = useCallback((choice: ImportConflictChoice) => {
    if (!pendingBackupImport) return;
    const choices = Object.fromEntries(pendingBackupImport.preview.conflicts.map((conflict) => [conflict.key, choice]));
    setPendingBackupImport((current) => current ? { ...current, choices } : current);
  }, [pendingBackupImport]);

  const hasMediaForTag = useCallback((tag: string) => {
    return posts.some((post) => post.tags.includes(tag) && (
      (post.imageBlobs?.length ?? 0) > 0
      || Boolean(post.imageBlob)
      || (post.mediaRefs?.length ?? 0) > 0
    ));
  }, [posts]);

  const openCalendarWithTag = useCallback((tag: string) => {
    setCalendarState((current) => ({
      ...current,
      activeTags: [tag],
    }));
    pushHistoryState({ bocchiSns: true, view: "calendar" });
  }, [pushHistoryState]);

  const openTagManagerWithTag = useCallback((tag: string) => {
    setTagManagerIntent({
      tag,
      untaggedOnly: false,
      token: `${tag}-${Date.now()}`,
    });
    pushHistoryState({ bocchiSns: true, view: "tag-manager" });
  }, [pushHistoryState]);

  const handleDeletePostsByTag = useCallback(async (tag: string) => {
    const deletedCount = await deletePostsByTag(tag);
    setTagDeleteIntent(null);
    if (deletedCount > 0) {
      showToast(`${deletedCount}件の投稿を削除しました。`);
    }
  }, [deletePostsByTag, showToast]);

  const handleTagMenuAction = useCallback(async (action: TagContextAction, tag: string) => {
    if (action === "media") {
      if (!hasMediaForTag(tag)) return;
      setActiveTab("media");
      setActiveTag(tag);
      replaceHistoryState({ bocchiSns: true, view: "home", activeTag: tag });
      applyHistoryState({ bocchiSns: true, view: "home", activeTag: tag });
      return;
    }
    if (action === "calendar") {
      openCalendarWithTag(tag);
      return;
    }
    if (action === "copy") {
      const copied = await copyTextToClipboard(`#${tag}`);
      showToast(copied ? "タグ名をコピーしました。" : "コピーできませんでした。");
      return;
    }
    if (action === "visibility") {
      toggleHiddenTag(tag);
      showToast(hiddenTags.includes(tag) ? `#${tag} を再表示しました。` : `#${tag} を非表示にしました。`);
      return;
    }
    if (action === "manage") {
      openTagManagerWithTag(tag);
      return;
    }
    const count = posts.filter((post) => post.tags.includes(tag)).length;
    if (count > 0) {
      setTagDeleteIntent({ tag, count });
    }
  }, [
    applyHistoryState,
    hasMediaForTag,
    hiddenTags,
    openCalendarWithTag,
    openTagManagerWithTag,
    posts,
    replaceHistoryState,
    setActiveTab,
    setActiveTag,
    showToast,
    toggleHiddenTag,
  ]);

  const replaceToDetail = useCallback((postId: string) => {
    const detailState: AppHistoryState = { bocchiSns: true, view: "detail", postId };
    replaceHistoryState(detailState);
    applyHistoryState(detailState);
  }, [applyHistoryState, replaceHistoryState]);

  const prepareInlineImageFiles = useCallback(async (files: File[], source: InlineImageSource = "picker") => {
    if (source !== "camera" && source !== "clipboard") {
      return files;
    }

    const largeFiles = files.filter((file) => file.size > MAX_INLINE_IMAGE_SIZE_BYTES);
    if (largeFiles.length === 0) {
      return files;
    }

    const preparedFiles = await Promise.all(files.map((file) => compressLargeInlineImage(file)));
    const changedResults = preparedFiles.filter((result) => result.changed);
    if (changedResults.length > 0) {
      const originalSize = changedResults.reduce((total, result) => total + result.originalSize, 0);
      const finalSize = changedResults.reduce((total, result) => total + result.finalSize, 0);
      showToast(`軽量化しました（${formatImageSize(originalSize)} → ${formatImageSize(finalSize)}）`);
    } else {
      const originalSize = largeFiles.reduce((total, file) => total + file.size, 0);
      showToast(`軽量化できず元の画像を追加しました（${formatImageSize(originalSize)}）`);
    }

    return preparedFiles.map((result) => result.file);
  }, [showToast]);

  // 画像選択ハンドラー
  const handleImagesSelect = useCallback(async (files: File[], source?: InlineImageSource) => {
    let currentError = "";
    const validFiles: File[] = [];

    for (const file of files) {
      const error = validateImageFile(file);
      if (error) {
        currentError = error;
        break;
      }
      validFiles.push(file);
    }

    setImageError(currentError);
    if (!currentError && validFiles.length > 0) {
      const preparedFiles = await prepareInlineImageFiles(validFiles, source);
      setComposerValue((prev) => {
        const existingBlobs = prev.imageBlobs || [];
        const existingBlobIds = normalizeImageBlobIds(existingBlobs, prev.imageBlobIds) || [];
        const nextBlobs = [...existingBlobs, ...preparedFiles];
        if (nextBlobs.length > 4) {
          setImageError("画像は最大4枚まで選択できます。");
          return prev;
        }
        const nextImageBlobIds = [...existingBlobIds, ...preparedFiles.map(() => createImageBlobId())];
        return {
          ...prev,
          imageBlobs: nextBlobs,
          imageBlobIds: nextImageBlobIds,
          mediaOrder: normalizeMediaOrder({
            imageBlobs: nextBlobs,
            imageBlobIds: nextImageBlobIds,
            mediaRefs: prev.mediaRefs,
            mediaOrder: [
              ...(prev.mediaOrder ?? normalizeMediaOrder(prev) ?? []),
              ...nextImageBlobIds.slice(existingBlobIds.length).map((id) => ({ source: "imageBlob" as const, id })),
            ],
          }),
        };
      });
    }
  }, [prepareInlineImageFiles]);

  const createQuickImagePostFromFiles = useCallback(async (files: File[], source?: InlineImageSource) => {
    if (isQuickPosting) return;

    let currentError = "";
    const validFiles: File[] = [];
    for (const file of files.slice(0, 4)) {
      const error = validateImageFile(file);
      if (error) {
        currentError = error;
        break;
      }
      validFiles.push(file);
    }

    if (currentError) {
      showToast(currentError);
      return;
    }
    if (validFiles.length === 0) {
      showToast("画像が選択されませんでした。");
      return;
    }

    setIsQuickPosting(true);
    try {
      const preparedFiles = await prepareInlineImageFiles(validFiles, source);
      const imageBlobIds = preparedFiles.map(() => createImageBlobId());
      const thumbnailBlobs = await createThumbnailBlobs(preparedFiles);
      const created = await createPost({
        ...emptyForm,
        type: "post",
        imageBlobs: preparedFiles,
        imageBlobIds,
        mediaOrder: normalizeMediaOrder({
          imageBlobs: preparedFiles,
          imageBlobIds,
          mediaOrder: imageBlobIds.map((id) => ({ source: "imageBlob" as const, id })),
        }),
        thumbnailBlobs,
      });
      showQuickPostToast(created, "画像を投稿しました。");
      if (created) replaceToHome();
    } finally {
      setIsQuickPosting(false);
    }
  }, [createPost, emptyForm, isQuickPosting, prepareInlineImageFiles, replaceToHome, showQuickPostToast, showToast]);

  const createQuickImagePostFromNativeItems = useCallback(async (items: NativePickedMedia[], source: string) => {
    if (isQuickPosting) return;
    if (items.length === 0) {
      showToast(source === "clipboard" ? "クリップボードに画像が見つかりませんでした。" : "画像が選択されませんでした。");
      return;
    }

    setIsQuickPosting(true);
    try {
      const mediaRefs = nativeMediaToRefs(items.slice(0, 4), source);
      const thumbnailBlobs = await nativePreviewBlobsToThumbnails(items.slice(0, 4));
      const created = await createPost({
        ...emptyForm,
        type: "post",
        mediaRefs,
        mediaOrder: normalizeMediaOrder({
          mediaRefs,
          mediaOrder: mediaRefs.map((mediaRef) => ({ source: "mediaRef" as const, id: mediaRef.id })),
        }),
        thumbnailBlobs,
      });
      showQuickPostToast(created, "画像を投稿しました。");
      if (created) replaceToHome();
    } finally {
      setIsQuickPosting(false);
    }
  }, [createPost, emptyForm, isQuickPosting, replaceToHome, showQuickPostToast, showToast]);

  const handleQuickImagePost = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await pickNativeImages(4);
        await createQuickImagePostFromNativeItems(result.items ?? [], "quick-picked");
      } catch {
        showToast("画像を選択できませんでした。");
      }
      return;
    }

    quickImageInputRef.current?.click();
  }, [createQuickImagePostFromNativeItems, showToast]);

  const handleQuickCameraPost = useCallback(() => {
    quickCameraInputRef.current?.click();
  }, []);

  const handleQuickClipboardPost = useCallback(async () => {
    if (isQuickPosting) return;

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await readNativeClipboardImages(4);
        if (result.items?.length) {
          await createQuickImagePostFromNativeItems(result.items, "clipboard");
          return;
        }
      } catch {
        // 画像ではないクリップボードなら、続けてURLとして読みにいく。
      }
    }

    try {
      const clipboardText = await readClipboardUrlText();
      const url = extractSharedUrl(clipboardText ?? "");
      if (!url) {
        showToast("クリップボードに画像またはURLが見つかりませんでした。");
        return;
      }

      setIsQuickPosting(true);
      const created = await createPost({
        ...emptyForm,
        type: "clip",
        url,
      });
      showQuickPostToast(created, "リンクをクリップしました。");
      if (created) replaceToHome();
    } catch {
      showToast("クリップボードを読み込めませんでした。");
    } finally {
      setIsQuickPosting(false);
    }
  }, [createPost, createQuickImagePostFromNativeItems, emptyForm, isQuickPosting, replaceToHome, showQuickPostToast, showToast]);

  const addNativeItemsToComposer = useCallback(async (items: NativePickedMedia[], source: string) => {
    if (items.length === 0) {
      setImageError(source === "clipboard" ? "クリップボードに画像が見つかりませんでした。" : "");
      return;
    }

    const mediaRefs = nativeMediaToRefs(items, source);
    const thumbnailBlobs = await nativePreviewBlobsToThumbnails(items);

    setImageError("");
    setComposerValue((prev) => {
      const nextImageBlobIds = normalizeImageBlobIds(prev.imageBlobs, prev.imageBlobIds);
      const existingOrder = prev.mediaOrder ?? normalizeMediaOrder(prev) ?? [];
      const nextCount = (prev.imageBlobs || []).length + (prev.mediaRefs || []).length + mediaRefs.length;
      if (nextCount > 4) {
        setImageError("画像は最大4枚まで選択できます。");
        return prev;
      }

      return {
        ...prev,
        mediaRefs: [...(prev.mediaRefs || []), ...mediaRefs],
        imageBlobIds: nextImageBlobIds,
        mediaOrder: normalizeMediaOrder({
          imageBlobs: prev.imageBlobs,
          imageBlobIds: nextImageBlobIds,
          mediaRefs: [...(prev.mediaRefs || []), ...mediaRefs],
          mediaOrder: [
            ...existingOrder,
            ...mediaRefs.map((mediaRef) => ({ source: "mediaRef" as const, id: mediaRef.id })),
          ],
        }),
        thumbnailBlobs: thumbnailBlobs
          ? [...(prev.thumbnailBlobs || []), ...thumbnailBlobs]
          : prev.thumbnailBlobs,
      };
    });
  }, []);

  const handleNativeImagesSelect = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    const currentCount = (composerValue.imageBlobs || []).length + (composerValue.mediaRefs || []).length;
    const remaining = 4 - currentCount;
    if (remaining <= 0) {
      setImageError("画像は最大4枚まで選択できます。");
      return;
    }

    try {
      const result = await pickNativeImages(remaining);
      if (!result.items || result.items.length === 0) return;

      await addNativeItemsToComposer(result.items, "picked");
    } catch {
      setImageError("画像を選択できませんでした。");
    }
  }, [addNativeItemsToComposer, composerValue.imageBlobs, composerValue.mediaRefs]);

  const handleNativeClipboardImagesSelect = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    const currentCount = (composerValue.imageBlobs || []).length + (composerValue.mediaRefs || []).length;
    const remaining = 4 - currentCount;
    if (remaining <= 0) {
      setImageError("画像は最大4枚まで選択できます。");
      return;
    }

    try {
      const result = await readNativeClipboardImages(remaining);
      if (result.items?.length) {
        await addNativeItemsToComposer(result.items, "clipboard");
        return;
      }

      const clipboardText = await readClipboardUrlText();
      const url = extractSharedUrl(clipboardText ?? "");
      if (!url) {
        setImageError("クリップボードに画像またはURLが見つかりませんでした。");
        return;
      }

      setImageError("");
      setComposerValue((current) => ({
        ...current,
        url,
      }));
    } catch {
      setImageError("クリップボードから画像またはURLを読み込めませんでした。");
    }
  }, [addNativeItemsToComposer, composerValue.imageBlobs, composerValue.mediaRefs]);

  const addNativeItemsToShareDraft = useCallback(async (items: NativePickedMedia[], source: string) => {
    if (items.length === 0) {
      setImageError(source === "clipboard" ? "クリップボードに画像が見つかりませんでした。" : "");
      return;
    }

    const mediaRefs = nativeMediaToRefs(items, source);
    const thumbnailBlobs = await nativePreviewBlobsToThumbnails(items);

    setImageError("");
    setShareDraftMediaRefs((current) => {
      const existingCount = (pendingShareImport?.images.length ?? 0) + (pendingShareImport?.imageBlobs.length ?? 0) + current.length;
      if (existingCount + mediaRefs.length > 4) {
        setImageError("画像は最大4枚まで選択できます。");
        return current;
      }
      return [...current, ...mediaRefs];
    });
    if (thumbnailBlobs) {
      setShareDraftThumbnailBlobs((current) => [...(current || []), ...thumbnailBlobs]);
    }
  }, [pendingShareImport?.imageBlobs, pendingShareImport?.images]);

  const handleShareNativeImagesSelect = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    const currentCount = (pendingShareImport?.images.length ?? 0) + (pendingShareImport?.imageBlobs.length ?? 0) + shareDraftMediaRefs.length;
    const remaining = 4 - currentCount;
    if (remaining <= 0) {
      setImageError("画像は最大4枚まで選択できます。");
      return;
    }

    try {
      const result = await pickNativeImages(remaining);
      await addNativeItemsToShareDraft(result.items ?? [], "picked");
    } catch {
      setImageError("画像を選択できませんでした。");
    }
  }, [addNativeItemsToShareDraft, pendingShareImport?.imageBlobs, pendingShareImport?.images, shareDraftMediaRefs.length]);

  const handleShareNativeClipboardImagesSelect = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    const currentCount = (pendingShareImport?.images.length ?? 0) + (pendingShareImport?.imageBlobs.length ?? 0) + shareDraftMediaRefs.length;
    const remaining = 4 - currentCount;
    if (remaining <= 0) {
      setImageError("画像は最大4枚まで選択できます。");
      return;
    }

    try {
      const result = await readNativeClipboardImages(remaining);
      if (result.items?.length) {
        await addNativeItemsToShareDraft(result.items, "clipboard");
        return;
      }

      const clipboardText = await readClipboardUrlText();
      const url = extractSharedUrl(clipboardText ?? "");
      if (!url) {
        setImageError("クリップボードに画像またはURLが見つかりませんでした。");
        return;
      }

      setImageError("");
      setPendingShareImport((current) => {
        if (!current) return current;
        return {
          ...current,
          url,
        };
      });
    } catch {
      setImageError("クリップボードから画像またはURLを読み込めませんでした。");
    }
  }, [addNativeItemsToShareDraft, pendingShareImport?.imageBlobs, pendingShareImport?.images, shareDraftMediaRefs.length]);

  const composerPreviewUrls = useMemo(
    () => (composerValue.imageBlobs || []).map((blob) => URL.createObjectURL(blob)),
    [composerValue.imageBlobs],
  );

  const composerMediaPreviewUrls = useMemo(
    () => (composerValue.mediaRefs || []).map((mediaRef) => Capacitor.convertFileSrc(mediaRef.uri)),
    [composerValue.mediaRefs],
  );

  useEffect(() => {
    return () => composerPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [composerPreviewUrls]);

  // 詳細画面からの操作
  const handleCopyForX = async () => {
    if (!selectedPost) return;
    const copied = await copyTextToClipboard(buildTweetText(selectedPost));
    showToast(copied ? "X投稿用テキストをコピーしました。" : "コピーできませんでした。");
  };

  const handleOpenX = () => {
    if (!selectedPost) return;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildTweetText(selectedPost))}`;
    window.open(tweetUrl, "_blank", "noopener,noreferrer");
  };

  const handleMarkAsPosted = async () => {
    if (!selectedPost) return;
    const nextType = selectedPost.type === "posted" ? (selectedPost.postedFrom ?? "post") : "posted";
    const postedFrom = selectedPost.type === "posted" ? selectedPost.postedFrom : selectedPost.type;
    await updatePostStatus(selectedPost, nextType, postedFrom);
  };

  const handleSavePostMedia = useCallback(async (post: Post) => {
    if (!Capacitor.isNativePlatform()) {
      alert("端末への保存はAndroidアプリで利用できます。");
      return;
    }

    try {
      const legacyBlobs = post.imageBlobs && post.imageBlobs.length > 0
        ? post.imageBlobs
        : post.imageBlob
          ? [post.imageBlob]
          : [];
      const legacyItems = await Promise.all(
        legacyBlobs.map(async (blob, index) => ({
          dataUrl: await blobToDataUrl(blob),
          mimeType: blob.type || "image/jpeg",
          name: `bocchi-image-${post.id}-${index + 1}${getImageExtensionFromType(blob.type)}`,
        })),
      );
      const copiedItems: NativeSaveMediaItem[] = (post.mediaRefs ?? [])
        .filter((mediaRef) => mediaRef.kind === "image" && mediaRef.storage === "app-local-copy")
        .map((mediaRef, index) => ({
          uri: mediaRef.uri,
          mimeType: mediaRef.mimeType || "image/jpeg",
          name: mediaRef.name || `bocchi-image-${post.id}-${index + 1}${getImageExtensionFromType(mediaRef.mimeType)}`,
        }));
      const items: NativeSaveMediaItem[] = [...legacyItems, ...copiedItems];

      if (items.length === 0) {
        const hasDeviceReference = post.mediaRefs?.some((mediaRef) => mediaRef.kind === "image" && mediaRef.storage === "device-reference");
        showToast(hasDeviceReference ? "この画像はすでに端末内にあります。" : "保存できる画像がありません。");
        return;
      }

      const result = await saveNativeImages(items);
      showToast(result.savedCount > 0 ? "端末に保存しました。" : "保存できませんでした。");
    } catch {
      showToast("保存できませんでした。");
    }
  }, [showToast]);

  const handleCopyPostImage = useCallback(async (post: Post, index: number) => {
    const target = getOrderedPostImageItem(post, index);
    if (!target) {
      showToast("コピーできる画像が見つかりませんでした。");
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      showToast("画像コピーはAndroidアプリで利用できます。");
      return;
    }

    try {
      let item: NativeSaveMediaItem;
      if (target.kind === "blob") {
        item = {
          dataUrl: await blobToDataUrl(target.blob),
          mimeType: target.blob.type || "image/jpeg",
          name: `bocchi-image-${post.id}-${target.index + 1}${getImageExtensionFromType(target.blob.type)}`,
        };
      } else {
        item = {
          uri: target.mediaRef.uri,
          mimeType: target.mediaRef.mimeType || "image/jpeg",
          name: target.mediaRef.name || `bocchi-image-${post.id}-${index + 1}${getImageExtensionFromType(target.mediaRef.mimeType)}`,
        };
      }

      const result = await copyNativeImageToClipboard(item);
      showToast(result.copied ? "画像をクリップボードにコピーしました。" : "画像をコピーできませんでした。");
    } catch {
      showToast("画像をコピーできませんでした。");
    }
  }, [showToast]);

  const handlePostTypeChange = async (post: Post, nextType: PostType) => {
    const success = await updatePost(post.id, { ...fromPost(post), type: nextType }, post.source);
    showToast(success ? `${postTypeLabels[nextType]}に移動しました。` : "移動できませんでした。");
  };

  const handleDelete = async () => {
    if (!selectedPost) return;
    if (confirm("本当に削除しますか？")) {
      await deletePost(selectedPost.id);
      replaceToHome();
    }
  };

  const handleImportShare = async (postData: {
    body: string;
    url: string;
    tags: string[];
    type: PostType;
    ogp?: OgpPreview;
    imageBlobs?: Blob[];
    mediaRefs?: PostMediaRef[];
    thumbnailBlobs?: Blob[];
  }) => {
    const created = await createPost({
      type: postData.type,
      body: postData.body,
      url: postData.url,
      ogp: postData.url ? postData.ogp : undefined,
      tagsText: postData.tags.join(", "),
      imageBlobs: postData.imageBlobs,
      mediaRefs: postData.mediaRefs,
      thumbnailBlobs: postData.thumbnailBlobs,
    }, Capacitor.isNativePlatform() && launchedFromShareRef.current ? { commit: "sync" } : undefined);
    if (!created) return;
    if (isOgpIncomplete(created)) {
      queuePostOgpRefresh(created, 150);
    }
    if (Capacitor.isNativePlatform() && launchedFromShareRef.current) {
      finishShareFlow(true);
      return;
    }
    replaceToHome();
  };

  useEffect(() => {
    if (activeView !== "home" || visiblePosts.length === 0) return;
    visiblePosts
      .slice(0, 12)
      .filter(canAutoRetryOgp)
      .forEach((post, index) => {
        queuePostOgpRefresh(post, 250 + index * 120);
      });
  }, [activeView, queuePostOgpRefresh, visiblePosts]);

  const postViewerImages = imageViewerRoute?.kind === "post"
    ? postImageUrlMap[imageViewerRoute.postId]
    : undefined;
  const postViewerIndex = postViewerImages && imageViewerRoute?.kind === "post"
    ? Math.min(Math.max(imageViewerRoute.index, 0), postViewerImages.length - 1)
    : 0;
  const postImageViewer = imageViewerRoute?.kind === "post" && postViewerImages && postViewerImages.length > 0 ? (
    <ImageViewer
      key={`post-${imageViewerRoute.postId}-${postViewerIndex}`}
      images={postViewerImages}
      initialIndex={postViewerIndex}
      originRect={imageViewerOriginRect}
      onCopyCurrentImage={(index) => {
        const post = posts.find((item) => item.id === imageViewerRoute.postId);
        if (!post) return;
        return handleCopyPostImage(post, index);
      }}
      onClose={closeImageViewer}
    />
  ) : null;
  const toastElement = (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex transform-gpu justify-center px-4">
      <div
        className={`flex max-w-md transform-gpu items-center gap-3 rounded-full bg-neutral-950 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-[opacity,transform] duration-150 ease-out [contain:paint] ${
          toast ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"
        }`}
        aria-hidden={!toast}
      >
        <span>{toast?.message ?? ""}</span>
        {toast?.action && (
          <button
            type="button"
            className="rounded-full border border-white/35 px-3 py-1 text-xs font-bold text-white active:scale-95"
            onClick={() => {
              setToast(null);
              if (toastTimerRef.current) {
                window.clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
              }
              toast.action?.onClick();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
  const backupImportReviewElement = pendingBackupImport ? (
    <BackupImportReview
      backupPostCount={pendingBackupImport.parsed.posts.length}
      preview={pendingBackupImport.preview}
      choices={pendingBackupImport.choices}
      isBusy={isBackupBusy || isBusy}
      onChoiceChange={setBackupImportChoice}
      onConfirm={confirmPendingBackupImport}
      onConfirmAll={confirmAllPendingBackupImport}
      onCancel={() => setPendingBackupImport(null)}
    />
  ) : null;

  /* detail / share 画面は全画面で展開 */
  if (activeView === "detail" && selectedPost) {
    return (
      <main className="flex flex-col flex-1">
        <PostDetail
          post={selectedPost}
          imageUrls={postImageUrlMap[selectedPost.id]}
          onBack={goBackOrHome}
          onCopyForX={handleCopyForX}
          onCardCopy={(_, copied) => {
            showToast(copied ? "本文とURLをコピーしました。" : "コピーできませんでした。");
          }}
          onCardUrlCopy={(_, copied) => {
            showToast(copied ? "URLをコピーしました。" : "コピーできませんでした。");
          }}
          onOpenX={handleOpenX}
          onMarkAsPosted={handleMarkAsPosted}
          onEdit={() => openEditComposer(selectedPost)}
          onSaveMedia={handleSavePostMedia}
          onDelete={handleDelete}
          onTagClick={(tag) => {
            resetToHome(tag);
          }}
          onPostTypeChange={handlePostTypeChange}
          onPostOgpFetched={handlePostOgpFetchResult}
          onPostOgpRetry={handleRetryPostOgp}
          onImageOpen={(post, index, originRect) => {
            openImageViewer({ kind: "post", postId: post.id, index }, originRect);
          }}
          isBusy={isBusy}
        />
        <ComposerModal
          isOpen={isComposerOpen}
          onClose={closeComposer}
          title={isEditorOpen ? "投稿を編集" : "新しい投稿"}
          submitLabel="保存する"
          onSubmit={async (pendingTag) => {
            if (isEditorOpen && selectedPost) {
              const success = await updatePost(
                selectedPost.id,
                { ...composerValue, tagsText: appendPendingTag(composerValue.tagsText, pendingTag) },
                selectedPost.source,
              );
              if (success) replaceToDetail(selectedPost.id);
            } else {
              const nextValue = pendingTag
                ? { ...composerValue, tagsText: appendPendingTag(composerValue.tagsText, pendingTag) }
                : composerValue;
              const success = await createPost(nextValue);
              if (success) {
                setComposerValue(emptyForm);
                replaceToHome();
              }
            }
          }}
          value={composerValue}
          onChange={setComposerValue}
          onImagesSelect={handleImagesSelect}
          onNativeImagesSelect={Capacitor.isNativePlatform() ? handleNativeImagesSelect : undefined}
          onNativeClipboardImagesSelect={Capacitor.isNativePlatform() ? handleNativeClipboardImagesSelect : undefined}
          imageError={imageError}
          isBusy={isBusy}
          imagePreviewUrls={composerPreviewUrls}
          mediaPreviewUrls={composerMediaPreviewUrls}
          autoTagUrls={systemTaggingEnabled && !isEditorOpen}
        />
        {postImageViewer}
        {backupImportReviewElement}
        {toastElement}
      </main>
    );
  }

  if (activeView === "share") {
    return (
      <main className="flex flex-col flex-1">
        <ShareImport
          key={`${pendingShareImport?.url ?? ""}\n${pendingShareImport?.memo ?? ""}\n${pendingShareImport?.images.map((image) => image.id).join(",") ?? ""}`}
          onBack={() => {
            if (Capacitor.isNativePlatform() && launchedFromShareRef.current) {
              finishShareFlow(true);
              return;
            }
            goBackOrHome();
          }}
          onImport={handleImportShare}
          isBusy={isBusy}
          initialUrl={pendingShareImport?.url ?? ""}
          initialMemo={pendingShareImport?.memo ?? ""}
          initialOgp={pendingShareImport?.ogp}
          initialImagePreviews={pendingShareImport?.images ?? []}
          initialImageBlobs={pendingShareImport?.imageBlobs ?? []}
          additionalMediaRefs={shareDraftMediaRefs}
          additionalThumbnailBlobs={shareDraftThumbnailBlobs}
          onNativeImagesSelect={Capacitor.isNativePlatform() ? handleShareNativeImagesSelect : undefined}
          onNativeClipboardImagesSelect={Capacitor.isNativePlatform() ? handleShareNativeClipboardImagesSelect : undefined}
          onAdditionalMediaRemove={(mediaRefId) => {
            setShareDraftMediaRefs((current) => current.filter((mediaRef) => mediaRef.id !== mediaRefId));
            setShareDraftThumbnailBlobs(undefined);
          }}
        />
        {backupImportReviewElement}
        {toastElement}
      </main>
    );
  }

  if (activeView === "settings") {
    return (
      <main className="flex flex-col flex-1">
        <SettingsView
          onBack={goBackOrHome}
          onOpenTagManager={() => {
            setTagManagerIntent(null);
            pushHistoryState({ bocchiSns: true, view: "tag-manager" });
          }}
          themeMode={themeMode}
          onThemeChange={setTheme}
          hidePostedInSourceTabs={hidePostedInSourceTabs}
          onHidePostedInSourceTabsChange={setHidePostedInSourceTabs}
          systemTaggingEnabled={systemTaggingEnabled}
          onSystemTaggingEnabledChange={setSystemTaggingEnabled}
          postCardSectionOrder={postCardSectionOrder}
          onPostCardSectionOrderChange={setPostCardSectionOrder}
          existingTags={existingTags}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onImportJsonRequest={handleImportJsonRequest}
          useNativeJsonPicker={Capacitor.isNativePlatform()}
          isBackupBusy={isBackupBusy}
        />
        {backupImportReviewElement}
        {toastElement}
      </main>
    );
  }

  if (activeView === "tag-manager") {
    return (
      <main className="flex flex-col flex-1">
        <TagManagerView
          key={tagManagerIntent?.token ?? "tag-manager"}
          onBack={goBackOrHome}
          posts={posts.filter((post) => !post.trashedAt)}
          isBusy={isBusy}
          postThumbnailUrlMap={postThumbnailUrlMap}
          existingTags={existingTags}
          onBulkUpdatePostTags={bulkUpdatePostTags}
          initialActiveTab={tagManagerIntent ? "bulk" : "catalog"}
          initialPostTagFilter={tagManagerIntent?.tag ?? "__all__"}
          initialUntaggedOnly={tagManagerIntent?.untaggedOnly ?? true}
        />
        {backupImportReviewElement}
        {toastElement}
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 relative">
      {/* 画像エラー表示エリア */}
      {imageError && (
        <div className="absolute top-20 left-0 right-0 z-50 px-4 pointer-events-none">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 shadow-lg pointer-events-auto">
            {imageError}
          </div>
        </div>
      )}

      {activeView === "home" && (
        <>
          <PostFeed
            posts={visiblePosts}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            activeTag={activeTag}
            availableTags={availableTags}
            onTagChange={handleTimelineTagChange}
            onTagMenuAction={handleTagMenuAction}
            hasMediaForTag={hasMediaForTag}
            postImageUrlMap={postImageUrlMap}
            postThumbnailUrlMap={postThumbnailUrlMap}
            onPostClick={openPostDetail}
            onPostEdit={openEditComposer}
            onPostCopy={(_, copied) => {
              showToast(copied ? "本文とURLをコピーしました。" : "コピーできませんでした。");
            }}
            onPostUrlCopy={(_, copied) => {
              showToast(copied ? "URLをコピーしました。" : "コピーできませんでした。");
            }}
            onPostImageCopy={handleCopyPostImage}
            onPostSaveMedia={handleSavePostMedia}
            onPostTypeChange={handlePostTypeChange}
            onPostOgpFetched={handlePostOgpFetchResult}
            onPostOgpRetry={handleRetryPostOgp}
            onPostDelete={deletePost}
            onPostRestore={restorePost}
            onRestoreAllTrash={restoreAllTrashedPosts}
            onEmptyTrash={emptyTrash}
            imageViewerRoute={imageViewerRoute}
            imageViewerOriginRect={imageViewerOriginRect}
            onImageViewerOpen={openImageViewer}
            onImageViewerClose={closeImageViewer}
            isBooting={isBooting}
            postCardSectionOrder={postCardSectionOrder}
            header={
              <AppHeader
                onRefresh={loadPosts}
                isBusy={isBusy}
                onTimelineTopRequest={requestTimelineTop}
                onSettingsClick={() => pushHistoryState({ bocchiSns: true, view: "settings" })}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            }
          />
        </>
      )}

      {activeView === "calendar" && (
        <CalendarView
          posts={visibleCalendarPosts}
          postThumbnailUrlMap={postThumbnailUrlMap}
          onPostClick={openPostDetail}
          onPostEdit={openEditComposer}
          persistedSelectedDateKey={calendarState.selectedDateKey}
          persistedVisibleMonthKey={calendarState.visibleMonthKey}
          persistedActiveFilter={calendarState.activeFilter}
          persistedActiveTags={calendarState.activeTags}
          onCalendarStateChange={handleCalendarStateChange}
          onCalendarFilterChange={handleCalendarFilterChange}
        />
      )}

      {activeView === "profile" && (
        <div className="p-10 text-center">プロフィール機能は準備中です。</div>
      )}

      <BottomNav
        activeView={activeView === "profile" ? "profile" : activeView === "calendar" ? "calendar" : "home"}
        onViewChange={(view) => {
          if (view === "post") {
            openNewComposer();
          } else if (view === "home" && activeViewRef.current === "home") {
            requestTimelineTop();
          } else if (view === "home") {
            setTimelineChromeHidden(false);
            resetToHome(null);
            scrollViewportToTop("auto");
          } else if (view === "calendar") {
            setTimelineChromeHidden(false);
            resetToCalendar();
            scrollViewportToTop("auto");
          } else {
            setTimelineChromeHidden(false);
            pushHistoryState({ bocchiSns: true, view });
          }
        }}
        onPostClick={openNewComposer}
        onHomeClick={requestTimelineTop}
        onQuickImagePost={handleQuickImagePost}
        onQuickCameraPost={handleQuickCameraPost}
        onQuickClipboardPost={handleQuickClipboardPost}
        showPostFab={activeView !== "calendar"}
      />

      <input
        ref={quickImageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void createQuickImagePostFromFiles(Array.from(event.target.files ?? []), "picker");
          event.target.value = "";
        }}
      />
      <input
        ref={quickCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          void createQuickImagePostFromFiles(Array.from(event.target.files ?? []), "camera");
          event.target.value = "";
        }}
      />

      <ComposerModal
        isOpen={isComposerOpen}
        onClose={closeComposer}
        title={isEditorOpen ? "投稿を編集" : "新しい投稿"}
        submitLabel="保存する"
        onSubmit={async (pendingTag) => {
          if (isEditorOpen && selectedPost) {
            const success = await updatePost(
              selectedPost.id,
              { ...composerValue, tagsText: appendPendingTag(composerValue.tagsText, pendingTag) },
              selectedPost.source,
            );
            if (success) replaceToDetail(selectedPost.id);
          } else {
            const nextValue = pendingTag
              ? { ...composerValue, tagsText: appendPendingTag(composerValue.tagsText, pendingTag) }
              : composerValue;
            const success = await createPost(nextValue);
            if (success) {
              setComposerValue(emptyForm);
              replaceToHome();
            }
          }
        }}
        value={composerValue}
        onChange={setComposerValue}
        onImagesSelect={handleImagesSelect}
        onNativeImagesSelect={Capacitor.isNativePlatform() ? handleNativeImagesSelect : undefined}
        onNativeClipboardImagesSelect={Capacitor.isNativePlatform() ? handleNativeClipboardImagesSelect : undefined}
        imageError={imageError}
        isBusy={isBusy}
        imagePreviewUrls={composerPreviewUrls}
        mediaPreviewUrls={composerMediaPreviewUrls}
        autoTagUrls={systemTaggingEnabled && !isEditorOpen}
      />
      {postImageViewer}
      {backupImportReviewElement}
      {toastElement}
      {tagDeleteIntent && (
        <SwipeConfirmSheet
          title={`#${tagDeleteIntent.tag} の投稿を削除`}
          description={`${tagDeleteIntent.count}件の投稿が削除されます。この操作は元に戻せません。`}
          confirmLabel="削除する"
          onCancel={() => setTagDeleteIntent(null)}
          onConfirm={() => void handleDeletePostsByTag(tagDeleteIntent.tag)}
        />
      )}
    </main>
  );
}

async function readClipboardUrlText() {
  if (Capacitor.isNativePlatform()) {
    const nativeResult = await readNativeClipboardText();
    return nativeResult.text ?? "";
  }

  return await navigator.clipboard?.readText?.() ?? "";
}
