"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Edit3, Image as ImageIcon } from "lucide-react";
import { TabSwitcher } from "@/components/ui/tab-switcher";
import type { Post } from "@/types/post";

type CalendarFilter = "all" | "post" | "clip";

type CalendarViewProps = {
  posts: Post[];
  postThumbnailUrlMap: Record<string, string[]>;
  onPostClick: (postId: string) => void;
  onPostEdit: (post: Post) => void;
  onTagClick: (tag: string) => void;
};

const filterTabs: Array<{ label: string; value: CalendarFilter }> = [
  { label: "すべて", value: "all" },
  { label: "ポスト", value: "post" },
  { label: "クリップ", value: "clip" },
];

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

function formatSelectedDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
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

export function CalendarView({ posts, postThumbnailUrlMap, onPostClick, onPostEdit, onTagClick }: CalendarViewProps) {
  const didSyncInitialPostDateRef = useRef(false);
  const [selectedDateKey, setSelectedDateKey] = useState(() => getLatestPostDateKey(posts));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = new Date(`${getLatestPostDateKey(posts)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  });
  const [activeFilter, setActiveFilter] = useState<CalendarFilter>("all");
  const todayKey = toDateKey(new Date().toISOString());

  useEffect(() => {
    if (didSyncInitialPostDateRef.current || posts.length === 0) return;

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
  }, [posts]);

  const postsByDate = useMemo(() => {
    const next = new Map<string, Post[]>();
    posts.forEach((post) => {
      const dateKey = toDateKey(post.updatedAt);
      const current = next.get(dateKey) ?? [];
      current.push(post);
      next.set(dateKey, current);
    });
    return next;
  }, [posts]);

  const selectedPosts = useMemo(() => {
    return (postsByDate.get(selectedDateKey) ?? []).filter((post) => matchesFilter(post, activeFilter));
  }, [activeFilter, postsByDate, selectedDateKey]);

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
    <div className="flex min-h-screen flex-col gap-4 px-4 pb-28 pt-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">カレンダー</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            投稿日をたどる
          </h1>
        </div>
        <CalendarDays size={24} className="text-primary" />
      </header>

      <section className="rounded-[24px] border border-border bg-card p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="前の月"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-base font-semibold text-foreground">{formatMonth(visibleMonth)}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectToday}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
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

        <div className="grid grid-cols-7 gap-1 text-center">
          {weekLabels.map((label) => (
            <div key={label} className="py-2 text-xs font-medium text-muted-foreground">
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
                className={`relative flex aspect-square flex-col items-center justify-center rounded-2xl text-sm transition active:scale-95 ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : isCurrentMonth
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/40 hover:bg-muted/50"
                }`}
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

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{formatSelectedDate(selectedDateKey)}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{selectedPosts.length}件</p>
          </div>
          <div className="min-w-[168px]">
            <TabSwitcher tabs={filterTabs} value={activeFilter} onChange={(next) => setActiveFilter(next as CalendarFilter)} />
          </div>
        </div>

        {selectedPosts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            この条件の投稿はありません。
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedPosts.map((post) => {
              const imageUrl = postThumbnailUrlMap[post.id]?.[0];
              return (
                <article
                  key={post.id}
                  onClick={() => onPostClick(post.id)}
                  className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:border-muted-foreground/30 hover:shadow-md active:scale-[0.997]"
                >
                  {imageUrl ? (
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-black/5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <ImageIcon size={18} />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="mb-1 flex items-center gap-2">
                      <time className="font-medium text-muted-foreground" style={compactMetaTextStyle}>{formatTime(post.updatedAt)}</time>
                      <span className="rounded-full bg-secondary px-2 py-[1px] font-medium text-muted-foreground" style={compactMetaTextStyle}>
                        {getTypeLabel(post)}
                      </span>
                    </div>
                    <p className="min-h-0 flex-1 truncate text-sm leading-relaxed text-foreground">{post.body}</p>
                    {post.tags.length > 0 && (
                      <div className="mt-2 flex gap-1.5 overflow-x-auto screen-scroll">
                        {post.tags.slice(0, 3).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onTagClick(tag);
                            }}
                            className="shrink-0 rounded-full bg-secondary px-2 py-[1px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            style={compactMetaTextStyle}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPostEdit(post);
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label="編集"
                  >
                    <Edit3 size={16} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
