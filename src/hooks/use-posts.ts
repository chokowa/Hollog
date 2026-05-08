"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { postsRepository } from "@/lib/postsRepository";
import type { OgpPreview, Post, PostRecordInput, TimelineFilter } from "@/types/post";

const HIDE_POSTED_IN_SOURCE_TABS_KEY = "bocchisns_hide_posted_in_source_tabs";

export type PostFormValue = {
  type: Post["type"];
  postedFrom?: Post["postedFrom"];
  body: string;
  url: string;
  ogp?: OgpPreview;
  tagsText: string;
  imageBlobs?: Blob[];
};

const emptyForm: PostFormValue = {
  type: "post",
  body: "",
  url: "",
  tagsText: "",
};

const blobUrlCache = new Map<Blob, string>();
const postImageUrlListCache = new Map<string, { key: string; urls: string[] }>();

function toRecordInput(value: PostFormValue): PostRecordInput {
  return {
    type: value.type,
    postedFrom: value.postedFrom,
    body: value.body.trim(),
    url: value.url.trim() || undefined,
    ogp: value.url.trim() ? value.ogp : undefined,
    imageBlobs: value.imageBlobs,
    tags: value.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  } as PostRecordInput;
}

function fromPost(post: Post): PostFormValue {
  return {
    type: post.type,
    postedFrom: post.postedFrom,
    body: post.body,
    url: post.url ?? "",
    ogp: post.ogp,
    tagsText: post.tags.join(", "),
    imageBlobs: post.imageBlobs && post.imageBlobs.length > 0 ? post.imageBlobs : (post.imageBlob ? [post.imageBlob] : []),
  };
}

