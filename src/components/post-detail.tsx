"use client";

import { ArrowLeft, Copy, ExternalLink, CheckCircle2, Edit3, Trash2 } from "lucide-react";
import { PostCard } from "@/components/ui/post-card";
import type { ImageOriginRect } from "@/types/navigation";
import type { Post, PostType } from "@/types/post";

type PostDetailProps = {
  post: Post;
  imageUrls?: string[];
  onBack: () => void;
  onCopyForX: () => void;
  onOpenX: () => void;
  onMarkAsPosted: () => void;
  onEdit: () => void;
  onSaveMedia: (post: Post) => void;
  onDelete: () => void;
  onTagClick: (tag: string) => void;
  onPostTypeChange: (post: Post, nextType: PostType) => void;
  onPostOgpFetched: (post: Post, ogp: Post["ogp"]) => void;
  onImageOpen: (post: Post, index: number, originRect: ImageOriginRect) => void;
  isBusy?: boolean;
};

export function PostDetail({
  post,
  imageUrls,
  onBack,
  onCopyForX,
  onOpenX,
  onMarkAsPosted,
  onEdit,
  onSaveMedia,
  onDelete,
  onTagClick,
  onPostTypeChange,
  onPostOgpFetched,
  onImageOpen,
  isBusy,
}: PostDetailProps) {
  return (
    <div>
      {/* ヘッダー */}
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex items-center gap-4 px-4 py-4">
          <button
            onClick={onBack}
            className="rounded-full p-2 transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} className="text-muted-foreground" />
          </button>
          <h1 className="text-xl font-normal text-foreground">投稿詳細</h1>
        </div>
      </header>

      <div className="px-4 py-6">
        <div className="mb-8">
          <PostCard
            post={post}
            imageUrls={imageUrls}
            isDetail={true}
            onTagClick={onTagClick}
            onSaveMedia={onSaveMedia}
            onTypeChange={(nextType) => onPostTypeChange(post, nextType)}
            onOgpFetched={(ogp) => onPostOgpFetched(post, ogp)}
            onImageOpen={onImageOpen}
          />
        </div>

        <div className="mb-4 rounded-[28px] border border-border bg-card px-3 py-3 shadow-sm">
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={onCopyForX}
              className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Copy size={22} />
              <span className="text-[11px] font-medium">コピー</span>
            </button>
            <button
              onClick={onOpenX}
              className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <ExternalLink size={22} />
              <span className="text-[11px] font-medium">Xへ投稿</span>
            </button>
            <button
              onClick={onMarkAsPosted}
              disabled={isBusy}
              className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-3 transition-colors hover:bg-muted/50 disabled:opacity-50 ${
                post.type === "posted" ? "text-emerald-500" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 size={22} />
              <span className="text-[11px] font-medium">
                {post.type === "posted" ? "投稿済み" : "未投稿"}
              </span>
            </button>
            <button
              onClick={onEdit}
              className="flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Edit3 size={22} />
              <span className="text-[11px] font-medium">編集</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={onDelete}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-100 bg-card px-4 py-3.5 text-red-600 shadow-sm transition-colors hover:bg-red-50"
          >
            <Trash2 size={18} className="text-red-500" />
            <span className="font-medium">削除する</span>
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ※X投稿時は、本文・URL・タグのみが送信されます。
        </p>
      </div>
    </div>
  );
}
