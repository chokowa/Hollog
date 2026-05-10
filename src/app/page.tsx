"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePosts } from "@/hooks/use-posts";
import { AppHeader } from "@/components/app-header";
import { PostFeed } from "@/components/post-feed";
import { BottomNav } from "@/components/bottom-nav";
import { CalendarView } from "@/components/calendar-view";
import { ComposerModal } from "@/components/composer-modal";
import { PostDetail } from "@/components/post-detail";
import { ShareImport } from "@/components/share-import";
import { SettingsView } from "@/components/settings-view";
import { TagManagerView } from "@/components/tag-manager-view";
import { ImageViewer } from "@/components/ui/image-viewer";
import { useTheme } from "@/hooks/use-theme";
import { copyTextToClipboard } from "@/lib/clipboard";
import { createThumbnailBlobs } from "@/lib/image-thumbnails";
import { validateImageFile } from "@/lib/image-validation";
import {
  pickNativeImages,
  readNativeClipboardImages,
  saveNativeImages,
  type NativePickedMedia,
  type NativeSaveMediaItem,
} from "@/lib/native-media-picker";
import { createImageBlobId, normalizeImageBlobIds, normalizeMediaOrder } from "@/lib/post-media";
import { postTypeLabels } from "@/lib/post-labels";
import { readSystemTaggingEnabled, writeSystemTaggingEnabled } from "@/lib/tag-suggestions";
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
  text?: string;
  subject?: string;
  title?: string;
  htmlText?: string;
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

const URL_PATTERN = /https?:\/\/[^\s<>"']+/;

function extractSharedUrl(...values: string[]) {
  for (const value of values) {
    const match = value.match(URL_PATTERN);
    if (match?.[0]) {
      return match[0].replace(/[)、。,\].!?]+$/, "");
    }
  }
  return "";
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
  images: SharedImagePreview[];
  imageBlobs: Blob[];
  mediaRefs: PostMediaRef[];
};

type AppToast = {
  message: string;
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
  const clipText = payload.clipText?.trim() ?? "";
  const url = extractSharedUrl(text, subject, title, htmlText, clipText);
  const memoParts = [
    subject || title,
    url ? text.replace(url, "").trim() : text || clipText,
  ].filter(Boolean);

  const images = (payload.images ?? [])
    .map((image, index) => sharedImageToPreview(image, index))
    .filter((image): image is SharedImagePreview => Boolean(image));

  return {
    url,
    memo: Array.from(new Set(memoParts)).join("\n"),
    images,
    imageBlobs: [],
    mediaRefs: images.map((image) => image.mediaRef).filter((mediaRef): mediaRef is PostMediaRef => Boolean(mediaRef)),
  };
}

