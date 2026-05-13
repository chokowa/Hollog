import assert from "node:assert/strict";

import { buildHollogBackupFilename, createHollogBackup, parseHollogBackup, stringifyHollogBackup, type HollogBackupSettings } from "@/lib/hollog-backup";
import { readHiddenTags, writeHiddenTags } from "@/lib/hidden-tags";
import { buildDefaultMediaOrder, combinePostData, moveMediaOrderItem, normalizeImageBlobIds, normalizeMediaOrder, splitPostData } from "@/lib/post-media";
import { buildNextOgpFetchState, canAutoRetryOgp, isOgpIncomplete, mergeOgpPreview, resetOgpFetchState } from "@/lib/post-ogp";
import { readPostCardSectionOrder, writePostCardSectionOrder } from "@/lib/post-card-layout";
import { samplePosts } from "@/lib/sample-posts";
import { getSystemTagsForUrl, getVisibleTagSuggestions, readSystemTaggingEnabled, readTagSuggestionCatalog, uniqueTags, uniqueTagSuggestions, writeSystemTaggingEnabled, writeTagSuggestionCatalog } from "@/lib/tag-suggestions";
import type { OgpPreview, Post, PostMediaOrderItem, PostMediaRef, PostRecordInput, TimelineFilter } from "@/types/post";

type SimulationRecordInput = Omit<PostRecordInput, "source">;

type PostFormValue = {
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

type ImportPostsResult = {
  addedCount: number;
  duplicateCount: number;
  mergedTagCount: number;
  conflictCount: number;
  skippedCount: number;
  overwrittenCount: number;
};

type ImportConflictChoice = "keep-existing" | "use-imported";
type ImportConflictField = "body" | "url" | "ogp";

type ImportConflict = {
  key: string;
  importedIndex: number;
  fields: ImportConflictField[];
  existing: Post;
  imported: Post;
  mergedTags: string[];
};

type ImportPostsPreview = ImportPostsResult & {
  conflicts: ImportConflict[];
};

type TimelineQuery = {
  activeTab: TimelineFilter;
  hidePostedInSourceTabs: boolean;
  hiddenTags?: string[];
  activeTag?: string | null;
  searchQuery?: string;
};

type SimulationResult = {
  scenarioCount: number;
  postCount: number;
  scenarioNames: string[];
};

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }
}

function installWindowMock() {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage },
  });
}

function createPostId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clonePost(post: Post): Post {
  return {
    ...post,
    tags: [...post.tags],
    imageBlobs: post.imageBlobs ? [...post.imageBlobs] : undefined,
    imageBlobIds: post.imageBlobIds ? [...post.imageBlobIds] : undefined,
    thumbnailBlobs: post.thumbnailBlobs ? [...post.thumbnailBlobs] : undefined,
    mediaRefs: post.mediaRefs ? post.mediaRefs.map((mediaRef) => ({ ...mediaRef })) : undefined,
    mediaOrder: post.mediaOrder ? post.mediaOrder.map((item) => ({ ...item })) : undefined,
  };
}

