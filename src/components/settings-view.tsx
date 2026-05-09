"use client";

import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, EyeOff, Moon, Monitor, Pencil, Plus, Sun, Tags, Trash2, X } from "lucide-react";
import type { ThemeMode } from "@/hooks/use-theme";
import { readTagSuggestions, uniqueTags, writeTagSuggestions } from "@/lib/tag-suggestions";

type SettingsViewProps = {
  onBack: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  hidePostedInSourceTabs: boolean;
  onHidePostedInSourceTabsChange: (hidden: boolean) => void;
  existingTags: string[];
};

export function SettingsView({
  onBack,
  themeMode,
  onThemeChange,
  hidePostedInSourceTabs,
  onHidePostedInSourceTabsChange,
  existingTags,
}: SettingsViewProps) {
  const [tagSuggestions, setTagSuggestions] = useState<string[]>(() => uniqueTags([...readTagSuggestions(), ...existingTags]));
  const [newTag, setNewTag] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const saveTags = (nextTags: string[]) => {
    setTagSuggestions(writeTagSuggestions(nextTags));
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim().replace(/^#/, "");
    if (!trimmed || tagSuggestions.includes(trimmed)) return;
    saveTags([...tagSuggestions, trimmed]);
    setNewTag("");
  };

  const startEditingTag = (tag: string) => {
    setEditingTag(tag);
    setEditingValue(tag);
  };

  const cancelEditingTag = () => {
    setEditingTag(null);
    setEditingValue("");
  };

  const handleSaveEdit = () => {
    if (!editingTag) return;
    const trimmed = editingValue.trim().replace(/^#/, "");
    if (!trimmed) return;

    saveTags(tagSuggestions.map((tag) => (tag === editingTag ? trimmed : tag)));
    cancelEditingTag();
  };

  const moveTag = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= tagSuggestions.length) return;

    const nextTags = [...tagSuggestions];
    const [movedTag] = nextTags.splice(fromIndex, 1);
    nextTags.splice(toIndex, 0, movedTag);
    saveTags(nextTags);
  };

  const handleDeleteTag = (tagToRemove: string) => {
    if (confirm(`タグ "${tagToRemove}" を削除しますか？`)) {
      saveTags(tagSuggestions.filter((t) => t !== tagToRemove));
      if (editingTag === tagToRemove) cancelEditingTag();
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-secondary min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-4 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground -ml-2"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-medium text-foreground">設定</h1>
        <div className="w-9" /> {/* バランス用 */}
      </header>

      {/* Content */}
      <div className="p-4 sm:p-6 space-y-6">
        <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-4 flex items-center gap-2">
            <Tags size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">カスタムタグの管理</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              投稿画面の候補リストに出すタグを管理します。上にあるタグほど候補一覧でも先に表示されます。
            </p>

            <div className="mb-4 flex gap-2">
              <input
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="タグを追加"
                className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-muted-foreground"
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
                aria-label="タグを追加"
                title="タグを追加"
              >
                <Plus size={18} />
              </button>
            </div>

            {tagSuggestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                登録されているタグ候補はありません。
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {tagSuggestions.map((tag, index) => (
                  <li
                    key={tag}
                    className="flex items-center gap-2 rounded-xl border border-border p-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {editingTag === tag ? (
                        <input
                          value={editingValue}
                          onChange={(event) => setEditingValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleSaveEdit();
                            }
                            if (event.key === "Escape") {
                              cancelEditingTag();
                            }
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm outline-none transition-colors focus:border-muted-foreground"
                          autoFocus
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate px-2 text-sm font-medium text-foreground">{tag}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {editingTag === tag ? (
                        <>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="保存"
                            aria-label="保存"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingTag}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="キャンセル"
                            aria-label="キャンセル"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => moveTag(index, -1)}
                            disabled={index === 0}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            title="上へ"
                            aria-label="上へ"
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTag(index, 1)}
                            disabled={index === tagSuggestions.length - 1}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                            title="下へ"
                            aria-label="下へ"
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditingTag(tag)}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            title="編集"
                            aria-label="編集"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTag(tag)}
                            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
                            title="削除"
                            aria-label="削除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-4 flex items-center gap-2">
            <EyeOff size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">投稿済みカード</h2>
          </div>
          <div className="p-5">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-muted/30">
              <span className="text-sm font-medium text-foreground">
                投稿済みのカードはポストとクリップタブから見えなくする
              </span>
              <input
                type="checkbox"
                checked={hidePostedInSourceTabs}
                onChange={(event) => onHidePostedInSourceTabsChange(event.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>
          </div>
        </section>

        {/* テーマ設定 */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-4 flex items-center gap-2">
            <Sun size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">テーマ</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              アプリの外観を切り替えます。「システム」を選ぶと端末の設定にしたがいます。
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "system" as ThemeMode, label: "システム", icon: Monitor },
                { value: "light" as ThemeMode, label: "ライト", icon: Sun },
                { value: "dark" as ThemeMode, label: "ダーク", icon: Moon },
              ]).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => onThemeChange(value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                    themeMode === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon size={24} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
