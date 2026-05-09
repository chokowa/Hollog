"use client";

import { Check, Images, Link2, Tags, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createThumbnailBlobs } from "@/lib/image-thumbnails";
import { readTagSuggestions, writeTagSuggestions } from "@/lib/tag-suggestions";
import type { PostMediaRef, PostType } from "@/types/post";

type ShareImportProps = {
  onBack: () => void;
  onImport: (postData: {
    body: string;
    url: string;
    tags: string[];
    type: PostType;
    imageBlobs?: Blob[];
    mediaRefs?: PostMediaRef[];
    thumbnailBlobs?: Blob[];
  }) => void;
  isBusy?: boolean;
  initialUrl?: string;
  initialMemo?: string;
  initialImagePreviews?: SharedImagePreview[];
  initialImageBlobs?: Blob[];
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
}: ShareImportProps) {
  const [url, setUrl] = useState(initialUrl);
  const [memo, setMemo] = useState(initialMemo);
  const [sharedImagePreviews, setSharedImagePreviews] = useState(initialImagePreviews);
  const [imageBlobs, setImageBlobs] = useState(initialImageBlobs);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>(readTagSuggestions);
  const [saveDestination, setSaveDestination] = useState<SaveDestination>("clip");
  const [isPreparingImages, setIsPreparingImages] = useState(false);
  const [brokenPreviewIds, setBrokenPreviewIds] = useState<Set<string>>(() => new Set());

  const filteredSuggestions = tagSuggestions
    .filter((tag) => tag.toLowerCase().includes(tagInput.trim().toLowerCase()))
    .filter((tag) => !tags.includes(tag))
    .slice(0, 6);
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
  ];
  const hasImages = sharedImagePreviews.length > 0 || imageBlobs.length > 0;
  const isSaving = Boolean(isBusy || isPreparingImages);

  useEffect(() => {
    return () => blobPreviewItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, [blobPreviewItems]);

  const addTag = (value: string) => {
    const tag = value.trim().replace(/^#/, "");
    if (!tag || tags.includes(tag)) {
      setTagInput("");
      return;
    }

    if (!tagSuggestions.includes(tag)) {
      setTagSuggestions(writeTagSuggestions([...tagSuggestions, tag]));
    }

    setTags((current) => [...current, tag]);
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  };

  const handleSave = async () => {
    setIsPreparingImages(true);
    let preparedImageBlobs = imageBlobs;
    let preparedThumbnailBlobs: Blob[] | undefined;
    const mediaRefs = sharedImagePreviews
      .map((image) => image.mediaRef)
      .filter((mediaRef): mediaRef is PostMediaRef => Boolean(mediaRef));
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
        {imagePreviewItems.length > 0 && (
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <label className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Images size={15} />
              画像
            </label>
            <div className="grid grid-cols-2 gap-2">
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
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <label className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Link2 size={15} />
            URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/..."
            className="w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="メモを追加"
            className="min-h-[6.5rem] w-full resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
            rows={4}
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <label className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Tags size={15} />
            タグ
          </label>
          {tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                >
                  #{tag}
                  <X size={13} />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2">
            <input
              type="text"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addTag(tagInput);
                }
                if (event.key === "Backspace" && !tagInput && tags.length > 0) {
                  handleRemoveTag(tags[tags.length - 1]);
                }
              }}
              placeholder="タグを入力"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              disabled={!tagInput.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
              aria-label="タグを追加"
            >
              <Check size={16} />
            </button>
          </div>
          {filteredSuggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {filteredSuggestions.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addTag(tag)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-2 shadow-sm">
          {([
            { value: "clip" as const, label: "クリップ", description: "後で読むURLや情報を保存" },
            { value: "post" as const, label: "ポスト", description: "SNSでシェアする予定のもの" },
          ]).map((option) => {
            const selected = saveDestination === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSaveDestination(option.value)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  selected ? "bg-primary/10" : "hover:bg-muted/40"
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-primary bg-primary" : "border-border"
                }`}>
                  {selected && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}
