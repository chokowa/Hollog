"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock3, Info, RotateCcw, ShieldCheck, Trash2, ZoomIn } from "lucide-react";
import { ImageViewer } from "@/components/ui/image-viewer";
import { PostCard } from "@/components/ui/post-card";
import { TagContextMenu, type TagContextAction } from "@/components/ui/tag-context-menu";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import type { AvailableTag } from "@/hooks/use-posts";
import type { PostCardSection } from "@/lib/post-card-layout";
import type { ImageOriginRect, ImageViewerRoute } from "@/types/navigation";
import type { Post, PostType, TimelineFilter } from "@/types/post";

type PostFeedProps = {
  posts: Post[];
  activeTab: TimelineFilter;
  onTabChange: (tab: TimelineFilter) => void;
  activeTag: string | null;
  availableTags: AvailableTag[];
  onTagChange: (tag: string | null) => void;
  onTagMenuAction: (action: TagContextAction, tag: string) => void;
  hasMediaForTag: (tag: string) => boolean;
  postImageUrlMap: Record<string, string[]>;
  postThumbnailUrlMap: Record<string, string[]>;
  onPostClick: (postId: string) => void;
  onPostEdit: (post: Post) => void;
  onPostCopy: (post: Post, copied: boolean) => void;
  onPostUrlCopy: (post: Post, copied: boolean) => void;
  onPostImageCopy: (post: Post, index: number) => void | Promise<void>;
  onPostSaveMedia: (post: Post) => void;
  onPostTypeChange: (post: Post, nextType: PostType) => void;
  onPostOgpFetched: (post: Post, ogp: Post["ogp"] | null) => void;
  onPostOgpRetry: (post: Post) => void;
  onPostDelete: (postId: string) => Promise<boolean>;
  onPostRestore: (postId: string) => Promise<boolean>;
  onRestoreAllTrash: () => Promise<number>;
  onEmptyTrash: () => Promise<number>;
  imageViewerRoute: ImageViewerRoute | null;
  imageViewerOriginRect: ImageOriginRect | null;
  onImageViewerOpen: (route: ImageViewerRoute, originRect?: ImageOriginRect | null) => void;
  onImageViewerClose: () => void;
  isBooting: boolean;
  postCardSectionOrder: PostCardSection[];
  header?: ReactNode;
};

const timelineTabs: Array<{ label: string; value: TimelineFilter }> = [
  { label: "すべて", value: "all" },
  { label: "ポスト", value: "post" },
  { label: "クリップ", value: "clip" },
  { label: "投稿済み", value: "posted" },
  { label: "メディア", value: "media" },
  { label: "ゴミ箱", value: "trash" },
];

const INITIAL_VISIBLE_ITEMS = 18;
const VISIBLE_ITEMS_STEP = 12;

type MediaItem = {
  post: Post;
  url: string;
  imageIndex: number;
  mediaKey: string;
};

type TimelinePostGroup = {
  dateKey: string;
  label: string;
  posts: Post[];
};

const SWIPE_DELETE_THRESHOLD = 96;
const SWIPE_MAX_OFFSET = -140;
const SWIPE_VERTICAL_LOCK = 10;
const SWIPE_DRAG_RESISTANCE = 0.68;
const TAG_SCROLL_GAP_HIT_SLOP = 8;