export default function Home() {
  const {
    posts,
    visiblePosts,
    hidePostedInSourceTabs,
    setHidePostedInSourceTabs,
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
    deletePost,
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
  const [composerValue, setComposerValue] = useState(emptyForm);
  const [shareDraftMediaRefs, setShareDraftMediaRefs] = useState<PostMediaRef[]>([]);
  const [shareDraftThumbnailBlobs, setShareDraftThumbnailBlobs] = useState<Blob[] | undefined>();
  const [imageError, setImageError] = useState<string>("");
  const [toast, setToast] = useState<AppToast | null>(null);
  const [pendingShareImport, setPendingShareImport] = useState<PendingShareImport | null>(null);
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
  const pendingTimelineChromeHiddenRef = useRef<boolean | null>(null);
  const nativeShareDedupRef = useRef<{ key: string; receivedAt: number } | null>(null);
  const { mode: themeMode, setTheme } = useTheme();

  const selectedPost = posts.find((p) => p.id === selectedPostId);
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message });
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
  }, []);

  const finishShareFlow = useCallback((returnToSource: boolean) => {
    launchedFromShareRef.current = false;
    clearPendingShare();
    replaceHistoryState({ bocchiSns: true, view: "home", activeTag: null });
    applyHistoryState({ bocchiSns: true, view: "home", activeTag: null });

    if (Capacitor.isNativePlatform() && returnToSource) {
      window.setTimeout(() => {
        void CapacitorApp.minimizeApp();
      }, 120);
    }
  }, [applyHistoryState, clearPendingShare, replaceHistoryState]);

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
      const currentState = window.history.state as AppHistoryState | null;
      if (currentState?.bocchiSns && (currentState.view !== "home" || currentState.composer || currentState.imageViewer)) {
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
  }, [moveToHistoryState]);

  useEffect(() => {
    const handleNativeShare = (event: Event) => {
      const customEvent = event as CustomEvent<NativeSharePayload>;
      const nextShare = parseSharedPayload(customEvent.detail ?? {});
      if (!nextShare.url && !nextShare.memo && nextShare.images.length === 0 && nextShare.imageBlobs.length === 0) return;
      const shareKey = `${nextShare.url}\n${nextShare.memo}\n${nextShare.images.map((image) => `${image.name}:${image.type}:${image.previewUrl}`).join(",")}`;
      const now = Date.now();
      const lastShare = nativeShareDedupRef.current;
      if (lastShare?.key === shareKey && now - lastShare.receivedAt < 10000) return;
      nativeShareDedupRef.current = { key: shareKey, receivedAt: now };

      launchedFromShareRef.current = true;
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
  }, [resetToHome]);

  const setSystemTaggingEnabled = useCallback((enabled: boolean) => {
    setSystemTaggingEnabledState(writeSystemTaggingEnabled(enabled));
  }, []);

  const replaceToDetail = useCallback((postId: string) => {
    const detailState: AppHistoryState = { bocchiSns: true, view: "detail", postId };
    replaceHistoryState(detailState);
    applyHistoryState(detailState);
  }, [applyHistoryState, replaceHistoryState]);

  // 画像選択ハンドラー
  const handleImagesSelect = useCallback((files: File[]) => {
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
      setComposerValue((prev) => {
        const existingBlobs = prev.imageBlobs || [];
        const existingBlobIds = normalizeImageBlobIds(existingBlobs, prev.imageBlobIds) || [];
        const nextBlobs = [...existingBlobs, ...validFiles];
        if (nextBlobs.length > 4) {
          setImageError("画像は最大4枚まで選択できます。");
          return prev;
        }
        const nextImageBlobIds = [...existingBlobIds, ...validFiles.map(() => createImageBlobId())];
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
  }, []);

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
      await addNativeItemsToComposer(result.items ?? [], "clipboard");
    } catch {
      setImageError("クリップボードから画像を読み込めませんでした。");
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
      await addNativeItemsToShareDraft(result.items ?? [], "clipboard");
    } catch {
      setImageError("クリップボードから画像を読み込めませんでした。");
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

  // 投稿送信ハンドラー
  const handleSubmit = async () => {
    const success = await createPost(composerValue);
    if (success) {
      setComposerValue(emptyForm);
      replaceToHome();
    }
  };

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
        showToast(hasDeviceReference ? "この画像は元ファイル参照のため、すでに端末内にあります。" : "保存できる画像がありません。");
        return;
      }

      const result = await saveNativeImages(items);
      showToast(result.savedCount > 0 ? "端末に保存しました。" : "保存できませんでした。");
    } catch {
      showToast("保存できませんでした。");
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
    const success = await createPost({
      type: postData.type,
      body: postData.body,
      url: postData.url,
      ogp: postData.url ? postData.ogp : undefined,
      tagsText: postData.tags.join(", "),
      imageBlobs: postData.imageBlobs,
      mediaRefs: postData.mediaRefs,
      thumbnailBlobs: postData.thumbnailBlobs,
    }, Capacitor.isNativePlatform() && launchedFromShareRef.current ? { commit: "sync" } : undefined);
    if (!success) return;
    if (Capacitor.isNativePlatform() && launchedFromShareRef.current) {
      finishShareFlow(true);
      return;
    }
    replaceToHome();
  };

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
      onClose={closeImageViewer}
    />
  ) : null;
  const toastElement = toast ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <div className="max-w-md rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background shadow-xl">
        {toast.message}
      </div>
    </div>
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
            showToast(copied ? "本文をコピーしました。" : "コピーできませんでした。");
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
          onPostOgpFetched={(post, ogp) => {
            if (ogp) updatePostOgp(post, ogp);
          }}
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
          onSubmit={async () => {
            if (isEditorOpen && selectedPost) {
              const success = await updatePost(selectedPost.id, composerValue, selectedPost.source);
              if (success) replaceToDetail(selectedPost.id);
            } else {
              await handleSubmit();
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
      {toastElement}
      </main>
    );
  }

  if (activeView === "settings") {
    return (
      <main className="flex flex-col flex-1">
        <SettingsView
          onBack={goBackOrHome}
          onOpenTagManager={() => pushHistoryState({ bocchiSns: true, view: "tag-manager" })}
          themeMode={themeMode}
          onThemeChange={setTheme}
          hidePostedInSourceTabs={hidePostedInSourceTabs}
          onHidePostedInSourceTabsChange={setHidePostedInSourceTabs}
          systemTaggingEnabled={systemTaggingEnabled}
          onSystemTaggingEnabledChange={setSystemTaggingEnabled}
          existingTags={existingTags}
        />
        {toastElement}
      </main>
    );
  }

  if (activeView === "tag-manager") {
    return (
      <main className="flex flex-col flex-1">
        <TagManagerView
          onBack={goBackOrHome}
          posts={posts}
          isBusy={isBusy}
          postThumbnailUrlMap={postThumbnailUrlMap}
          existingTags={existingTags}
          onBulkUpdatePostTags={bulkUpdatePostTags}
        />
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
            postImageUrlMap={postImageUrlMap}
            postThumbnailUrlMap={postThumbnailUrlMap}
            onPostClick={openPostDetail}
            onPostEdit={openEditComposer}
            onPostCopy={(_, copied) => {
              showToast(copied ? "本文をコピーしました。" : "コピーできませんでした。");
            }}
            onPostSaveMedia={handleSavePostMedia}
            onPostTypeChange={handlePostTypeChange}
            onPostOgpFetched={(post, ogp) => {
              if (ogp) updatePostOgp(post, ogp);
            }}
            onPostDelete={deletePost}
            imageViewerRoute={imageViewerRoute}
            imageViewerOriginRect={imageViewerOriginRect}
            onImageViewerOpen={openImageViewer}
            onImageViewerClose={closeImageViewer}
            isBooting={isBooting}
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
          posts={posts}
          postThumbnailUrlMap={postThumbnailUrlMap}
          onPostClick={openPostDetail}
          onPostEdit={openEditComposer}
          onTagClick={(tag) => {
            resetToHome(tag);
          }}
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
      />

      <ComposerModal
        isOpen={isComposerOpen}
        onClose={closeComposer}
        title={isEditorOpen ? "投稿を編集" : "新しい投稿"}
        submitLabel="保存する"
        onSubmit={async () => {
          if (isEditorOpen && selectedPost) {
            const success = await updatePost(selectedPost.id, composerValue, selectedPost.source);
            if (success) replaceToDetail(selectedPost.id);
          } else {
            await handleSubmit();
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
      {toastElement}
    </main>
  );
}
