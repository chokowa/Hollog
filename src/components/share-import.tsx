"use client";

import { ChevronDown, Clipboard, ExternalLink, ImagePlus, Link2, Loader2, Tags, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createThumbnailBlobs } from "@/lib/image-thumbnails";
import { fetchOgpPreview } from "@/lib/ogp-preview";
import {
  getSystemTagsForUrl,
  getVisibleTagSuggestions,
  readSystemTaggingEnabled,
  readTagSuggestionCatalog,
  writeTagSuggestionCatalog,
} from "@/lib/tag-suggestions";
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
  }) => void;
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
};

type SharedImagePreview = {
  id: string;
  name: string;
  type: string;
  previewUrl: string;
  mediaRef?: PostMediaRef;
};

type SaveDestination = "clip" | "post";

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
}: ShareImportProps) {
  const initialTags = readSystemTaggingEnabled() ? getSystemTagsForUrl(initialUrl) : [];
  const [url, setUrl] = useState(initialUrl);
  const [memo, setMemo] = useState(initialMemo);
  const [sharedImagePreviews, setSharedImagePreviews] = useState(initialImagePreviews);
  const [imageBlobs, setImageBlobs] = useState(initialImageBlobs);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState(readTagSuggestionCatalog);
  const [removedAutoTags, setRemovedAutoTags] = useState<string[]>([]);
  const [saveDestination, setSaveDestination] = useState<SaveDestination>("clip");
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [ogp, setOgp] = useState<OgpPreview | null>(null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [brokenPreviewIds, setBrokenPreviewIds] = useState<Set<string>>(() => new Set());
  const ogpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedUrl = useRef("");

  const filteredSuggestions = getVisibleTagSuggestions(tagSuggestions, tagInput, tags).slice(0, 6);
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
    try {
      new URL(targetUrl);
    } catch {
      setOgp(null);
      lastFetchedUrl.current = "";
      return;
    }

    lastFetchedUrl.current = targetUrl;
    setOgpLoading(true);
    try {
      setOgp(await fetchOgpPreview(targetUrl));
    } catch {
      setOgp(null);
    } finally {
      setOgpLoading(false);
    }
  }, []);

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

  const addTag = (value: string) => {
    const tag = value.trim().replace(/^#/, "");
    if (!tag || tags.includes(tag)) {
      setTagInput("");
      return;
    }

    if (!tagSuggestions.some((suggestion) => suggestion.name === tag)) {
      setTagSuggestions(writeTagSuggestionCatalog([...tagSuggestions, { name: tag, isSystem: false }]));
    }

    setTags((current) => [...current, tag]);
    setTagInput("");
    setShowSuggest(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (getSystemTagsForUrl(url).includes(tagToRemove)) {
      setRemovedAutoTags((current) => current.includes(tagToRemove) ? current : [...current, tagToRemove]);
    }
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = async () => {
    setIsPreparingImages(true);
    let preparedImageBlobs = imageBlobs;
    let preparedThumbnailBlobs: Blob[] | undefined;
    const mediaRefs = [
      ...sharedImagePreviews
        .map((image) => image.mediaRef)
        .filter((mediaRef): mediaRef is PostMediaRef => Boolean(mediaRef)),
      ...additionalMediaRefs,
    ];
    try {
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
    } catch {
      setIsPreparingImages(false);
      return;
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
    onImport({
      body: fullBody,
      url: url.trim(),
      tags,
      type: saveDestination,
      ogp: url.trim() ? ogp ?? undefined : undefined,
      imageBlobs: preparedImageBlobs,
      mediaRefs,
      thumbnailBlobs: preparedThumbnailBlobs,
    });
    setIsPreparingImages(false);
  };

  return (
    <div className="min-h-screen bg-secondary">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3 shadow-sm">
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
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {isSaving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      <div className="space-y-4 px-4 py-5">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
              className="mt-3 w-full overflow-hidden rounded-xl border border-border bg-muted/30 text-left shadow-sm transition-colors hover:bg-muted/50"
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

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-1">
                {onNativeImagesSelect && (
                  <button
                    type="button"
                    onClick={onNativeImagesSelect}
                    disabled={imagePreviewItems.length >= 4}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                    title="画像を追加"
                    aria-label="画像を追加"
                  >
                    <ImagePlus size={18} />
                  </button>
                )}
                {onNativeClipboardImagesSelect && (
                  <button
                    type="button"
                    onClick={onNativeClipboardImagesSelect}
                    disabled={imagePreviewItems.length >= 4}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                    title="コピーした画像を貼り付け"
                    aria-label="コピーした画像を貼り付け"
                  >
                    <Clipboard size={18} />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{imagePreviewItems.length}/4</span>
            </div>
          )}
        </section>

        <section className="relative rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-muted-foreground">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tags size={16} className="shrink-0 text-muted-foreground" />
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(event) => {
                setTagInput(event.target.value);
                setShowSuggest(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTag(tagInput);
                }
                if (event.key === "Backspace" && !tagInput && tags.length > 0) {
                  handleRemoveTag(tags[tags.length - 1]);
                }
              }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
              placeholder={tags.length === 0 ? "タグを入力..." : "さらに追加..."}
              className="min-w-[96px] flex-1 bg-transparent text-sm outline-none"
            />
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setShowSuggest(!showSuggest);
              }}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted"
            >
              <ChevronDown size={16} className={showSuggest ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
          </div>

          {showSuggest && (tagInput.trim() || filteredSuggestions.length > 0) && (
            <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg screen-scroll">
              {tagInput.trim() && !tags.includes(tagInput.trim()) && !tagSuggestions.some((tag) => tag.name === tagInput.trim()) && (
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    addTag(tagInput);
                  }}
                  className="mb-2 flex w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <span className="flex items-center justify-center rounded-full bg-primary/20 p-1">
                    <Tags size={12} />
                  </span>
                  「{tagInput}」を新規追加
                </button>
              )}
              {filteredSuggestions.length > 0 && (
                <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">候補から選ぶ</div>
              )}
              <div className="flex flex-wrap gap-2">
                {filteredSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      addTag(tag);
                    }}
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
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
  );
}
