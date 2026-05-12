"use client";

import { useRef } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Download, EyeOff, LayoutList, Moon, Monitor, RotateCcw, Sparkles, Sun, Tags, Upload } from "lucide-react";
import type { ThemeMode } from "@/hooks/use-theme";
import { AppButton } from "@/components/ui/app-button";
import {
  DEFAULT_POST_CARD_SECTION_ORDER,
  POST_CARD_SECTION_LABELS,
  type PostCardSection,
} from "@/lib/post-card-layout";

type SettingsViewProps = {
  onBack: () => void;
  onOpenTagManager: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  hidePostedInSourceTabs: boolean;
  onHidePostedInSourceTabsChange: (hidden: boolean) => void;
  systemTaggingEnabled: boolean;
  onSystemTaggingEnabledChange: (enabled: boolean) => void;
  postCardSectionOrder: PostCardSection[];
  onPostCardSectionOrderChange: (order: PostCardSection[]) => void;
  existingTags: string[];
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onImportJsonRequest: () => void;
  useNativeJsonPicker: boolean;
  isBackupBusy: boolean;
};

export function SettingsView({
  onBack,
  onOpenTagManager,
  themeMode,
  onThemeChange,
  hidePostedInSourceTabs,
  onHidePostedInSourceTabsChange,
  systemTaggingEnabled,
  onSystemTaggingEnabledChange,
  postCardSectionOrder,
  onPostCardSectionOrderChange,
  existingTags,
  onExportJson,
  onImportJson,
  onImportJsonRequest,
  useNativeJsonPicker,
  isBackupBusy,
}: SettingsViewProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const movePostCardSection = (section: PostCardSection, direction: -1 | 1) => {
    const index = postCardSectionOrder.indexOf(section);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= postCardSectionOrder.length) return;

    const nextOrder = [...postCardSectionOrder];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    onPostCardSectionOrderChange(nextOrder);
  };

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
            <h2 className="font-medium text-foreground">タグ管理</h2>
          </div>
          <div className="p-5">
            <p className="mb-4 text-sm text-muted-foreground">
              タグ候補の管理と、複数投稿への一括タグ付けを専用画面で行います。
            </p>
            <div className="mb-4 rounded-xl border border-border bg-secondary px-4 py-3">
              <p className="text-sm font-medium text-foreground">使用中のタグ</p>
              <p className="mt-1 text-xs text-muted-foreground">{existingTags.length}件</p>
            </div>
            <AppButton block onClick={onOpenTagManager}>
              タグ管理を開く
            </AppButton>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Upload size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">バックアップ</h2>
          </div>
          <div className="space-y-4 p-5">
            <div className="space-y-2">
              <AppButton
                type="button"
                block
                onClick={onExportJson}
                disabled={isBackupBusy}
                className="gap-2"
              >
                <Upload size={16} />
                バックアップを保存
              </AppButton>
              <AppButton
                type="button"
                block
                onClick={() => {
                  if (useNativeJsonPicker) {
                    onImportJsonRequest();
                    return;
                  }
                  importInputRef.current?.click();
                }}
                disabled={isBackupBusy}
                className="gap-2"
              >
                <Download size={16} />
                バックアップから復元
              </AppButton>
            </div>
            <p className="text-sm text-muted-foreground">
              投稿、URL、タグ、プレビュー、表示設定を1つのファイルに保存できます。機種変更や念のための控えに使えます。
            </p>
            <div className="rounded-xl border border-border bg-secondary px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              写真や動画の本体はまだ保存されません。復元時は同じ投稿を二重に増やさず、本文などが違うものは確認してから反映します。
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onImportJson(file);
              }}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Sparkles size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">自動タグ</h2>
          </div>
          <div className="p-5">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-muted/30">
              <span className="text-sm font-medium text-foreground">
                サービス名タグを自動で付ける
              </span>
              <input
                type="checkbox"
                checked={systemTaggingEnabled}
                onChange={(event) => onSystemTaggingEnabledChange(event.target.checked)}
                className="bocchi-checkbox h-5 w-5"
              />
            </label>
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
                投稿済みをポスト/クリップに表示しない
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
            <LayoutList size={18} className="text-primary" />
            <h2 className="font-medium text-foreground">投稿カードの並び順</h2>
          </div>
          <div className="space-y-2 p-5">
            {postCardSectionOrder.map((section, index) => (
              <div
                key={section}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary px-4 py-3"
              >
                <span className="text-sm font-medium text-foreground">
                  {POST_CARD_SECTION_LABELS[section]}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => movePostCardSection(section, -1)}
                    disabled={index === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-35"
                    aria-label={`${POST_CARD_SECTION_LABELS[section]}を上へ`}
                    title="上へ"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePostCardSection(section, 1)}
                    disabled={index === postCardSectionOrder.length - 1}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-35"
                    aria-label={`${POST_CARD_SECTION_LABELS[section]}を下へ`}
                    title="下へ"
                  >
                    <ArrowDown size={16} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onPostCardSectionOrderChange(DEFAULT_POST_CARD_SECTION_ORDER)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <RotateCcw size={16} />
              初期順に戻す
            </button>
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
