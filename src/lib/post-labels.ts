import type { PostSource, PostType } from "@/types/post";

export const postTypeLabels: Record<PostType, string> = {
  post: "ポスト",
  clip: "クリップ",
  posted: "投稿済み",
};

export const postSourceLabels: Record<PostSource, string> = {
  manual: "手入力",
  web: "Web保存",
  share: "共有から保存",
  x: "X由来",
};
