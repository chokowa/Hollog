"use client";

/* eslint-disable @next/next/no-img-element */
import { memo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Archive, Copy, Database, Download, Edit3, Link as LinkIcon, Share, Loader2, ArrowRightLeft, MoreHorizontal, type LucideIcon } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard";
import { fetchOgpPreview } from "@/lib/ogp-preview";
import { DEFAULT_POST_CARD_SECTION_ORDER, type PostCardSection } from "@/lib/post-card-layout";
import { canAutoRetryOgp, isOgpIncomplete } from "@/lib/post-ogp";
import { TagContextMenu, type TagContextAction } from "@/components/ui/tag-context-menu";
import type { ImageOriginRect } from "@/types/navigation";
import type { OgpPreview, Post, PostType } from "@/types/post";

type PostCardProps = {
  post: Post;
  imageUrls?: string[];
  onClick?: () => void;
  onEdit?: () => void;
  onCopy?: (post: Post, copied: boolean) => void;
  onUrlCopy?: (post: Post, copied: boolean) => void;
  onTagClick?: (tag: string) => void;
  onTagMenuAction?: (action: TagContextAction, tag: string) => void;
  isTagHidden?: (tag: string) => boolean;
  hasMediaForTag?: (tag: string) => boolean;
  onTypeChange?: (nextType: PostType) => void;
  onOgpFetched?: (ogp: OgpPreview | null) => void;
  onOgpRetry?: (post: Post) => void;
  onImageOpen?: (post: Post, index: number, originRect: ImageOriginRect) => void;
  onSaveMedia?: (post: Post) => void;
  sectionOrder?: PostCardSection[];
  isDetail?: boolean;
};

type SectionPlacement = "first" | "middle" | "last" | "only";

const COMPACT_CARD_EDGE_Y_CLASS = "py-3";
const COMPACT_CARD_SECTION_GAP_CLASS = "mb-2.5";

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

function buildPostClipboardText(post: Post) {
  return [post.body.trim(), post.url?.trim() ?? ""].filter(Boolean).join("\n");
}

