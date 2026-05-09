"use client";

import { Check, Link2, Tags, X } from "lucide-react";
import { useState } from "react";
import { readTagSuggestions, writeTagSuggestions } from "@/lib/tag-suggestions";
import type { PostType } from "@/types/post";

type ShareImportProps = {
  onBack: () => void;
  onImport: (postData: { body: string; url: string; tags: string[]; type: PostType }) => void;
  isBusy?: boolean;
  initialUrl?: string;
  initialMemo?: string;
};

type SaveDestination = "clip" | "post";

export function ShareImport({ onBack, onImport, isBusy, initialUrl = "", initialMemo = "" }: ShareImportProps) {
  const [url, setUrl] = useState(initialUrl);
  const [memo, setMemo] = useState(initialMemo);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>(readTagSuggestions);
  const [saveDestination, setSaveDestination] = useState<SaveDestination>("clip");

  const filteredSuggestions = tagSuggestions
    .filter((tag) => tag.toLowerCase().includes(tagInput.trim().toLowerCase()))
    .filter((tag) => !tags.includes(tag))
    .slice(0, 6);

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

  const handleSave = () => {
    const fullBody = memo.trim() ? memo.trim() : (url.trim() ? "共有されたリンク" : "共有されたテキスト");
    onImport({
      body: fullBody,
      url: url.trim(),
      tags,
      type: saveDestination,
    });
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
            disabled={isBusy || (!url.trim() && !memo.trim())}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {isBusy ? "保存中..." : "保存"}
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