function TimelineBootSkeleton() {
  return (
    <div className="relative flex flex-col gap-5 pl-4 sm:pl-5" aria-hidden="true">
      <div className="pointer-events-none absolute bottom-0 left-[5px] top-3 w-px bg-border" />
      {[0, 1, 2].map((groupIndex) => (
        <section key={groupIndex} className="timeline-date-section relative">
          <div className="mb-2.5 flex items-center gap-3">
            <span className="absolute left-[-15px] top-[7px] z-10 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground/35 shadow-[0_0_0_1px_var(--border)]" />
            <div className="h-4 w-24 rounded-full bg-muted" />
            <div className="ml-auto h-6 w-14 rounded-full border border-border bg-card" />
          </div>
          <div className="flex flex-col gap-3">
            {[0, 1].map((itemIndex) => (
              <div key={itemIndex} className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-muted" />
                  <div className="h-3 w-28 rounded-full bg-muted" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded-full bg-muted" />
                  <div className="h-3 w-4/5 rounded-full bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function getPostDateKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const parts = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : iso;
}

function formatTimelineDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function groupPostsByDate(posts: Post[], getDate: (post: Post) => string): TimelinePostGroup[] {
  const groups: TimelinePostGroup[] = [];
  const groupMap = new Map<string, TimelinePostGroup>();

  posts.forEach((post) => {
    const groupDate = getDate(post);
    const dateKey = getPostDateKey(groupDate);
    const existingGroup = groupMap.get(dateKey);

    if (existingGroup) {
      existingGroup.posts.push(post);
      return;
    }

    const nextGroup = {
      dateKey,
      label: formatTimelineDate(groupDate),
      posts: [post],
    };
    groupMap.set(dateKey, nextGroup);
    groups.push(nextGroup);
  });

  return groups;
}

function formatTrashMovedAt(post: Post) {
  if (!post.trashedAt) return "移動日時は未記録";

  try {
    return `${new Intl.DateTimeFormat("ja-JP", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(post.trashedAt))}に移動`;
  } catch {
    return "ゴミ箱へ移動済み";
  }
}

type SwipeablePostCardProps = {
  post: Post;
  children: ReactNode;
  onOpen: () => void;
  onDelete: (post: Post, height: number) => void;
};

function isInsideFilledHorizontalScrollArea(target: HTMLElement, clientX: number) {
  const horizontalScrollElement = target.closest<HTMLElement>("[data-horizontal-scroll]");
  if (!horizontalScrollElement) return false;

  const scrollItems = Array.from(horizontalScrollElement.querySelectorAll<HTMLElement>("[data-horizontal-scroll-item]"));
  if (scrollItems.length === 0) return true;

  const firstRect = scrollItems[0].getBoundingClientRect();
  const lastRect = scrollItems[scrollItems.length - 1].getBoundingClientRect();
  return clientX >= firstRect.left - TAG_SCROLL_GAP_HIT_SLOP && clientX <= lastRect.right + TAG_SCROLL_GAP_HIT_SLOP;
}

function canStartPostSwipe(target: HTMLElement, clientX: number) {
  return !(
    isInsideFilledHorizontalScrollArea(target, clientX)
    || target.closest("[data-horizontal-scroll] button, [data-horizontal-scroll] a, button:not([data-swipe-start]), a, input, textarea, select")
    || target.closest("[data-card-media], img")
  );
}

function getSwipeOffset(deltaX: number) {
  return Math.max(SWIPE_MAX_OFFSET, Math.min(0, deltaX * SWIPE_DRAG_RESISTANCE));
}

function SwipeablePostCard({ post, children, onOpen, onDelete }: SwipeablePostCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const offsetXRef = useRef(0);
  const suppressNextClickRef = useRef(false);
  const startedOnMediaRef = useRef(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lockedAxis: "x" | "y" | null;
    moved: boolean;
    captured: boolean;
  } | null>(null);
  const touchDragStateRef = useRef<{
    touchId: number;
    startX: number;
    startY: number;
    lockedAxis: "x" | "y" | null;
    moved: boolean;
  } | null>(null);

  const updateOffsetX = (nextOffsetX: number) => {
    offsetXRef.current = nextOffsetX;
    setOffsetX(nextOffsetX);
  };

  const resetSwipe = () => {
    dragStateRef.current = null;
    touchDragStateRef.current = null;
    setIsDragging(false);
    startedOnMediaRef.current = false;
    updateOffsetX(0);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    startedOnMediaRef.current = Boolean(target.closest("[data-card-media], img"));
    if (!canStartPostSwipe(target, event.clientX)) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lockedAxis: null,
      moved: false,
      captured: false,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") {
      resetSwipe();
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.lockedAxis) {
      if (Math.abs(deltaY) > SWIPE_VERTICAL_LOCK && Math.abs(deltaY) > Math.abs(deltaX)) {
        dragState.lockedAxis = "y";
      } else if (Math.abs(deltaX) > SWIPE_VERTICAL_LOCK && Math.abs(deltaX) > Math.abs(deltaY)) {
        dragState.lockedAxis = "x";
      }
    }

    if (dragState.lockedAxis !== "x") return;

    if (!dragState.captured) {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragState.captured = true;
    }

    event.preventDefault();
    dragState.moved = true;
    suppressNextClickRef.current = true;
    updateOffsetX(getSwipeOffset(deltaX));
  };

  const finishSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") {
      resetSwipe();
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setIsDragging(false);
    startedOnMediaRef.current = false;

    if (offsetXRef.current <= -SWIPE_DELETE_THRESHOLD) {
      suppressNextClickRef.current = true;
      updateOffsetX(SWIPE_MAX_OFFSET);
      const height = cardRef.current?.getBoundingClientRect().height ?? 96;
      window.setTimeout(() => onDelete(post, height), 140);
      return;
    }

    updateOffsetX(0);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") return;
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    const target = event.target as HTMLElement;
    startedOnMediaRef.current = Boolean(target.closest("[data-card-media], img"));
    if (!canStartPostSwipe(target, touch.clientX)) return;

    touchDragStateRef.current = {
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lockedAxis: null,
      moved: false,
    };
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") {
      resetSwipe();
      return;
    }

    const dragState = touchDragStateRef.current;
    if (!dragState) return;

    const touch = Array.from(event.touches).find((item) => item.identifier === dragState.touchId);
    if (!touch) return;

    const deltaX = touch.clientX - dragState.startX;
    const deltaY = touch.clientY - dragState.startY;

    if (!dragState.lockedAxis) {
      if (Math.abs(deltaY) > SWIPE_VERTICAL_LOCK && Math.abs(deltaY) > Math.abs(deltaX)) {
        dragState.lockedAxis = "y";
      } else if (Math.abs(deltaX) > SWIPE_VERTICAL_LOCK && Math.abs(deltaX) > Math.abs(deltaY)) {
        dragState.lockedAxis = "x";
      }
    }

    if (dragState.lockedAxis !== "x") return;

    event.preventDefault();
    dragState.moved = true;
    suppressNextClickRef.current = true;
    updateOffsetX(getSwipeOffset(deltaX));
  };

  const finishTouchSwipe = () => {
    const dragState = touchDragStateRef.current;
    if (!dragState) return;

    touchDragStateRef.current = null;
    setIsDragging(false);
    startedOnMediaRef.current = false;

    if (offsetXRef.current <= -SWIPE_DELETE_THRESHOLD) {
      suppressNextClickRef.current = true;
      updateOffsetX(SWIPE_MAX_OFFSET);
      const height = cardRef.current?.getBoundingClientRect().height ?? 96;
      window.setTimeout(() => onDelete(post, height), 140);
      return;
    }

    updateOffsetX(0);
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, [data-card-media], img, input, textarea, select") || startedOnMediaRef.current) {
      startedOnMediaRef.current = false;
      return;
    }

    if (suppressNextClickRef.current || offsetX !== 0) {
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      updateOffsetX(0);
      return;
    }

    onOpen();
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressNextClickRef.current && offsetX === 0) return;

    suppressNextClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    updateOffsetX(0);
  };

  return (
    <div ref={cardRef} className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 right-4 flex items-center">
        <div className="flex h-12 w-20 items-center justify-center rounded-full bg-red-500 text-white shadow-sm">
          <Trash2 size={22} />
        </div>
      </div>
      <div
        className={`relative touch-pan-y ${isDragging ? "" : "transition-transform duration-200 ease-out"}`}
        style={{ transform: `translateX(${offsetX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={finishSwipe}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={finishTouchSwipe}
        onTouchCancel={finishTouchSwipe}
        onClickCapture={handleClickCapture}
        onClick={handleClick}
      >
        {children}
      </div>
    </div>
  );
}

export function PostFeed({
  posts,
  activeTab,
  onTabChange,
  activeTag,
  availableTags,
  onTagChange,
  onTagMenuAction,
  hasMediaForTag,
  postImageUrlMap,
  postThumbnailUrlMap,
  onPostClick,
  onPostEdit,
  onPostCopy,
  onPostUrlCopy,
  onPostImageCopy,
  onPostSaveMedia,
  onPostTypeChange,
  onPostOgpFetched,
  onPostOgpRetry,
  onPostDelete,
  onPostRestore,
  onRestoreAllTrash,
  onEmptyTrash,
  imageViewerRoute,
  imageViewerOriginRect,
  onImageViewerOpen,
  onImageViewerClose,
  isBooting,
  postCardSectionOrder,
  header,
}: PostFeedProps) {
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const postsContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const mediaItemRefs = useRef(new Map<string, HTMLImageElement>());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [pendingDeletedPosts, setPendingDeletedPosts] = useState<Record<string, Post>>({});
  const [pendingDeletedHeights, setPendingDeletedHeights] = useState<Record<string, number>>({});
  const [visibleItemsState, setVisibleItemsState] = useState({
    key: "",
    count: INITIAL_VISIBLE_ITEMS,
  });
  const listAnimationKey = `${activeTab}-${activeTag ?? "all"}`;
  const visibleItemCount = visibleItemsState.key === listAnimationKey
    ? visibleItemsState.count
    : INITIAL_VISIBLE_ITEMS;
  const mediaItems = useMemo<MediaItem[]>(() => {
    return posts.flatMap((post) => {
      const thumbnailUrls = postThumbnailUrlMap[post.id] || [];
      return thumbnailUrls.map((url, imageIndex) => ({
        post,
        url,
        imageIndex,
        mediaKey: `${post.id}-${imageIndex}`,
      }));
    });
  }, [postThumbnailUrlMap, posts]);
  const visiblePosts = useMemo(
    () => posts.slice(0, visibleItemCount),
    [posts, visibleItemCount],
  );
  const groupedVisiblePosts = useMemo(
    () => groupPostsByDate(visiblePosts, (post) => activeTab === "trash" ? post.trashedAt ?? post.updatedAt : post.updatedAt),
    [activeTab, visiblePosts],
  );
  const visibleMediaItems = useMemo(
    () => mediaItems.slice(0, visibleItemCount),
    [mediaItems, visibleItemCount],
  );
  const totalItemCount = activeTab === "media" ? mediaItems.length : posts.length;
  const hasMoreItems = visibleItemCount < totalItemCount;
  const deleteTimersRef = useRef(new Map<string, number>());
  const [tagMenuState, setTagMenuState] = useState<{ tag: string; left: number; top: number; hidden: boolean } | null>(null);
  const tagLongPressTimerRef = useRef<number | null>(null);
  const suppressTagClickRef = useRef<string | null>(null);
  const orderedTags = useMemo(() => {
    if (!activeTag) return availableTags;
    const activeTagSummary = availableTags.find((tag) => tag.name === activeTag);
    return [
      activeTagSummary ?? { name: activeTag, count: 0 },
      ...availableTags.filter((tag) => tag.name !== activeTag),
    ];
  }, [activeTag, availableTags]);
  const updateTagScrollButtons = () => {
    const el = tagScrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 1);
  };
  const scrollTags = (direction: "left" | "right") => {
    tagScrollRef.current?.scrollBy({
      left: direction === "left" ? -180 : 180,
      behavior: "smooth",
    });
  };
  const scrollTimelineToTop = (behavior: ScrollBehavior = "auto") => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior });
    });
  };
  const animateTimelineTopFromNearTop = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const secondPost = postsContainerRef.current?.children[1] as HTMLElement | undefined;
        if (!secondPost) {
          window.scrollTo({ top: 0 });
          return;
        }

        window.scrollTo({ top: secondPost.offsetTop });
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      });
    });
  };
  const handleTagChange = (tag: string | null) => {
    onTagChange(tag);
    scrollTimelineToTop();
  };
  const showMoreItems = useCallback(() => {
    setVisibleItemsState((current) => ({
      key: listAnimationKey,
      count: Math.min(
        (current.key === listAnimationKey ? current.count : INITIAL_VISIBLE_ITEMS) + VISIBLE_ITEMS_STEP,
        totalItemCount,
      ),
    }));
  }, [listAnimationKey, totalItemCount]);
  const openMediaViewer = (event: React.MouseEvent, itemIndex: number) => {
    event.stopPropagation();
    onImageViewerOpen({ kind: "media", index: itemIndex }, getMediaOriginRect(itemIndex));
  };
  const commitPendingDelete = useCallback(async (postId: string) => {
    deleteTimersRef.current.delete(postId);
    await onPostDelete(postId);
    setPendingDeletedPosts((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });
    setPendingDeletedHeights((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });
  }, [onPostDelete]);
  const requestDeletePost = useCallback((post: Post, height: number) => {
    if (deleteTimersRef.current.has(post.id)) return;

    setPendingDeletedPosts((current) => ({ ...current, [post.id]: post }));
    setPendingDeletedHeights((current) => ({ ...current, [post.id]: height }));
    const timer = window.setTimeout(() => {
      void commitPendingDelete(post.id);
    }, 5000);
    deleteTimersRef.current.set(post.id, timer);
  }, [commitPendingDelete]);
  const undoPendingDelete = (postId: string) => {
    const pendingPost = pendingDeletedPosts[postId];
    if (!pendingPost) return;

    const timer = deleteTimersRef.current.get(postId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      deleteTimersRef.current.delete(postId);
    }
    setPendingDeletedPosts((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });
    setPendingDeletedHeights((current) => {
      const next = { ...current };
      delete next[postId];
      return next;
    });
  };
  const restoreAllTrash = async () => {
    if (posts.length === 0) return;
    await onRestoreAllTrash();
  };
  const emptyTrash = async () => {
    if (posts.length === 0) return;
    if (!confirm(`ゴミ箱内の${posts.length}件を完全に削除します。削除後は元に戻せません。`)) return;
    await onEmptyTrash();
  };
  const getMediaOriginRect = useCallback((index: number) => {
    const item = visibleMediaItems[index];
    if (!item) return null;

    const image = mediaItemRefs.current.get(item.mediaKey);
    if (!image) return null;

    const rect = image.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
  }, [visibleMediaItems]);

  useEffect(() => {
    updateTagScrollButtons();
    window.addEventListener("resize", updateTagScrollButtons);
    return () => window.removeEventListener("resize", updateTagScrollButtons);
  }, [orderedTags]);

  useEffect(() => {
    if (!tagMenuState) return;
    const closeMenu = () => setTagMenuState(null);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [tagMenuState]);

  useEffect(() => {
    const handleTimelineTop = () => animateTimelineTopFromNearTop();
    window.addEventListener("bocchi:timeline-top", handleTimelineTop);
    return () => window.removeEventListener("bocchi:timeline-top", handleTimelineTop);
  }, []);

  useEffect(() => {
    const deleteTimers = deleteTimersRef.current;
    return () => {
      deleteTimers.forEach((timer) => window.clearTimeout(timer));
      deleteTimers.clear();
    };
  }, []);

  useEffect(() => {
    const loadMoreMarker = loadMoreRef.current;
    if (!loadMoreMarker || !hasMoreItems) return;

    if (!("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          showMoreItems();
        }
      },
      { rootMargin: "900px 0px" },
    );

    observer.observe(loadMoreMarker);
    return () => observer.disconnect();
  }, [hasMoreItems, showMoreItems, totalItemCount, visibleItemCount]);

  return (
    <div className="flex flex-col gap-3 pb-[22rem]">
      <div
        className="timeline-top-chrome sticky top-0 z-20 transform-gpu bg-background will-change-transform transition-transform duration-[260ms] ease-out"
      >
        {header}
        <div className="px-3 pb-2 pt-1 sm:px-4">
          <TabSwitcher
            tabs={timelineTabs}
            value={activeTab}
            onChange={(next) => {
              onTabChange(next as TimelineFilter);
              onTagChange(null);
              scrollTimelineToTop();
            }}
          />
          {orderedTags.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollTags("left")}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
                  aria-label="タグを左へ送る"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <div
                ref={tagScrollRef}
                className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 screen-scroll"
                onScroll={updateTagScrollButtons}
              >
                {orderedTags.map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => {
                      if (suppressTagClickRef.current === tag.name) {
                        suppressTagClickRef.current = null;
                        return;
                      }
                      handleTagChange(activeTag === tag.name ? null : tag.name);
                    }}
                    onPointerDown={(event) => {
                      const target = event.currentTarget;
                      if (tagLongPressTimerRef.current !== null) {
                        window.clearTimeout(tagLongPressTimerRef.current);
                      }
                      tagLongPressTimerRef.current = window.setTimeout(() => {
                        suppressTagClickRef.current = tag.name;
                        const rect = target.getBoundingClientRect();
                        const menuWidth = 192;
                        const menuHeight = 248;
                        const gap = 8;
                        const left = Math.max(gap, Math.min(rect.left, window.innerWidth - menuWidth - gap));
                        const top = rect.bottom + menuHeight + gap < window.innerHeight
                          ? rect.bottom + gap
                          : Math.max(gap, rect.top - menuHeight - gap);
                        setTagMenuState({ tag: tag.name, left, top, hidden: Boolean(tag.hidden) });
                        tagLongPressTimerRef.current = null;
                      }, 420);
                    }}
                    onPointerUp={() => {
                      if (tagLongPressTimerRef.current !== null) {
                        window.clearTimeout(tagLongPressTimerRef.current);
                        tagLongPressTimerRef.current = null;
                      }
                    }}
                    onPointerLeave={() => {
                      if (tagLongPressTimerRef.current !== null) {
                        window.clearTimeout(tagLongPressTimerRef.current);
                        tagLongPressTimerRef.current = null;
                      }
                    }}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTag === tag.name
                        ? "border-primary bg-primary text-primary-foreground"
                        : tag.hidden
                          ? "border-border bg-card text-muted-foreground/45 hover:bg-muted"
                          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>#{tag.name}</span>
                    <span className={`text-[11px] leading-none ${activeTag === tag.name ? "opacity-80" : "text-muted-foreground"}`}>
                      {tag.count}
                    </span>
                    {activeTag === tag.name && (
                      <span className="text-[11px] leading-none opacity-75" aria-hidden="true">
                        ×
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <TagContextMenu
                tag={tagMenuState?.tag ?? ""}
                isOpen={Boolean(tagMenuState)}
                position={tagMenuState ? { left: tagMenuState.left, top: tagMenuState.top } : null}
                hasMedia={tagMenuState ? hasMediaForTag(tagMenuState.tag) : false}
                hidden={Boolean(tagMenuState?.hidden)}
                onClose={() => setTagMenuState(null)}
                onAction={onTagMenuAction}
              />
              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollTags("right")}
                  className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
                  aria-label="タグを右へ送る"
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}
          {activeTab === "trash" && (
            <div className="mt-3 overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_12px_40px_rgba(0,0,0,0.05)] dark:bg-card/92">
              <div className="flex items-start gap-3 border-b border-border/70 px-4 py-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Trash2 size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">ゴミ箱</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {posts.length}件
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    ゴミ箱に移動した投稿はここから戻せます。完全削除するまで、他の画面には表示されません。
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck size={14} />
                  空にする前に確認があります
                </p>
                <div className="flex shrink-0 justify-end gap-2">
                  <button
                    type="button"
                    onClick={restoreAllTrash}
                    disabled={posts.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
                  >
                    <RotateCcw size={14} />
                    すべて戻す
                  </button>
                  <button
                    type="button"
                    onClick={emptyTrash}
                    disabled={posts.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-red-500/35 bg-red-500/10 px-3 text-xs font-semibold text-red-500 transition hover:bg-red-500 hover:text-white disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                    ゴミ箱を空にする
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-2 sm:px-3">
        {isBooting ? (
          <TimelineBootSkeleton />
        ) : posts.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--border)] bg-card p-10 text-center text-sm text-muted-foreground">
            {activeTab === "trash" ? (
              <div className="mx-auto flex max-w-[18rem] flex-col items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Trash2 size={22} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">ゴミ箱は空です</p>
                  <p className="mt-1 text-xs leading-relaxed">ゴミ箱に移動した投稿はここに集まり、必要なら戻せます。</p>
                </div>
              </div>
            ) : "まだ投稿がありません。"}
          </div>
        ) : activeTab === "media" ? (
          <div key={listAnimationKey} className="columns-2 gap-2 space-y-2 sm:columns-3">
            {visibleMediaItems.map(({ post, url, mediaKey }, itemIndex) => (
              <div
                key={mediaKey}
                className="timeline-media-shell group relative cursor-pointer break-inside-avoid overflow-hidden rounded-xl transition-opacity hover:opacity-90"
                onClick={() => onPostClick(post.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={(node) => {
                    if (node) {
                      mediaItemRefs.current.set(mediaKey, node);
                    } else {
                      mediaItemRefs.current.delete(mediaKey);
                    }
                  }}
                  src={url}
                  alt="media"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto object-cover"
                />
                <button
                  type="button"
                  onClick={(event) => openMediaViewer(event, itemIndex)}
                  className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-sm transition hover:bg-black/75 active:scale-95"
                  aria-label="拡大表示"
                  title="拡大表示"
                >
                  <ZoomIn size={15} />
                </button>
              </div>
            ))}
            {hasMoreItems && (
              <button
                ref={loadMoreRef}
                type="button"
                onClick={showMoreItems}
                className="h-10 w-full break-inside-avoid text-xs text-muted-foreground"
              >
                さらに表示
              </button>
            )}
          </div>
        ) : (
          <div
            key={listAnimationKey}
            ref={postsContainerRef}
            className="relative flex flex-col gap-5 pl-4 sm:pl-5"
          >
            <div className="pointer-events-none absolute bottom-0 left-[5px] top-3 w-px bg-border" />
            {groupedVisiblePosts.map((group) => (
              <section
                key={group.dateKey}
                className="timeline-date-section relative"
                aria-labelledby={`timeline-date-${group.dateKey}`}
              >
                <div className="mb-2.5 flex items-center gap-3">
                  <span className="absolute left-[-15px] top-[7px] z-10 h-3 w-3 rounded-full border-2 border-background bg-muted-foreground shadow-[0_0_0_1px_var(--border)]" />
                  <h2
                    id={`timeline-date-${group.dateKey}`}
                    className="min-w-0 flex-1 text-sm font-semibold text-foreground"
                  >
                    {group.label}
                  </h2>
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                    {group.posts.length}件
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {group.posts.map((post) => {
                    const pendingDeletedPost = pendingDeletedPosts[post.id];
                    if (pendingDeletedPost) {
                      return (
                        <div
                          key={post.id}
                          className="timeline-card-shell"
                        >
                          <div
                            className="flex items-center justify-between gap-3 rounded-[22px] border border-border/80 bg-card px-4 py-3 text-sm text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)]"
                            style={{ minHeight: pendingDeletedHeights[post.id] ?? 96 }}
                          >
                            <div className="min-w-0">
                              <p className="font-medium">ゴミ箱に移動します</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">{pendingDeletedPost.body || pendingDeletedPost.url || "投稿"}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => undoPendingDelete(post.id)}
                              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-muted active:scale-95"
                            >
                              元に戻す
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const card = (
                      <PostCard
                        post={post}
                        imageUrls={postThumbnailUrlMap[post.id]}
                        onClick={activeTab === "trash" ? () => onPostClick(post.id) : undefined}
                        onEdit={() => onPostEdit(post)}
                        onCopy={onPostCopy}
                        onUrlCopy={onPostUrlCopy}
                        onSaveMedia={onPostSaveMedia}
                        onTagClick={handleTagChange}
                        onTagMenuAction={onTagMenuAction}
                        isTagHidden={(tag) => Boolean(availableTags.find((item) => item.name === tag)?.hidden)}
                        hasMediaForTag={hasMediaForTag}
                        onTypeChange={(nextType) => onPostTypeChange(post, nextType)}
                        onOgpFetched={(ogp) => onPostOgpFetched(post, ogp)}
                        onOgpRetry={onPostOgpRetry}
                        sectionOrder={postCardSectionOrder}
                        onImageOpen={(clickedPost, index, originRect) => {
                          onImageViewerOpen({ kind: "post", postId: clickedPost.id, index }, originRect);
                        }}
                      />
                    );

                    return (
                      <div
                        key={post.id}
                        className="timeline-card-shell"
                      >
                        {activeTab === "trash" ? (
                          <div className="overflow-hidden rounded-[22px] border border-border/80 bg-card shadow-[0_1px_0_rgba(255,255,255,0.03)]">
                            <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/25 px-4 py-2 text-xs text-muted-foreground">
                              <span className="inline-flex min-w-0 items-center gap-1.5">
                                <Clock3 size={13} />
                                <span className="truncate">{formatTrashMovedAt(post)}</span>
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background px-2 py-1 text-[11px] font-medium">
                                <Info size={12} />
                                他画面で非表示
                              </span>
                            </div>
                            {card}
                            <div className="flex justify-end border-t border-border/70 bg-muted/20 px-4 py-2">
                              <button
                                type="button"
                                onClick={() => void onPostRestore(post.id)}
                                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-muted active:scale-95"
                              >
                                <RotateCcw size={14} />
                                元に戻す
                              </button>
                            </div>
                          </div>
                        ) : (
                          <SwipeablePostCard post={post} onOpen={() => onPostClick(post.id)} onDelete={requestDeletePost}>
                            {card}
                          </SwipeablePostCard>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {hasMoreItems && (
              <button
                ref={loadMoreRef}
                type="button"
                onClick={showMoreItems}
                className="h-12 text-xs text-muted-foreground"
              >
                さらに表示
              </button>
            )}
          </div>
        )}
      </div>
      {imageViewerRoute?.kind === "media" && visibleMediaItems.length > 0 && (
        <ImageViewer
          key={`media-${imageViewerRoute.index}`}
          images={visibleMediaItems.map((item) => postImageUrlMap[item.post.id]?.[item.imageIndex] ?? item.url)}
          initialIndex={Math.min(Math.max(imageViewerRoute.index, 0), visibleMediaItems.length - 1)}
          originRect={imageViewerOriginRect}
          getOriginRect={getMediaOriginRect}
          onCopyCurrentImage={(index) => {
            const item = visibleMediaItems[index];
            if (!item) return;
            return onPostImageCopy(item.post, item.imageIndex);
          }}
          onClose={onImageViewerClose}
        />
      )}
    </div>
  );
}
