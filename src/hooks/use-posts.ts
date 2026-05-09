"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createThumbnailBlobs } from "@/lib/image-thumbnails";
import { postsRepository } from "@/lib/postsRepository";
import { uniqueTags } from "@/lib/tag-suggestions";
import type { OgpPreview, Post, PostMediaRef, PostRecordInput, TimelineFilter } from "@/types/post";

const HIDE_POSTED_IN_SOURCE_TABS_KEY = "bocchisns_hide_posted_in_source_tabs";

export type PostFormValue = {
  type: Post["type"];
  postedFrom?: Post["postedFrom"];
  body: string;
  url: string;
  ogp?: OgpPreview;
  tagsText: string;
  imageBlobs?: Blob[];
  mediaRefs?: PostMediaRef[];
  thumbnailBlobs?: Blob[];
};

export type AvailableTag = {
  name: string;
  count: number;
};

const emptyForm: PostFormValue = {
  type: "post",
  body: "",
  url: "",
  tagsText: "",
};

const blobUrlCache = new Map<Blob, string>();
const postImageUrlListCache = new Map<string, { key: string; urls: string[] }>();
const postThumbnailUrlListCache = new Map<string, { key: string; urls: string[] }>();

function toRecordInput(value: PostFormValue): PostRecordInput {
  return {
    type: value.type,
    postedFrom: value.postedFrom,
    body: value.body.trim(),
    url: value.url.trim() || undefined,
    ogp: value.url.trim() ? value.ogp : undefined,
    imageBlobs: value.imageBlobs,
    mediaRefs: value.mediaRefs,
    thumbnailBlobs: value.thumbnailBlobs,
    tags: value.tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  } as PostRecordInput;
}

function getOriginalImageBlobs(post: Pick<Post, "imageBlobs" | "imageBlob">) {
  return post.imageBlobs && post.imageBlobs.length > 0 ? post.imageBlobs : (post.imageBlob ? [post.imageBlob] : []);
}

function getMediaRefs(post: Pick<Post, "mediaRefs">) {
  return post.mediaRefs ?? [];
}

function getMediaCount(post: Pick<Post, "imageBlobs" | "imageBlob" | "mediaRefs">) {
  return getOriginalImageBlobs(post).length + getMediaRefs(post).length;
}

function getThumbnailImageBlobs(post: Pick<Post, "imageBlobs" | "imageBlob" | "thumbnailBlobs" | "mediaRefs">) {
  const originalBlobs = getOriginalImageBlobs(post);
  if (hasCompleteThumbnailSet(post)) {
    return post.thumbnailBlobs ?? [];
  }

  return originalBlobs;
}

function hasCompleteThumbnailSet(post: Pick<Post, "imageBlobs" | "imageBlob" | "thumbnailBlobs" | "mediaRefs">) {
  return Boolean(post.thumbnailBlobs && post.thumbnailBlobs.length === getMediaCount(post) && post.thumbnailBlobs.length > 0);
}

function mediaRefToUrl(mediaRef: PostMediaRef) {
  return Capacitor.convertFileSrc(mediaRef.uri);
}

function areBlobListsEqual(left: Blob[] | undefined, right: Blob[] | undefined) {
  const leftList = left ?? [];
  const rightList = right ?? [];

  if (leftList.length !== rightList.length) {
    return false;
  }

  return leftList.every((blob, index) => blob === rightList[index]);
}

function areStringListsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function buildPostUrlMap(
  posts: Post[],
  getBlobs: (post: Post) => Blob[],
  listCache: Map<string, { key: string; urls: string[] }>,
  includeMediaRefs: boolean | ((post: Post) => boolean) = false,
) {
  const urls: Record<string, string[]> = {};

  posts.forEach((post) => {
    const blobs = getBlobs(post);
    const shouldIncludeRefs = typeof includeMediaRefs === "function" ? includeMediaRefs(post) : includeMediaRefs;
    const refUrls = shouldIncludeRefs ? getMediaRefs(post).map(mediaRefToUrl) : [];
    if (blobs.length === 0 && refUrls.length === 0) {
      return;
    }

    const nextUrls = blobs.map((blob) => {
      const cachedUrl = blobUrlCache.get(blob);
      if (cachedUrl) return cachedUrl;

      const nextUrl = URL.createObjectURL(blob);
      blobUrlCache.set(blob, nextUrl);
      return nextUrl;
    });
    const allUrls = [...nextUrls, ...refUrls];
    const cacheKey = allUrls.join("\n");
    const cachedList = listCache.get(post.id);

    if (cachedList?.key === cacheKey) {
      urls[post.id] = cachedList.urls;
    } else {
      listCache.set(post.id, { key: cacheKey, urls: allUrls });
      urls[post.id] = allUrls;
    }
  });

  return urls;
}