export function usePosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<TimelineFilter>("all");
  const [hidePostedInSourceTabs, setHidePostedInSourceTabsState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HIDE_POSTED_IN_SOURCE_TABS_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isBooting, setIsBooting] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  // 投稿リストの読み込み
  const loadPosts = useCallback(async () => {
    setError("");
    setIsBusy(true);
    try {
      const nextPosts = await postsRepository.list();
      setPosts(nextPosts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setIsBusy(false);
      setIsBooting(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = setTimeout(() => {
      void loadPosts();
    }, 0);
    return () => clearTimeout(loadTimer);
  }, [loadPosts]);

  const setHidePostedInSourceTabs = useCallback((nextValue: boolean) => {
    setHidePostedInSourceTabsState(nextValue);
    try {
      localStorage.setItem(HIDE_POSTED_IN_SOURCE_TABS_KEY, String(nextValue));
    } catch {}
  }, []);

  // フィルタリング
  const tabFilteredPosts = useMemo(() => {
    switch (activeTab) {
      case "post":
        return posts.filter((p) =>
          p.type === "post" || (!hidePostedInSourceTabs && p.type === "posted" && (!p.postedFrom || p.postedFrom === "post")),
        );
      case "clip":
        return posts.filter((p) =>
          p.type === "clip" || (!hidePostedInSourceTabs && p.type === "posted" && (!p.postedFrom || p.postedFrom === "clip")),
        );
      case "posted": return posts.filter((p) => p.type === "posted");
      case "media": return posts.filter((p) => (p.imageBlobs && p.imageBlobs.length > 0) || Boolean(p.imageBlob));
      default: return posts;
    }
  }, [posts, activeTab, hidePostedInSourceTabs]);

  const availableTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    tabFilteredPosts.forEach((post) => {
      post.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      });
    });
    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
      .map(([tag]) => tag);
  }, [tabFilteredPosts]);

  const visiblePosts = useMemo(() => {
    const tagFilteredPosts = activeTag
      ? tabFilteredPosts.filter((post) => post.tags.includes(activeTag))
      : tabFilteredPosts;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return tagFilteredPosts;
    return tagFilteredPosts.filter((post) => {
      const searchableText = [
        post.body,
        post.url ?? "",
        post.ogp?.title ?? "",
        post.ogp?.description ?? "",
        post.ogp?.siteName ?? "",
        ...post.tags,
      ].join(" ").toLowerCase();
      return searchableText.includes(query);
    });
  }, [tabFilteredPosts, activeTag, searchQuery]);


  useEffect(() => {
    if (activeTag && !availableTags.includes(activeTag)) {
      const syncTimer = setTimeout(() => {
        setActiveTag(null);
      }, 0);
      return () => clearTimeout(syncTimer);
    }
  }, [activeTag, availableTags]);

  // 画像URL管理
  const postImageUrlMap = useMemo(() => {
    const urls: Record<string, string[]> = {};

    posts.forEach((post) => {
      const blobs = post.imageBlobs && post.imageBlobs.length > 0 ? post.imageBlobs : (post.imageBlob ? [post.imageBlob] : []);
      if (blobs.length > 0) {
        const nextUrls = blobs.map((blob) => {
          const cachedUrl = blobUrlCache.get(blob);
          if (cachedUrl) return cachedUrl;

          const nextUrl = URL.createObjectURL(blob);
          blobUrlCache.set(blob, nextUrl);
          return nextUrl;
        });
        const cacheKey = nextUrls.join("\n");
        const cachedList = postImageUrlListCache.get(post.id);

        if (cachedList?.key === cacheKey) {
          urls[post.id] = cachedList.urls;
        } else {
          postImageUrlListCache.set(post.id, { key: cacheKey, urls: nextUrls });
          urls[post.id] = nextUrls;
        }
      }
    });

    return urls;
  }, [posts]);

  useEffect(() => {
    const activeBlobs = new Set<Blob>();
    const activePostIds = new Set<string>();
    posts.forEach((post) => {
      activePostIds.add(post.id);
      const blobs = post.imageBlobs && post.imageBlobs.length > 0 ? post.imageBlobs : (post.imageBlob ? [post.imageBlob] : []);
      blobs.forEach((blob) => activeBlobs.add(blob));
    });

    for (const postId of postImageUrlListCache.keys()) {
      if (!activePostIds.has(postId)) {
        postImageUrlListCache.delete(postId);
      }
    }

    for (const [blob, url] of blobUrlCache.entries()) {
      if (!activeBlobs.has(blob)) {
        URL.revokeObjectURL(url);
        blobUrlCache.delete(blob);
      }
    }
  }, [posts]);

  useEffect(() => {
    return () => {
      blobUrlCache.forEach((url) => URL.revokeObjectURL(url));
      blobUrlCache.clear();
      postImageUrlListCache.clear();
    };
  }, []);

  // 操作ハンドラー
  const createPost = async (value: PostFormValue) => {
    setIsBusy(true);
    try {
      const created = await postsRepository.create({
        ...toRecordInput(value),
        source: "manual",
      });
      setPosts((prev) => [created, ...prev]);
      setStatusMessage("投稿を保存しました。");
      return created;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post");
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const updatePost = async (id: string, value: PostFormValue, source: Post["source"]) => {
    setIsBusy(true);
    try {
      const updated = await postsRepository.update(id, {
        ...toRecordInput(value),
        source,
      });
      setPosts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      setStatusMessage("投稿を更新しました。");
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update post");
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  const updatePostOgp = async (post: Post, ogp: OgpPreview) => {
    if (!post.url) return null;
    try {
      const updated = await postsRepository.updateOgp(post.id, ogp);
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update OGP data");
      return null;
    }
  };

  const deletePost = async (id: string) => {
    setIsBusy(true);
    try {
      await postsRepository.delete(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setStatusMessage("投稿を削除しました。");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete post");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  return {
    posts,
    visiblePosts,
    hidePostedInSourceTabs,
    setHidePostedInSourceTabs,
    activeTab,
    setActiveTab,
    activeTag,
    setActiveTag,
    availableTags,
    searchQuery,
    setSearchQuery,
    error,
    setError,
    statusMessage,
    setStatusMessage,
    isBooting,
    isBusy,
    postImageUrlMap,
    loadPosts,
    createPost,
    updatePost,
    updatePostOgp,
    deletePost,
    fromPost,
    emptyForm,
    buildTweetText: (post: Post) => {
      const tagText = post.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");
      return [post.body, post.url, tagText].filter(Boolean).join("\n");
    }
  };
}
