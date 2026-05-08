export type PostType = "post" | "clip" | "posted";
export type PostSource = "manual" | "share" | "web" | "x";
export type TimelineFilter = "all" | "post" | "clip" | "posted" | "media";

export type OgpPreview = {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  siteName?: string | null;
};

export type Post = {
  id: string;
  type: PostType;
  postedFrom?: Exclude<PostType, "posted">;
  body: string;
  url?: string;
  ogp?: OgpPreview;
  imageBlob?: Blob;
  imageBlobs?: Blob[];
  tags: string[];
  source: PostSource;
  createdAt: string;
  updatedAt: string;
};

export type PostRecordInput = Omit<Post, "id" | "createdAt" | "updatedAt">;
