"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Capacitor } from "@capacitor/core";
import { readHiddenTags, writeHiddenTags } from "@/lib/hidden-tags";
import { createThumbnailBlobs } from "@/lib/image-thumbnails";
import { normalizeImageBlobIds, normalizeMediaOrder } from "@/lib/post-media";
import { postsRepository } from "@/lib/postsRepository";
import { uniqueTags } from "@/lib/tag-suggestions";
import type { OgpPreview, Post, PostMediaOrderItem, PostMediaRef, PostRecordInput, TimelineFilter } from "@/types/post";

const HIDE_POSTED_IN_SOURCE_TABS_KEY = "bocchisns_hide_posted_in_source_tabs";
const POST_SYNC_EVENT_KEY = "bocchisns_post_sync_event";
const POST_SYNC_CHANNEL_NAME = "bocchisns_post_sync";

export type PostFormValue = {
  type: Post["type"];
  postedFrom?: Post["postedFrom"];
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

export type AvailableTag = {
  name: string;
  count: number;
  hidden?: boolean;
};

type CreatePostOptions = {
  commit?: "default" | "sync";
};

type PostSyncEvent = {
  kind: "created";
  postId: string;
  sourceInstanceId: string;
  createdAt: string;
};

export type ImportPostsResult = {
  addedCount: number;
  duplicateCount: number;
  mergedTagCount: number;
  conflictCount: number;
  skippedCount: number;
  overwrittenCount: number;
};

export type ImportConflictChoice = "keep-existing" | "use-imported";
export type ImportConflictField = "body" | "url" | "ogp";

export type ImportConflict = {
  key: string;
  importedIndex: number;
  fields: ImportConflictField[];
  existing: Post;
  imported: Post;
  mergedTags: string[];
};

export type ImportPostsPreview = ImportPostsResult & {
  conflicts: ImportConflict[];
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
  const imageBlobIds = normalizeImageBlobIds(value.imageBlobs, value.imageBlobIds);
  const mediaOrder = normalizeMediaOrder({
    imageBlobs: value.imageBlobs,
    imageBlobIds,
    mediaRefs: value.mediaRefs,
    mediaOrder: value.mediaOrder,
  });

  return {
    type: value.type,
    postedFrom: value.postedFrom,
    body: value.body.trim(),
    url: value.url.trim() || undefined,
    ogp: value.url.trim() ? value.ogp : undefined,
    imageBlobs: value.imageBlobs,
    imageBlobIds,
    mediaRefs: value.mediaRefs,
    mediaOrder,
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

function getImageBlobIds(post: Pick<Post, "imageBlobs" | "imageBlob" | "imageBlobIds">) {
  return normalizeImageBlobIds(getOriginalImageBlobs(post), post.imageBlobIds) ?? [];
}

function getMediaOrder(post: Pick<Post, "imageBlobs" | "imageBlob" | "imageBlobIds" | "mediaRefs" | "mediaOrder">) {
  return normalizeMediaOrder({
    imageBlobs: getOriginalImageBlobs(post),
    imageBlobIds: getImageBlobIds(post),
    mediaRefs: getMediaRefs(post),
    mediaOrder: post.mediaOrder,
  }) ?? [];
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

function normalizeDuplicateText(value?: string) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeDuplicateUrl(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    url.hash = "";
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return normalizeDuplicateText(trimmed);
  }
}

function getBodyDateDuplicateKey(post: Pick<Post, "body" | "createdAt">) {
  const body = normalizeDuplicateText(post.body);
  const date = post.createdAt?.slice(0, 10) ?? "";
  return body && date ? `${body}\n${date}` : "";
}

function getImportConflictFields(existing: Post, imported: Post): ImportConflictField[] {
  const fields: ImportConflictField[] = [];
  if (normalizeDuplicateText(existing.body) !== normalizeDuplicateText(imported.body)) {
    fields.push("body");
  }
  if (normalizeDuplicateUrl(existing.url) !== normalizeDuplicateUrl(imported.url)) {
    fields.push("url");
  }
  if (JSON.stringify(existing.ogp ?? null) !== JSON.stringify(imported.ogp ?? null)) {
    fields.push("ogp");
  }
  return fields;
}

function buildImportConflictKey(existing: Post, imported: Post, importedIndex: number) {
  return `${existing.id}\n${imported.id}\n${importedIndex}`;
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
    const mediaRefs = getMediaRefs(post);
    if (blobs.length === 0 && (!shouldIncludeRefs || mediaRefs.length === 0)) {
      return;
    }

    const nextUrls = blobs.map((blob) => {
      const cachedUrl = blobUrlCache.get(blob);
      if (cachedUrl) return cachedUrl;

      const nextUrl = URL.createObjectURL(blob);
      blobUrlCache.set(blob, nextUrl);
      return nextUrl;
    });
    const blobIdList = getBlobs === getThumbnailImageBlobs && hasCompleteThumbnailSet(post) && mediaRefs.length === 0
      ? getImageBlobIds(post)
      : getImageBlobIds(post);
    const blobUrlMap = new Map(blobIdList.map((id, index) => [id, nextUrls[index]]));
    const refUrlMap = new Map(mediaRefs.map((mediaRef) => [mediaRef.id, mediaRefToUrl(mediaRef)]));
    const orderedUrls = getMediaOrder(post).flatMap((item) => {
      if (item.source === "imageBlob") {
        const url = blobUrlMap.get(item.id);
        return url ? [url] : [];
      }
      if (!shouldIncludeRefs) {
        return [];
      }
      const url = refUrlMap.get(item.id);
      return url ? [url] : [];
    });
    const allUrls = orderedUrls.length > 0 ? orderedUrls : [...nextUrls, ...(shouldIncludeRefs ? mediaRefs.map(mediaRefToUrl) : [])];
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
    imageBlobIds: getImageBlobIds(post),
    mediaRefs: getMediaRefs(post),
    mediaOrder: getMediaOrder(post),
    thumbnailBlobs: post.thumbnailBlobs,
  };
}

function buildImportPlan(
  latestPosts: Post[],
  importedPosts: Post[],
  conflictChoices: Record<string, ImportConflictChoice> = {},
): {
  preview: ImportPostsPreview;
  newPosts: Post[];
  updatesById: Map<string, Partial<PostRecordInput>>;
} {
  const knownById = new Map<string, { post: Post; isNew: boolean }>();
  const knownByUrl = new Map<string, { post: Post; isNew: boolean }>();
  const knownByBodyDate = new Map<string, { post: Post; isNew: boolean }>();
  const updatesById = new Map<string, Partial<PostRecordInput>>();

  const registerKnownPost = (post: Post, isNew: boolean) => {
    const known = { post, isNew };
    knownById.set(post.id, known);
    const urlKey = normalizeDuplicateUrl(post.url);
    if (urlKey && !knownByUrl.has(urlKey)) {
      knownByUrl.set(urlKey, known);
    }
    const bodyDateKey = getBodyDateDuplicateKey(post);
    if (bodyDateKey && !knownByBodyDate.has(bodyDateKey)) {
      knownByBodyDate.set(bodyDateKey, known);
    }
  };

  const findDuplicate = (post: Post) => {
    const idMatch = knownById.get(post.id);
    if (idMatch) return idMatch;

    const urlKey = normalizeDuplicateUrl(post.url);
    const urlMatch = urlKey ? knownByUrl.get(urlKey) : null;
    if (urlMatch) return urlMatch;

    const bodyDateKey = getBodyDateDuplicateKey(post);
    return bodyDateKey ? knownByBodyDate.get(bodyDateKey) : undefined;
  };

  latestPosts.forEach((post) => {
    registerKnownPost({ ...post, tags: [...post.tags] }, false);
  });

  const newPosts: Post[] = [];
  const conflicts: ImportConflict[] = [];
  let duplicateCount = 0;
  let mergedTagCount = 0;
  let conflictCount = 0;
  let skippedCount = 0;
  let overwrittenCount = 0;

  importedPosts.forEach((post, importedIndex) => {
    const importedPost: Post = {
      ...post,
      tags: uniqueTags(post.tags),
      imageBlob: undefined,
      imageBlobs: post.imageBlobs,
      thumbnailBlobs: post.thumbnailBlobs,
    };
    const duplicate = findDuplicate(importedPost);

    if (!duplicate) {
      newPosts.push(importedPost);
      registerKnownPost(importedPost, true);
      return;
    }

    duplicateCount += 1;
    const fields = getImportConflictFields(duplicate.post, importedPost);
    const conflictKey = buildImportConflictKey(duplicate.post, importedPost, importedIndex);
    const nextTags = uniqueTags([...duplicate.post.tags, ...importedPost.tags]);
    const hasTagMerge = !areStringListsEqual(duplicate.post.tags, nextTags);
    const shouldUseImported = fields.length > 0 && conflictChoices[conflictKey] === "use-imported";

    if (fields.length > 0) {
      conflictCount += 1;
      conflicts.push({
        key: conflictKey,
        importedIndex,
        fields,
        existing: duplicate.post,
        imported: importedPost,
        mergedTags: nextTags,
      });
    }

    if (!hasTagMerge && !shouldUseImported) {
      skippedCount += 1;
      return;
    }

    if (hasTagMerge) {
      duplicate.post.tags = nextTags;
      mergedTagCount += 1;
    }

    if (shouldUseImported) {
      duplicate.post.body = importedPost.body;
      duplicate.post.url = importedPost.url;
      duplicate.post.ogp = importedPost.ogp;
      duplicate.post.ogpFetch = importedPost.ogpFetch;
      overwrittenCount += 1;
    }

    if (!duplicate.isNew) {
      updatesById.set(duplicate.post.id, {
        ...(updatesById.get(duplicate.post.id) ?? {}),
        ...(hasTagMerge ? { tags: nextTags } : {}),
        ...(shouldUseImported
          ? {
              body: importedPost.body,
              url: importedPost.url,
              ogp: importedPost.ogp,
              ogpFetch: importedPost.ogpFetch,
            }
          : {}),
        source: duplicate.post.source,
      });
    }
  });

  return {
    preview: {
      addedCount: newPosts.length,
      duplicateCount,
      mergedTagCount,
      conflictCount,
      skippedCount,
      overwrittenCount,
      conflicts,
    },
    newPosts,
    updatesById,
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
  const [hiddenTags, setHiddenTagsState] = useState<string[]>(readHiddenTags);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isBooting, setIsBooting] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const loadPostsRequestIdRef = useRef(0);
  const latestAppliedRequestIdRef = useRef(0);
  const postsMutationVersionRef = useRef(0);
  const instanceIdRef = useRef<string | null>(null);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  const getInstanceId = useCallback(() => {
    instanceIdRef.current ??= `posts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return instanceIdRef.current;
  }, []);

  const applyCreatedPostFromAnotherInstance = useCallback(async (event: PostSyncEvent) => {
    if (event.sourceInstanceId === getInstanceId()) return;

    try {
      const created = await postsRepository.getById(event.postId);
      if (!created) return;

      postsMutationVersionRef.current += 1;
      setPosts((prev) => {
        const withoutDuplicate = prev.filter((post) => post.id !== created.id);
        return [created, ...withoutDuplicate];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync post");
    }
  }, [getInstanceId]);

  const broadcastCreatedPost = useCallback((postId: string) => {
    if (typeof window === "undefined") return;

    const event: PostSyncEvent = {
      kind: "created",
      postId,
      sourceInstanceId: getInstanceId(),
      createdAt: new Date().toISOString(),
    };

    try {
      syncChannelRef.current?.postMessage(event);
    } catch {}

    try {
      localStorage.setItem(POST_SYNC_EVENT_KEY, JSON.stringify(event));
    } catch {}
  }, [getInstanceId]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSyncEvent = (event: PostSyncEvent) => {
      if (event.kind === "created") {
        void applyCreatedPostFromAnotherInstance(event);
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== POST_SYNC_EVENT_KEY || !event.newValue) return;
      try {
        handleSyncEvent(JSON.parse(event.newValue) as PostSyncEvent);
      } catch {}
    };

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel(POST_SYNC_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<PostSyncEvent>) => handleSyncEvent(event.data);
      syncChannelRef.current = channel;
    }
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      if (syncChannelRef.current === channel) {
        syncChannelRef.current = null;
      }
      channel?.close();
    };
  }, [applyCreatedPostFromAnotherInstance]);

  // 投稿リストの読み込み
  const loadPosts = useCallback(async () => {
    const requestId = ++loadPostsRequestIdRef.current;
    const mutationVersionAtStart = postsMutationVersionRef.current;
    setError("");
    setIsBusy(true);
    try {
      const nextPosts = await postsRepository.list();
      const isLatestRequest = requestId >= latestAppliedRequestIdRef.current;
      const hasConcurrentMutation = postsMutationVersionRef.current !== mutationVersionAtStart;

      if (isLatestRequest && !hasConcurrentMutation) {
        latestAppliedRequestIdRef.current = requestId;
        setPosts(nextPosts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      if (requestId === loadPostsRequestIdRef.current) {
        setIsBusy(false);
      }
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

  const setHiddenTags = useCallback((nextTags: string[]) => {
    setHiddenTagsState(writeHiddenTags(nextTags));
  }, []);

  const toggleHiddenTag = useCallback((tag: string) => {
    setHiddenTagsState((current) => {
      const next = current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag];
      return writeHiddenTags(next);
    });
  }, []);

  // フィルタリング
  const activePosts = useMemo(() => posts.filter((post) => !post.trashedAt), [posts]);
  const trashedPosts = useMemo(
    () => posts.filter((post) => post.trashedAt).sort((left, right) => (right.trashedAt ?? "").localeCompare(left.trashedAt ?? "")),
    [posts],
  );

  const tabBasePosts = useMemo(() => {
    if (activeTab === "trash") return trashedPosts;

    switch (activeTab) {
      case "post":
        return activePosts.filter((p) =>
          p.type === "post" || (!hidePostedInSourceTabs && p.type === "posted" && (!p.postedFrom || p.postedFrom === "post")),
        );
      case "clip":
        return activePosts.filter((p) =>
          p.type === "clip" || (!hidePostedInSourceTabs && p.type === "posted" && (!p.postedFrom || p.postedFrom === "clip")),
        );
      case "posted": return activePosts.filter((p) => p.type === "posted");
      case "media": return activePosts.filter((p) => getMediaCount(p) > 0);
      default: return activePosts;
    }
  }, [activePosts, activeTab, hidePostedInSourceTabs, trashedPosts]);

  const tabFilteredPosts = useMemo(() => {
    if (hiddenTags.length === 0) return tabBasePosts;
    const hiddenTagSet = new Set(hiddenTags);
    return tabBasePosts.filter((post) => !post.tags.some((tag) => hiddenTagSet.has(tag)));
  }, [hiddenTags, tabBasePosts]);

  const availableTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    tabBasePosts.forEach((post) => {
      post.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      });
    });
    return Array.from(tagCounts.entries())
      .sort((a, b) => {
        const leftHidden = hiddenTags.includes(a[0]);
        const rightHidden = hiddenTags.includes(b[0]);
        if (leftHidden !== rightHidden) return leftHidden ? 1 : -1;
        return b[1] - a[1] || a[0].localeCompare(b[0], "ja");
      })
      .map(([name, count]) => ({ name, count, hidden: hiddenTags.includes(name) }));
  }, [hiddenTags, tabBasePosts]);

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
    if (activeTag && (!availableTags.some((tag) => tag.name === activeTag) || hiddenTags.includes(activeTag))) {
      const syncTimer = setTimeout(() => {
        setActiveTag(null);
      }, 0);
      return () => clearTimeout(syncTimer);
    }
  }, [activeTag, availableTags, hiddenTags]);

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
  const createPost = async (value: PostFormValue, options: CreatePostOptions = {}) => {
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
      const commitCreatedPost = () => {
        postsMutationVersionRef.current += 1;
        setPosts((prev) => [created, ...prev]);
        setStatusMessage("投稿を保存しました。");
      };
      if (options.commit === "sync") {
        flushSync(commitCreatedPost);
      } else {
        commitCreatedPost();
      }
      broadcastCreatedPost(created.id);
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
      postsMutationVersionRef.current += 1;
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
      postsMutationVersionRef.current += 1;
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

  const updatePostOgp = async (post: Post, ogp: OgpPreview | undefined, ogpFetch?: Post["ogpFetch"]) => {
    if (!post.url) return null;
    try {
      const updated = await postsRepository.update(
        post.id,
        {
          ogp,
          ogpFetch,
        },
        { touchUpdatedAt: false },
      );
      postsMutationVersionRef.current += 1;
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
      const currentPost = posts.find((post) => post.id === id);
      if (!currentPost) return false;
      if (currentPost.trashedAt) return true;

      const updated = await postsRepository.update(
        id,
        {
          trashedAt: new Date().toISOString(),
          source: currentPost.source,
        },
        { touchUpdatedAt: false },
      );
      postsMutationVersionRef.current += 1;
      setPosts((prev) => prev.map((post) => (post.id === id ? updated : post)));
      setStatusMessage("投稿をゴミ箱に移動しました。");
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
      postsMutationVersionRef.current += 1;
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

  const deletePostsByTag = async (tag: string) => {
    setIsBusy(true);
    try {
      const trashedAt = new Date().toISOString();
      const targetPosts = posts.filter((post) => !post.trashedAt && post.tags.includes(tag));
      const updatedPosts = await Promise.all(targetPosts.map((post) =>
        postsRepository.update(
          post.id,
          {
            trashedAt,
            source: post.source,
          },
          { touchUpdatedAt: false },
        ),
      ));
      postsMutationVersionRef.current += 1;
      const updatedById = new Map(updatedPosts.map((post) => [post.id, post]));
      setPosts((prev) => prev.map((post) => updatedById.get(post.id) ?? post));
      setStatusMessage(`${updatedPosts.length}件の投稿をゴミ箱に移動しました。`);
      return updatedPosts.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tagged posts");
      return 0;
    } finally {
      setIsBusy(false);
    }
  };

  const restorePost = async (id: string) => {
    setIsBusy(true);
    try {
      const currentPost = posts.find((post) => post.id === id);
      if (!currentPost) return false;

      const restored = await postsRepository.update(
        id,
        {
          trashedAt: undefined,
          source: currentPost.source,
        },
        { touchUpdatedAt: false },
      );
      postsMutationVersionRef.current += 1;
      setPosts((prev) => prev.map((post) => (post.id === id ? restored : post)));
      setStatusMessage("投稿を元に戻しました。");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore post");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const restoreAllTrashedPosts = async () => {
    setIsBusy(true);
    try {
      const targets = posts.filter((post) => post.trashedAt);
      const restoredPosts = await Promise.all(targets.map((post) =>
        postsRepository.update(
          post.id,
          {
            trashedAt: undefined,
            source: post.source,
          },
          { touchUpdatedAt: false },
        ),
      ));
      const restoredById = new Map(restoredPosts.map((post) => [post.id, post]));
      postsMutationVersionRef.current += 1;
      setPosts((prev) => prev.map((post) => restoredById.get(post.id) ?? post));
      setStatusMessage(`${restoredPosts.length}件の投稿を元に戻しました。`);
      return restoredPosts.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore trashed posts");
      return 0;
    } finally {
      setIsBusy(false);
    }
  };

  const emptyTrash = async () => {
    setIsBusy(true);
    try {
      const targets = posts.filter((post) => post.trashedAt);
      await Promise.all(targets.map((post) => postsRepository.delete(post.id)));
      const deletedIds = new Set(targets.map((post) => post.id));
      postsMutationVersionRef.current += 1;
      setPosts((prev) => prev.filter((post) => !deletedIds.has(post.id)));
      setStatusMessage(`${targets.length}件の投稿を完全に削除しました。`);
      return targets.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to empty trash");
      return 0;
    } finally {
      setIsBusy(false);
    }
  };

  const previewImportPosts = async (importedPosts: Post[]): Promise<ImportPostsPreview | null> => {
    try {
      const latestPosts = await postsRepository.list();
      return buildImportPlan(latestPosts, importedPosts).preview;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview import");
      return null;
    }
  };

  const importPosts = async (
    importedPosts: Post[],
    options: { conflictChoices?: Record<string, ImportConflictChoice> } = {},
  ): Promise<ImportPostsResult | null> => {
    setIsBusy(true);
    try {
      const latestPosts = await postsRepository.list();
      const plan = buildImportPlan(latestPosts, importedPosts, options.conflictChoices);
      const updatedPosts = await Promise.all(Array.from(plan.updatesById.entries()).map(([postId, input]) =>
        postsRepository.update(
          postId,
          input,
          { touchUpdatedAt: false },
        ),
      ));
      await postsRepository.importMany(plan.newPosts);

      const nextPosts = await postsRepository.list();
      const updatedById = new Map(updatedPosts.map((post) => [post.id, post]));
      postsMutationVersionRef.current += 1;
      setPosts(nextPosts.map((post) => updatedById.get(post.id) ?? post));
      setStatusMessage(`${plan.preview.addedCount}件の投稿を復元しました。`);

      return plan.preview;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import posts");
      return null;
    } finally {
      setIsBusy(false);
    }
  };

  return {
    posts,
    activePosts,
    trashedPosts,
    visiblePosts,
    hidePostedInSourceTabs,
    setHidePostedInSourceTabs,
    hiddenTags,
    setHiddenTags,
    toggleHiddenTag,
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
    deletePostsByTag,
    deletePost,
    restorePost,
    restoreAllTrashedPosts,
    emptyTrash,
    previewImportPosts,
    importPosts,
    fromPost,
    emptyForm,
    buildTweetText: (post: Post) => {
      const tagText = post.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");
      return [post.body, post.url, tagText].filter(Boolean).join("\n");
    }
  };
}
