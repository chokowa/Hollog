"use client";

import { ArrowLeft, EyeOff, Moon, Monitor, Sun, Tags } from "lucide-react";
import type { ThemeMode } from "@/hooks/use-theme";
import { AppButton } from "@/components/ui/app-button";

type SettingsViewProps = {
  onBack: () => void;
  onOpenTagManager: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  hidePostedInSourceTabs: boolean;
  onHidePostedInSourceTabsChange: (hidden: boolean) => void;
  existingTags: string[];
};

export function SettingsView({
  onBack,
  onOpenTagManager,
  themeMode,
  onThemeChange,
  hidePostedInSourceTabs,
  onHidePostedInSourceTabsChange,
  existingTags,
}: SettingsViewProps) {
  return (
    <div className="flex flex-col flex-1 bg-secondary min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-4 shadow-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground -ml-2"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-medium text-foreground">設定</h1>
        <div className="w-9" />
      </header>

      <div className="space-y-6 p-4 sm:p-6">
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Tags size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">タグ整理</h2>
          </div>
          <div className="p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              タグ候補の管理と、複数投稿への一括タグ付けを専用画面で行います。
            </p>
            <div className="mb-4 rounded-xl border border-border bg-secondary px-4 py-3">
              <p className="text-sm font-medium text-foreground">現在の使用タグ</p>
              <p className="mt-1 text-xs text-muted-foreground">{existingTags.length}件</p>
            </div>
            <AppButton block onClick={onOpenTagManager}>
              タグ整理を開く
            </AppButton>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
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
                className="bocchi-checkbox h-5 w-5"
              />
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Sun size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">テーマ</h2>
          </div>
          <div className="p-5">
            <p className="mb-4 text-sm text-muted-foreground">
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
