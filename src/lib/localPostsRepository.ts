import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { samplePosts } from "@/lib/sample-posts";
import type { PostsRepository } from "@/lib/postsRepository";
import type { Post } from "@/types/post";

const DB_NAME = "bocchisns-local-db";
const DB_VERSION = 3;
const POSTS_STORE_NAME = "posts";
const META_STORE_NAME = "meta";
const SEEDED_KEY = "sample-seeded";

interface BocchiSnsDb extends DBSchema {
  posts: {
    key: string;
    value: Post;
  };
  meta: {
    key: string;
    value: boolean;
  };
}

let dbPromise: Promise<IDBPDatabase<BocchiSnsDb>> | null = null;

type LegacyPost = Partial<Post> & {
  status?: "private" | "ready_to_post" | "archived";
  type?: "draft" | "saved" | "post" | "clip" | "posted";
  source?: Post["source"];
  imageBlobs?: Blob[];
  thumbnailBlobs?: Blob[];
  postedFrom?: Post["postedFrom"];
};

function createPostId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `post-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDatabase() {
  if (!dbPromise) {
    dbPromise = openDB<BocchiSnsDb>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (!database.objectStoreNames.contains(POSTS_STORE_NAME)) {
          database.createObjectStore(POSTS_STORE_NAME, { keyPath: "id" });
        }

        if (!database.objectStoreNames.contains(META_STORE_NAME)) {
          database.createObjectStore(META_STORE_NAME);
        }

        if (oldVersion === 0) {
          transaction.objectStore(META_STORE_NAME).put(false, SEEDED_KEY);
          return;
        }

        if (oldVersion < 2) {
          transaction.objectStore(META_STORE_NAME).put(true, SEEDED_KEY);
        }

        if (oldVersion < 3) {
          transaction.objectStore(META_STORE_NAME).put(true, SEEDED_KEY);
        }
      },
    });
  }

  return dbPromise;
}

function normalizePost(rawPost: LegacyPost): Post {
  const nextType =
    rawPost.type === "post" || rawPost.type === "clip" || rawPost.type === "posted"
      ? rawPost.type
      : rawPost.type === "draft"
        ? "post"
        : rawPost.status === "ready_to_post" || rawPost.source === "x"
          ? "posted"
          : "clip";

  return {
    id: rawPost.id ?? createPostId(),
    type: nextType,
    postedFrom: rawPost.postedFrom,
    body: rawPost.body ?? "",
    url: rawPost.url ?? undefined,
    ogp: rawPost.ogp,
    imageBlob: rawPost.imageBlob,
    imageBlobs: Array.isArray(rawPost.imageBlobs) ? rawPost.imageBlobs : (rawPost.imageBlob ? [rawPost.imageBlob] : []),
    thumbnailBlobs: Array.isArray(rawPost.thumbnailBlobs) ? rawPost.thumbnailBlobs : undefined,
    tags: Array.isArray(rawPost.tags) ? rawPost.tags : [],
    source: rawPost.source ?? "manual",
    createdAt: rawPost.createdAt ?? new Date().toISOString(),
    updatedAt: rawPost.updatedAt ?? rawPost.createdAt ?? new Date().toISOString(),
  };
}

async function ensureSeedData() {
  const database = await getDatabase();
  const hasSeeded = await database.get(META_STORE_NAME, SEEDED_KEY);
  if (hasSeeded) {
    return database;
  }

  const transaction = database.transaction([POSTS_STORE_NAME, META_STORE_NAME], "readwrite");
  const postsStore = transaction.objectStore(POSTS_STORE_NAME);
  const metaStore = transaction.objectStore(META_STORE_NAME);
  await Promise.all(samplePosts.map((post) => postsStore.put(post)));
  await metaStore.put(true, SEEDED_KEY);
  await transaction.done;
  return database;
}

function sortPosts(posts: Post[]) {
  return posts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export const localPostsRepository: PostsRepository = {
  async list() {
    const database = await ensureSeedData();
    const posts = (await database.getAll(POSTS_STORE_NAME)).map((post) =>
      normalizePost(post as LegacyPost),
    );
    return sortPosts(posts);
  },

  async getById(id) {
    const database = await ensureSeedData();
    const post = await database.get(POSTS_STORE_NAME, id);
    return post ? normalizePost(post as LegacyPost) : null;
  },

  async create(input) {
    const database = await ensureSeedData();
    const now = new Date().toISOString();
    const post: Post = {
      ...input,
      id: createPostId(),
      createdAt: now,
      updatedAt: now,
    };

    await database.put(POSTS_STORE_NAME, post);
    return post;
  },

  async update(id, input, options) {
    const database = await ensureSeedData();
    const current = await database.get(POSTS_STORE_NAME, id);

    if (!current) {
      throw new Error("Post not found");
    }

    const normalizedCurrent = normalizePost(current as LegacyPost);
    const nextPost: Post = {
      ...normalizedCurrent,
      ...input,
      updatedAt: options?.touchUpdatedAt === false
        ? normalizedCurrent.updatedAt
        : new Date().toISOString(),
    };

    await database.put(POSTS_STORE_NAME, nextPost);
    return nextPost;
  },

  async updateOgp(id, ogp) {
    const database = await ensureSeedData();
    const current = await database.get(POSTS_STORE_NAME, id);

    if (!current) {
      throw new Error("Post not found");
    }

    const nextPost: Post = {
      ...normalizePost(current as LegacyPost),
      ogp,
    };

    await database.put(POSTS_STORE_NAME, nextPost);
    return nextPost;
  },

  async delete(id) {
    const database = await ensureSeedData();
    await database.delete(POSTS_STORE_NAME, id);
  },
};
