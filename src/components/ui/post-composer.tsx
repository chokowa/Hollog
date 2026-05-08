"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useRef, useCallback } from "react";
import { Camera, ImagePlus, Link2, Tags, X, Clipboard, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import type { OgpPreview, PostType } from "@/types/post";

export type PostFormValue = {
  type: PostType;
  body: string;
  url: string;
  ogp?: OgpPreview;
  tagsText: string;
  imageBlobs?: Blob[];
};

type PostComposerProps = {
  submitLabel: string;
  value: PostFormValue;
  imagePreviewUrls?: string[];
  imageError?: string;
  pending?: boolean;
  compact?: boolean;
  onCancel?: () => void;
  onChange: (nextValue: PostFormValue) => void;
  onImagesSelect: (files: File[]) => void;
  onSubmit: () => void;
};

export function PostComposer({
  submitLabel,
  value,
  imagePreviewUrls,
  imageError,
  pending = false,
  compact = false,
  onCancel,
  onChange,
  onImagesSelect,
  onSubmit,
}: PostComposerProps) {
  const [tagInput, setTagInput] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [isBodyFocused, setIsBodyFocused] = useState(false);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [ogp, setOgp] = useState<OgpPreview | null>(value.ogp ?? null);
  const [ogpLoading, setOgpLoading] = useState(false);
  const ogpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedUrl = useRef("");
  const latestValueRef = useRef(value);
  const latestOnChangeRef = useRef(onChange);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    latestValueRef.current = value;
    latestOnChangeRef.current = onChange;
  }, [value, onChange]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("bocchisns_custom_tags");
      if (saved) {
        setCustomTags(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to parse custom tags", e);
    }
  }, []);

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
      const res = await fetch(`/api/ogp?url=${encodeURIComponent(url)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.title || data.image) {
          setOgp(data);
          latestOnChangeRef.current({ ...latestValueRef.current, ogp: data });
        } else {
          setOgp(null);
          latestOnChangeRef.current({ ...latestValueRef.current, ogp: undefined });
        }
      } else {
        setOgp(null);
        latestOnChangeRef.current({ ...latestValueRef.current, ogp: undefined });
      }
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
      setOgp(null);
      if (value.ogp) latestOnChangeRef.current({ ...latestValueRef.current, ogp: undefined });
      lastFetchedUrl.current = "";
      return;
    }
    if (value.ogp && lastFetchedUrl.current !== value.url.trim()) {
      setOgp(value.ogp);
      lastFetchedUrl.current = value.url.trim();
      return;
    }
    ogpTimerRef.current = setTimeout(() => {
      fetchOgp(value.url.trim());
    }, 800);
    return () => {
      if (ogpTimerRef.current) clearTimeout(ogpTimerRef.current);
    };
  }, [value.url, value.ogp, fetchOgp]);

  const predefinedTags = ["idea", "memo", "design", "reference", "todo", "music", "art"];
  const allAvailableTags = Array.from(new Set([...predefinedTags, ...customTags]));

  const currentTags = value.tagsText.split(",").map(t => t.trim()).filter(Boolean);
  const suggests = allAvailableTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !currentTags.includes(t));

  const addTag = (newTag: string) => {
    const trimmed = newTag.trim();
    if (!trimmed) return;

    if (!allAvailableTags.includes(trimmed)) {
      const nextCustom = [...customTags, trimmed];
      setCustomTags(nextCustom);
      try {
        localStorage.setItem("bocchisns_custom_tags", JSON.stringify(nextCustom));
      } catch (e) {}
    }

    if (currentTags.includes(trimmed)) {
      setTagInput("");
      return;
    }
    const nextTags = [...currentTags, trimmed].join(", ");
    onChange({ ...value, tagsText: nextTags });
    setTagInput("");
    setShowSuggest(false);
  };

  const removeTag = (tagToRemove: string) => {
    const nextTags = currentTags.filter(t => t !== tagToRemove).join(", ");
    onChange({ ...value, tagsText: nextTags });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && tagInput === "" && currentTags.length > 0) {
      removeTag(currentTags[currentTags.length - 1]);
    }
  };

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
      onImagesSelect(files);
    }
  };

  const handleClipboardRead = async () => {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      alert("現在の接続環境ではブラウザのセキュリティ制限によりクリップボードにアクセスできません。");
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
        onImagesSelect(files);
      } else {
        alert("クリップボードに画像が見つかりませんでした。");
      }
    } catch (err) {
      console.error(err);
      alert("ブラウザの制限によりクリップボードから画像を読み込めません。");
    }
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) onImagesSelect(files);
    e.target.value = "";
  };

  return (
    <div
      className={compact ? "" : "bg-card p-4 sm:p-5"}
      onPaste={handlePaste}
    >
      <div className="sticky top-0 z-30 -mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:-mx-5 sm:-mt-5 sm:px-5">
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
          aria-label="閉じる"
        >
          <X size={20} />
        </button>
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || (!value.body.trim() && (!value.imageBlobs || value.imageBlobs.length === 0) && !value.url.trim())}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {pending ? "保存中..." : submitLabel}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* 本文 */}
        <div>
          <div className={`rounded-xl border bg-card p-4 shadow-sm transition-all ${
            isBodyFocused
              ? "border-primary/60 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
              : "border-border"
          }`}>
            {imagePreviewUrls && imagePreviewUrls.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                {imagePreviewUrls.map((url, i) => (
                  <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-border bg-black/5">
                    <img src={url} alt={`Preview ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        const newBlobs = [...(value.imageBlobs || [])];
                        newBlobs.splice(i, 1);
                        onChange({ ...value, imageBlobs: newBlobs });
                      }}
                      className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 shadow-md transition-colors hover:bg-black/80"
                      aria-label="画像を削除"
                    >
                      <X size={14} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={value.body}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
              onFocus={() => setIsBodyFocused(true)}
              onBlur={() => setIsBodyFocused(false)}
              rows={6}
              placeholder="コメントを追加"
              className="w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground/50"
            />
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-1">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageInputChange}
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleImageInputChange}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={(value.imageBlobs || []).length >= 4}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                  title="画像を追加"
                  aria-label="画像を追加"
                >
                  <ImagePlus size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={(value.imageBlobs || []).length >= 4}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                  title="カメラで撮影"
                  aria-label="カメラで撮影"
                >
                  <Camera size={18} />
                </button>
                <button
                  type="button"
                  onClick={handleClipboardRead}
                  disabled={(value.imageBlobs || []).length >= 4}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                  title="コピーした画像を貼り付け"
                  aria-label="コピーした画像を貼り付け"
                >
                  <Clipboard size={18} />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{value.body.length}</span>
                <span>{(value.imageBlobs || []).length}/4</span>
              </div>
            </div>
          </div>
        </div>

        {/* URL & Tags */}
        <div className="grid gap-3">
          <div>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-muted-foreground">
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
            <div className="relative rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-muted-foreground">
              <div className="flex flex-wrap items-center gap-1.5">
                <Tags size={16} className="shrink-0 text-muted-foreground" />
                {currentTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowSuggest(true);
                  }}
                  onKeyDown={handleTagKeyDown}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 200)}
                  placeholder={currentTags.length === 0 ? "タグを入力..." : "さらに追加..."}
                  className="min-w-[96px] flex-1 bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowSuggest(!showSuggest);
                  }}
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted transition-colors"
                >
                  <ChevronDown size={16} className={showSuggest ? "rotate-180 transition-transform" : "transition-transform"} />
                </button>
              </div>

              {showSuggest && (tagInput.trim() || suggests.length > 0) && (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg screen-scroll">
                  {tagInput.trim() && !currentTags.includes(tagInput.trim()) && !allAvailableTags.includes(tagInput.trim()) && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
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
                  {suggests.length > 0 && (
                    <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">候補から選ぶ</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {suggests.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
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
            </div>
          </div>
        </div>

        {/* 保存先 */}
        <div>
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
                className={`relative z-10 rounded-full px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
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

        {imageError && (
          <p className="text-sm text-destructive">{imageError}</p>
        )}
      </div>
    </div>
  );
}