function PostCardComponent({
  post,
  imageUrls,
  onClick,
  onEdit,
  onCopy,
  onUrlCopy,
  onTagClick,
  onTagMenuAction,
  isTagHidden,
  hasMediaForTag,
  onTypeChange,
  onOgpFetched,
  onOgpRetry,
  onImageOpen,
  onSaveMedia,
  sectionOrder = DEFAULT_POST_CARD_SECTION_ORDER,
  isDetail = false,
}: PostCardProps) {
  const [fetchedOgp, setFetchedOgp] = useState<OgpPreview | null>(null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [tagMenuState, setTagMenuState] = useState<{ tag: string; left: number; top: number } | null>(null);
  const [shouldFetchOgp, setShouldFetchOgp] = useState(isDetail);
  const [shouldLoadImages, setShouldLoadImages] = useState(isDetail);
  const [brokenImageUrls, setBrokenImageUrls] = useState<Set<string>>(() => new Set());
  const articleRef = useRef<HTMLElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const actionButtonRef = useRef<HTMLButtonElement>(null);
  const suppressNextOutsideClickRef = useRef(false);
  const suppressResetTimerRef = useRef<number | null>(null);
  const tagLongPressTimerRef = useRef<number | null>(null);
  const tagLongPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressTagClickRef = useRef<string | null>(null);
  const fetchedRef = useRef(false);
  const ogp = post.ogp ?? fetchedOgp;
  const cardSurfaceClass = isDetail
    ? "post-card-surface cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-muted-foreground/30 hover:shadow-md active:scale-[0.997]"
    : `post-card-surface cursor-pointer overflow-hidden rounded-[28px] border border-border/80 bg-card px-4 ${COMPACT_CARD_EDGE_Y_CLASS} shadow-[0_1px_0_rgba(255,255,255,0.03)] transition hover:border-muted-foreground/25 hover:bg-card/95`;
  const compactUrlButtonClass = isDetail
    ? "w-full rounded-lg border border-border bg-muted/50 p-3 text-left transition-colors hover:bg-muted"
    : "w-full rounded-2xl border border-border/80 bg-muted/35 px-3 py-2.5 text-left transition-colors hover:bg-muted/55";
  const compactOgpCardClass = isDetail
    ? "mt-2 w-full rounded-lg border border-border bg-muted/30 overflow-hidden shadow-sm transition-colors hover:bg-muted/50 text-left"
    : "mt-2 w-full overflow-hidden rounded-[22px] border border-border/80 bg-muted/25 text-left transition-colors hover:bg-muted/45";

  const getFlushWrapperClass = (placement: SectionPlacement) => {
    const horizontal = isDetail ? "-mx-5" : "-mx-4";
    const top = placement === "first" || placement === "only" ? (isDetail ? "-mt-5" : "-mt-3") : "";
    const bottom = placement === "last" || placement === "only"
      ? (isDetail ? "-mb-5" : "-mb-3")
      : isDetail ? "mb-4" : COMPACT_CARD_SECTION_GAP_CLASS;
    return [horizontal, top, bottom].filter(Boolean).join(" ");
  };

  const getFlushRadiusClass = (placement: SectionPlacement) => {
    if (isDetail) {
      if (placement === "only") return "rounded-xl";
      if (placement === "first") return "rounded-t-xl";
      if (placement === "last") return "rounded-b-xl";
      return "";
    }

    if (placement === "only") return "rounded-[28px]";
    if (placement === "first") return "rounded-t-[28px]";
    if (placement === "last") return "rounded-b-[28px]";
    return "";
  };

  const getContainedMediaClass = (placement?: SectionPlacement) => {
    if (placement) {
      return `overflow-hidden bg-black/5 ${getFlushRadiusClass(placement)}`;
    }
    return isDetail
      ? "mb-4 overflow-hidden rounded-xl border border-border bg-black/5"
      : "overflow-hidden rounded-2xl border border-border/80 bg-black/5";
  };

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
    if (isDetail || !post.url || !canAutoRetryOgp(post) || fetchedRef.current || shouldFetchOgp) return;
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
  }, [isDetail, post, post.url, shouldFetchOgp]);

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
      const target = event.target as Node;
      if (actionMenuRef.current?.contains(target) || actionButtonRef.current?.contains(target)) return;
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
    const closeFloatingMenu = () => setIsActionMenuOpen(false);

    document.addEventListener("pointerdown", closeBeforeBackgroundHandlesTap, true);
    window.addEventListener("resize", closeFloatingMenu);
    window.addEventListener("scroll", closeFloatingMenu, true);
    return () => {
      document.removeEventListener("pointerdown", closeBeforeBackgroundHandlesTap, true);
      window.removeEventListener("resize", closeFloatingMenu);
      window.removeEventListener("scroll", closeFloatingMenu, true);
    };
  }, [isActionMenuOpen]);

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

  // OGP情報を取得
  useEffect(() => {
    if (post.ogp && !isOgpIncomplete(post)) {
      fetchedRef.current = true;
      return;
    }
    if (!shouldFetchOgp || !post.url || fetchedRef.current || !canAutoRetryOgp(post)) return;
    fetchedRef.current = true;
    (async () => {
      try {
        new URL(post.url!);
      } catch {
        onOgpFetched?.(null);
        return;
      }
      setOgpLoading(true);
      let data: OgpPreview | null = null;
      try {
        data = await fetchOgpPreview(post.url!);
        if (data) {
          setFetchedOgp(data);
        }
      } catch {}
      onOgpFetched?.(data);
      setOgpLoading(false);
    })();
  }, [post, post.ogp, post.url, onOgpFetched, shouldFetchOgp]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionMenuOpen(false);
    const copied = await copyTextToClipboard(buildPostClipboardText(post));
    onCopy?.(post, copied);
  };

  const handleCopyUrl = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!post.url) return;
    const copied = await copyTextToClipboard(post.url);
    onUrlCopy?.(post, copied);
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

  const handleRetryOgp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsActionMenuOpen(false);
    onOgpRetry?.(post);
  };

  const toggleActionMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isActionMenuOpen) {
      setIsActionMenuOpen(false);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 280;
    const gap = 8;
    const left = Math.max(gap, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - gap));
    const opensDown = rect.top < window.innerHeight / 2;
    const top = opensDown
      ? Math.min(rect.bottom + gap, window.innerHeight - menuHeight - gap)
      : Math.max(gap, rect.top - menuHeight - gap);

    setActionMenuPosition({ left, top });
    setIsActionMenuOpen(true);
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

  const renderImages = (placement?: SectionPlacement) => {
    if (!imageUrls || imageUrls.length === 0) return null;

    const count = imageUrls.length;
    const mediaBlockClass = getContainedMediaClass(placement);
    if (!shouldLoadImages) {
      return <div data-card-media className={`${mediaBlockClass} aspect-[4/3]`} />;
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
          className={`${mediaBlockClass} aspect-[4/3]`}
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
          className={`${mediaBlockClass} grid aspect-[4/3] grid-cols-2 gap-1`}
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
          className={`${mediaBlockClass} grid aspect-[4/3] grid-cols-[1.35fr_1fr] gap-1`}
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
          className={`${mediaBlockClass} grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1`}
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

  const openTagMenu = (tag: string, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const menuWidth = 192;
    const menuHeight = 248;
    const gap = 8;
    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - menuWidth - gap));
    const top = rect.bottom + menuHeight + gap < window.innerHeight
      ? rect.bottom + gap
      : Math.max(gap, rect.top - menuHeight - gap);
    setTagMenuState({ tag, left, top });
  };

  const clearTagLongPress = () => {
    if (tagLongPressTimerRef.current !== null) {
      window.clearTimeout(tagLongPressTimerRef.current);
      tagLongPressTimerRef.current = null;
    }
    tagLongPressStartRef.current = null;
  };

  const renderUrlSection = () => {
    if (!post.url) return null;

    return (
      <div className={isDetail ? "mb-4" : ""}>
        <div className={`${compactUrlButtonClass} relative`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.open(post.url, "_blank", "noopener,noreferrer");
            }}
            className="flex min-w-0 w-full items-start gap-2 pr-8 text-left"
          >
            <LinkIcon size={isDetail ? 16 : 15} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className={`${isDetail ? "text-xs" : "text-[13px]"} truncate text-primary`}>{post.url}</div>
            </div>
          </button>
          <button
            type="button"
            onClick={handleCopyUrl}
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-background/80 hover:text-foreground active:scale-95"
            title="URLをコピー"
            aria-label="URLをコピー"
          >
            <Copy size={isDetail ? 14 : 13} />
          </button>
        </div>
      </div>
    );
  };

  const renderPreviewSection = (placement?: SectionPlacement) => {
    if (!post.url) return null;
    if (!ogpLoading && !(ogp && (ogp.title || ogp.image))) return null;
    const previewCardClass = placement
      ? `w-full overflow-hidden bg-muted/25 text-left transition-colors hover:bg-muted/45 ${getFlushRadiusClass(placement)}`
      : compactOgpCardClass.replace(/^mt-2\s+/, "");

    return (
      <div className={placement ? "" : isDetail ? "mb-4" : ""}>
        {ogpLoading && (
          <div className="flex items-center justify-center py-3">
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
            className={previewCardClass}
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
    );
  };

  const renderBodySection = () => (
    <p
      data-swipe-area
      className={`${isDetail ? "mb-4 text-[17px]" : "text-[15px]"} whitespace-pre-wrap break-words leading-relaxed text-foreground`}
    >
      {renderBodyWithLinks(post.body)}
    </p>
  );

  const renderActionMenu = () => {
    if (!isActionMenuOpen || !actionMenuPosition) return null;
    if (typeof document === "undefined") return null;

    return createPortal(
      <div
        ref={actionMenuRef}
        style={{ left: actionMenuPosition.left, top: actionMenuPosition.top }}
        className="fixed z-[100] w-44 overflow-hidden rounded-2xl border border-border bg-card p-1 text-sm shadow-2xl"
      >
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
          <span>本文+URLをコピー</span>
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
        {post.url && onOgpRetry && (
          <button
            type="button"
            onClick={handleRetryOgp}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Loader2 size={15} />
            <span>プレビューを再取得</span>
          </button>
        )}
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
      </div>,
      document.body,
    );
  };

  const renderMetaSection = () => (
    <div data-swipe-area>
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
            <div data-horizontal-scroll className="flex min-w-0 flex-1 touch-auto items-center gap-1.5 overflow-x-auto screen-scroll">
              {post.tags.map((tag, index) => (
                <button
                  type="button"
                  data-swipe-start
                  data-horizontal-scroll-item
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressTagClickRef.current === tag) {
                      suppressTagClickRef.current = null;
                      return;
                    }
                    onTagClick?.(tag);
                  }}
                  onPointerDown={(e) => {
                    if (isDetail || !onTagMenuAction) return;
                    const target = e.currentTarget;
                    clearTagLongPress();
                    tagLongPressStartRef.current = { x: e.clientX, y: e.clientY };
                    tagLongPressTimerRef.current = window.setTimeout(() => {
                      suppressTagClickRef.current = tag;
                      openTagMenu(tag, target);
                      tagLongPressTimerRef.current = null;
                      tagLongPressStartRef.current = null;
                    }, 420);
                  }}
                  onPointerMove={(e) => {
                    const start = tagLongPressStartRef.current;
                    if (!start) return;
                    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
                      clearTagLongPress();
                    }
                  }}
                  onPointerUp={clearTagLongPress}
                  onPointerLeave={clearTagLongPress}
                  onPointerCancel={clearTagLongPress}
                  className={`shrink-0 rounded-full transition-colors ${
                    isTagHidden?.(tag)
                      ? "bg-muted text-muted-foreground/60 hover:bg-muted"
                      : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
                  } ${isDetail ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-[11px]"}`}
                  title={`#${tag}で絞り込み`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative shrink-0">
          <button
            ref={actionButtonRef}
            type="button"
            onClick={toggleActionMenu}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
            title="操作メニュー"
            aria-label="操作メニュー"
            aria-expanded={isActionMenuOpen}
          >
            <MoreHorizontal size={18} />
          </button>
          {renderActionMenu()}
        </div>
      </div>
      <TagContextMenu
        tag={tagMenuState?.tag ?? ""}
        isOpen={Boolean(tagMenuState)}
        position={tagMenuState ? { left: tagMenuState.left, top: tagMenuState.top } : null}
        hasMedia={tagMenuState ? (hasMediaForTag?.(tagMenuState.tag) ?? false) : false}
        hidden={tagMenuState ? (isTagHidden?.(tagMenuState.tag) ?? false) : false}
        onClose={() => setTagMenuState(null)}
        onAction={(action, tag) => onTagMenuAction?.(action, tag)}
      />
    </div>
  );

  const resolvedSectionOrder = isDetail ? DEFAULT_POST_CARD_SECTION_ORDER : sectionOrder;
  const hasSectionContent = (section: PostCardSection) => {
    if (section === "url") return Boolean(post.url);
    if (section === "preview") return Boolean(post.url && (ogpLoading || (ogp && (ogp.title || ogp.image))));
    if (section === "media") return Boolean(imageUrls && imageUrls.length > 0);
    return true;
  };
  const visibleSectionOrder = resolvedSectionOrder.filter(hasSectionContent);
  const getSectionPlacement = (index: number): SectionPlacement => {
    if (visibleSectionOrder.length === 1) return "only";
    if (index === 0) return "first";
    if (index === visibleSectionOrder.length - 1) return "last";
    return "middle";
  };
  const renderSection = (section: PostCardSection, placement?: SectionPlacement) => {
    if (section === "url") return renderUrlSection();
    if (section === "preview") return renderPreviewSection(placement);
    if (section === "media") return renderImages(placement);
    if (section === "body") return renderBodySection();
    return renderMetaSection();
  };

  return (
    <>
      <article
        ref={articleRef}
        onClick={onClick}
        className={cardSurfaceClass}
      >
        {visibleSectionOrder.map((section, index) => {
          const placement = getSectionPlacement(index);
          const shouldFlush = !isDetail && (section === "media" || section === "preview");
          const content = renderSection(section, shouldFlush ? placement : undefined);
          if (!content) return null;
          const sectionWrapperClass = shouldFlush
            ? getFlushWrapperClass(placement)
            : !isDetail && placement !== "last" && placement !== "only"
              ? COMPACT_CARD_SECTION_GAP_CLASS
              : undefined;
          return (
            <div key={section} className={sectionWrapperClass}>
              {content}
            </div>
          );
        })}
      </article>
    </>
  );
}

export const PostCard = memo(PostCardComponent, (prev, next) => (
  prev.post === next.post
  && prev.imageUrls === next.imageUrls
  && prev.onCopy === next.onCopy
  && prev.onUrlCopy === next.onUrlCopy
  && prev.onTagMenuAction === next.onTagMenuAction
  && prev.isTagHidden === next.isTagHidden
  && prev.hasMediaForTag === next.hasMediaForTag
  && prev.onImageOpen === next.onImageOpen
  && prev.onSaveMedia === next.onSaveMedia
  && prev.sectionOrder === next.sectionOrder
  && prev.isDetail === next.isDetail
));
