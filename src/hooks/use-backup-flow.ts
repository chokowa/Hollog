"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  buildHollogBackupFilename,
  createHollogBackup,
  parseHollogBackup,
  stringifyHollogBackup,
  type HollogBackupSettings,
  type ParsedHollogBackup,
} from "@/lib/hollog-backup";
import { openNativeJsonFile, saveNativeJsonFile } from "@/lib/native-media-picker";
import type { PostCardSection } from "@/lib/post-card-layout";
import { readTagSuggestionCatalog, uniqueTagSuggestions, writeTagSuggestionCatalog } from "@/lib/tag-suggestions";
import type { ThemeMode } from "@/hooks/use-theme";
import type { ImportConflictChoice, ImportPostsPreview, ImportPostsResult } from "@/hooks/use-posts";
import type { Post } from "@/types/post";

type PendingBackupImport = {
  parsed: ParsedHollogBackup;
  preview: ImportPostsPreview;
  choices: Record<string, ImportConflictChoice>;
};

type UseBackupFlowOptions = {
  posts: Post[];
  themeMode: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  hidePostedInSourceTabs: boolean;
  setHidePostedInSourceTabs: (value: boolean) => void;
  hiddenTags: string[];
  setHiddenTags: (tags: string[]) => void;
  systemTaggingEnabled: boolean;
  setSystemTaggingEnabled: (enabled: boolean) => void;
  postCardSectionOrder: PostCardSection[];
  setPostCardSectionOrder: (order: PostCardSection[]) => void;
  previewImportPosts: (importedPosts: Post[]) => Promise<ImportPostsPreview | null>;
  importPosts: (
    importedPosts: Post[],
    options?: { conflictChoices?: Record<string, ImportConflictChoice> },
  ) => Promise<ImportPostsResult | null>;
  showToast: (message: string) => void;
};

