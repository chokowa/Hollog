"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Trash2, ZoomIn } from "lucide-react";
import { ImageViewer } from "@/components/ui/image-viewer";
import { PostCard } from "@/components/ui/post-card";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import type { AvailableTag } from "@/hooks/use-posts";
import type { ImageOriginRect, ImageViewerRoute } from "@/types/navigation";
import type { Post, PostType, TimelineFilter } from "@/types/post";

type PostFeedProps = {
  posts: Post[];
  activeTab: TimelineFilter;
  onTabChange: (tab: TimelineFilter) => void;
  activeTag: string | null;
  availableTags: AvailableTag[];
  onTagChange: (tag: string | null) => void;
  postImageUrlMap: Record<string, string[]>;
  postThumbnailUrlMap: Record<string, string[]>;
  onPostClick: (postId: string) => void;
  onPostEdit: (post: Post) => void;
  onPostSaveMedia: (post: Post) => void;
  onPostTypeChange: (post: Post, nextType: PostType) => void;
  onPostOgpFetched: (post: Post, ogp: Post["ogp"]) => void;
  onPostDelete: (postId: string) => Promise<boolean>;
  imageViewerRoute: ImageViewerRoute | null;
  imageViewerOriginRect: ImageOriginRect | null;
  onImageViewerOpen: (route: ImageViewerRoute, originRect?: ImageOriginRect | null) => void;
  onImageViewerClose: () => void;
  isBooting: boolean;
  header?: ReactNode;
};

