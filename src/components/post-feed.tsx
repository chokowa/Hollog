"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PostCard } from "@/components/ui/post-card";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import type { Post, PostType, TimelineFilter } from "@/types/post";

type PostFeedProps = {
  posts: Post[];
  activeTab: TimelineFilter;
  onTabChange: (tab: TimelineFilter) => void;
  activeTag: string | null;
  availableTags: string[];
  onTagChange: (tag: string | null) => void;
  postImageUrlMap: Record<string, string[]>;
  onPostClick: (postId: string) => void;
  onPostTypeChange: (post: Post, nextType: PostType) => void;
  onPostOgpFetched: (post: Post, ogp: Post["ogp"]) => void;
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

export function PostFeed({
  posts,
  activeTab,
  onTabChange,
  activeTag,
  availableTags,
  onTagChange,
  postImageUrlMap,
  onPostClick,
  onPostTypeChange,
  onPostOgpFetched,
  isBooting,
  header,
}: PostFeedProps) {
  const tagScrollRef = useRef<HTMLDivElement>(null);
  const postsContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [visibleItemsState, setVisibleItemsState] = useState({
    key: "",
    count: INITIAL_VISIBLE_ITEMS,
  });
  const listAnimationKey = `${activeTab}-${activeTag ?? "all"}-${posts.length}`;
  const visibleItemCount = visibleItemsState.key === listAnimationKey
    ? visibleItemsState.count
    : INITIAL_VISIBLE_ITEMS;
  const mediaItems = useMemo(() => {
    return posts.flatMap((post) => {
      const urls = postImageUrlMap[post.id] || [];
      return urls.map((url, index) => ({ post, url, index }));
    });
  }, [postImageUrlMap, posts]);
  const visiblePosts = useMemo(
    () => posts.slice(0, visibleItemCount),
    [posts, visibleItemCount],
  );
  const visibleMediaItems = useMemo(
    () => mediaItems.slice(0, visibleItemCount),
    [mediaItems, visibleItemCount],
  );
  const totalItemCount = activeTab === "media" ? mediaItems.length : posts.length;
  const hasMoreItems = visibleItemCount < totalItemCount;
  const orderedTags = useMemo(() => {
    if (!activeTag) return availableTags;
    return [activeTag, ...availableTags.filter((tag) => tag !== activeTag)];
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
    <div className="flex flex-col gap-4 pb-28">
      <div
        className="timeline-top-chrome sticky top-0 z-20 transform-gpu bg-background will-change-transform transition-transform duration-[260ms] ease-out"
      >
        {header}
        <div className="px-4 py-2">
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
                    key={tag}
                    type="button"
                    onClick={() => handleTagChange(activeTag === tag ? null : tag)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTag === tag
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span>#{tag}</span>
                    {activeTag === tag && (
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

      <div className="px-4">
        {isBooting ? (
          <div className="flex items-center justify-center py-10 text-sm text-[var(--muted)]">
            読み込み中...
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-[24px] border border-[var(--border)] bg-card p-10 text-center text-sm text-[var(--muted)]">
            まだ投稿がありません。
          </div>
        ) : activeTab === "media" ? (
          <div key={listAnimationKey} className="columns-2 gap-2 space-y-2 sm:columns-3">
            {visibleMediaItems.map(({ post, url, index }) => (
              <div
                key={`${post.id}-${index}`}
                className="timeline-media-shell relative cursor-pointer break-inside-avoid overflow-hidden rounded-xl transition-opacity hover:opacity-90"
                onClick={() => onPostClick(post.id)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="media" loading="lazy" decoding="async" className="w-full h-auto object-cover" />
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
            className="flex flex-col gap-4"
          >
            {visiblePosts.map((post) => (
              <div
                key={post.id}
                className="timeline-card-shell"
              >
                <PostCard
                  post={post}
                  imageUrls={postImageUrlMap[post.id]}
                  onClick={() => onPostClick(post.id)}
                  onTagClick={handleTagChange}
                  onTypeChange={(nextType) => onPostTypeChange(post, nextType)}
                  onOgpFetched={(ogp) => onPostOgpFetched(post, ogp)}
                />
              </div>
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
    </div>
  );
}
