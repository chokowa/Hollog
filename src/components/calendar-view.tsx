"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Filter, Image as ImageIcon } from "lucide-react";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import type { Post } from "@/types/post";

export type CalendarFilter = "all" | "post" | "clip";

type CalendarViewProps = {
  posts: Post[];
  postThumbnailUrlMap: Record<string, string[]>;
  onPostClick: (postId: string) => void;
  onPostEdit: (post: Post) => void;
  persistedSelectedDateKey?: string | null;
  persistedVisibleMonthKey?: string | null;
  persistedActiveFilter: CalendarFilter;
  persistedActiveTags: string[];
  onCalendarStateChange?: (state: { selectedDateKey: string; visibleMonthKey: string }) => void;
  onCalendarFilterChange: (state: { activeFilter: CalendarFilter; activeTags: string[] }) => void;
};

const weekLabels = ["日", "月", "火", "水", "木", "金", "土"];
const compactMetaTextStyle = {
  fontSize: "12px",
  lineHeight: "16px",
} as const;

function toDateKey(iso: string) {
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

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function formatSelectedDateCompact(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date).replace(/\s+/g, "");
}

function formatSelectedDateShort(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date).replace(/\s+/g, "");
}

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function monthKeyToDate(monthKey: string) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getCalendarDays(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function matchesFilter(post: Post, filter: CalendarFilter) {
  if (filter === "all") return true;
  if (post.type === filter) return true;
  return post.type === "posted" && post.postedFrom === filter;
}

function getTypeLabel(post: Post) {
  const type = post.type === "posted" ? post.postedFrom : post.type;
  if (type === "clip") return "クリップ";
  if (type === "post") return "ポスト";
  return "投稿済み";
}

function getLatestPostDateKey(posts: Post[]) {
  const latestPost = posts[0];
  return latestPost ? toDateKey(latestPost.updatedAt) : toDateKey(new Date().toISOString());
}

export function CalendarView({
  posts,
  postThumbnailUrlMap,
  onPostClick,
  onPostEdit,
  persistedSelectedDateKey,
  persistedVisibleMonthKey,
  persistedActiveFilter,
  persistedActiveTags,
  onCalendarStateChange,
  onCalendarFilterChange,
}: CalendarViewProps) {
  const didSyncInitialPostDateRef = useRef(false);
  const tagFilterRef = useRef<HTMLDivElement>(null);
  const suppressNextOutsideClickRef = useRef(false);
  const [selectedDateKey, setSelectedDateKey] = useState(() => persistedSelectedDateKey ?? getLatestPostDateKey(posts));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const persistedMonth = persistedVisibleMonthKey ? monthKeyToDate(persistedVisibleMonthKey) : null;
    const date = persistedMonth ?? new Date(`${persistedSelectedDateKey ?? getLatestPostDateKey(posts)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  });
  const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
  const todayKey = toDateKey(new Date().toISOString());
  const activeFilter = persistedActiveFilter;
  const activeTags = persistedActiveTags;

  useEffect(() => {
    if (didSyncInitialPostDateRef.current || posts.length === 0 || persistedSelectedDateKey) return;

    const latestDateKey = getLatestPostDateKey(posts);
    const latestDate = new Date(`${latestDateKey}T00:00:00`);
    didSyncInitialPostDateRef.current = true;

    const syncTimer = window.setTimeout(() => {
      setSelectedDateKey(latestDateKey);
      if (!Number.isNaN(latestDate.getTime())) {
        setVisibleMonth(latestDate);
      }
    }, 0);

    return () => window.clearTimeout(syncTimer);
  }, [persistedSelectedDateKey, posts]);

  useEffect(() => {
    onCalendarStateChange?.({
      selectedDateKey,
      visibleMonthKey: toMonthKey(visibleMonth),
    });
  }, [onCalendarStateChange, selectedDateKey, visibleMonth]);

  useEffect(() => {
    const suppressOutsideClick = (event: MouseEvent) => {
      if (!suppressNextOutsideClickRef.current) return;
      suppressNextOutsideClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    window.addEventListener("click", suppressOutsideClick, true);
    return () => window.removeEventListener("click", suppressOutsideClick, true);
  }, []);

  useEffect(() => {
    if (!isTagFilterOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-calendar-tag-filter-backdrop]")) {
        suppressNextOutsideClickRef.current = true;
        setIsTagFilterOpen(false);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if (tagFilterRef.current?.contains(target)) return;
      suppressNextOutsideClickRef.current = true;
      setIsTagFilterOpen(false);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [isTagFilterOpen]);

  useEffect(() => {
    document.documentElement.dataset.calendarTagFilter = isTagFilterOpen ? "open" : "closed";

    const handleCloseRequest = () => {
      suppressNextOutsideClickRef.current = false;
      setIsTagFilterOpen(false);
    };

    window.addEventListener("bocchi:calendar-close-tag-filter", handleCloseRequest);
    return () => {
      window.removeEventListener("bocchi:calendar-close-tag-filter", handleCloseRequest);
      document.documentElement.dataset.calendarTagFilter = "closed";
    };
  }, [isTagFilterOpen]);

  const setActiveFilter = useCallback((activeFilter: CalendarFilter) => {
    onCalendarFilterChange({ activeFilter, activeTags });
  }, [activeTags, onCalendarFilterChange]);

  const setActiveTags = useCallback((activeTags: string[]) => {
    onCalendarFilterChange({ activeFilter, activeTags });
  }, [activeFilter, onCalendarFilterChange]);

  const availableTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    posts.forEach((post) => {
      post.tags.forEach((tag) => {
        if (!tag.trim()) return;
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      });
    });

    return Array.from(tagCounts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0], "ja");
      })
      .map(([tag, count]) => ({ tag, count }));
  }, [posts]);

  const resolvedActiveTags = useMemo(() => {
    if (activeTags.length === 0) return [];

    const availableTagSet = new Set(availableTags.map(({ tag }) => tag));
    return activeTags.filter((tag) => availableTagSet.has(tag));
  }, [activeTags, availableTags]);

  const filteredPosts = useMemo(() => {
    if (resolvedActiveTags.length === 0) return posts;
    const activeTagSet = new Set(resolvedActiveTags);
    return posts.filter((post) => post.tags.some((tag) => activeTagSet.has(tag)));
  }, [posts, resolvedActiveTags]);

  const postsByDate = useMemo(() => {
    const next = new Map<string, Post[]>();
    filteredPosts.forEach((post) => {
      const dateKey = toDateKey(post.updatedAt);
      const current = next.get(dateKey) ?? [];
      current.push(post);
      next.set(dateKey, current);
    });
    return next;
  }, [filteredPosts]);

  const selectedDayPosts = useMemo(() => postsByDate.get(selectedDateKey) ?? [], [postsByDate, selectedDateKey]);

  const filterCounts = useMemo(() => {
    const countByFilter: Record<CalendarFilter, number> = {
      all: selectedDayPosts.length,
      post: 0,
      clip: 0,
    };

    selectedDayPosts.forEach((post) => {
      if (matchesFilter(post, "post")) countByFilter.post += 1;
      if (matchesFilter(post, "clip")) countByFilter.clip += 1;
    });

    return countByFilter;
  }, [selectedDayPosts]);

  const filterTabs = useMemo<Array<{ label: string; value: CalendarFilter; count: number }>>(() => ([
    { label: "すべて", value: "all", count: filterCounts.all },
    { label: "ポスト", value: "post", count: filterCounts.post },
    { label: "クリップ", value: "clip", count: filterCounts.clip },
  ]), [filterCounts]);

  const selectedPosts = useMemo(() => {
    return selectedDayPosts.filter((post) => matchesFilter(post, activeFilter));
  }, [activeFilter, selectedDayPosts]);

  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);

  const shiftMonth = (offset: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const selectToday = () => {
    const today = new Date();
    didSyncInitialPostDateRef.current = true;
    setSelectedDateKey(todayKey);
    setVisibleMonth(today);
  };

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col gap-3 px-4 pb-28 pt-4">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground" style={{ fontSize: 18, lineHeight: "24px" }}>カレンダー</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative shrink-0" ref={tagFilterRef}>
            {isTagFilterOpen && (
              <div
                className="fixed inset-0 z-[35] cursor-default bg-transparent"
                data-calendar-tag-filter-backdrop
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={() => setIsTagFilterOpen((current) => !current)}
              className={`relative z-40 flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border px-2 font-medium transition ${
                resolvedActiveTags.length > 0
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              style={{ fontSize: 13, lineHeight: "18px" }}
              aria-label="タグで絞り込む"
            >
              <Filter size={16} />
              {resolvedActiveTags.length > 0 && (
                <span className="min-w-4 rounded-full bg-primary/15 px-1 text-center font-semibold text-primary">
                  {resolvedActiveTags.length}
                </span>
              )}
            </button>

            {isTagFilterOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-3xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">タグで絞り込み</p>
                    <p className="text-xs text-muted-foreground">全投稿日から選べます</p>
                  </div>
                  {resolvedActiveTags.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTags([])}
                      className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      解除
                    </button>
                  )}
                </div>

                {availableTags.length === 0 ? (
                  <div className="rounded-2xl bg-secondary px-3 py-4 text-center text-xs text-muted-foreground">
                    この日にタグ付き投稿はありません。
                  </div>
                ) : (
                  <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto pr-1">
                    {availableTags.map(({ tag, count }) => {
                      const isActive = resolvedActiveTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setActiveTags(
                              activeTags.includes(tag)
                                ? activeTags.filter((currentTag) => currentTag !== tag)
                                : [...activeTags, tag],
                            );
                          }}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>#{tag}</span>
                          <span className={`rounded-full px-1.5 py-[1px] ${
                            isActive ? "bg-white/20 text-primary-foreground" : "bg-background text-muted-foreground"
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-primary">
            <CalendarDays size={18} />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <section className="shrink-0 rounded-[24px] border border-border bg-card px-4 py-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="前の月"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="font-semibold text-foreground" style={{ fontSize: 16, lineHeight: "22px" }}>{formatMonth(visibleMonth)}</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectToday}
                className="rounded-full border border-border px-3 py-1.5 font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                style={{ fontSize: 12, lineHeight: "16px" }}
              >
                今日
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="次の月"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {weekLabels.map((label) => (
              <div key={label} className="py-1.5 font-medium text-muted-foreground" style={{ fontSize: 11, lineHeight: "14px" }}>
                {label}
              </div>
            ))}
            {calendarDays.map((date) => {
              const dateKey = toDateKey(date.toISOString());
              const dayPosts = postsByDate.get(dateKey) ?? [];
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = dateKey === selectedDateKey;
              const isToday = dateKey === todayKey;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => {
                    didSyncInitialPostDateRef.current = true;
                    setSelectedDateKey(dateKey);
                  }}
                  className={`relative flex h-9 flex-col items-center justify-center rounded-2xl transition active:scale-95 ${
                    isSelected
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : isCurrentMonth
                        ? "text-foreground hover:bg-muted"
                        : "text-muted-foreground/40 hover:bg-muted/50"
                  }`}
                  style={{ fontSize: 15, lineHeight: "19px" }}
                >
                  <span className={isToday && !isSelected ? "font-bold text-primary" : "font-medium"}>
                    {date.getDate()}
                  </span>
                  {dayPosts.length > 0 && (
                    <span
                      className={`mt-1 h-1.5 w-1.5 rounded-full ${
                        isSelected ? "bg-primary-foreground" : "bg-primary"
                      }`}
                      aria-label={`${dayPosts.length}件の投稿`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col">
          <div className="shrink-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="truncate font-semibold text-foreground" style={{ fontSize: 15, lineHeight: "21px" }}>
                <span className="hidden min-[390px]:inline">{formatSelectedDateCompact(selectedDateKey)}</span>
                <span className="min-[390px]:hidden">{formatSelectedDateShort(selectedDateKey)}</span>
              </h2>
              <span className="shrink-0 text-muted-foreground" style={{ fontSize: 12, lineHeight: "16px" }}>{selectedPosts.length}件</span>
            </div>
            {resolvedActiveTags.length > 0 && (
              <div className="mt-1 flex max-w-full gap-1 overflow-x-auto screen-scroll">
                {resolvedActiveTags.map((tag) => (
                  <span key={tag} className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 w-full">
              <TabSwitcher tabs={filterTabs} value={activeFilter} onChange={(next) => setActiveFilter(next as CalendarFilter)} />
            </div>
          </div>

          {selectedPosts.length === 0 ? (
            <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/40 p-6 text-center text-sm text-muted-foreground">
              この条件の投稿はありません。
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 pb-4">
              {selectedPosts.map((post) => {
                const imageUrl = postThumbnailUrlMap[post.id]?.[0] ?? post.ogp?.image ?? "";
                return (
                  <article
                    key={post.id}
                    onClick={() => onPostClick(post.id)}
                    className="grid cursor-pointer grid-cols-[42px_44px_minmax(0,1fr)_28px] items-center gap-2 rounded-2xl border border-border bg-card px-2.5 py-2 shadow-sm transition hover:border-muted-foreground/30 active:scale-[0.997]"
                  >
                    <div className="text-center font-medium text-muted-foreground" style={{ fontSize: 12, lineHeight: "16px" }}>
                      {formatTime(post.updatedAt)}
                    </div>
                    {imageUrl ? (
                      <div className="h-11 w-11 overflow-hidden rounded-lg bg-black/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <ImageIcon size={16} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-[1px] font-medium text-muted-foreground" style={compactMetaTextStyle}>
                          {getTypeLabel(post)}
                        </span>
                        {post.tags.length > 0 && (
                          <span className="min-w-0 truncate rounded-full bg-secondary px-2 py-[1px] font-medium text-muted-foreground" style={compactMetaTextStyle}>
                            #{post.tags[0]}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-medium text-foreground" style={{ fontSize: 14, lineHeight: "19px" }}>
                        {post.body || "本文なし"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPostEdit(post);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label="編集"
                    >
                      <Edit3 size={14} />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
