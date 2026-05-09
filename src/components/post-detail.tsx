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

        {/* アクション一覧 */}
        <div className="space-y-3">
          <button
            onClick={onCopyForX}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
          >
            <Copy size={20} className="text-muted-foreground" />
            <span className="font-medium text-foreground">X投稿用にコピー</span>
          </button>

          <button
            onClick={onOpenX}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
          >
            <ExternalLink size={20} className="text-muted-foreground" />
            <span className="font-medium text-foreground">Xを開いて投稿</span>
          </button>

          <button
            onClick={onMarkAsPosted}
            disabled={isBusy}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
          >
            <CheckCircle2
              size={20}
              className={post.type === "posted" ? "text-emerald-500" : "text-muted-foreground"}
            />
            <span className={`font-medium ${post.type === "posted" ? "text-emerald-600" : "text-foreground"}`}>
              {post.type === "posted" ? "投稿済み" : "投稿済みにする"}
            </span>
          </button>

          <div className="pt-4">
            <button
              onClick={onEdit}
              className="mb-3 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50"
            >
              <Edit3 size={20} className="text-muted-foreground" />
              <span className="font-medium text-foreground">内容を編集</span>
            </button>

            <button
              onClick={onDelete}
              className="flex w-full items-center gap-3 rounded-xl border border-red-100 bg-card p-4 shadow-sm transition-colors hover:bg-red-50"
            >
              <Trash2 size={20} className="text-red-500" />
              <span className="font-medium text-red-600">削除する</span>
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ※X投稿時は、本文・URL・タグのみが送信されます。
        </p>
      </div>
    </div>
  );
}
