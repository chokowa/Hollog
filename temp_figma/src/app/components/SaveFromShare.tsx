import { X, Link as LinkIcon } from 'lucide-react';
import { useState } from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';

interface ShareData {
  url: string;
  title?: string;
  description?: string;
}

export function SaveFromShare({ shareData, onBack }: {
  shareData: ShareData;
  onBack: () => void;
}) {
  const [memo, setMemo] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saveDestination, setSaveDestination] = useState('saved');

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      const newTag = tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`;
      setTags([...tags, newTag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleSave = () => {
    // 保存処理
    console.log({
      url: shareData.url,
      title: shareData.title,
      memo,
      tags,
      saveDestination,
    });
    onBack();
  };

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl">外部から保存</h1>
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={20} className="text-gray-600" />
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* URLプレビュー */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-2">共有されたURL</label>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <LinkIcon size={20} className="text-gray-500 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                {shareData.title && (
                  <div className="text-base text-gray-900 mb-2 break-words">
                    {shareData.title}
                  </div>
                )}
                {shareData.description && (
                  <div className="text-sm text-gray-600 mb-2 line-clamp-2">
                    {shareData.description}
                  </div>
                )}
                <a
                  href={shareData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline break-all"
                >
                  {shareData.url}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 自分用メモ */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-2">自分用メモ（オプション）</label>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="このURLについてメモを残す..."
              className="w-full resize-none border-none outline-none bg-transparent min-h-[120px]"
              rows={4}
            />
          </div>
        </div>

        {/* タグ入力 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-2">タグ（オプション）</label>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="タグを入力してEnter"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
              />
              <button
                onClick={handleAddTag}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                追加
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 text-sm text-gray-700 bg-gray-100 px-3 py-1 rounded-full"
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 保存先選択 */}
        <div className="mb-8">
          <label className="block text-sm text-gray-700 mb-3">保存先</label>
          <RadioGroup.Root
            value={saveDestination}
            onValueChange={setSaveDestination}
            className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-200"
          >
            <RadioGroup.Item
              value="saved"
              className="flex items-center px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer data-[state=checked]:bg-gray-50"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center data-[state=checked]:border-gray-900 data-[state=checked]:bg-gray-900">
                  <div className="w-2 h-2 rounded-full bg-white opacity-0 data-[state=checked]:opacity-100" />
                </div>
                <div>
                  <div className="text-gray-900">保存情報</div>
                  <div className="text-xs text-gray-500 mt-0.5">後で読むURLや参考情報を保存</div>
                </div>
              </div>
            </RadioGroup.Item>

            <RadioGroup.Item
              value="candidates"
              className="flex items-center px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer data-[state=checked]:bg-gray-50"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center data-[state=checked]:border-gray-900 data-[state=checked]:bg-gray-900">
                  <div className="w-2 h-2 rounded-full bg-white opacity-0 data-[state=checked]:opacity-100" />
                </div>
                <div>
                  <div className="text-gray-900">投稿候補</div>
                  <div className="text-xs text-gray-500 mt-0.5">SNSでシェアする予定のもの</div>
                </div>
              </div>
            </RadioGroup.Item>
          </RadioGroup.Root>
        </div>

        {/* 保存ボタン */}
        <button
          onClick={handleSave}
          className="w-full py-4 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
        >
          保存する
        </button>
      </div>
    </div>
  );
}
