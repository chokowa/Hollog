"use client";

import { X, Link as LinkIcon, Plus } from "lucide-react";
import { useState } from "react";
import type { PostType } from "@/types/post";

type ShareImportProps = {
  onBack: () => void;
  onImport: (postData: { body: string; url: string; tags: string[]; type: PostType }) => void;
  isBusy?: boolean;
};

export function ShareImport({ onBack, onImport, isBusy }: ShareImportProps) {
  const [url, setUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saveDestination, setSaveDestination] = useState("saved");

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      const tag = tagInput.trim().replace(/^#/, "");
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSave = () => {
    const fullBody = memo.trim() ? memo.trim() : "共有されたリンク";
    onImport({
      body: fullBody,
      url: url.trim(),
      tags: tags,
      type: saveDestination === "saved" ? "clip" : "post",
    });
  };

  return (
    <div>
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-normal text-foreground">外部から保存</h1>
          <button
            onClick={onBack}
            className="rounded-full p-2 transition-colors hover:bg-muted"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>
      </header>

      <div className="px-4 py-6">
        {/* URL入力 */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            共有されたURL
          </label>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
            <LinkIcon size={20} className="text-muted-foreground" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/..."
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* 自分用メモ */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            自分用メモ（オプション）
          </label>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="このURLについてメモを残す..."
              className="min-h-[120px] w-full resize-none bg-transparent outline-none"
              rows={4}
            />
          </div>
        </div>

        {/* タグ入力 */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            タグ（オプション）
          </label>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="タグを入力してEnter"
                className="flex-1 rounded-lg border border-border px-3 py-2 outline-none transition-colors focus:border-muted-foreground"
              />
              <button
                onClick={handleAddTag}
                className="rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
                aria-label="タグを追加"
              >
                <Plus size={18} />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground"
                  >
                    #{tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="rounded-full p-0.5 transition-colors hover:bg-muted"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 保存先選択 */}
        <div className="mb-8">
          <label className="mb-3 block text-sm font-medium text-muted-foreground">
            保存先
          </label>
          <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
            <button
              onClick={() => setSaveDestination("saved")}
              className={`flex w-full items-center px-4 py-4 text-left transition-colors hover:bg-muted/50 ${
                saveDestination === "saved" ? "bg-muted/30" : ""
              }`}
            >
              <div className="mr-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-border">
                {saveDestination === "saved" && (
                  <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </div>
              <div>
                <div className="font-medium text-foreground">クリップ</div>
                <div className="text-xs text-muted-foreground">
                  後で読むURLや情報を保存
                </div>
              </div>
            </button>

            <button
              onClick={() => setSaveDestination("candidates")}
              className={`flex w-full items-center px-4 py-4 text-left transition-colors hover:bg-muted/50 ${
                saveDestination === "candidates" ? "bg-muted/30" : ""
              }`}
            >
              <div className="mr-3 flex h-5 w-5 items-center justify-center rounded-full border-2 border-border">
                {saveDestination === "candidates" && (
                  <div className="h-2.5 w-2.5 rounded-full bg-primary" />
                )}
              </div>
              <div>
                <div className="font-medium text-foreground">ポスト</div>
                <div className="text-xs text-muted-foreground">
                  SNSでシェアする予定のもの
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          disabled={isBusy || !url.trim()}
          className="w-full rounded-xl bg-primary py-4 text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isBusy ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}
