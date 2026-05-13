"use client";

import { Clipboard, ExternalLink, ImagePlus, Link2, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createThumbnailBlobs } from "@/lib/image-thumbnails";
import { fetchOgpPreview } from "@/lib/ogp-preview";
import {
  getSystemTagsForUrl,
  readSystemTaggingEnabled,
} from "@/lib/tag-suggestions";
import { TagInput, type TagInputHandle } from "@/components/ui/tag-input";
import type { OgpPreview, PostMediaRef, PostType } from "@/types/post";

type ShareImportProps = {
  onBack: () => void;
  onImport: (postData: {
    body: string;
    url: string;
    tags: string[];
    type: PostType;
    ogp?: OgpPreview;
    imageBlobs?: Blob[];
    mediaRefs?: PostMediaRef[];
    thumbnailBlobs?: Blob[];
  }) => void | Promise<void>;
  isBusy?: boolean;
  initialUrl?: string;
  initialMemo?: string;
  initialImagePreviews?: SharedImagePreview[];
  initialImageBlobs?: Blob[];
  additionalMediaRefs?: PostMediaRef[];
  additionalThumbnailBlobs?: Blob[];
  onNativeImagesSelect?: () => void;
  onNativeClipboardImagesSelect?: () => void;
  onAdditionalMediaRemove?: (mediaRefId: string) => void;
  initialOgp?: OgpPreview;
  onSaveError?: (message: string) => void;
};

type SharedImagePreview = {
  id: string;
  name: string;
  type: string;
  previewUrl: string;
  mediaRef?: PostMediaRef;
};

type SaveDestination = "clip" | "post";

function isAmazonUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "amazon.co.jp"
      || hostname.endsWith(".amazon.co.jp")
      || hostname === "amzn.to"
      || hostname === "amzn.asia";
  } catch {
    return false;
  }
}

function mergeIntentAndFetchedOgp(fetchedOgp: OgpPreview | null, intentOgp: OgpPreview | null, url: string) {
  if (!fetchedOgp) return intentOgp;
  if (!intentOgp) return fetchedOgp;

  const fetchedTitle = fetchedOgp.title?.trim() ?? "";
  const intentTitle = intentOgp.title?.trim() ?? "";
  const fetchedSiteName = fetchedOgp.siteName?.trim() ?? "";
  const fetchedTitleLooksGeneric = Boolean(
    intentTitle
    && fetchedTitle
    && fetchedSiteName
    && fetchedTitle.toLowerCase() === fetchedSiteName.toLowerCase(),
  );

  return {
    ...fetchedOgp,
    title: fetchedTitleLooksGeneric ? intentOgp.title : fetchedOgp.title || intentOgp.title,
    description: fetchedOgp.description || intentOgp.description,
    image: isAmazonUrl(url) ? fetchedOgp.image || intentOgp.image : intentOgp.image || fetchedOgp.image,
    siteName: fetchedOgp.siteName || intentOgp.siteName,
  };
}

