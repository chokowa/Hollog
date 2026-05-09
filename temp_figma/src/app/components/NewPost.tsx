import { ArrowLeft, ImagePlus, X } from 'lucide-react';
import { useState } from 'react';
import * as RadioGroup from '@radix-ui/react-radio-group';

export function NewPost({ onBack }: { onBack: () => void }) {
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [saveDestination, setSaveDestination] = useState('drafts');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    // 保存処理
    console.log({
      content,
      url,
      tags,
      saveDestination,
      previewImage,
    });
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
          <h1 className="text-xl">新しい投稿</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 本文入力欄 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-2">本文</label>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="いま考えていることを書く..."
              className="w-full resize-none border-none outline-none bg-transparent min-h-[160px]"
              rows={6}
            />
          </div>
        </div>

        {/* URL入力欄 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-2">URL（オプション）</label>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 border-none outline-none bg-transparent rounded-xl"
            />
          </div>
        </div>

        {/* 画像追加 */}
        <div className="mb-6">
          <label className="block text-sm text-gray-700 mb-2">画像（オプション）</label>
          {previewImage ? (
            <div className="relative bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <img src={previewImage} alt="Preview" className="w-full h-auto" />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
              >
                <X size={16} className="text-gray-600" />
              </button>
            </div>
          ) : (
            <label className="block bg-white rounded-xl border border-gray-200 border-dashed p-8 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-2">
                <div className="p-3 bg-gray-100 rounded-full">
                  <ImagePlus size={24} className="text-gray-600" />
                </div>
                <span className="text-sm text-gray-600">画像を追加</span>
              </div>
            </label>
          )}
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
              value="drafts"
              className="flex items-center px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer data-[state=checked]:bg-gray-50"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center data-[state=checked]:border-gray-900 data-[state=checked]:bg-gray-900">
                  <div className="w-2 h-2 rounded-full bg-white opacity-0 data-[state=checked]:opacity-100" />
                </div>
                <span className="text-gray-900">下書き</span>
              </div>
            </RadioGroup.Item>

            <RadioGroup.Item
              value="saved"
              className="flex items-center px-4 py-4 hover:bg-gray-50 transition-colors cursor-pointer data-[state=checked]:bg-gray-50"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center data-[state=checked]:border-gray-900 data-[state=checked]:bg-gray-900">
                  <div className="w-2 h-2 rounded-full bg-white opacity-0 data-[state=checked]:opacity-100" />
                </div>
                <span className="text-gray-900">保存情報</span>
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
                <span className="text-gray-900">投稿候補</span>
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
