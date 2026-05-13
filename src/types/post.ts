export type PostType = "post" | "clip" | "posted";
export type PostSource = "manual" | "share" | "web" | "x";
export type TimelineFilter = "all" | "post" | "clip" | "posted" | "media" | "trash";
export type PostMediaKind = "image" | "video";
export type PostMediaStorage = "device-reference" | "app-local-copy";

export type PostMediaRef = {
  id: string;
  kind: PostMediaKind;
  storage: PostMediaStorage;
  uri: string;
  mimeType?: string;
  name?: string;
};

export type PostMediaOrderItem = {
  source: "imageBlob" | "mediaRef";
  id: string;
};

export type OgpPreview = {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
};

export type OgpFetchStatus = "pending" | "complete" | "exhausted";

export type OgpFetchState = {
  attemptCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: string | null;
  status?: OgpFetchStatus;
};

export type Post = {
  id: string;
  type: PostType;
  postedFrom?: Exclude<PostType, "posted">;
  body: string;
  url?: string;
  ogp?: OgpPreview;
  ogpFetch?: OgpFetchState;
  imageBlob?: Blob;
  imageBlobs?: Blob[];
  imageBlobIds?: string[];
  thumbnailBlobs?: Blob[];
  mediaRefs?: PostMediaRef[];
  mediaOrder?: PostMediaOrderItem[];
  tags: string[];
  source: PostSource;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string;
};

export type PostRecordInput = Omit<Post, "id" | "createdAt" | "updatedAt">;
