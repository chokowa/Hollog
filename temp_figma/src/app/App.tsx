import { Search, Settings, Copy, Share, Edit3, Link as LinkIcon, Plus, ExternalLink } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';
import { NewPost } from './components/NewPost';
import { PostDetail } from './components/PostDetail';
import { SaveFromShare } from './components/SaveFromShare';

export default function App() {
  const [showNewPost, setShowNewPost] = useState(false);
  const [selectedPost, setSelectedPost] = useState<typeof posts[0] | null>(null);
  const [showSaveFromShare, setShowSaveFromShare] = useState(false);

  // デモ用の外部共有データ
  const demoShareData = {
    url: 'https://example.com/article/web-development',
    title: 'モダンWeb開発のベストプラクティス 2026',
    description: '最新のフロントエンド開発手法とツールについて解説。React、TypeScript、Tailwind CSSを使った効率的な開発方法を紹介します。',
  };

  if (showNewPost) {
    return <NewPost onBack={() => setShowNewPost(false)} />;
  }

  if (showSaveFromShare) {
    return (
      <SaveFromShare
        shareData={demoShareData}
        onBack={() => setShowSaveFromShare(false)}
      />
    );
  }

  if (selectedPost) {
    return (
      <PostDetail
        post={selectedPost}
        onBack={() => setSelectedPost(null)}
        onEdit={() => {
          // 編集画面への遷移処理
          setSelectedPost(null);
          setShowNewPost(true);
        }}
        onDelete={() => {
          // 削除処理
          console.log('Delete post:', selectedPost.id);
        }}
      />
    );
  }
  const posts = [
    {
      id: 1,
      type: 'text',
      content: 'SNSに投稿する前に、ここで下書きを整理しておくと安心。思いついたことを気軽にメモできるのがいいね。',
      tags: ['#メモ', '#下書き'],
      date: '2026-05-08 14:23',
    },
    {
      id: 2,
      type: 'url',
      content: '後で読みたい記事を発見。個人開発のモチベーション維持について書かれていて参考になりそう。',
      url: 'https://example.com/article/motivation',
      urlTitle: '個人開発を続けるコツ - 開発ブログ',
      tags: ['#開発', '#参考記事'],
      date: '2026-05-08 12:45',
    },
    {
      id: 3,
      type: 'image',
      content: '今日のランチ。シンプルだけど美味しかった。',
      imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
      tags: ['#ランチ', '#日常'],
      date: '2026-05-08 11:30',
    },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] pb-8">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl">ぼっちSNS</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveFromShare(true)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="外部から保存"
            >
              <ExternalLink size={20} className="text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Search size={20} className="text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <Settings size={20} className="text-gray-600" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4">
        {/* 投稿入力欄 */}
        <div className="mt-6 mb-6">
          <button
            onClick={() => setShowNewPost(true)}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-full">
                <Plus size={20} className="text-gray-600" />
              </div>
              <span className="text-gray-500">いま考えていることを書く...</span>
            </div>
          </button>
        </div>

        {/* タブ */}
        <Tabs.Root defaultValue="all" className="mb-6">
          <Tabs.List className="flex gap-6 border-b border-gray-200 mb-6">
            <Tabs.Trigger
              value="all"
              className="pb-3 px-1 text-gray-600 hover:text-gray-900 transition-colors data-[state=active]:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-gray-900"
            >
              すべて
            </Tabs.Trigger>
            <Tabs.Trigger
              value="drafts"
              className="pb-3 px-1 text-gray-600 hover:text-gray-900 transition-colors data-[state=active]:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-gray-900"
            >
              下書き
            </Tabs.Trigger>
            <Tabs.Trigger
              value="saved"
              className="pb-3 px-1 text-gray-600 hover:text-gray-900 transition-colors data-[state=active]:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-gray-900"
            >
              保存情報
            </Tabs.Trigger>
            <Tabs.Trigger
              value="candidates"
              className="pb-3 px-1 text-gray-600 hover:text-gray-900 transition-colors data-[state=active]:text-gray-900 data-[state=active]:border-b-2 data-[state=active]:border-gray-900"
            >
              投稿候補
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="all">
            <PostList posts={posts} onPostClick={setSelectedPost} />
          </Tabs.Content>
          <Tabs.Content value="drafts">
            <PostList posts={posts.filter(p => p.id === 1)} onPostClick={setSelectedPost} />
          </Tabs.Content>
          <Tabs.Content value="saved">
            <PostList posts={posts.filter(p => p.type === 'url')} onPostClick={setSelectedPost} />
          </Tabs.Content>
          <Tabs.Content value="candidates">
            <PostList posts={posts.filter(p => p.id === 3)} onPostClick={setSelectedPost} />
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  );
}

function PostList({ posts, onPostClick }: { posts: typeof initialPosts; onPostClick: (post: typeof initialPosts[0]) => void }) {
  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onPostClick={onPostClick} />
      ))}
    </div>
  );
}

const initialPosts = [
  {
    id: 1,
    type: 'text' as const,
    content: '',
    tags: [] as string[],
    date: '',
  },
];

function PostCard({ post, onPostClick }: { post: typeof initialPosts[0] & { type: 'text' | 'url' | 'image'; url?: string; urlTitle?: string; imageUrl?: string }; onPostClick: (post: typeof initialPosts[0]) => void }) {
  return (
    <article
      onClick={() => onPostClick(post)}
      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* URL プレビュー */}
      {post.type === 'url' && post.url && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-start gap-2 mb-1">
            <LinkIcon size={16} className="text-gray-500 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-900 mb-1 break-words">{post.urlTitle}</div>
              <div className="text-xs text-gray-500 truncate">{post.url}</div>
            </div>
          </div>
        </div>
      )}

      {/* 画像 */}
      {post.type === 'image' && post.imageUrl && (
        <div className="mb-4 rounded-lg overflow-hidden">
          <img
            src={post.imageUrl}
            alt=""
            className="w-full h-auto object-cover"
          />
        </div>
      )}

      {/* 本文 */}
      <p className="text-gray-900 mb-4 leading-relaxed whitespace-pre-wrap">
        {post.content}
      </p>

      {/* タグ */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {post.tags.map((tag, index) => (
            <span
              key={index}
              className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* フッター */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <time className="text-sm text-gray-500">{post.date}</time>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(post.content);
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="コピー"
          >
            <Copy size={16} className="text-gray-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const text = encodeURIComponent(post.content);
              window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Xへ投稿"
          >
            <Share size={16} className="text-gray-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPostClick(post);
            }}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="編集"
          >
            <Edit3 size={16} className="text-gray-600" />
          </button>
        </div>
      </div>
    </article>
  );
}
