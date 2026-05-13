"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ChevronDown, Tags, X } from "lucide-react";
import {
  getVisibleTagSuggestions,
  readTagSuggestionCatalog,
  writeTagSuggestionCatalog,
} from "@/lib/tag-suggestions";

type TagInputVariant = "composer" | "shareImport";

type TagInputProps = {
  tags: string[];
  onChange: (nextTags: string[]) => void;
  variant: TagInputVariant;
  maxSuggestions?: number;
  autoFocusOnContainerClick?: boolean;
};

export type TagInputHandle = {
  commitPendingTag: () => string;
  focus: () => void;
  getPendingTag: () => string;
};

type VariantClasses = {
  wrapper: string;
  inner: string;
  icon: string;
  tag: string;
  tagTextPrefix: string;
  removeButton: string;
  input: string;
  toggleButton: string;
  createButton: string;
  suggestionButton: string;
};

const variantClasses: Record<TagInputVariant, VariantClasses> = {
  composer: {
    wrapper: "relative rounded-2xl border border-border bg-muted/20 px-3 py-2.5 transition-colors focus-within:border-muted-foreground",
    inner: "flex flex-wrap items-center gap-2",
    icon: "",
    tag: "flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm text-foreground",
    tagTextPrefix: "#",
    removeButton: "rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
    input: "min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground",
    toggleButton: "rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted",
    createButton: "mb-2 flex w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10",
    suggestionButton: "rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted",
  },
  shareImport: {
    wrapper: "relative rounded-[20px] border border-border bg-card px-3 py-2.5 shadow-sm transition-colors focus-within:border-muted-foreground",
    inner: "flex flex-wrap items-center gap-1.5",
    icon: "shrink-0 text-muted-foreground",
    tag: "flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary",
    tagTextPrefix: "",
    removeButton: "rounded-full p-0.5 transition-colors hover:bg-primary/20",
    input: "min-w-[96px] flex-1 bg-transparent text-sm outline-none",
    toggleButton: "rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted",
    createButton: "mb-2 flex w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/10",
    suggestionButton: "rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted",
  },
};

export const TagInput = forwardRef<TagInputHandle, TagInputProps>(function TagInput({
  tags,
  onChange,
  variant,
  maxSuggestions,
  autoFocusOnContainerClick = false,
}, ref) {
  const [tagInput, setTagInput] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState(readTagSuggestionCatalog);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef(false);
  const classes = variantClasses[variant];

  const suggestions = useMemo(() => {
    const visibleSuggestions = getVisibleTagSuggestions(tagSuggestions, tagInput, tags);
    return typeof maxSuggestions === "number"
      ? visibleSuggestions.slice(0, maxSuggestions)
      : visibleSuggestions;
  }, [maxSuggestions, tagInput, tagSuggestions, tags]);

  const getPendingTag = useCallback(() => {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (!trimmed || tags.includes(trimmed)) return "";
    return trimmed;
  }, [tagInput, tags]);

  const focus = useCallback(() => {
    setShowSuggest(true);
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, []);

  const keepInputActive = useCallback(() => {
    restoreFocusRef.current = true;
    focus();
    window.setTimeout(() => {
      if (!restoreFocusRef.current) return;
      inputRef.current?.focus();
    }, 80);
  }, [focus]);

  const addTag = useCallback((value: string) => {
    const nextTag = value.trim().replace(/^#/, "");
    if (!nextTag) return;

    if (!tagSuggestions.some((suggestion) => suggestion.name === nextTag)) {
      setTagSuggestions(writeTagSuggestionCatalog([...tagSuggestions, { name: nextTag, isSystem: false }]));
    }

    if (tags.includes(nextTag)) {
      setTagInput("");
      return;
    }

    onChange([...tags, nextTag]);
    setTagInput("");
    setShowSuggest(false);
  }, [onChange, tagSuggestions, tags]);

  const commitPendingTag = useCallback(() => {
    const pendingTag = getPendingTag();
    if (!pendingTag) return "";
    addTag(pendingTag);
    return pendingTag;
  }, [addTag, getPendingTag]);

  const removeTag = useCallback((tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  }, [onChange, tags]);

  useImperativeHandle(ref, () => ({
    commitPendingTag,
    focus,
    getPendingTag,
  }), [commitPendingTag, focus, getPendingTag]);

  return (
    <div
      className={classes.wrapper}
      onClick={(event) => {
        if (!autoFocusOnContainerClick) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest("button")) return;
        focus();
      }}
    >
      <div className={classes.inner}>
        {variant === "shareImport" ? (
          <Tags size={16} className={classes.icon} />
        ) : null}
        {tags.map((tag) => (
          <span
            key={tag}
            className={classes.tag}
          >
            {classes.tagTextPrefix}
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className={classes.removeButton}
              aria-label={`${tag}を削除`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={tagInput}
          onChange={(event) => {
            setTagInput(event.target.value);
            setShowSuggest(true);
          }}
          onBeforeInput={(event) => {
            const nativeEvent = event.nativeEvent as InputEvent;
            if (nativeEvent.inputType === "insertLineBreak") {
              event.preventDefault();
              commitPendingTag();
              if (variant === "composer") {
                keepInputActive();
              }
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commitPendingTag();
              if (variant === "composer") {
                keepInputActive();
              }
            } else if (event.key === "Backspace" && tagInput === "" && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          onFocus={() => {
            restoreFocusRef.current = false;
            setShowSuggest(true);
          }}
          onBlur={() => setTimeout(() => {
            if (variant === "composer" && restoreFocusRef.current) {
              keepInputActive();
              return;
            }
            commitPendingTag();
            setShowSuggest(false);
          }, 200)}
          enterKeyHint="done"
          placeholder={tags.length === 0 ? "タグを入力..." : "さらに追加..."}
          className={classes.input}
        />
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            if (showSuggest) {
              setShowSuggest(false);
              return;
            }
            focus();
          }}
          className={classes.toggleButton}
          aria-label="タグ候補を表示"
        >
          <ChevronDown size={16} className={showSuggest ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>

      {showSuggest && (tagInput.trim() || suggestions.length > 0) && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg screen-scroll">
          {tagInput.trim() && !tags.includes(tagInput.trim()) && !tagSuggestions.some((tag) => tag.name === tagInput.trim()) && (
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                addTag(tagInput);
              }}
              className={classes.createButton}
            >
              <span className="flex items-center justify-center rounded-full bg-primary/20 p-1">
                <Tags size={12} />
              </span>
              「{tagInput}」を新規追加
            </button>
          )}
          {suggestions.length > 0 && (
            <div className="mb-1 px-1 text-xs font-medium text-muted-foreground">候補から選ぶ</div>
          )}
          <div className="flex flex-wrap gap-2">
            {suggestions.map((tag) => (
              <button
                key={tag}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  addTag(tag);
                }}
                className={classes.suggestionButton}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
