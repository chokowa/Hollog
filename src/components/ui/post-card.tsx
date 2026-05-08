"use client";

/* eslint-disable @next/next/no-img-element */
import { memo, useState, useEffect, useRef } from "react";
import { Copy, Edit3, Link as LinkIcon, Share, ExternalLink, Loader2, ArrowRightLeft } from "lucide-react";
import { ImageViewer } from "@/components/ui/image-viewer";
import type { OgpPreview, Post, PostType } from "@/types/post";

type PostCardProps = {
  post: Post;
  imageUrls?: string[];
  onClick?: () => void;
  onTagClick?: (tag: string) => void;
  onTypeChange?: (nextType: PostType) => void;
  onOgpFetched?: (ogp: OgpPreview) => void;
  isDetail?: boolean;
};

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
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

function PostCardComponent({ post, imageUrls, onClick, onTagClick, onTypeChange, onOgpFetched, isDetail = false }: PostCardProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerOriginRect, setViewerOriginRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [fetchedOgp, setFetchedOgp] = useState<OgpPreview | null>(null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [shouldFetchOgp, setShouldFetchOgp] = useState(isDetail);
  const articleRef = useRef<HTMLElement>(null);
  const fetchedRef = useRef(false);
  const ogp = post.ogp ?? fetchedOgp;

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
        const res = await fetch(`/api/ogp?url=${encodeURIComponent(post.url!)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.title || data.image) {
            setFetchedOgp(data);
            onOgpFetched?.(data);
          }
        }
      } catch {}
      setOgpLoading(false);
    })();
  }, [post.ogp, post.url, onOgpFetched, shouldFetchOgp]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(post.body);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = encodeURIComponent(post.body);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank");
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>, index: number) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setViewerOriginRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    setViewerIndex(index);
  };

  const movableType = post.type === "post" ? "clip" : post.type === "clip" ? "post" : null;
  const moveLabel = movableType === "clip" ? "クリップに移動" : movableType === "post" ? "ポストに移動" : "";

  const renderImages = () => {
    if (!imageUrls || imageUrls.length === 0) return null;

    if (isDetail) {
      return (
        <div className="mb-4 flex flex-col gap-3">
          {imageUrls.map((url, i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-border bg-black/5">
              <img
                src={url}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-auto object-contain cursor-pointer"
                onClick={(e) => handleImageClick(e, i)}
              />
            </div>
          ))}
        </div>
      );
    }

    const count = imageUrls.length;
    if (count === 1) {
      return (
        <div className="mb-4 overflow-hidden rounded-lg border border-border bg-black/5 max-h-[400px]">
          <img
            src={imageUrls[0]}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain cursor-pointer transition-opacity hover:opacity-90"
            onClick={(e) => handleImageClick(e, 0)}
          />
        </div>
      );
    }

    if (count === 2) {
      return (
        <div className="mb-4 grid aspect-[3/2] grid-cols-2 gap-1 overflow-hidden rounded-lg border border-border">
          {imageUrls.map((url, i) => (
            <img key={i} src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, i)} />
          ))}
        </div>
      );
    }

    if (count === 3) {
      return (
        <div className="mb-4 grid aspect-[3/2] grid-cols-2 gap-1 overflow-hidden rounded-lg border border-border">
          <img src={imageUrls[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, 0)} />
          <div className="grid grid-rows-2 gap-1 h-full overflow-hidden">
            <img src={imageUrls[1]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, 1)} />
            <img src={imageUrls[2]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, 2)} />
          </div>
        </div>
      );
    }

    if (count >= 4) {
      return (
        <div className="mb-4 grid aspect-[3/2] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-lg border border-border">
          {imageUrls.slice(0, 4).map((url, i) => (
            <img key={i} src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover cursor-pointer transition-opacity hover:opacity-90" onClick={(e) => handleImageClick(e, i)} />
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
        className="post-card-surface cursor-pointer overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition hover:border-muted-foreground/30 hover:shadow-md active:scale-[0.997]"
      >
        {post.url && (
          <div className="mb-4">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(post.url, "_blank", "noopener,noreferrer");
              }}
              className="w-full rounded-lg border border-border bg-muted/50 p-3 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-start gap-2">
                <LinkIcon size={16} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-primary">{post.url}</div>
                </div>
                <ExternalLink size={14} className="flex-shrink-0 text-muted-foreground mt-0.5" />
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
                className="mt-2 w-full rounded-lg border border-border bg-muted/30 overflow-hidden shadow-sm transition-colors hover:bg-muted/50 text-left"
              >
                {ogp.image && (
                  <div className="aspect-video w-full overflow-hidden bg-black/5">
                    <img src={ogp.image} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-3">
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

        <p className="mb-4 whitespace-pre-wrap break-words leading-relaxed text-foreground">
          {renderBodyWithLinks(post.body)}
        </p>

        {post.tags && post.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {post.tags.map((tag, index) => (
              <button
                type="button"
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
                className="rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={`#${tag}で絞り込み`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <time className="text-sm text-muted-foreground">
            {formatTime(post.updatedAt)}
          </time>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
              title="コピー"
            >
              <Copy size={16} />
            </button>
            <button
              onClick={handleShare}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
              title="Xへ投稿"
            >
              <Share size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
              title="編集"
            >
              <Edit3 size={16} />
            </button>
            {movableType && onTypeChange && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTypeChange(movableType);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
                title={moveLabel}
                aria-label={moveLabel}
              >
                <ArrowRightLeft size={16} />
              </button>
            )}
          </div>
        </div>
      </article>

      {viewerIndex !== null && imageUrls && (
        <ImageViewer
          images={imageUrls}
          initialIndex={viewerIndex}
          originRect={viewerOriginRect}
          onClose={() => {
            setViewerIndex(null);
            setViewerOriginRect(null);
          }}
        />
      )}
    </>
  );
}

export const PostCard = memo(PostCardComponent, (prev, next) => (
  prev.post === next.post
  && prev.imageUrls === next.imageUrls
  && prev.isDetail === next.isDetail
));