function fromPost(post: Post): PostFormValue {
  return {
    type: post.type,
    postedFrom: post.postedFrom,
    body: post.body,
    url: post.url ?? "",
    ogp: post.ogp,
    tagsText: post.tags.join(", "),
    imageBlobs: getOriginalImageBlobs(post),
    mediaRefs: getMediaRefs(post),
    thumbnailBlobs: post.thumbnailBlobs,
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
      case "media": return posts.filter((p) => getMediaCount(p) > 0);
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
      .map(([name, count]) => ({ name, count }));
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
    if (activeTag && !availableTags.some((tag) => tag.name === activeTag)) {
      const syncTimer = setTimeout(() => {
        setActiveTag(null);
      }, 0);
      return () => clearTimeout(syncTimer);
    }
  }, [activeTag, availableTags]);

  // 画像URL管理
  const postImageUrlMap = useMemo(() => {
    return buildPostUrlMap(posts, getOriginalImageBlobs, postImageUrlListCache, true);
  }, [posts]);

  const postThumbnailUrlMap = useMemo(() => {
    return buildPostUrlMap(posts, getThumbnailImageBlobs, postThumbnailUrlListCache, (post) => !hasCompleteThumbnailSet(post));
  }, [posts]);

  useEffect(() => {
    const activeBlobs = new Set<Blob>();
    const activePostIds = new Set<string>();
    posts.forEach((post) => {
      activePostIds.add(post.id);
      getOriginalImageBlobs(post).forEach((blob) => activeBlobs.add(blob));
      getThumbnailImageBlobs(post).forEach((blob) => activeBlobs.add(blob));
    });

    for (const postId of postImageUrlListCache.keys()) {
      if (!activePostIds.has(postId)) {
        postImageUrlListCache.delete(postId);
      }
    }

    for (const postId of postThumbnailUrlListCache.keys()) {
      if (!activePostIds.has(postId)) {
        postThumbnailUrlListCache.delete(postId);
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
      postThumbnailUrlListCache.clear();
    };
  }, []);

  // 操作ハンドラー
  const createPost = async (value: PostFormValue) => {
    setIsBusy(true);
    try {
      const recordInput = toRecordInput(value);
      const imageBlobs = recordInput.imageBlobs ?? [];
      const mediaRefs = recordInput.mediaRefs ?? [];
      const created = await postsRepository.create({
        ...recordInput,
        thumbnailBlobs: recordInput.thumbnailBlobs
          ?? (imageBlobs.length > 0 && mediaRefs.length === 0 ? await createThumbnailBlobs(imageBlobs) : undefined),
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
      const currentPost = posts.find((post) => post.id === id);
      const recordInput = toRecordInput(value);
      const nextImageBlobs = recordInput.imageBlobs ?? [];
      const nextMediaRefs = recordInput.mediaRefs ?? [];
      const shouldRefreshThumbnails = Boolean(
        nextImageBlobs.length > 0
        && nextMediaRefs.length === 0
        && (
          !currentPost
          || !currentPost.thumbnailBlobs
          || currentPost.thumbnailBlobs.length !== nextImageBlobs.length
          || !areBlobListsEqual(getOriginalImageBlobs(currentPost), nextImageBlobs)
        ),
      );
      const updated = await postsRepository.update(id, {
        ...recordInput,
        thumbnailBlobs: recordInput.thumbnailBlobs ?? (nextImageBlobs.length === 0 && nextMediaRefs.length === 0
          ? undefined
          : shouldRefreshThumbnails
            ? await createThumbnailBlobs(nextImageBlobs)
            : currentPost?.thumbnailBlobs),
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

  const updatePostStatus = async (
    post: Post,
    nextType: Post["type"],
    postedFrom?: Post["postedFrom"],
  ) => {
    setIsBusy(true);
    try {
      const updated = await postsRepository.update(
        post.id,
        {
          type: nextType,
          postedFrom,
          source: post.source,
        },
        { touchUpdatedAt: false },
      );
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      setStatusMessage(nextType === "posted" ? "投稿済みにしました。" : "未投稿に戻しました。");
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update post status");
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

  const bulkUpdatePostTags = async (postIds: string[], tags: string[], mode: "append" | "replace") => {
    setIsBusy(true);
    try {
      const normalizedTags = uniqueTags(tags);
      const postsById = new Map(posts.map((post) => [post.id, post]));
      const touchedPostIds = uniqueValues(postIds);
      const updatedPosts = await Promise.all(touchedPostIds.map(async (postId) => {
        const post = postsById.get(postId);
        if (!post) {
          throw new Error("Post not found");
        }

        const nextTags = mode === "append"
          ? uniqueTags([...post.tags, ...normalizedTags])
          : normalizedTags;

        if (areStringListsEqual(post.tags, nextTags)) {
          return post;
        }

        return postsRepository.update(
          post.id,
          {
            tags: nextTags,
            source: post.source,
          },
          { touchUpdatedAt: false },
        );
      }));

      const updatedById = new Map(updatedPosts.map((post) => [post.id, post]));
      setPosts((prev) => prev.map((post) => updatedById.get(post.id) ?? post));
      setStatusMessage(`${updatedPosts.length}件の投稿にタグを適用しました。`);
      return updatedPosts;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk update post tags");
      return null;
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
    postThumbnailUrlMap,
    loadPosts,
    createPost,
    updatePost,
    updatePostStatus,
    updatePostOgp,
    bulkUpdatePostTags,
    deletePost,
    fromPost,
    emptyForm,
    buildTweetText: (post: Post) => {
      const tagText = post.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");
      return [post.body, post.url, tagText].filter(Boolean).join("\n");
    }
  };
}
