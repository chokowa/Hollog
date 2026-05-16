"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Camera, ImagePlus, Link2, Tags, X, Clipboard, ExternalLink, GripVertical, Loader2 } from "lucide-react";
import { fetchOgpPreview } from "@/lib/ogp-preview";
import { moveMediaOrderItem, normalizeImageBlobIds, normalizeMediaOrder } from "@/lib/post-media";
import {
  getSystemTagsForUrl,
  readSystemTaggingEnabled,
} from "@/lib/tag-suggestions";
import { TagInput, type TagInputHandle } from "@/components/ui/tag-input";
import type { OgpPreview, PostMediaOrderItem, PostMediaRef, PostType } from "@/types/post";

export type InlineImageSource = "picker" | "camera" | "clipboard";

export type PostFormValue = {
  type: PostType;
  body: string;
  url: string;
  ogp?: OgpPreview;
  tagsText: string;
  imageBlobs?: Blob[];
  imageBlobIds?: string[];
  mediaRefs?: PostMediaRef[];
  mediaOrder?: PostMediaOrderItem[];
  thumbnailBlobs?: Blob[];
};

type PostComposerProps = {
  title: string;
  submitLabel: string;
  value: PostFormValue;
  imagePreviewUrls?: string[];
  mediaPreviewUrls?: string[];
  imageError?: string;
  pending?: boolean;
  compact?: boolean;
  autoTagUrls?: boolean;
  onCancel?: () => void;
  onChange: (nextValue: PostFormValue) => void;
  onImagesSelect: (files: File[], source?: InlineImageSource) => void;
  onNativeImagesSelect?: () => void;
  onNativeClipboardImagesSelect?: () => void;
  onSubmit: (pendingTag?: string) => void;
};