const timelineTabs: Array<{ label: string; value: TimelineFilter }> = [
  { label: "すべて", value: "all" },
  { label: "ポスト", value: "post" },
  { label: "クリップ", value: "clip" },
  { label: "投稿済み", value: "posted" },
  { label: "メディア", value: "media" },
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

function groupPostsByUpdatedDate(posts: Post[]): TimelinePostGroup[] {
  const groups: TimelinePostGroup[] = [];
  const groupMap = new Map<string, TimelinePostGroup>();

  posts.forEach((post) => {
    const dateKey = getPostDateKey(post.updatedAt);
    const existingGroup = groupMap.get(dateKey);

    if (existingGroup) {
      existingGroup.posts.push(post);
      return;
    }

    const nextGroup = {
      dateKey,
      label: formatTimelineDate(post.updatedAt),
      posts: [post],
    };
    groupMap.set(dateKey, nextGroup);
    groups.push(nextGroup);
  });

  return groups;
}

type SwipeablePostCardProps = {
  post: Post;
  children: ReactNode;
  onOpen: () => void;
  onDelete: (post: Post) => void;
};

function SwipeablePostCard({ post, children, onOpen, onDelete }: SwipeablePostCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const suppressNextClickRef = useRef(false);
  const startedOnMediaRef = useRef(false);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lockedAxis: "x" | "y" | null;
    moved: boolean;
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    startedOnMediaRef.current = Boolean(target.closest("[data-card-media], img"));
    if (target.closest("button, a, input, textarea, select") || startedOnMediaRef.current) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lockedAxis: null,
      moved: false,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") {
      dragStateRef.current = null;
      setIsDragging(false);
      setOffsetX(0);
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
    event.preventDefault();
    dragState.moved = true;
    suppressNextClickRef.current = true;
    setOffsetX(Math.max(SWIPE_MAX_OFFSET, Math.min(0, deltaX)));
  };

  const finishSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (document.documentElement.dataset.imageViewer === "open") {
      dragStateRef.current = null;
      setIsDragging(false);
      setOffsetX(0);
      return;
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    setIsDragging(false);
    startedOnMediaRef.current = false;

    if (offsetX <= -SWIPE_DELETE_THRESHOLD) {
      suppressNextClickRef.current = true;
      setOffsetX(SWIPE_MAX_OFFSET);
      window.setTimeout(() => onDelete(post), 140);
      return;
    }

    setOffsetX(0);
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
      setOffsetX(0);
      return;
    }

    onOpen();
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
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
  postImageUrlMap,
  postThumbnailUrlMap,
  onPostClick,
  onPostEdit,
  onPostSaveMedia,
  onPostTypeChange,
  onPostOgpFetched,
  onPostDelete,
  imageViewerRoute,
  imageViewerOriginRect,
  onImageViewerOpen,
  onImageViewerClose,
  isBooting,
  header,
}: PostFeedProps) {
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const postsContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const mediaItemRefs = useRef(new Map<string, HTMLImageElement>());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [pendingDeletedPosts, setPendingDeletedPosts] = useState<Record<string, Post>>({});
  const [latestPendingDeleteId, setLatestPendingDeleteId] = useState<string | null>(null);
  const [visibleItemsState, setVisibleItemsState] = useState({
    key: "",
    count: INITIAL_VISIBLE_ITEMS,
  });
  const listAnimationKey = `${activeTab}-${activeTag ?? "all"}-${posts.length}`;
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
  const timelinePosts = useMemo(
    () => posts.filter((post) => !pendingDeletedPosts[post.id]),
    [pendingDeletedPosts, posts],
  );
  const visiblePosts = useMemo(
    () => timelinePosts.slice(0, visibleItemCount),
    [timelinePosts, visibleItemCount],
  );
  const groupedVisiblePosts = useMemo(
    () => groupPostsByUpdatedDate(visiblePosts),
    [visiblePosts],
  );
  const visibleMediaItems = useMemo(
    () => mediaItems.slice(0, visibleItemCount),
    [mediaItems, visibleItemCount],
  );
  const totalItemCount = activeTab === "media" ? mediaItems.length : timelinePosts.length;
  const hasMoreItems = visibleItemCount < totalItemCount;
  const deleteTimersRef = useRef(new Map<string, number>());
  const latestPendingPost = latestPendingDeleteId ? pendingDeletedPosts[latestPendingDeleteId] : null;
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
    const deleted = await onPostDelete(postId);
    if (!deleted) {
      setPendingDeletedPosts((current) => {
        const next = { ...current };
        delete next[postId];
        return next;
      });
    }
    setLatestPendingDeleteId((current) => (current === postId ? null : current));
  }, [onPostDelete]);
  const requestDeletePost = useCallback((post: Post) => {
    if (deleteTimersRef.current.has(post.id)) return;

    setPendingDeletedPosts((current) => ({ ...current, [post.id]: post }));
    setLatestPendingDeleteId(post.id);
    const timer = window.setTimeout(() => {
      void commitPendingDelete(post.id);
    }, 5000);
    deleteTimersRef.current.set(post.id, timer);
  }, [commitPendingDelete]);
  const undoLatestDelete = () => {
    if (!latestPendingDeleteId) return;

    const timer = deleteTimersRef.current.get(latestPendingDeleteId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      deleteTimersRef.current.delete(latestPendingDeleteId);
    }
    setPendingDeletedPosts((current) => {
      const next = { ...current };
      delete next[latestPendingDeleteId];
      return next;
    });
    setLatestPendingDeleteId(null);
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
    <div className="flex flex-col gap-3 pb-28">
      <div
        className="timeline-top-chrome sticky top-0 z-20 transform-gpu bg-background will-change-transform transition-transform duration-[260ms] ease-out"
      >
        {header}
        <div className="px-3 py-2 sm:px-4">
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
                    onClick={() => handleTagChange(activeTag === tag.name ? null : tag.name)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTag === tag.name
                        ? "border-primary bg-primary text-primary-foreground"
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
        </div>
      </div>

      <div className="px-2 sm:px-3">
        {isBooting ? (
          <div className="flex items-center justify-center py-10 text-sm text-[var(--muted)]">
            読み込み中...
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--border)] bg-card p-10 text-center text-sm text-[var(--muted)]">
            まだ投稿がありません。
          </div>
        ) : activeTab === "media" ? (
          <div key={listAnimationKey} className="timeline-list-swap columns-2 gap-2 space-y-2 sm:columns-3">
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
                  aria-label="画像を連続表示"
                  title="画像を連続表示"
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
            className="timeline-list-swap relative flex flex-col gap-5 pl-4 sm:pl-5"
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
                  {group.posts.map((post) => (
                    <div
                      key={post.id}
                      className="timeline-card-shell"
                    >
                      <SwipeablePostCard post={post} onOpen={() => onPostClick(post.id)} onDelete={requestDeletePost}>
                          <PostCard
                          post={post}
                          imageUrls={postThumbnailUrlMap[post.id]}
                          onEdit={() => onPostEdit(post)}
                          onSaveMedia={onPostSaveMedia}
                          onTagClick={handleTagChange}
                          onTypeChange={(nextType) => onPostTypeChange(post, nextType)}
                          onOgpFetched={(ogp) => onPostOgpFetched(post, ogp)}
                          onImageOpen={(clickedPost, index, originRect) => {
                            onImageViewerOpen({ kind: "post", postId: clickedPost.id, index }, originRect);
                          }}
                        />
                      </SwipeablePostCard>
                    </div>
                  ))}
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
          onClose={onImageViewerClose}
        />
      )}
      {latestPendingPost && (
        <div className="fixed inset-x-0 bottom-24 z-50 mx-auto flex w-full max-w-md justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-2xl bg-neutral-950 px-4 py-3 text-sm text-white shadow-xl">
            <span className="min-w-0 truncate">1件削除しました</span>
            <button
              type="button"
              onClick={undoLatestDelete}
              className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold text-cyan-300 underline underline-offset-4 transition hover:bg-white/10 active:scale-95"
            >
              元に戻す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
