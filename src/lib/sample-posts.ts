import type { Post } from "@/types/post";

export const samplePosts: Post[] = [
  {
    id: "sample-1",
    type: "post",
    body: "駅前の小さな喫茶店で、だれにも見つからない席を確保。静かな午後にコードを書くの、かなり好きかもしれない。",
    url: "https://example.com/cafe-note",
    tags: ["cafe", "memo"],
    source: "manual",
    createdAt: "2026-05-08T08:20:00.000Z",
    updatedAt: "2026-05-08T08:20:00.000Z",
  },
  {
    id: "sample-2",
    type: "posted",
    body: "新しい曲の断片を録ってみた。完璧じゃなくても、今日はちゃんと前に進めた気がする。",
    url: "https://example.com/demo-track",
    tags: ["song", "idea", "share"],
    source: "x",
    createdAt: "2026-05-08T06:05:00.000Z",
    updatedAt: "2026-05-08T06:05:00.000Z",
  },
  {
    id: "sample-3",
    type: "clip",
    body: "メモ: 投稿画面は『書き始めるハードルの低さ』が大事。入力欄が怖く見えないように余白を多めにしたい。",
    tags: ["design", "ux"],
    source: "web",
    createdAt: "2026-05-07T23:40:00.000Z",
    updatedAt: "2026-05-07T23:40:00.000Z",
  },
];
