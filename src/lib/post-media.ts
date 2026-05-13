import type { Post, PostMediaOrderItem, PostMediaRef, SplitPostData } from "@/types/post";

type MediaOrderInput = {
  imageBlobs?: Blob[];
  imageBlobIds?: string[];
  mediaRefs?: PostMediaRef[];
  mediaOrder?: PostMediaOrderItem[];
};

type DefinedPostMediaBundle = {
  [Key in keyof SplitPostData["media"]]?: Exclude<SplitPostData["media"][Key], undefined>;
};

export function createImageBlobId() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return `image-${globalThis.crypto.randomUUID()}`;
  }

  return `image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeImageBlobIds(imageBlobs?: Blob[], imageBlobIds?: string[]) {
  if (!imageBlobs || imageBlobs.length === 0) {
    return undefined;
  }

  const nextIds = [...(imageBlobIds ?? [])];
  while (nextIds.length < imageBlobs.length) {
    nextIds.push(createImageBlobId());
  }

  return nextIds.slice(0, imageBlobs.length);
}

export function buildDefaultMediaOrder(imageBlobIds?: string[], mediaRefs?: PostMediaRef[]) {
  const nextOrder: PostMediaOrderItem[] = [];

  (imageBlobIds ?? []).forEach((id) => {
    nextOrder.push({ source: "imageBlob", id });
  });

  (mediaRefs ?? []).forEach((mediaRef) => {
    nextOrder.push({ source: "mediaRef", id: mediaRef.id });
  });

  return nextOrder;
}

export function normalizeMediaOrder({
  imageBlobs,
  imageBlobIds,
  mediaRefs,
  mediaOrder,
}: MediaOrderInput) {
  const nextImageIds = normalizeImageBlobIds(imageBlobs, imageBlobIds);
  const defaultOrder = buildDefaultMediaOrder(nextImageIds, mediaRefs);
  const validKeys = new Set(defaultOrder.map((item) => `${item.source}:${item.id}`));
  const consumedKeys = new Set<string>();
  const nextOrder: PostMediaOrderItem[] = [];

  (mediaOrder ?? []).forEach((item) => {
    const key = `${item.source}:${item.id}`;
    if (!validKeys.has(key) || consumedKeys.has(key)) {
      return;
    }
    consumedKeys.add(key);
    nextOrder.push(item);
  });

  defaultOrder.forEach((item) => {
    const key = `${item.source}:${item.id}`;
    if (consumedKeys.has(key)) {
      return;
    }
    consumedKeys.add(key);
    nextOrder.push(item);
  });

  return nextOrder.length > 0 ? nextOrder : undefined;
}

export function moveMediaOrderItem(
  mediaOrder: PostMediaOrderItem[] | undefined,
  draggedId: string,
  targetId: string,
) {
  if (!mediaOrder || draggedId === targetId) {
    return mediaOrder;
  }

  const fromIndex = mediaOrder.findIndex((item) => `${item.source}:${item.id}` === draggedId);
  const toIndex = mediaOrder.findIndex((item) => `${item.source}:${item.id}` === targetId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return mediaOrder;
  }

  const nextOrder = [...mediaOrder];
  const [movedItem] = nextOrder.splice(fromIndex, 1);
  nextOrder.splice(toIndex, 0, movedItem);
  return nextOrder;
}

export function splitPostData(post: Post): SplitPostData {
  const {
    imageBlob,
    imageBlobs,
    imageBlobIds,
    thumbnailBlobs,
    mediaRefs,
    mediaOrder,
    ...metadata
  } = post;

  return {
    metadata,
    media: {
      imageBlob,
      imageBlobs,
      imageBlobIds,
      thumbnailBlobs,
      mediaRefs,
      mediaOrder,
    },
  };
}

export function combinePostData({ metadata, media }: SplitPostData): Post {
  return {
    ...metadata,
    ...omitUndefinedMedia(media),
  };
}

function omitUndefinedMedia(media: SplitPostData["media"]): DefinedPostMediaBundle {
  return Object.fromEntries(
    Object.entries(media).filter(([, value]) => value !== undefined),
  ) as DefinedPostMediaBundle;
}