function toRecordInput(value: PostFormValue): SimulationRecordInput {
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
    tags: value.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

function fromPost(post: Post): PostFormValue {
  return {
    type: post.type,
    postedFrom: post.postedFrom,
    body: post.body,
    url: post.url ?? "",
    ogp: post.ogp,
    tagsText: post.tags.join(", "),
    imageBlobs: post.imageBlobs,
    imageBlobIds: post.imageBlobIds,
    mediaRefs: post.mediaRefs,
    mediaOrder: post.mediaOrder,
    thumbnailBlobs: post.thumbnailBlobs,
  };
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
  const date = post.createdAt.slice(0, 10);
  return body && date ? `${body}\n${date}` : "";
}

function areStringListsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getImportConflictFields(existing: Post, imported: Post): ImportConflictField[] {
  const fields: ImportConflictField[] = [];
  if (normalizeDuplicateText(existing.body) !== normalizeDuplicateText(imported.body)) fields.push("body");
  if (normalizeDuplicateUrl(existing.url) !== normalizeDuplicateUrl(imported.url)) fields.push("url");
  if (JSON.stringify(existing.ogp ?? null) !== JSON.stringify(imported.ogp ?? null)) fields.push("ogp");
  return fields;
}

function buildImportConflictKey(existing: Post, imported: Post, importedIndex: number) {
  return `${existing.id}\n${imported.id}\n${importedIndex}`;
}

function buildImportPlan(
  latestPosts: Post[],
  importedPosts: Post[],
  conflictChoices: Record<string, ImportConflictChoice> = {},
) {
  const knownById = new Map<string, { post: Post; isNew: boolean }>();
  const knownByUrl = new Map<string, { post: Post; isNew: boolean }>();
  const knownByBodyDate = new Map<string, { post: Post; isNew: boolean }>();
  const updatesById = new Map<string, Partial<PostRecordInput>>();

  const registerKnownPost = (post: Post, isNew: boolean) => {
    const known = { post, isNew };
    knownById.set(post.id, known);
    const urlKey = normalizeDuplicateUrl(post.url);
    if (urlKey && !knownByUrl.has(urlKey)) knownByUrl.set(urlKey, known);
    const bodyDateKey = getBodyDateDuplicateKey(post);
    if (bodyDateKey && !knownByBodyDate.has(bodyDateKey)) knownByBodyDate.set(bodyDateKey, known);
  };

  const findDuplicate = (post: Post) => {
    const idMatch = knownById.get(post.id);
    if (idMatch) return idMatch;
    const urlKey = normalizeDuplicateUrl(post.url);
    const urlMatch = urlKey ? knownByUrl.get(urlKey) : undefined;
    if (urlMatch) return urlMatch;
    const bodyDateKey = getBodyDateDuplicateKey(post);
    return bodyDateKey ? knownByBodyDate.get(bodyDateKey) : undefined;
  };

  latestPosts.forEach((post) => registerKnownPost(clonePost(post), false));

  const newPosts: Post[] = [];
  const conflicts: ImportConflict[] = [];
  let duplicateCount = 0;
  let mergedTagCount = 0;
  let conflictCount = 0;
  let skippedCount = 0;
  let overwrittenCount = 0;

  importedPosts.forEach((post, importedIndex) => {
    const importedPost = clonePost({ ...post, tags: uniqueTags(post.tags) });
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
        existing: clonePost(duplicate.post),
        imported: clonePost(importedPost),
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

  const preview: ImportPostsPreview = {
    addedCount: newPosts.length,
    duplicateCount,
    mergedTagCount,
    conflictCount,
    skippedCount,
    overwrittenCount,
    conflicts,
  };

  return { preview, newPosts, updatesById };
}

function filterPosts(posts: Post[], query: TimelineQuery) {
  const activePosts = posts.filter((post) => !post.trashedAt);
  const trashedPosts = posts.filter((post) => post.trashedAt);

  const tabBasePosts = (() => {
    if (query.activeTab === "trash") return trashedPosts;
    switch (query.activeTab) {
      case "post":
        return activePosts.filter((post) =>
          post.type === "post" || (!query.hidePostedInSourceTabs && post.type === "posted" && (!post.postedFrom || post.postedFrom === "post")),
        );
      case "clip":
        return activePosts.filter((post) =>
          post.type === "clip" || (!query.hidePostedInSourceTabs && post.type === "posted" && (!post.postedFrom || post.postedFrom === "clip")),
        );
      case "posted":
        return activePosts.filter((post) => post.type === "posted");
      case "media":
        return activePosts.filter((post) => (post.imageBlobs?.length ?? 0) + (post.mediaRefs?.length ?? 0) > 0);
      default:
        return activePosts;
    }
  })();

  const hiddenTagSet = new Set(query.hiddenTags ?? []);
  const tabFilteredPosts = hiddenTagSet.size > 0
    ? tabBasePosts.filter((post) => !post.tags.some((tag) => hiddenTagSet.has(tag)))
    : tabBasePosts;
  const activeTag = query.activeTag ?? null;
  const tagFilteredPosts = activeTag
    ? tabFilteredPosts.filter((post) => post.tags.includes(activeTag))
    : tabFilteredPosts;
  const normalizedQuery = query.searchQuery?.trim().toLowerCase() ?? "";

  if (!normalizedQuery) return tagFilteredPosts;

  return tagFilteredPosts.filter((post) => {
    const searchableText = [
      post.body,
      post.url ?? "",
      post.ogp?.title ?? "",
      post.ogp?.description ?? "",
      post.ogp?.siteName ?? "",
      ...post.tags,
    ].join(" ").toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}

class SimulationHarness {
  posts: Post[];

  constructor(initialPosts: Post[]) {
    this.posts = initialPosts.map(clonePost);
  }

  list() {
    return this.posts.map(clonePost);
  }

  find(id: string) {
    const post = this.posts.find((item) => item.id === id);
    assert.ok(post, `Post not found: ${id}`);
    return post;
  }

  create(value: PostFormValue, source: Post["source"] = "manual") {
    const now = new Date().toISOString();
    const recordInput = toRecordInput(value);
    const created: Post = {
      ...recordInput,
      id: createPostId(),
      source,
      createdAt: now,
      updatedAt: now,
    };
    this.posts.unshift(created);
    return clonePost(created);
  }

  update(id: string, value: PostFormValue) {
    const current = this.find(id);
    const recordInput = toRecordInput(value);
    Object.assign(current, recordInput, { updatedAt: new Date().toISOString() });
    return clonePost(current);
  }

  updateStatus(id: string, nextType: Post["type"], postedFrom?: Post["postedFrom"]) {
    const current = this.find(id);
    current.type = nextType;
    current.postedFrom = postedFrom;
    return clonePost(current);
  }

  delete(id: string) {
    this.find(id).trashedAt = new Date().toISOString();
  }

  restore(id: string) {
    this.find(id).trashedAt = undefined;
  }

  restoreAllTrashed() {
    this.posts.forEach((post) => {
      post.trashedAt = undefined;
    });
  }

  bulkUpdateTags(postIds: string[], tags: string[], mode: "append" | "replace") {
    const normalizedTags = uniqueTags(tags);
    postIds.forEach((postId) => {
      const current = this.find(postId);
      current.tags = mode === "append" ? uniqueTags([...current.tags, ...normalizedTags]) : normalizedTags;
    });
  }

  deletePostsByTag(tag: string) {
    this.posts.forEach((post) => {
      if (!post.trashedAt && post.tags.includes(tag)) {
        post.trashedAt = new Date().toISOString();
      }
    });
  }

  previewImport(importedPosts: Post[]) {
    return buildImportPlan(this.list(), importedPosts).preview;
  }

  importPosts(importedPosts: Post[], conflictChoices: Record<string, ImportConflictChoice> = {}) {
    const plan = buildImportPlan(this.list(), importedPosts, conflictChoices);
    plan.updatesById.forEach((input, postId) => {
      Object.assign(this.find(postId), input);
    });
    plan.newPosts.forEach((post) => {
      this.posts.unshift(clonePost(post));
    });
    return plan.preview;
  }

  visiblePosts(query: TimelineQuery) {
    return filterPosts(this.list(), query);
  }
}

function createSampleBlob(label: string, type = "image/png") {
  return new Blob([label], { type });
}

function createMediaRef(id: string, uri: string): PostMediaRef {
  return {
    id,
    kind: "image",
    storage: "app-local-copy",
    uri,
    mimeType: "image/jpeg",
    name: `${id}.jpg`,
  };
}

function createBackupSettings(): HollogBackupSettings {
  return {
    themeMode: "dark",
    hidePostedInSourceTabs: true,
    hiddenTags: ["secret"],
    systemTaggingEnabled: true,
    tagSuggestions: uniqueTagSuggestions([
      { name: "idea", isSystem: false },
      { name: "GitHub", isSystem: true },
    ]),
    postCardSectionOrder: ["media", "body", "url", "preview", "meta"],
  };
}

export async function runAppSimulation(): Promise<SimulationResult> {
  installWindowMock();

  const harness = new SimulationHarness(samplePosts);
  const scenarioNames: string[] = [];
  const scenario = async (name: string, run: () => void | Promise<void>) => {
    scenarioNames.push(name);
    await run();
  };

  await scenario("create and normalize manual post", () => {
    const created = harness.create({
      type: "post",
      body: "  draft body  ",
      url: " https://example.com/new ",
      ogp: { title: "Title" },
      tagsText: "alpha, beta, alpha",
    });
    assert.equal(created.body, "draft body");
    assert.equal(created.url, "https://example.com/new");
    assert.deepEqual(created.tags, ["alpha", "beta", "alpha"]);
    const updated = harness.update(created.id, { ...fromPost(created), tagsText: "alpha, gamma" });
    assert.deepEqual(updated.tags, ["alpha", "gamma"]);
  });

  await scenario("media ordering and clip branch", () => {
    const firstBlob = createSampleBlob("first");
    const secondBlob = createSampleBlob("second");
    const imageBlobIds = normalizeImageBlobIds([firstBlob, secondBlob]);
    assert.ok(imageBlobIds);
    const mediaRefs = [createMediaRef("ref-1", "file:///ref-1.jpg")];
    const defaultOrder = buildDefaultMediaOrder(imageBlobIds, mediaRefs);
    const movedOrder = moveMediaOrderItem(defaultOrder, `mediaRef:${mediaRefs[0].id}`, `imageBlob:${imageBlobIds?.[0]}`);
    assert.ok(movedOrder);
    assert.equal(movedOrder?.[0].source, "mediaRef");

    const created = harness.create({
      type: "clip",
      body: "clip with media",
      url: "",
      tagsText: "media",
      imageBlobs: [firstBlob, secondBlob],
      imageBlobIds,
      mediaRefs,
      mediaOrder: movedOrder,
    });
    assert.equal(created.type, "clip");
    assert.equal(created.mediaOrder?.[0].source, "mediaRef");
  });

  await scenario("post metadata and media split round trip", () => {
    const imageBlob = createSampleBlob("legacy");
    const firstBlob = createSampleBlob("first");
    const secondBlob = createSampleBlob("second");
    const thumbnailBlobs = [createSampleBlob("thumb-1"), createSampleBlob("thumb-2")];
    const mediaRefs = [
      createMediaRef("ref-a", "file:///ref-a.jpg"),
      createMediaRef("ref-b", "content://media/ref-b.jpg"),
    ];
    const post: Post = {
      id: "split-post",
      type: "posted",
      postedFrom: "clip",
      body: "body with media",
      url: "https://example.com/split",
      ogp: {
        title: "Split title",
        description: "Split description",
        image: "https://example.com/ogp.jpg",
        siteName: "Example",
      },
      ogpFetch: {
        attemptCount: 2,
        lastAttemptAt: "2026-05-13T01:00:00.000Z",
        nextRetryAt: null,
        status: "complete",
      },
      imageBlob,
      imageBlobs: [firstBlob, secondBlob],
      imageBlobIds: ["blob-1", "blob-2"],
      thumbnailBlobs,
      mediaRefs,
      mediaOrder: [
        { source: "mediaRef", id: "ref-b" },
        { source: "imageBlob", id: "blob-2" },
        { source: "mediaRef", id: "ref-a" },
        { source: "imageBlob", id: "blob-1" },
      ],
      tags: ["tag-a", "tag-b"],
      source: "share",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T02:00:00.000Z",
      trashedAt: "2026-05-13T03:00:00.000Z",
    };

    const split = splitPostData(post);
    assert.equal("imageBlobs" in split.metadata, false);
    assert.equal("thumbnailBlobs" in split.metadata, false);
    assert.equal(split.metadata.url, post.url);
    assert.deepEqual(split.metadata.ogp, post.ogp);
    assert.deepEqual(split.metadata.tags, post.tags);
    assert.equal(split.metadata.createdAt, post.createdAt);
    assert.equal(split.metadata.updatedAt, post.updatedAt);
    assert.equal(split.media.imageBlob, imageBlob);
    assert.deepEqual(split.media.imageBlobs, post.imageBlobs);
    assert.deepEqual(split.media.imageBlobIds, post.imageBlobIds);
    assert.deepEqual(split.media.thumbnailBlobs, thumbnailBlobs);
    assert.deepEqual(split.media.mediaRefs, mediaRefs);
    assert.deepEqual(split.media.mediaOrder, post.mediaOrder);
    assert.deepEqual(combinePostData(split), post);

    const textOnlyPost: Post = {
      id: "split-text-only-post",
      type: "post",
      body: "text only",
      tags: ["note"],
      source: "manual",
      createdAt: "2026-05-13T04:00:00.000Z",
      updatedAt: "2026-05-13T04:10:00.000Z",
    };
    const restoredTextOnlyPost = combinePostData(splitPostData(textOnlyPost));
    assert.deepEqual(restoredTextOnlyPost, textOnlyPost);
    assert.equal("imageBlob" in restoredTextOnlyPost, false);
    assert.equal("imageBlobs" in restoredTextOnlyPost, false);
    assert.equal("imageBlobIds" in restoredTextOnlyPost, false);
    assert.equal("thumbnailBlobs" in restoredTextOnlyPost, false);
    assert.equal("mediaRefs" in restoredTextOnlyPost, false);
    assert.equal("mediaOrder" in restoredTextOnlyPost, false);
  });

  await scenario("posted transitions and trash lifecycle", () => {
    const target = harness.list().find((post) => post.type === "post");
    assert.ok(target);
    harness.updateStatus(target.id, "posted", "post");
    assert.equal(harness.find(target.id).type, "posted");
    harness.delete(target.id);
    assert.ok(harness.find(target.id).trashedAt);
    harness.restore(target.id);
    assert.equal(harness.find(target.id).trashedAt, undefined);
    harness.delete(target.id);
    assert.equal(harness.visiblePosts({ activeTab: "trash", hidePostedInSourceTabs: false }).some((post) => post.id === target.id), true);
    harness.restoreAllTrashed();
    assert.equal(harness.visiblePosts({ activeTab: "trash", hidePostedInSourceTabs: false }).length, 0);
  });

  await scenario("bulk tag operations and delete-by-tag", () => {
    const current = harness.list().slice(0, 2);
    harness.bulkUpdateTags(current.map((post) => post.id), ["bulk", "shared"], "append");
    current.forEach((post) => {
      assert.equal(harness.find(post.id).tags.includes("bulk"), true);
    });
    harness.bulkUpdateTags([current[0].id], ["replaced"], "replace");
    assert.deepEqual(harness.find(current[0].id).tags, ["replaced"]);
    harness.deletePostsByTag("bulk");
    assert.equal(harness.visiblePosts({ activeTab: "trash", hidePostedInSourceTabs: false }).length >= 1, true);
  });

  await scenario("timeline filtering branches", () => {
    const all = harness.visiblePosts({ activeTab: "all", hidePostedInSourceTabs: false });
    const postsOnly = harness.visiblePosts({ activeTab: "post", hidePostedInSourceTabs: false });
    const clipsOnly = harness.visiblePosts({ activeTab: "clip", hidePostedInSourceTabs: false });
    const postedOnly = harness.visiblePosts({ activeTab: "posted", hidePostedInSourceTabs: true });
    const mediaOnly = harness.visiblePosts({ activeTab: "media", hidePostedInSourceTabs: false });
    const search = harness.visiblePosts({ activeTab: "all", hidePostedInSourceTabs: false, searchQuery: "cafe" });
    const hidden = harness.visiblePosts({ activeTab: "all", hidePostedInSourceTabs: false, hiddenTags: ["memo"] });
    assert.equal(all.length >= postsOnly.length, true);
    assert.equal(clipsOnly.every((post) => post.type === "clip" || post.type === "posted"), true);
    assert.equal(postedOnly.every((post) => post.type === "posted"), true);
    assert.equal(mediaOnly.length >= 1, true);
    assert.equal(search.some((post) => post.body.includes("喫茶店")), true);
    assert.equal(hidden.every((post) => !post.tags.includes("memo")), true);
  });

  await scenario("import preview and conflict resolution", () => {
    const existing = harness.list().find((post) => Boolean(post.url));
    assert.ok(existing);
    const incoming: Post[] = [
      {
        ...clonePost(existing),
        id: `import-${existing.id}`,
        body: `${existing.body} updated`,
        url: existing.url,
        tags: uniqueTags([...existing.tags, "imported"]),
      },
      {
        id: "new-import-post",
        type: "clip",
        body: "fresh import",
        tags: ["archive"],
        source: "share",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const preview = harness.previewImport(incoming);
    assert.equal(preview.addedCount, 1);
    assert.equal(preview.conflictCount, 1);
    assert.equal(preview.conflicts[0]?.fields.includes("body"), true);

    const result = harness.importPosts(incoming, {
      [preview.conflicts[0].key]: "use-imported",
    });
    assert.equal(result.addedCount, 1);
    assert.equal(result.overwrittenCount, 1);
    assert.equal(harness.list().some((post) => post.id === "new-import-post"), true);
    assert.equal(harness.find(existing.id).tags.includes("imported"), true);
  });

  await scenario("backup export and import parsing", () => {
    const settings = createBackupSettings();
    const backup = createHollogBackup(harness.list(), settings);
    const parsed = parseHollogBackup(JSON.parse(stringifyHollogBackup(backup)));
    assert.equal(parsed.posts.length, harness.list().length);
    assert.deepEqual(parsed.backup.settings.postCardSectionOrder, settings.postCardSectionOrder);
    assert.equal(buildHollogBackupFilename(new Date("2026-05-13T00:00:00.000Z")).startsWith("hollog-backup-2026-05-13T00-00-00"), true);
  });

  await scenario("settings helpers using storage", () => {
    assert.deepEqual(writeHiddenTags([" alpha ", "beta", "alpha"]), ["alpha", "beta"]);
    assert.deepEqual(readHiddenTags(), ["alpha", "beta"]);
    assert.deepEqual(writePostCardSectionOrder(["body", "url", "preview", "meta", "media"]), ["body", "url", "preview", "meta", "media"]);
    assert.deepEqual(readPostCardSectionOrder(), ["body", "url", "preview", "meta", "media"]);

    const tagCatalog = writeTagSuggestionCatalog([
      { name: "idea", isSystem: false },
      { name: "#idea", isSystem: false },
      { name: "GitHub", isSystem: true },
    ]);
    assert.equal(tagCatalog.length, 2);
    assert.equal(readTagSuggestionCatalog().some((tag) => tag.name === "GitHub" && tag.isSystem), true);
    assert.equal(readSystemTaggingEnabled(), true);
    assert.equal(writeSystemTaggingEnabled(false), false);
    assert.equal(readSystemTaggingEnabled(), false);
    assert.deepEqual(getSystemTagsForUrl("https://github.com/example/repo"), ["GitHub"]);
    assert.deepEqual(getVisibleTagSuggestions(tagCatalog, "git", []), ["GitHub"]);
  });

  await scenario("ogp retry helpers", () => {
    const post = {
      url: "https://example.com/ogp",
      ogp: { title: "Only title" },
      ogpFetch: resetOgpFetchState(),
    };
    assert.equal(isOgpIncomplete(post), true);
    assert.equal(canAutoRetryOgp(post), true);
    const merged = mergeOgpPreview(post.ogp, { image: "https://example.com/image.png", siteName: "Example" });
    assert.equal(merged?.image, "https://example.com/image.png");
    const completed = buildNextOgpFetchState(post, merged, new Date("2026-05-13T00:00:00.000Z"));
    assert.equal(completed.status, "complete");

    const pendingState = buildNextOgpFetchState(post, { title: "Still partial" }, new Date("2026-05-13T00:00:00.000Z"));
    assert.equal(pendingState.status, "pending");
    const exhaustedState = buildNextOgpFetchState(
      { ...post, ogpFetch: { attemptCount: 2, status: "pending", nextRetryAt: null } },
      { title: "Still partial" },
      new Date("2026-05-13T00:01:00.000Z"),
    );
    assert.equal(exhaustedState.status, "exhausted");
  });

  return {
    scenarioCount: scenarioNames.length,
    postCount: harness.list().length,
    scenarioNames,
  };
}
