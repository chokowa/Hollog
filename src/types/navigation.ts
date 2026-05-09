export type ImageViewerRoute =
  | {
      kind: "post";
      postId: string;
      index: number;
    }
  | {
      kind: "media";
      index: number;
    };

export type ImageOriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};