async function saveJsonTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const file = new File([blob], fileName, { type: "application/json" });
  const shareNavigator = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (shareNavigator.share && shareNavigator.canShare?.({ files: [file] })) {
    await shareNavigator.share({
      files: [file],
      title: "Hollogバックアップ",
      text: "Hollogのバックアップです。",
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useBackupFlow({
  posts,
  themeMode,
  setTheme,
  hidePostedInSourceTabs,
  setHidePostedInSourceTabs,
  hiddenTags,
  setHiddenTags,
  systemTaggingEnabled,
  setSystemTaggingEnabled,
  postCardSectionOrder,
  setPostCardSectionOrder,
  previewImportPosts,
  importPosts,
  showToast,
}: UseBackupFlowOptions) {
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [pendingBackupImport, setPendingBackupImport] = useState<PendingBackupImport | null>(null);
  const postsRef = useRef<Post[]>([]);

  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);

  const buildBackupSettings = useCallback((): HollogBackupSettings => ({
    themeMode,
    hidePostedInSourceTabs,
    hiddenTags,
    systemTaggingEnabled,
    tagSuggestions: readTagSuggestionCatalog(),
    postCardSectionOrder,
  }), [hiddenTags, hidePostedInSourceTabs, postCardSectionOrder, systemTaggingEnabled, themeMode]);

  const handleExportJson = useCallback(async () => {
    setIsBackupBusy(true);
    try {
      const backup = createHollogBackup(postsRef.current, buildBackupSettings());
      const fileName = buildHollogBackupFilename();
      const content = stringifyHollogBackup(backup);
      if (Capacitor.isNativePlatform()) {
        const result = await saveNativeJsonFile(fileName, content);
        if (result.cancelled) {
          showToast("バックアップの保存をキャンセルしました。");
          return;
        }
      } else {
        await saveJsonTextFile(fileName, content);
      }
      showToast(`${backup.posts.length}件の投稿をバックアップに保存しました。`);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      showToast(name === "AbortError" ? "バックアップの保存をキャンセルしました。" : "バックアップを保存できませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [buildBackupSettings, showToast]);

  const applyBackupImport = useCallback(async (
    parsed: ParsedHollogBackup,
    conflictChoices: Record<string, ImportConflictChoice> = {},
  ) => {
    setIsBackupBusy(true);
    try {
      const result = await importPosts(parsed.posts, { conflictChoices });
      if (!result) {
        showToast("バックアップの内容を復元できませんでした。");
        return;
      }

      const backupSettings = parsed.backup.settings;
      setTheme(backupSettings.themeMode);
      setHidePostedInSourceTabs(backupSettings.hidePostedInSourceTabs);
      setHiddenTags([...hiddenTags, ...backupSettings.hiddenTags]);
      setSystemTaggingEnabled(backupSettings.systemTaggingEnabled);
      setPostCardSectionOrder(backupSettings.postCardSectionOrder);
      writeTagSuggestionCatalog(uniqueTagSuggestions([
        ...readTagSuggestionCatalog(),
        ...backupSettings.tagSuggestions,
      ]));

      const summary = [
        `${result.addedCount}件をバックアップから追加`,
        result.mergedTagCount > 0 ? `${result.mergedTagCount}件にタグを追加` : "",
        result.duplicateCount > 0 ? `${result.duplicateCount}件は同じ内容のため変更なし` : "",
        result.overwrittenCount > 0 ? `${result.overwrittenCount}件をバックアップの内容に更新` : "",
        result.conflictCount > result.overwrittenCount ? `${result.conflictCount - result.overwrittenCount}件は今の内容を保持` : "",
        parsed.invalidPostCount > 0 ? `${parsed.invalidPostCount}件は読み込めずスキップ` : "",
      ].filter(Boolean).join(" / ");
      showToast(summary || "バックアップから変更する内容はありませんでした。");
      setPendingBackupImport(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "バックアップファイルを読み込めませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [
    hiddenTags,
    importPosts,
    setHiddenTags,
    setHidePostedInSourceTabs,
    setPostCardSectionOrder,
    setSystemTaggingEnabled,
    setTheme,
    showToast,
  ]);

  const handleImportJson = useCallback(async (file: File) => {
    setIsBackupBusy(true);
    try {
      const parsed = parseHollogBackup(JSON.parse(await file.text()));
      const preview = await previewImportPosts(parsed.posts);
      if (!preview) {
        showToast("バックアップの内容を確認できませんでした。");
        return;
      }

      setPendingBackupImport({ parsed, preview, choices: {} });
      showToast(
        preview.conflicts.length > 0
          ? `${preview.conflicts.length}件の投稿で、残す内容を選んでください。`
          : "内容の違いはありません。確認後に復元できます。",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "バックアップファイルを読み込めませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [previewImportPosts, showToast]);

  const handleImportJsonRequest = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;

    setIsBackupBusy(true);
    try {
      const opened = await openNativeJsonFile();
      if (opened.cancelled) {
        showToast("バックアップの復元をキャンセルしました。");
        return;
      }
      if (!opened.content) {
        showToast("バックアップファイルを読み込めませんでした。");
        return;
      }

      const parsed = parseHollogBackup(JSON.parse(opened.content));
      const preview = await previewImportPosts(parsed.posts);
      if (!preview) {
        showToast("バックアップの内容を確認できませんでした。");
        return;
      }

      setPendingBackupImport({ parsed, preview, choices: {} });
      showToast(
        preview.conflicts.length > 0
          ? `${preview.conflicts.length}件の投稿で、残す内容を選んでください。`
          : "内容の違いはありません。確認後に復元できます。",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "バックアップファイルを読み込めませんでした。");
    } finally {
      setIsBackupBusy(false);
    }
  }, [previewImportPosts, showToast]);

  const setBackupImportChoice = useCallback((key: string, choice: ImportConflictChoice) => {
    setPendingBackupImport((current) => current
      ? {
          ...current,
          choices: {
            ...current.choices,
            [key]: choice,
          },
        }
      : current);
  }, []);

  const confirmPendingBackupImport = useCallback(() => {
    if (!pendingBackupImport) return;
    void applyBackupImport(pendingBackupImport.parsed, pendingBackupImport.choices);
  }, [applyBackupImport, pendingBackupImport]);

  const confirmAllPendingBackupImport = useCallback((choice: ImportConflictChoice) => {
    if (!pendingBackupImport) return;
    const choices = Object.fromEntries(pendingBackupImport.preview.conflicts.map((conflict) => [conflict.key, choice]));
    setPendingBackupImport((current) => current ? { ...current, choices } : current);
  }, [pendingBackupImport]);

  const cancelPendingBackupImport = useCallback(() => {
    setPendingBackupImport(null);
  }, []);

  return {
    isBackupBusy,
    pendingBackupImport,
    handleExportJson,
    handleImportJson,
    handleImportJsonRequest,
    setBackupImportChoice,
    confirmPendingBackupImport,
    confirmAllPendingBackupImport,
    cancelPendingBackupImport,
  };
}
