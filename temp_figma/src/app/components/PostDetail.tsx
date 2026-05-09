import { ArrowLeft, Copy, Share, Edit3, Trash2, Link as LinkIcon } from 'lucide-react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useState } from 'react';

interface Post {
  id: number;
  type: 'text' | 'url' | 'image';
  content: string;
  tags?: string[];
  date: string;
  url?: string;
  urlTitle?: string;
  imageUrl?: string;
}

export function PostDetail({ post, onBack, onEdit, onDelete }: {
  post: Post;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(post.content);
    // トースト通知などを表示する処理を追加できます
  };

  const handleShareToX = () => {
    const text = encodeURIComponent(post.content);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const handleDelete = () => {
    onDelete();
    setShowDeleteDialog(false);
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="text-xl">投稿詳細</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* メインコンテンツ */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          {/* URLプレビュー */}
          {post.type === 'url' && post.url && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start gap-3">
                <LinkIcon size={20} className="text-gray-500 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-base text-gray-900 mb-2 break-words">
                    {post.urlTitle}
                  </div>
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline break-all"
                  >
                    {post.url}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* 画像 */}
          {post.type === 'image' && post.imageUrl && (
            <div className="mb-6 rounded-lg overflow-hidden">
              <img
                src={post.imageUrl}
                alt=""
                className="w-full h-auto object-cover"
              />
            </div>
          )}

          {/* 本文 */}
          <div className="mb-6">
            <p className="text-gray-900 text-base leading-relaxed whitespace-pre-wrap">
              {post.content}
            </p>
          </div>

          {/* タグ */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {post.tags.map((tag, index) => (
                <span
                  key={index}
                  className="text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 作成日時 */}
          <div className="pt-4 border-t border-gray-100">
            <time className="text-sm text-gray-500">{post.date}</time>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="space-y-3">
          {/* コピー */}
          <button
            onClick={handleCopy}
            className="w-full bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <Copy size={20} className="text-gray-600" />
            <span className="text-gray-900">コピー</span>
          </button>

          {/* Xへ投稿 */}
          <button
            onClick={handleShareToX}
            className="w-full bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <Share size={20} className="text-gray-600" />
            <span className="text-gray-900">Xへ投稿</span>
          </button>

          {/* 編集 */}
          <button
            onClick={onEdit}
            className="w-full bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:bg-gray-50 transition-colors flex items-center gap-3"
          >
            <Edit3 size={20} className="text-gray-600" />
            <span className="text-gray-900">編集</span>
          </button>

          {/* 削除 */}
          <AlertDialog.Root open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialog.Trigger asChild>
              <button className="w-full bg-white rounded-xl border border-red-200 shadow-sm p-4 hover:bg-red-50 transition-colors flex items-center gap-3">
                <Trash2 size={20} className="text-red-600" />
                <span className="text-red-600">削除</span>
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
              <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-lg p-6 w-[90%] max-w-md z-50">
                <AlertDialog.Title className="text-lg text-gray-900 mb-2">
                  投稿を削除しますか？
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-gray-600 mb-6">
                  この操作は取り消せません。本当に削除してもよろしいですか？
                </AlertDialog.Description>
                <div className="flex gap-3">
                  <AlertDialog.Cancel asChild>
                    <button className="flex-1 px-4 py-3 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors">
                      キャンセル
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      削除する
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      </div>
    </div>
  );
}
