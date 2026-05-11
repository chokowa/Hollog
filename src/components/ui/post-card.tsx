"use client";

/* eslint-disable @next/next/no-img-element */
import { memo, useState, useEffect, useRef } from "react";
import { Archive, Copy, Database, Download, Edit3, Link as LinkIcon, Share, ExternalLink, Loader2, ArrowRightLeft, MoreHorizontal, type LucideIcon } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { fetchOgpPreview } from "@/lib/ogp-preview";
import type { ImageOriginRect } from "@/types/navigation";
import type { OgpPreview, Post, PostType } from "@/types/post";

type PostCardProps = {
  post: Post;
  imageUrls?: string[];
  onClick?: () => void;
  onEdit?: () => void;
  onCopy?: (post: Post, copied: boolean) => void;
  onTagClick?: (tag: string) => void;
  onTypeChange?: (nextType: PostType) => void;
  onOgpFetched?: (ogp: OgpPreview) => void;
  onImageOpen?: (post: Post, index: number, originRect: ImageOriginRect) => void;
  onSaveMedia?: (post: Post) => void;
  isDetail?: boolean;
};

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

function formatDetailedDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function renderBodyWithLinks(body: string) {
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  const parts = body.split(urlPattern);

  return parts.map((part, index) => {
    if (!part.match(urlPattern)) return part;

    const href = part.replace(/[、。,.!?！？)）\]]+$/, "");
    const suffix = part.slice(href.length);

    return (
      <span key={`${part}-${index}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        >
          {href}
        </a>
        {suffix}
      </span>
    );
  });
}

function PostCardComponent({ post, imageUrls, onClick, onEdit, onCopy, onTagClick, onTypeChange, onOgpFetched, onImageOpen, onSaveMedia, isDetail = false }: PostCardProps) {
  const [fetchedOgp, setFetchedOgp] = useState<OgpPreview | null>(null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [shouldFetchOgp, setShouldFetchOgp] = useState(isDetail);
  const [shouldLoadImages, setShouldLoadImages] = useState(isDetail);
  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(() => new Set());
  const articleRef = useRef<HTMLElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const suppressNextOutsideClickRef = useRef(false);
  const suppressResetTimerRef = useRef<number | null>(null);
  const fetchedRef = useRef(false);
  const ogp = post.ogp ?? fetchedOgp;
  const timelineMediaBleedClass = "-mx-4 -mt-4 mb-3";
  const timelineMediaCornerClass = "rounded-t-[28px]";
  const cardSurfaceClass = isDetail
    ? "post-card-surface cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-muted-foreground/30 hover:shadow-md active:scale-[0.997]"
    : "post-card-surface cursor-pointer overflow-hidden rounded-[28px] border border-border/80 bg-card px-4 pb-3 pt-4 shadow-[0_1px_0_rgba(255,255,255,0.03)] transition hover:border-muted-foreground/25 hover:bg-card/95";
  const compactUrlButtonClass = isDetail
    ? "w-full rounded-lg border border-border bg-muted/50 p-3 text-left transition-colors hover:bg-muted"
    : "w-full rounded-2xl border border-border/80 bg-muted/35 px-3 py-2.5 text-left transition-colors hover:bg-muted/55";
  const compactOgpCardClass = isDetail
    ? "mt-2 w-full rounded-lg border border-border bg-muted/30 overflow-hidden shadow-sm transition-colors hover:bg-muted/50 text-left"
    : "mt-2 w-full overflow-hidden rounded-[22px] border border-border/80 bg-muted/25 text-left transition-colors hover:bg-muted/45";

  useEffect(() => {
    if (isDetail || shouldLoadImages || !imageUrls || imageUrls.length === 0) return;
    const article = articleRef.current;

    if (!article || !("IntersectionObserver" in window)) {
      const timer = window.setTimeout(() => setShouldLoadImages(true), 0);
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadImages(true);
          observer.disconnect();
        }
      },
      { rootMargin: "900px 0px" },
    );

    observer.observe(article);
    return () => observer.disconnect();
  }, [imageUrls, isDetail, shouldLoadImages]);

  useEffect(() => {
    if (isDetail || !post.url || post.ogp || fetchedRef.current || shouldFetchOgp) return;
    const article = articleRef.current;
    if (!article || !("IntersectionObserver" in window)) {
      setShouldFetchOgp(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldFetchOgp(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );

    observer.observe(article);
    return () => observer.disconnect();
  }, [isDetail, post.ogp, post.url, shouldFetchOgp]);

  useEffect(() => {
    const blockClickAfterClose = (event: MouseEvent) => {
      if (!suppressNextOutsideClickRef.current) return;
      if (actionMenuRef.current?.contains(event.target as Node)) return;

      suppressNextOutsideClickRef.current = false;
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
        suppressResetTimerRef.current = null;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener("click", blockClickAfterClose, true);
    return () => {
      document.removeEventListener("click", blockClickAfterClose, true);
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isActionMenuOpen) return;

    const closeBeforeBackgroundHandlesTap = (event: PointerEvent) => {
      if (actionMenuRef.current?.contains(event.target as Node)) return;

      suppressNextOutsideClickRef.current = true;
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
      suppressResetTimerRef.current = window.setTimeout(() => {
        suppressNextOutsideClickRef.current = false;
        suppressResetTimerRef.current = null;
      }, 700);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setIsActionMenuOpen(false);
    };

    document.addEventListener("pointerdown", closeBeforeBackgroundHandlesTap, true);
    return () => {
      document.removeEventListener("pointerdown", closeBeforeBackgroundHandlesTap, true);
    };
  }, [isActionMenuOpen]);

  // OGP情報を取得
  useEffect(() => {
    if (post.ogp) {
      fetchedRef.current = true;
      return;
    }
    if (!shouldFetchOgp || !post.url || fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        new URL(post.url!);
      } catch {
        return;
      }
      setOgpLoading(true);
      try {
        const data = await fetchOgpPreview(post.url!);
        if (data) {
          setFetchedOgp(data);
          onOgpFetched?.(data);
        }
      } catch {}
      setOgpLoading(false);
    })();
  }, [post.ogp, post.url, onOgpFetched, shouldFetchOgp]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionMenuOpen(false);
    const copied = await copyTextToClipboard(post.body);
    onCopy?.(post, copied);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionMenuOpen(false);
    const text = encodeURIComponent(post.body);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionMenuOpen(false);
    (onEdit ?? onClick)?.();
  };

  const handleSaveMedia = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionMenuOpen(false);
    onSaveMedia?.(post);
  };

  const handleMoveType = (e: React.MouseEvent, nextType: PostType) => {
    e.stopPropagation();
    setIsActionMenuOpen(false);
    onTypeChange?.(nextType);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>, index: number) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    onImageOpen?.(post, index, {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  };

  const markImageBroken = (url: string) => {
    setBrokenImageUrls((current) => {
      if (current.has(url)) return current;
      const next = new Set(current);
      next.add(url);
      return next;
    });
  };

  const renderBrokenImage = (className: string) => (
    <div className={`flex items-center justify-center bg-muted px-4 text-center text-xs text-muted-foreground ${className}`}>
      元ファイルを読み込めません
    </div>
  );

  const getMediaStorageBadge = (index: number): { label: string; Icon: LucideIcon } => {
    const legacyImageCount = (post.imageBlobs?.length ?? 0) + (post.imageBlob ? 1 : 0);
    if (index < legacyImageCount) {
      return { label: "保存済み", Icon: Database };
    }

    const mediaRef = post.mediaRefs?.[index - legacyImageCount];
    if (mediaRef?.storage === "device-reference") {
      return { label: "端末の画像を参照", Icon: LinkIcon };
    }
    if (mediaRef?.storage === "app-local-copy") {
      return { label: "アプリ内保存", Icon: Archive };
    }

    return { label: "保存済み", Icon: Database };
  };

  const renderMediaStorageBadge = (index: number) => {
    if (!isDetail) return null;
    const { label, Icon } = getMediaStorageBadge(index);
    return (
      <div
        className="absolute right-2 top-2 z-[1] flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white/70 backdrop-blur-sm"
        title={label}
        aria-label={label}
      >
        <Icon size={15} />
      </div>
    );
  };

  const movableType = post.type === "post" ? "clip" : post.type === "clip" ? "post" : null;
  const moveLabel = movableType === "clip" ? "クリップに移動" : movableType === "post" ? "ポストに移動" : "";
  const hasMedia = Boolean(
    (post.imageBlobs?.length ?? 0)
    + (post.imageBlob ? 1 : 0)
    + (post.mediaRefs?.filter((mediaRef) => mediaRef.kind === "image").length ?? 0),
  );

  const renderImages = () => {
    if (!imageUrls || imageUrls.length === 0) return null;

    const count = imageUrls.length;
    if (!shouldLoadImages) {
      return isDetail
        ? <div data-card-media className="-mx-5 -mt-5 mb-4 aspect-[4/3] rounded-t-xl border-b border-border bg-black/5" />
        : <div data-card-media className={`${timelineMediaBleedClass} aspect-[4/3] ${timelineMediaCornerClass} bg-black/5`} />;
    }

    if (isDetail) {
      return (
        <div data-card-media className="mb-4 flex flex-col gap-3">
          {imageUrls.map((url, i) => (
            <div key={i} className="relative overflow-hidden rounded-lg border border-border bg-black/5">
              {brokenImageUrls.has(url) ? renderBrokenImage("min-h-40 w-full") : (
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-full h-auto object-contain cursor-pointer"
                  onClick={(e) => handleImageClick(e, i)}
                  onError={() => markImageBroken(url)}
                />
              )}
              {renderMediaStorageBadge(i)}
            </div>
          ))}
        </div>
      );
    }

    if (count === 1) {
      return (
        <div
          data-card-media
          className={isDetail
            ? "-mx-5 -mt-5 mb-4 aspect-[4/3] overflow-hidden rounded-t-xl border-b border-border bg-black/5"
            : `${timelineMediaBleedClass} aspect-[4/3] overflow-hidden ${timelineMediaCornerClass} bg-black/5`}
        >
          {brokenImageUrls.has(imageUrls[0]) ? renderBrokenImage("h-full w-full") : (
            <img
              src={imageUrls[0]}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90"
              onClick={(e) => handleImageClick(e, 0)}
              onError={() => markImageBroken(imageUrls[0])}
            />
          )}
        </div>
      );
    }

    if (count === 2) {
      return (
        <div
          data-card-media
          className={isDetail
            ? "-mx-5 -mt-5 mb-4 grid aspect-[4/3] grid-cols-2 gap-1 overflow-hidden rounded-t-xl border-b border-border bg-black/5"
            : `${timelineMediaBleedClass} grid aspect-[4/3] grid-cols-2 gap-1 overflow-hidden ${timelineMediaCornerClass} bg-black/5`}
        >
          {imageUrls.map((url, i) => (
            brokenImageUrls.has(url)
              ? <div key={i}>{renderBrokenImage("h-full w-full")}</div>
              : <img key={i} src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, i)} onError={() => markImageBroken(url)} />
          ))}
        </div>
      );
    }

    if (count === 3) {
      return (
        <div
          data-card-media
          className={isDetail
            ? "-mx-5 -mt-5 mb-4 grid aspect-[4/3] grid-cols-[1.35fr_1fr] gap-1 overflow-hidden rounded-t-xl border-b border-border bg-black/5"
            : `${timelineMediaBleedClass} grid aspect-[4/3] grid-cols-[1.35fr_1fr] gap-1 overflow-hidden ${timelineMediaCornerClass} bg-black/5`}
        >
          {brokenImageUrls.has(imageUrls[0])
            ? renderBrokenImage("h-full w-full")
            : <img src={imageUrls[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, 0)} onError={() => markImageBroken(imageUrls[0])} />}
          <div className="grid grid-rows-2 gap-1 h-full overflow-hidden">
            {imageUrls.slice(1, 3).map((url, offset) => (
              brokenImageUrls.has(url)
                ? <div key={url}>{renderBrokenImage("h-full w-full")}</div>
                : <img key={url} src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, offset + 1)} onError={() => markImageBroken(url)} />
            ))}
          </div>
        </div>
      );
    }

    if (count >= 4) {
      return (
        <div
          data-card-media
          className={isDetail
            ? "-mx-5 -mt-5 mb-4 grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-t-xl border-b border-border bg-black/5"
            : `${timelineMediaBleedClass} grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden ${timelineMediaCornerClass} bg-black/5`}
        >
          {imageUrls.slice(0, 4).map((url, i) => (
            brokenImageUrls.has(url)
              ? <div key={url}>{renderBrokenImage("h-full w-full")}</div>
              : <img key={url} src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, i)} onError={() => markImageBroken(url)} />
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <article
        ref={articleRef}
        onClick={onClick}
        className={cardSurfaceClass}
      >
        {post.url && (
          <div className={isDetail ? "mb-4" : "mb-3"}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(post.url, "_blank", "noopener,noreferrer");
              }}
              className={compactUrlButtonClass}
            >
              <div className="flex items-start gap-2">
                <LinkIcon size={isDetail ? 16 : 15} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className={`${isDetail ? "text-xs" : "text-[13px]"} truncate text-primary`}>{post.url}</div>
                </div>
                <ExternalLink size={isDetail ? 14 : 13} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
              </div>
            </button>

            {/* OGPプレビューカード */}
            {ogpLoading && (
              <div className="mt-2 flex items-center justify-center py-3">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            )}
            {ogp && (ogp.title || ogp.image) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(post.url, "_blank", "noopener,noreferrer");
                }}
                className={compactOgpCardClass}
              >
                {ogp.image && (
                  <div className="aspect-video w-full overflow-hidden bg-black/5">
                    <img src={ogp.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className={isDetail ? "p-3" : "px-3 py-2.5"}>
                  {ogp.siteName && (
                    <p className="text-xs text-muted-foreground mb-1">{ogp.siteName}</p>
                  )}
                  {ogp.title && (
                    <p className="text-sm font-medium text-foreground line-clamp-2">{ogp.title}</p>
                  )}
                  {ogp.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{ogp.description}</p>
                  )}
                </div>
              </button>
            )}
          </div>
        )}

        {renderImages()}

        <p className={`${isDetail ? "mb-4 text-[17px]" : "mb-3 text-[15px]"} whitespace-pre-wrap break-words leading-relaxed text-foreground`}>
          {renderBodyWithLinks(post.body)}
        </p>

        <div className={`border-t border-border ${isDetail ? "pt-3.5" : "pt-2.5"}`}>
          {isDetail && (
            <time className="mb-3 block text-sm text-muted-foreground">
              {formatDetailedDateTime(post.updatedAt)}
            </time>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {!isDetail && (
                <time className="shrink-0 text-[15px] text-muted-foreground">
                  {formatTime(post.updatedAt)}
                </time>
              )}
              {post.tags && post.tags.length > 0 && (
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto screen-scroll">
                  {post.tags.map((tag, index) => (
                    <button
                      type="button"
                      data-swipe-start
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTagClick?.(tag);
                      }}
                      className={`shrink-0 rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${isDetail ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-[11px]"}`}
                      title={`#${tag}で絞り込み`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isDetail && !post.tags?.length && (
              <time className="shrink-0 text-[15px] text-muted-foreground">
                {formatTime(post.updatedAt)}
              </time>
            )}
            <div ref={actionMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsActionMenuOpen((current) => !current);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
                title="操作メニュー"
                aria-label="操作メニュー"
                aria-expanded={isActionMenuOpen}
              >
                <MoreHorizontal size={18} />
              </button>
              {isActionMenuOpen && (
                  <div className="absolute bottom-11 right-0 z-20 w-44 overflow-hidden rounded-2xl border border-border bg-card p-1 text-sm shadow-xl">
                    {hasMedia && onSaveMedia && (
                      <button
                        type="button"
                        onClick={handleSaveMedia}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <Download size={15} />
                        <span>端末に保存</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Copy size={15} />
                      <span>コピー</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Share size={15} />
                      <span>Xへ投稿</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleEdit}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      <Edit3 size={15} />
                      <span>編集</span>
                    </button>
                    {movableType && onTypeChange && (
                      <button
                        type="button"
                        onClick={(e) => handleMoveType(e, movableType)}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <ArrowRightLeft size={15} />
                        <span>{moveLabel}</span>
                      </button>
                    )}
                  </div>
              )}
            </div>
          </div>
        </div>
      </article>
    </>
  );
}

export const PostCard = memo(PostCardComponent, (prev, next) => (
  prev.post === next.post
  && prev.imageUrls === next.imageUrls
  && prev.onCopy === next.onCopy
  && prev.onImageOpen === next.onImageOpen
  && prev.onSaveMedia === next.onSaveMedia
  && prev.isDetail === next.isDetail
));