export function PostComposer({
  title,
  submitLabel,
  value,
  imagePreviewUrls,
  mediaPreviewUrls,
  imageError,
  pending = false,
  compact = false,
  autoTagUrls = true,
  onCancel,
  onChange,
  onImagesSelect,
  onNativeImagesSelect,
  onNativeClipboardImagesSelect,
  onSubmit,
}: PostComposerProps) {
  const [isBodyFocused, setIsBodyFocused] = useState(false);
  const [removedAutoTags, setRemovedAutoTags] = useState<string[]>([]);
  const [ogp, setOgp] = useState<OgpPreview | null>(value.ogp ?? null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const [draggingMediaKey, setDraggingMediaKey] = useState<string | null>(null);
  const ogpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedUrl = useRef("");
  const latestValueRef = useRef(value);
  const latestOnChangeRef = useRef(onChange);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<TagInputHandle>(null);
  const imageCount = (value.imageBlobs || []).length + (value.mediaRefs || []).length;
  const previewImageList = useMemo(() => imagePreviewUrls ?? [], [imagePreviewUrls]);
  const previewMediaList = useMemo(() => mediaPreviewUrls ?? [], [mediaPreviewUrls]);
  const normalizedImageBlobIds = useMemo(
    () => normalizeImageBlobIds(value.imageBlobs, value.imageBlobIds) ?? [],
    [value.imageBlobIds, value.imageBlobs],
  );
  const normalizedMediaOrder = useMemo(
    () => normalizeMediaOrder({
      imageBlobs: value.imageBlobs,
      imageBlobIds: normalizedImageBlobIds,
      mediaRefs: value.mediaRefs,
      mediaOrder: value.mediaOrder,
    }) ?? [],
    [normalizedImageBlobIds, value.imageBlobs, value.mediaOrder, value.mediaRefs],
  );

  useEffect(() => {
    latestValueRef.current = value;
    latestOnChangeRef.current = onChange;
  }, [value, onChange]);

  // URLが変わったらOGPを自動取得
  const fetchOgp = useCallback(async (url: string) => {
    if (!url || lastFetchedUrl.current === url) return;
    try {
      new URL(url); // URL形式のバリデーション
    } catch {
      setOgp(null);
      return;
    }
    lastFetchedUrl.current = url;
    setOgpLoading(true);
    try {
      const data = await fetchOgpPreview(url);
      setOgp(data);
      latestOnChangeRef.current({ ...latestValueRef.current, ogp: data ?? undefined });
    } catch {
      setOgp(null);
      latestOnChangeRef.current({ ...latestValueRef.current, ogp: undefined });
    } finally {
      setOgpLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ogpTimerRef.current) clearTimeout(ogpTimerRef.current);
    if (!value.url.trim()) {
      const syncTimer = setTimeout(() => {
        setOgp(null);
        if (value.ogp) latestOnChangeRef.current({ ...latestValueRef.current, ogp: undefined });
        lastFetchedUrl.current = "";
      }, 0);
      return () => clearTimeout(syncTimer);
    }
    if (value.ogp && lastFetchedUrl.current !== value.url.trim()) {
      const syncTimer = setTimeout(() => {
        setOgp(value.ogp ?? null);
        lastFetchedUrl.current = value.url.trim();
      }, 0);
      return () => clearTimeout(syncTimer);
    }
    ogpTimerRef.current = setTimeout(() => {
      fetchOgp(value.url.trim());
    }, 800);
    return () => {
      if (ogpTimerRef.current) clearTimeout(ogpTimerRef.current);
    };
  }, [value.url, value.ogp, fetchOgp]);

  const currentTags = value.tagsText.split(",").map(t => t.trim()).filter(Boolean);
  const bodyCharacterCount = value.body.length;
  const canSubmit = !pending && (Boolean(value.body.trim()) || imageCount > 0 || Boolean(value.url.trim()));
  const orderedPreviewItems = useMemo(() => {
    const imageUrlMap = new Map(normalizedImageBlobIds.map((id, index) => [
      id,
      { source: "imageBlob" as const, id, url: previewImageList[index], index },
    ]));
    const mediaUrlMap = new Map((value.mediaRefs ?? []).map((mediaRef, index) => [
      mediaRef.id,
      { source: "mediaRef" as const, id: mediaRef.id, url: previewMediaList[index], index },
    ]));

    return normalizedMediaOrder.flatMap((item) => {
      const resolvedItem = item.source === "imageBlob"
        ? imageUrlMap.get(item.id)
        : mediaUrlMap.get(item.id);
      return resolvedItem?.url ? [resolvedItem] : [];
    });
  }, [normalizedImageBlobIds, normalizedMediaOrder, previewImageList, previewMediaList, value.mediaRefs]);

  useEffect(() => {
    if (!autoTagUrls || !readSystemTaggingEnabled()) return;

    const autoTags = getSystemTagsForUrl(value.url).filter((tag) => !removedAutoTags.includes(tag));
    const nextTags = [...currentTags];
    autoTags.forEach((tag) => {
      if (!nextTags.includes(tag)) nextTags.push(tag);
    });

    if (nextTags.length !== currentTags.length) {
      onChange({ ...value, tagsText: nextTags.join(", ") });
    }
  }, [autoTagUrls, currentTags, onChange, removedAutoTags, value]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      // 画像がペーストされた場合はテキストとしてのデフォルトペーストをキャンセル
      e.preventDefault();
      onImagesSelect(files, "clipboard");
    }
  };

  const handleClipboardRead = async () => {
    if (onNativeClipboardImagesSelect) {
      onNativeClipboardImagesSelect();
      return;
    }

    if (!navigator.clipboard || !navigator.clipboard.read) {
      alert("この環境ではクリップボードの画像を読み取れません。画像ボタンから選択してください。");
      return;
    }
    try {
      const clipboardItems = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of clipboardItems) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));
        for (const type of imageTypes) {
          const blob = await item.getType(type);
          files.push(new File([blob], "pasted-image.png", { type }));
        }
      }
      if (files.length > 0) {
        onImagesSelect(files, "clipboard");
      } else {
        alert("クリップボードに画像が見つかりませんでした。");
      }
    } catch (err) {
      console.error(err);
      alert("クリップボードから画像を読み取れませんでした。画像ボタンから選択してください。");
    }
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>, source: InlineImageSource) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onImagesSelect(files, source);
    e.target.value = "";
  };

  const removePreviewItem = (item: { source: "imageBlob" | "mediaRef"; id: string; index: number }) => {
    if (item.source === "imageBlob") {
      const nextImageBlobs = [...(value.imageBlobs || [])];
      nextImageBlobs.splice(item.index, 1);
      const nextImageBlobIds = [...normalizedImageBlobIds];
      nextImageBlobIds.splice(item.index, 1);
      onChange({
        ...value,
        imageBlobs: nextImageBlobs,
        imageBlobIds: nextImageBlobIds,
        mediaOrder: normalizeMediaOrder({
          imageBlobs: nextImageBlobs,
          imageBlobIds: nextImageBlobIds,
          mediaRefs: value.mediaRefs,
          mediaOrder: normalizedMediaOrder.filter((orderItem) => !(orderItem.source === "imageBlob" && orderItem.id === item.id)),
        }),
      });
      return;
    }

    const nextMediaRefs = [...(value.mediaRefs || [])];
    nextMediaRefs.splice(item.index, 1);
    onChange({
      ...value,
      mediaRefs: nextMediaRefs,
      mediaOrder: normalizeMediaOrder({
        imageBlobs: value.imageBlobs,
        imageBlobIds: normalizedImageBlobIds,
        mediaRefs: nextMediaRefs,
        mediaOrder: normalizedMediaOrder.filter((orderItem) => !(orderItem.source === "mediaRef" && orderItem.id === item.id)),
      }),
      thumbnailBlobs: undefined,
    });
  };

  const reorderPreviewItems = (draggedKey: string, targetKey: string) => {
    const nextOrder = moveMediaOrderItem(normalizedMediaOrder, draggedKey, targetKey);
    if (nextOrder === normalizedMediaOrder) {
      return;
    }
    onChange({
      ...value,
      imageBlobIds: normalizedImageBlobIds,
      mediaOrder: nextOrder,
    });
  };

  return (
    <div
      className={compact ? "" : "bg-card px-4 pb-5 pt-4 sm:px-5 sm:pb-6"}
      onPaste={handlePaste}
    >
      <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-5 flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:-mx-5 sm:-mt-4 sm:px-5">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
          aria-label="閉じる"
        >
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <p className="truncate text-base font-medium text-foreground">{title}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => {
              const pendingTag = tagInputRef.current?.getPendingTag() ?? "";
              if (pendingTag) {
                onSubmit(pendingTag);
                return;
              }
              onSubmit();
            }}
            disabled={!canSubmit}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {pending ? "保存中..." : submitLabel}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className={`rounded-[22px] border bg-card p-4 shadow-sm transition-all ${
            isBodyFocused
              ? "border-primary/40 shadow-[0_0_0_3px_rgba(255,255,255,0.05)]"
              : "border-border"
          }`}>
            {orderedPreviewItems.length > 0 ? (
              <div className="mb-4 grid grid-cols-2 gap-2">
                {orderedPreviewItems.map((item, previewIndex) => {
                  const dragKey = `${item.source}:${item.id}`;
                  return (
                    <div
                      key={dragKey}
                      draggable
                      onDragStart={() => setDraggingMediaKey(dragKey)}
                      onDragEnd={() => setDraggingMediaKey(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (!draggingMediaKey) return;
                        reorderPreviewItems(draggingMediaKey, dragKey);
                        setDraggingMediaKey(null);
                      }}
                      className={`relative aspect-square overflow-hidden rounded-xl border border-border bg-black/5 ${draggingMediaKey === dragKey ? "opacity-70" : ""}`}
                    >
                    <img src={item.url} alt={`プレビュー画像 ${previewIndex + 1}`} className="h-full w-full object-cover" />
                    <div className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/85 shadow-sm">
                      <GripVertical size={15} />
                    </div>
                    <button
                      type="button"
                      onClick={() => removePreviewItem(item)}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 shadow-md transition-colors hover:bg-black/80"
                      aria-label="画像を削除"
                    >
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                  );
                })}
              </div>
            ) : null}
            <textarea
              value={value.body}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
              onFocus={() => setIsBodyFocused(true)}
              onBlur={() => setIsBodyFocused(false)}
              rows={previewMediaList.length || previewImageList.length ? 5 : 7}
              placeholder="メモを追加"
              className="w-full resize-none bg-transparent text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground/50"
            />
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Tags size={14} />
                  <span>タグ</span>
                </div>
                <TagInput
                  ref={tagInputRef}
                  tags={currentTags}
                  onChange={(nextTags) => {
                    const autoUrlTags = getSystemTagsForUrl(value.url);
                    const removedAutoUrlTags = currentTags.filter((tag) => !nextTags.includes(tag) && autoUrlTags.includes(tag));
                    setRemovedAutoTags((current) => {
                      const preserved = current.filter((tag) => nextTags.includes(tag) || !autoUrlTags.includes(tag));
                      return [...new Set([...preserved, ...removedAutoUrlTags])];
                    });
                    onChange({ ...value, tagsText: nextTags.join(", ") });
                  }}
                  variant="composer"
                  autoFocusOnContainerClick
                />
              </div>

            <div className="flex items-end justify-between gap-3">
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => handleImageInputChange(event, "picker")}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => handleImageInputChange(event, "camera")}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (onNativeImagesSelect) {
                      onNativeImagesSelect();
                      return;
                    }
                    imageInputRef.current?.click();
                  }}
                  disabled={imageCount >= 4}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                  title="画像を追加"
                  aria-label="画像を追加"
                >
                  <ImagePlus size={20} />
                  <span className="text-[11px] font-medium">画像</span>
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={imageCount >= 4}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                  title="カメラで撮影"
                  aria-label="カメラで撮影"
                >
                  <Camera size={20} />
                  <span className="text-[11px] font-medium">カメラ</span>
                </button>
                <button
                  type="button"
                  onClick={handleClipboardRead}
                  disabled={imageCount >= 4}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-border bg-card px-2 text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                  title="コピーした画像を貼り付け"
                  aria-label="コピーした画像を貼り付け"
                >
                  <Clipboard size={20} />
                  <span className="text-[11px] font-medium">貼り付け</span>
                </button>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>{bodyCharacterCount}文字</div>
                <div>{imageCount}/4枚</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[22px] border border-border bg-card p-4 shadow-sm">
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">リンク</p>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-muted/20 px-3 py-2.5 shadow-sm transition-colors focus-within:border-muted-foreground">
              <Link2 size={16} className="text-muted-foreground" />
              <input
                value={value.url}
                onChange={(e) => onChange({ ...value, url: e.target.value })}
                placeholder="https://..."
                className="w-full bg-transparent text-sm outline-none"
              />
              {ogpLoading && <Loader2 size={16} className="animate-spin text-muted-foreground shrink-0" />}
            </div>

            {/* OGPプレビュー */}
            {ogp && (ogp.title || ogp.image) && (
              <button
                type="button"
                onClick={() => window.open(value.url, "_blank", "noopener,noreferrer")}
                className="mt-2 w-full rounded-xl border border-border bg-muted/30 overflow-hidden shadow-sm transition-colors hover:bg-muted/50 text-left"
              >
                {ogp.image && (
                  <div className="aspect-video w-full overflow-hidden bg-black/5">
                    <img src={ogp.image} alt="" className="w-full h-full object-cover" />
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
                  <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                    <ExternalLink size={12} />
                    <span>サイトを開く</span>
                  </div>
                </div>
              </button>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">保存する種類</p>
            <div className="relative grid grid-cols-2 rounded-full border border-border bg-muted p-1 shadow-inner">
              <div
                className={`absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-card shadow-sm transition-transform duration-200 ${
                  value.type === "clip" ? "translate-x-full" : "translate-x-0"
                }`}
              />
              {([
                { value: "post" as PostType, label: "ポスト" },
                { value: "clip" as PostType, label: "クリップ" },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange({ ...value, type: option.value })}
                  className={`relative z-10 rounded-full px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
                    value.type === option.value
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {imageError && (
          <p className="text-sm text-destructive">{imageError}</p>
        )}
      </div>
    </div>
  );
}
