"use client";

import { useState } from "react";
import { ArrowLeft, Trash2, Tags, Sun, Moon, Monitor, EyeOff } from "lucide-react";
import type { ThemeMode } from "@/hooks/use-theme";

function readCustomTags() {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("bocchisns_custom_tags");
    return saved ? (JSON.parse(saved) as string[]) : [];
  } catch {
    return [];
  }
}

type SettingsViewProps = {
  onBack: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  hidePostedInSourceTabs: boolean;
  onHidePostedInSourceTabsChange: (hidden: boolean) => void;
};

export function SettingsView({
  onBack,
  themeMode,
  onThemeChange,
  hidePostedInSourceTabs,
  onHidePostedInSourceTabsChange,
}: SettingsViewProps) {
  const [customTags, setCustomTags] = useState<string[]>(readCustomTags);

  const handleDeleteTag = (tagToRemove: string) => {
    if (confirm(`タグ "${tagToRemove}" を削除しますか？`)) {
      const nextTags = customTags.filter((t) => t !== tagToRemove);
      setCustomTags(nextTags);
      try {
        localStorage.setItem("bocchisns_custom_tags", JSON.stringify(nextTags));
      } catch {}
    }
  };

  return (
    <div className="flex flex-col flex-1 bg-secondary min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-4 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground -ml-2"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-medium text-foreground">設定</h1>
        <div className="w-9" /> {/* バランス用 */}
      </header>

      {/* Content */}
      <div className="p-4 sm:p-6 space-y-6">
        <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-4 flex items-center gap-2">
            <Tags size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">カスタムタグの管理</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              投稿画面で新しく入力し、記録されたタグの一覧です。不要になったタグはここから削除できます。
            </p>

            {customTags.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                登録されているカスタムタグはありません。
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {customTags.map((tag) => (
                  <li
                    key={tag}
                    className="flex items-center justify-between rounded-xl border border-border p-3 transition-colors hover:bg-muted/30"
                  >
                    <span className="text-sm font-medium text-foreground px-2">{tag}</span>
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      className="rounded-full p-2 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      title="削除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-4 flex items-center gap-2">
            <EyeOff size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">投稿済みカード</h2>
          </div>
          <div className="p-5">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-muted/30">
              <span className="text-sm font-medium text-foreground">
                投稿済みのカードはポストとクリップタブから見えなくする
              </span>
              <input
                type="checkbox"
                checked={hidePostedInSourceTabs}
                onChange={(event) => onHidePostedInSourceTabsChange(event.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>
          </div>
        </section>

        {/* テーマ設定 */}
        <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="border-b border-border px-5 py-4 flex items-center gap-2">
            <Sun size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">テーマ</h2>
          </div>
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              アプリの外観を切り替えます。「システム」を選ぶと端末の設定にしたがいます。
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "system" as ThemeMode, label: "システム", icon: Monitor },
                { value: "light" as ThemeMode, label: "ライト", icon: Sun },
                { value: "dark" as ThemeMode, label: "ダーク", icon: Moon },
              ]).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => onThemeChange(value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors ${
                    themeMode === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Icon size={24} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
