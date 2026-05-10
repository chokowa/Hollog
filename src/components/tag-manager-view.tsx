"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Images,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { AppButton } from "@/components/ui/app-button";
import { readTagSuggestions, uniqueTags, writeTagSuggestions } from "@/lib/tag-suggestions";
import type { Post } from "@/types/post";

type TagManagerViewProps = {
  onBack: () => void;
  posts: Post[];
  isBusy: boolean;
  postThumbnailUrlMap: Record<string, string[]>;
  existingTags: string[];
  onBulkUpdatePostTags: (postIds: string[], tags: string[], mode: "append" | "replace") => Promise<Post[] | null>;
};

type ManagerTab = "catalog" | "bulk";
type BulkMode = "append" | "replace";
type MediaFilter = "all" | "with" | "without";

function hasMedia(post: Post) {
  return Boolean((post.imageBlobs && post.imageBlobs.length > 0) || post.imageBlob || (post.mediaRefs && post.mediaRefs.length > 0));
}

function getPostDateValue(iso: string) {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 10);
  }

  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function formatPostDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function areValuesEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function TagManagerView({
  onBack,
  posts,
  isBusy,
  postThumbnailUrlMap,
  existingTags,
  onBulkUpdatePostTags,
}: TagManagerViewProps) {
  const [activeTab, setActiveTab] = useState<ManagerTab>("catalog");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>(() => uniqueTags(readTagSuggestions()));
  const [newTag, setNewTag] = useState("");
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const [postQuery, setPostQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [postTagFilter, setPostTagFilter] = useState<string>("__all__");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [untaggedOnly, setUntaggedOnly] = useState(true);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<BulkMode>("append");

  const catalogTags = useMemo(
    () => uniqueTags(tagSuggestions),
    [tagSuggestions],
  );

  const saveTags = (nextTags: string[]) => {
    setTagSuggestions(writeTagSuggestions(nextTags));
  };

  const tagUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    posts.forEach((post) => {
      post.tags.forEach((tag) => {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      });
    });
    return counts;
  }, [posts]);

  const allTagNames = useMemo(() => {
    return uniqueTags([
      ...tagSuggestions,
      ...existingTags,
      ...selectedTags,
    ]).sort((left, right) => {
      const countDiff = (tagUsageCounts.get(right) ?? 0) - (tagUsageCounts.get(left) ?? 0);
      return countDiff || left.localeCompare(right, "ja");
    });
  }, [existingTags, selectedTags, tagSuggestions, tagUsageCounts]);

  const quickTags = useMemo(() => tagSuggestions.slice(0, 10), [tagSuggestions]);

  const filteredPosts = useMemo(() => {
    const query = postQuery.trim().toLowerCase();

    return posts.filter((post) => {
      if (untaggedOnly && post.tags.length > 0) return false;
      if (postTagFilter !== "__all__" && !post.tags.includes(postTagFilter)) return false;
      if (mediaFilter === "with" && !hasMedia(post)) return false;
      if (mediaFilter === "without" && hasMedia(post)) return false;

      const createdDate = getPostDateValue(post.createdAt);
      if (dateFrom && createdDate < dateFrom) return false;
      if (dateTo && createdDate > dateTo) return false;

      if (!query) return true;
      const searchableText = [
        post.body,
        post.url ?? "",
        post.ogp?.title ?? "",
        post.ogp?.description ?? "",
        ...post.tags,
      ].join(" ").toLowerCase();
      return searchableText.includes(query);
    });
  }, [dateFrom, dateTo, mediaFilter, postQuery, postTagFilter, posts, untaggedOnly]);

  const selectedPostSet = useMemo(() => new Set(selectedPostIds), [selectedPostIds]);
  const selectedTagsSet = useMemo(() => new Set(selectedTags), [selectedTags]);

  const previewItems = useMemo(() => {
    return posts
      .filter((post) => selectedPostSet.has(post.id))
      .map((post) => {
        const nextTags = bulkMode === "append"
          ? uniqueTags([...post.tags, ...selectedTags])
          : uniqueTags(selectedTags);
        return {
          post,
          nextTags,
          changed: !areValuesEqual(post.tags, nextTags),
        };
      });
  }, [bulkMode, posts, selectedPostSet, selectedTags]);

  const changedPreviewCount = useMemo(
    () => previewItems.filter((item) => item.changed).length,
    [previewItems],
  );

  const filteredSelectableCount = filteredPosts.length;
  const selectedVisibleCount = filteredPosts.filter((post) => selectedPostSet.has(post.id)).length;
  const canApply = selectedPostIds.length > 0 && selectedTags.length > 0 && !isBusy;

  const handleAddTag = () => {
    const trimmed = newTag.trim().replace(/^#/, "");
    if (!trimmed || catalogTags.includes(trimmed)) return;
    saveTags([...catalogTags, trimmed]);
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

    saveTags(catalogTags.map((tag) => (tag === editingTag ? trimmed : tag)));
    setSelectedTags((current) => current.map((tag) => (tag === editingTag ? trimmed : tag)));
    cancelEditingTag();
  };

  const moveTag = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= catalogTags.length) return;

    const nextTags = [...catalogTags];
    const [movedTag] = nextTags.splice(fromIndex, 1);
    nextTags.splice(toIndex, 0, movedTag);
    saveTags(nextTags);
  };

  const handleDeleteTag = (tagToRemove: string) => {
    if (!confirm(`タグ候補 "${tagToRemove}" を削除しますか？\n既存投稿のタグ自体は消えません。`)) {
      return;
    }

    saveTags(catalogTags.filter((tag) => tag !== tagToRemove));
    setSelectedTags((current) => current.filter((tag) => tag !== tagToRemove));
    if (editingTag === tagToRemove) cancelEditingTag();
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPostIds((current) => (
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId]
    ));
  };

  const selectVisiblePosts = () => {
    setSelectedPostIds((current) => uniqueValues([...current, ...filteredPosts.map((post) => post.id)]));
  };

  const clearVisiblePosts = () => {
    const visibleIds = new Set(filteredPosts.map((post) => post.id));
    setSelectedPostIds((current) => current.filter((id) => !visibleIds.has(id)));
  };

  const clearAllSelections = () => {
    setSelectedPostIds([]);
    setSelectedTags([]);
  };

  const toggleTagSelection = (tag: string) => {
    setSelectedTags((current) => (
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    ));
  };

  const handleApply = async () => {
    if (!canApply) return;

    const modeLabel = bulkMode === "append" ? "追加" : "置き換え";
    const confirmed = confirm(
      `${selectedPostIds.length}件の投稿に対して、${selectedTags.length}件のタグを${modeLabel}します。\nこの操作を実行しますか？`,
    );
    if (!confirmed) return;

    const updated = await onBulkUpdatePostTags(selectedPostIds, selectedTags, bulkMode);
    if (!updated) return;

    setSelectedPostIds([]);
    alert(`${updated.length}件の投稿へタグを適用しました。`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-secondary">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-4">
          <button
            onClick={onBack}
            className="-ml-2 flex items-center gap-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="戻る"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center">
            <h1 className="text-lg font-medium text-foreground">タグ管理</h1>
            <p className="text-xs text-muted-foreground">
              {activeTab === "catalog" ? "候補タグを整える" : "複数投稿へまとめて適用"}
            </p>
          </div>
          <div className="w-16" />
        </div>

        <div className="px-4 pb-4">
          <div className="grid grid-cols-2 rounded-2xl border border-border bg-secondary p-1">
            {[
              { value: "catalog" as ManagerTab, label: "タグ一覧" },
              { value: "bulk" as ManagerTab, label: "一括タグ付け" },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 p-4 sm:p-6">
        {activeTab === "catalog" ? (
          <section className="mx-auto max-w-4xl rounded-3xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Tags size={18} className="text-primary" />
                <h2 className="font-medium text-foreground">タグ候補一覧</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                投稿画面や一括タグ付けで選びやすいように、タグ候補の追加・編集・並び替えを行います。
              </p>
            </div>

            <div className="p-5">
              <div className="mb-5 flex gap-2">
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
                >
                  <Plus size={18} />
                </button>
              </div>

              {catalogTags.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  登録されているタグ候補はありません。
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {catalogTags.map((tag, index) => (
                    <li
                      key={tag}
                      className="flex items-center gap-2 rounded-2xl border border-border p-3 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
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
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-muted-foreground"
                            autoFocus
                          />
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">#{tag}</p>
                              <p className="text-xs text-muted-foreground">
                                使用中 {tagUsageCounts.get(tag) ?? 0}件
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {editingTag === tag ? (
                          <>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="保存"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditingTag}
                              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
                              aria-label="上へ"
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveTag(index, 1)}
                              disabled={index === catalogTags.length - 1}
                              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                              aria-label="下へ"
                            >
                              <ArrowDown size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => startEditingTag(tag)}
                              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="編集"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTag(tag)}
                              className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
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
        ) : (
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">作業状況</h2>
                  <p className="text-sm text-muted-foreground">
                    投稿 {selectedPostIds.length}件選択 / タグ {selectedTags.length}件選択 / 反映対象 {changedPreviewCount}件
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <AppButton variant="ghost" className="h-10 rounded-full px-4 text-xs" onClick={clearAllSelections}>
                    選択をクリア
                  </AppButton>
                </div>
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
              <section className="rounded-3xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-medium text-foreground">投稿を絞り込んで選ぶ</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    初期状態では未タグ投稿だけを表示しています。
                  </p>
                </div>

                <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-3">
                  <label className="sm:col-span-2 xl:col-span-3">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">検索</span>
                    <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2">
                      <Search size={16} className="text-muted-foreground" />
                      <input
                        value={postQuery}
                        onChange={(event) => setPostQuery(event.target.value)}
                        placeholder="本文・URL・タグで検索"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">開始日</span>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(event) => setDateFrom(event.target.value)}
                      className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-muted-foreground"
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">終了日</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(event) => setDateTo(event.target.value)}
                      className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-muted-foreground"
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">タグ絞り込み</span>
                    <select
                      value={postTagFilter}
                      onChange={(event) => setPostTagFilter(event.target.value)}
                      className="w-full rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-muted-foreground"
                    >
                      <option value="__all__">すべてのタグ</option>
                      {allTagNames.map((tag) => (
                        <option key={tag} value={tag}>
                          #{tag}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="sm:col-span-2 xl:col-span-3">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">メディア</span>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "all" as MediaFilter, label: "すべて" },
                        { value: "with" as MediaFilter, label: "あり" },
                        { value: "without" as MediaFilter, label: "なし" },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setMediaFilter(option.value)}
                          className={`rounded-2xl border px-3 py-2 text-sm transition-colors ${
                            mediaFilter === option.value
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-card text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-secondary px-3 py-3 sm:col-span-2 xl:col-span-3">
                    <input
                      type="checkbox"
                      checked={untaggedOnly}
                      onChange={(event) => setUntaggedOnly(event.target.checked)}
                      className="bocchi-checkbox h-4 w-4"
                    />
                    <span className="text-sm text-foreground">未タグ投稿だけ表示する</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    表示 {filteredSelectableCount}件 / 表示中選択 {selectedVisibleCount}件
                  </p>
                  <div className="flex gap-2">
                    <AppButton variant="ghost" className="h-9 rounded-full px-3 text-xs" onClick={selectVisiblePosts}>
                      表示中を選択
                    </AppButton>
                    <AppButton variant="ghost" className="h-9 rounded-full px-3 text-xs" onClick={clearVisiblePosts}>
                      表示中を解除
                    </AppButton>
                  </div>
                </div>

                <div className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto p-4">
                  {filteredPosts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      条件に合う投稿がありません。
                    </div>
                  ) : (
                    filteredPosts.map((post) => {
                      const isSelected = selectedPostSet.has(post.id);
                      const thumbnailUrl = postThumbnailUrlMap[post.id]?.[0];
                      return (
                        <label
                          key={post.id}
                          className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePostSelection(post.id)}
                            className="bocchi-checkbox mt-1 h-4 w-4 shrink-0"
                          />

                          {thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnailUrl}
                              alt=""
                              className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                              <Images size={18} />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs text-muted-foreground">{formatPostDate(post.createdAt)}</p>
                              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                {post.type}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-sm text-foreground">
                              {post.body || post.url || "本文なし"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {post.tags.length > 0 ? (
                                post.tags.map((tag) => (
                                  <span
                                    key={`${post.id}-${tag}`}
                                    className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground"
                                  >
                                    #{tag}
                                  </span>
                                ))
                              ) : (
                                <span className="rounded-full bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                                  タグなし
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="rounded-3xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="font-medium text-foreground">タグを選ぶ</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    複数タグを同時に選べます。
                  </p>
                </div>

                <div className="space-y-4 p-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">クイックタグ</p>
                    <div className="flex flex-wrap gap-2">
                      {quickTags.map((tag) => {
                        const active = selectedTagsSet.has(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTagSelection(tag)}
                            className={`rounded-full border px-3 py-2 text-sm transition-colors ${
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-card text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            #{tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <label>
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">タグ検索</span>
                    <div className="flex items-center gap-2 rounded-2xl border border-border bg-secondary px-3 py-2">
                      <Search size={16} className="text-muted-foreground" />
                      <input
                        value={tagQuery}
                        onChange={(event) => setTagQuery(event.target.value)}
                        placeholder="タグ名で検索"
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </div>
                  </label>

                  <div className="rounded-2xl border border-border">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-medium text-foreground">全タグ一覧</p>
                    </div>
                    <div className="max-h-[26rem] overflow-y-auto p-2">
                      {allTagNames
                        .filter((tag) => tag.toLowerCase().includes(tagQuery.trim().toLowerCase()))
                        .map((tag) => {
                          const active = selectedTagsSet.has(tag);
                          return (
                            <label
                              key={tag}
                              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors ${
                                active ? "bg-primary/5" : "hover:bg-muted/40"
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => toggleTagSelection(tag)}
                                  className="bocchi-checkbox h-4 w-4"
                                />
                                <span className="truncate text-sm text-foreground">#{tag}</span>
                              </div>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {tagUsageCounts.get(tag) ?? 0}件
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">選択中のタグ</p>
                    <div className="flex min-h-12 flex-wrap gap-2 rounded-2xl border border-dashed border-border p-3">
                      {selectedTags.length === 0 ? (
                        <span className="text-sm text-muted-foreground">まだ選択されていません。</span>
                      ) : (
                        selectedTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleTagSelection(tag)}
                            className="rounded-full bg-primary px-3 py-1.5 text-sm text-primary-foreground"
                          >
                            #{tag}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-3xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-medium text-foreground">適用設定とプレビュー</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  既存タグを残すか、選択タグだけに置き換えるかを選びます。
                </p>
              </div>

              <div className="grid gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-3">
                  {[
                    {
                      value: "append" as BulkMode,
                      label: "追加でタグ付け",
                      description: "既存タグを残したまま、選択タグを加えます。",
                    },
                    {
                      value: "replace" as BulkMode,
                      label: "既存タグを置き換え",
                      description: "既存タグを外して、選択タグだけにします。",
                    },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setBulkMode(option.value)}
                      className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                        bulkMode === option.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">変更プレビュー</p>
                      <p className="text-xs text-muted-foreground">
                        変更あり {changedPreviewCount}件 / 選択 {previewItems.length}件
                      </p>
                    </div>
                    <AppButton
                      variant="primary"
                      className="h-10 rounded-full px-4 text-xs"
                      disabled={!canApply}
                      onClick={handleApply}
                    >
                      {isBusy ? "適用中..." : "この内容で適用"}
                    </AppButton>
                  </div>

                  <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                    {previewItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                        投稿とタグを選ぶと、ここに変更内容が表示されます。
                      </div>
                    ) : (
                      previewItems.map(({ post, nextTags, changed }) => (
                        <article
                          key={post.id}
                          className={`rounded-2xl border p-4 ${
                            changed ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-muted-foreground">{formatPostDate(post.createdAt)}</p>
                            <span className="text-xs font-medium text-muted-foreground">
                              {changed ? "変更あり" : "変更なし"}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm text-foreground">
                            {post.body || post.url || "本文なし"}
                          </p>

                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                              <p className="mb-1 text-[11px] font-medium text-muted-foreground">現在</p>
                              <div className="flex min-h-10 flex-wrap gap-1.5 rounded-xl bg-secondary p-2">
                                {post.tags.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">タグなし</span>
                                ) : (
                                  post.tags.map((tag) => (
                                    <span key={`${post.id}-current-${tag}`} className="rounded-full bg-card px-2 py-1 text-[11px] text-foreground">
                                      #{tag}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="mb-1 text-[11px] font-medium text-muted-foreground">適用後</p>
                              <div className="flex min-h-10 flex-wrap gap-1.5 rounded-xl bg-secondary p-2">
                                {nextTags.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">タグなし</span>
                                ) : (
                                  nextTags.map((tag) => (
                                    <span key={`${post.id}-next-${tag}`} className="rounded-full bg-primary px-2 py-1 text-[11px] text-primary-foreground">
                                      #{tag}
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