export function ShareImport({
  onBack,
  onImport,
  isBusy,
  initialUrl = "",
  initialMemo = "",
  initialImagePreviews = [],
  initialImageBlobs = [],
  additionalMediaRefs = [],
  additionalThumbnailBlobs,
  onNativeImagesSelect,
  onNativeClipboardImagesSelect,
  onAdditionalMediaRemove,
  initialOgp,
  onSaveError,
}: ShareImportProps) {
  const initialTags = readSystemTaggingEnabled() ? getSystemTagsForUrl(initialUrl) : [];
  const [url, setUrl] = useState(initialUrl);
  const [memo, setMemo] = useState(initialMemo);
  const [sharedImagePreviews, setSharedImagePreviews] = useState(initialImagePreviews);
  const [imageBlobs, setImageBlobs] = useState(initialImageBlobs);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [removedAutoTags, setRemovedAutoTags] = useState<string[]>([]);
  const [saveDestination, setSaveDestination] = useState<SaveDestination>("clip");
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [ogp, setOgp] = useState<OgpPreview | null>(initialOgp ?? null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [brokenPreviewIds, setBrokenPreviewIds] = useState<Set<string>>(() => new Set());
  const ogpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedUrl = useRef("");
  const tagInputRef = useRef<TagInputHandle>(null);
  const blobPreviewItems = useMemo(
    () => imageBlobs.map((blob, index) => ({
      kind: "blob" as const,
      id: `blob-${index}-${blob.size}-${blob.type}`,
      previewUrl: URL.createObjectURL(blob),
      index,
    })),
    [imageBlobs],
  );
  const imagePreviewItems = [
    ...sharedImagePreviews.map((image) => ({
      kind: "shared" as const,
      id: image.id,
      previewUrl: image.previewUrl,
    })),
    ...blobPreviewItems,
    ...additionalMediaRefs.map((mediaRef) => ({
      kind: "additional" as const,
      id: mediaRef.id,
      previewUrl: Capacitor.convertFileSrc(mediaRef.uri),
    })),
  ];
  const hasImages = sharedImagePreviews.length > 0 || imageBlobs.length > 0 || additionalMediaRefs.length > 0;
  const isSaving = Boolean(isBusy || isPreparingImages);

  const fetchOgp = useCallback(async (targetUrl: string) => {
    if (!targetUrl || lastFetchedUrl.current === targetUrl) return;
    const fallbackOgp = targetUrl.trim() === initialUrl.trim() ? initialOgp ?? null : null;
    try {
      new URL(targetUrl);
    } catch {
      setOgp(fallbackOgp);
      lastFetchedUrl.current = "";
      return;
    }

    lastFetchedUrl.current = targetUrl;
    setOgpLoading(true);
    try {
      setOgp(mergeIntentAndFetchedOgp(await fetchOgpPreview(targetUrl), fallbackOgp, targetUrl));
    } catch {
      setOgp(fallbackOgp);
    } finally {
      setOgpLoading(false);
    }
  }, [initialOgp, initialUrl]);

  useEffect(() => {
    if (ogpTimerRef.current) clearTimeout(ogpTimerRef.current);
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      const syncTimer = setTimeout(() => {
        setOgp(null);
        lastFetchedUrl.current = "";
      }, 0);
      return () => clearTimeout(syncTimer);
    }

    ogpTimerRef.current = setTimeout(() => {
      fetchOgp(trimmedUrl);
    }, 800);
    return () => {
      if (ogpTimerRef.current) clearTimeout(ogpTimerRef.current);
    };
  }, [fetchOgp, url]);

  useEffect(() => {
    return () => blobPreviewItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, [blobPreviewItems]);

  const applyUrl = (nextUrl: string) => {
    setUrl(nextUrl);
    if (!readSystemTaggingEnabled()) return;

    const autoTags = getSystemTagsForUrl(nextUrl).filter((tag) => !removedAutoTags.includes(tag));
    setTags((current) => {
      const nextTags = [...current];
      autoTags.forEach((tag) => {
        if (!nextTags.includes(tag)) nextTags.push(tag);
      });
      return nextTags.length === current.length ? current : nextTags;
    });
  };

  const handleSave = async () => {
    const pendingTag = tagInputRef.current?.getPendingTag() ?? "";
    const nextTags = pendingTag ? [...tags, pendingTag] : tags;
    setIsPreparingImages(true);
    try {
      let preparedImageBlobs = imageBlobs;
      let preparedThumbnailBlobs: Blob[] | undefined;
      const mediaRefs = [
        ...sharedImagePreviews
          .map((image) => image.mediaRef)
          .filter((mediaRef): mediaRef is PostMediaRef => Boolean(mediaRef)),
        ...additionalMediaRefs,
      ];

      if (sharedImagePreviews.length > 0) {
        const readableSharedImages = await Promise.allSettled(
          sharedImagePreviews.map(async (image) => {
            const response = await fetch(image.previewUrl);
            if (!response.ok) throw new Error("Unable to read shared image");
            const blob = await response.blob();
            return new File([blob], image.name, { type: blob.type || image.type });
          }),
        );
        const inlineImageBlobs = readableSharedImages.flatMap((result, index) => {
          if (sharedImagePreviews[index].mediaRef) return [];
          if (result.status === "rejected") throw result.reason;
          return [result.value];
        });
        preparedImageBlobs = [...imageBlobs, ...inlineImageBlobs];
        if (mediaRefs.length > 0) {
          const thumbnailSourceBlobs = readableSharedImages.flatMap((result, index) => (
            sharedImagePreviews[index].mediaRef && result.status === "fulfilled" ? [result.value] : []
          ));
          preparedThumbnailBlobs = thumbnailSourceBlobs.length > 0
            ? await createThumbnailBlobs(thumbnailSourceBlobs)
            : undefined;
        }
      }

      preparedThumbnailBlobs = [
        ...(preparedThumbnailBlobs ?? []),
        ...(additionalThumbnailBlobs ?? []),
      ];
      if (preparedThumbnailBlobs.length === 0) {
        preparedThumbnailBlobs = undefined;
      }

      const fullBody = memo.trim()
        ? memo.trim()
        : url.trim()
          ? "共有されたリンク"
          : preparedImageBlobs.length > 0 || mediaRefs.length > 0
            ? "共有された画像"
            : "共有されたテキスト";
      await onImport({
        body: fullBody,
        url: url.trim(),
        tags: nextTags,
        type: saveDestination,
        ogp: url.trim() ? ogp ?? undefined : undefined,
        imageBlobs: preparedImageBlobs,
        mediaRefs,
        thumbnailBlobs: preparedThumbnailBlobs,
      });
    } catch {
      onSaveError?.("保存できませんでした。");
      return;
    } finally {
      setIsPreparingImages(false);
    }
  };

  return (
    <div className="min-h-screen bg-secondary px-2 pt-3">
      <div className="mx-auto min-h-screen max-w-md overflow-hidden rounded-t-[28px] border border-border/70 bg-card shadow-2xl">
      <div className="flex justify-center border-b border-border/70 bg-card pt-2">
        <div className="mb-2 h-1 w-11 rounded-full bg-muted-foreground/35" aria-hidden="true" />
      </div>
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
            aria-label="閉じる"
          >
            <X size={20} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-base font-medium text-foreground">
            外部から保存
          </h1>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || (!url.trim() && !memo.trim() && !hasImages)}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5">
        <section className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
          <label className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Link2 size={15} />
            URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(event) => applyUrl(event.target.value)}
            placeholder="https://example.com/..."
            className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {ogpLoading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              リンクのプレビューを取得中...
            </div>
          )}
          {ogp && (ogp.title || ogp.image) && (
            <button
              type="button"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              className="mt-3 w-full overflow-hidden rounded-[20px] border border-border bg-muted/30 text-left shadow-sm transition-colors hover:bg-muted/50"
            >
              {ogp.image && (
                <div className="aspect-video w-full overflow-hidden bg-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ogp.image} alt="" className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-3">
                {ogp.siteName && (
                  <p className="mb-1 text-xs text-muted-foreground">{ogp.siteName}</p>
                )}
                {ogp.title && (
                  <p className="line-clamp-2 text-sm font-medium text-foreground">{ogp.title}</p>
                )}
                {ogp.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ogp.description}</p>
                )}
                <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                  <ExternalLink size={12} />
                  <span>サイトを開く</span>
                </div>
              </div>
            </button>
          )}
        </section>

        <section className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
          {imagePreviewItems.length > 0 && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {imagePreviewItems.map((item) => (
                <div key={item.id} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-black/5">
                  {brokenPreviewIds.has(item.id) ? (
                    <div className="flex h-full w-full items-center justify-center bg-muted px-3 text-center text-xs text-muted-foreground">
                      元ファイルを読み込めません
                    </div>
                  ) : (
                    <>
                      {/* Shared images are local object URLs and need native img behavior. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => {
                          setBrokenPreviewIds((current) => {
                            if (current.has(item.id)) return current;
                            const next = new Set(current);
                            next.add(item.id);
                            return next;
                          });
                        }}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (item.kind === "shared") {
                        setSharedImagePreviews((current) => current.filter((image) => image.id !== item.id));
                        return;
                      }
                      if (item.kind === "additional") {
                        onAdditionalMediaRemove?.(item.id);
                        return;
                      }
                      setImageBlobs((current) => current.filter((_, currentIndex) => currentIndex !== item.index));
                    }}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80"
                    aria-label="画像を削除"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="メモを追加"
            className="min-h-[6.5rem] w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
            rows={4}
          />
          {(onNativeImagesSelect || onNativeClipboardImagesSelect) && (
            <div className="mt-3 flex items-end justify-between gap-3 border-t border-border pt-3">
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                {onNativeImagesSelect && (
                  <button
                    type="button"
                    onClick={onNativeImagesSelect}
                    disabled={imagePreviewItems.length >= 4}
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                    title="画像を追加"
                    aria-label="画像を追加"
                  >
                    <ImagePlus size={18} />
                    <span className="text-[11px] font-medium">画像</span>
                  </button>
                )}
                {onNativeClipboardImagesSelect && (
                  <button
                    type="button"
                    onClick={onNativeClipboardImagesSelect}
                    disabled={imagePreviewItems.length >= 4}
                    className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                    title="コピーした画像を貼り付け"
                    aria-label="コピーした画像を貼り付け"
                  >
                    <Clipboard size={18} />
                    <span className="text-[11px] font-medium">貼付</span>
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{imagePreviewItems.length}/4</span>
            </div>
          )}
        </section>

        <TagInput
          ref={tagInputRef}
          tags={tags}
          onChange={(nextTags) => {
            const autoUrlTags = getSystemTagsForUrl(url);
            const removedAutoUrlTags = tags.filter((tag) => !nextTags.includes(tag) && autoUrlTags.includes(tag));
            setRemovedAutoTags((current) => {
              const preserved = current.filter((tag) => nextTags.includes(tag) || !autoUrlTags.includes(tag));
              return [...new Set([...preserved, ...removedAutoUrlTags])];
            });
            setTags(nextTags);
          }}
          variant="shareImport"
          maxSuggestions={6}
        />

        <section className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
          <p className="mb-2 text-xs font-medium text-muted-foreground">保存先</p>
          <div className="relative grid grid-cols-2 rounded-full border border-border bg-muted p-1 shadow-inner">
            <div
              className={`absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm transition-transform duration-200 ${
                saveDestination === "clip" ? "translate-x-full" : "translate-x-0"
              }`}
            />
          {([
            { value: "post" as const, label: "ポスト" },
            { value: "clip" as const, label: "クリップ" },
          ]).map((option) => {
            const selected = saveDestination === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSaveDestination(option.value)}
                className={`relative z-10 rounded-full px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                  selected
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            );
          })}
          </div>
        </section>
      </div>
      </div>
    </div>
  );
}
