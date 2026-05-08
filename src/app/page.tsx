"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { usePosts } from "@/hooks/use-posts";
import { AppHeader } from "@/components/app-header";
import { PostFeed } from "@/components/post-feed";
import { BottomNav } from "@/components/bottom-nav";
import { ComposerModal } from "@/components/composer-modal";
import { PostDetail } from "@/components/post-detail";
import { ShareImport } from "@/components/share-import";
import { SettingsView } from "@/components/settings-view";
import { useTheme } from "@/hooks/use-theme";
import { copyTextToClipboard } from "@/lib/clipboard";
import { validateImageFile } from "@/lib/image-validation";
import type { Post, PostType } from "@/types/post";

type ActiveView = "home" | "post" | "profile" | "detail" | "share" | "settings";
type AppHistoryState = {
  bocchiSns: true;
  view: ActiveView;
  postId?: string | null;
  composer?: "new" | "edit" | null;
};

export default function Home() {
  const {
    posts,
    visiblePosts,
    hidePostedInSourceTabs,
    setHidePostedInSourceTabs,
    activeTab,
    setActiveTab,
    activeTag,
    setActiveTag,
    availableTags,
    searchQuery,
    setSearchQuery,
    isBooting,
    isBusy,
    postImageUrlMap,
    loadPosts,
    createPost,
    updatePost,
    updatePostOgp,
    deletePost,
    fromPost,
    emptyForm,
    buildTweetText,
  } = usePosts();

  // 表示・入力状態
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [composerValue, setComposerValue] = useState(emptyForm);
  const [imageError, setImageError] = useState<string>("");
  const activeViewRef = useRef<ActiveView>("home");
  const selectedPostIdRef = useRef<string | null>(null);
  const lastScrollYRef = useRef(0);
  const scrollIntentStartYRef = useRef(0);
  const scrollIntentDirectionRef = useRef<"up" | "down" | null>(null);
  const isTopChromeHiddenRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollChromeTimerRef = useRef<number | null>(null);
  const pendingTimelineChromeHiddenRef = useRef<boolean | null>(null);
  const { mode: themeMode, setTheme } = useTheme();

  const selectedPost = posts.find((p) => p.id === selectedPostId);

  const setTimelineChromeHidden = useCallback((hidden: boolean) => {
    isTopChromeHiddenRef.current = hidden;
    document.documentElement.dataset.timelineChrome = hidden ? "hidden" : "visible";
  }, []);

  const requestTimelineTop = useCallback(() => {
    setTimelineChromeHidden(false);
    window.dispatchEvent(new Event("bocchi:timeline-top"));
  }, [setTimelineChromeHidden]);

  const applyHistoryState = useCallback((state: AppHistoryState | null) => {
    const nextState: AppHistoryState = state?.bocchiSns ? state : { bocchiSns: true, view: "home" };
    setActiveView(nextState.view);
    setSelectedPostId(nextState.postId ?? null);
    setIsComposerOpen(Boolean(nextState.composer));
    setIsEditorOpen(nextState.composer === "edit");
    if (!nextState.composer) {
      setImageError("");
    }
  }, []);

  const replaceHistoryState = useCallback((state: AppHistoryState) => {
    window.history.replaceState(state, "", window.location.href);
  }, []);

  const pushHistoryState = useCallback((state: AppHistoryState) => {
    window.history.pushState(state, "", window.location.href);
    applyHistoryState(state);
  }, [applyHistoryState]);

  const goBackOrHome = useCallback(() => {
    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.bocchiSns && (currentState.view !== "home" || currentState.composer)) {
      window.history.back();
      return;
    }
    const homeState: AppHistoryState = { bocchiSns: true, view: "home" };
    replaceHistoryState(homeState);
    applyHistoryState(homeState);
  }, [applyHistoryState, replaceHistoryState]);

  useEffect(() => {
    activeViewRef.current = activeView;
    selectedPostIdRef.current = selectedPostId;
    if (activeView !== "home") {
      setTimelineChromeHidden(false);
    }
  }, [activeView, selectedPostId, setTimelineChromeHidden]);

  useEffect(() => {
    const TOP_REVEAL_Y = 48;
    const HIDE_START_Y = 120;
    const HIDE_AFTER_SCROLL = 44;
    const SHOW_AFTER_SCROLL = 32;
    const MIN_SCROLL_DELTA = 6;
    const SCROLL_CHROME_SETTLE_DELAY = 72; // Set to 0 to restore immediate hide/show.

    const applyTimelineChromeHidden = (hidden: boolean) => {
      pendingTimelineChromeHiddenRef.current = null;
      setTimelineChromeHidden(hidden);
    };

    const scheduleTimelineChromeHidden = (hidden: boolean, delay = SCROLL_CHROME_SETTLE_DELAY) => {
      if (hidden === isTopChromeHiddenRef.current) {
        pendingTimelineChromeHiddenRef.current = null;
        if (scrollChromeTimerRef.current !== null) {
          window.clearTimeout(scrollChromeTimerRef.current);
          scrollChromeTimerRef.current = null;
        }
        return;
      }
      if (pendingTimelineChromeHiddenRef.current === hidden) return;

      pendingTimelineChromeHiddenRef.current = hidden;
      if (scrollChromeTimerRef.current !== null) {
        window.clearTimeout(scrollChromeTimerRef.current);
        scrollChromeTimerRef.current = null;
      }

      if (delay <= 0) {
        applyTimelineChromeHidden(hidden);
        return;
      }

      scrollChromeTimerRef.current = window.setTimeout(() => {
        scrollChromeTimerRef.current = null;
        applyTimelineChromeHidden(hidden);
      }, delay);
    };

    const updateScrollChrome = () => {
      scrollFrameRef.current = null;
      if (activeViewRef.current !== "home") {
        pendingTimelineChromeHiddenRef.current = null;
        if (scrollChromeTimerRef.current !== null) {
          window.clearTimeout(scrollChromeTimerRef.current);
          scrollChromeTimerRef.current = null;
        }
        return;
      }

      const currentY = window.scrollY;
      const previousY = lastScrollYRef.current;
      const delta = currentY - previousY;
      if (Math.abs(delta) < MIN_SCROLL_DELTA) return;

      const direction = delta > 0 ? "down" : delta < 0 ? "up" : scrollIntentDirectionRef.current;

      let nextHidden = isTopChromeHiddenRef.current;
      if (!direction) {
        lastScrollYRef.current = currentY;
        return;
      }

      if (direction !== scrollIntentDirectionRef.current) {
        scrollIntentDirectionRef.current = direction;
        scrollIntentStartYRef.current = previousY;
      }

      const intentDistance = Math.abs(currentY - scrollIntentStartYRef.current);

      if (currentY < TOP_REVEAL_Y) {
        nextHidden = false;
      } else if (direction === "down" && currentY > HIDE_START_Y && intentDistance > HIDE_AFTER_SCROLL) {
        nextHidden = true;
      } else if (direction === "up" && intentDistance > SHOW_AFTER_SCROLL) {
        nextHidden = false;
      }

      if (nextHidden !== isTopChromeHiddenRef.current) {
        scheduleTimelineChromeHidden(nextHidden, currentY < TOP_REVEAL_Y ? 0 : SCROLL_CHROME_SETTLE_DELAY);
        scrollIntentStartYRef.current = currentY;
      }

      lastScrollYRef.current = currentY;
    };

    const handleScroll = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateScrollChrome);
    };

    lastScrollYRef.current = window.scrollY;
    setTimelineChromeHidden(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
      if (scrollChromeTimerRef.current !== null) {
        window.clearTimeout(scrollChromeTimerRef.current);
      }
      pendingTimelineChromeHiddenRef.current = null;
    };
  }, [setTimelineChromeHidden]);

  useEffect(() => {
    const initialState = window.history.state as AppHistoryState | null;
    if (!initialState?.bocchiSns) {
      replaceHistoryState({ bocchiSns: true, view: "home" });
    }

    const handlePopState = (event: PopStateEvent) => {
      applyHistoryState(event.state as AppHistoryState | null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyHistoryState, replaceHistoryState]);

  useEffect(() => {
    if (isEditorOpen && selectedPost) {
      const syncTimer = setTimeout(() => {
        setComposerValue(fromPost(selectedPost));
      }, 0);
      return () => clearTimeout(syncTimer);
    }
    if (isComposerOpen && !isEditorOpen) {
      const syncTimer = setTimeout(() => {
        setComposerValue(emptyForm);
      }, 0);
      return () => clearTimeout(syncTimer);
    }
  }, [emptyForm, fromPost, isComposerOpen, isEditorOpen, selectedPost]);

  const openNewComposer = useCallback(() => {
    setComposerValue(emptyForm);
    setIsEditorOpen(false);
    pushHistoryState({
      bocchiSns: true,
      view: activeViewRef.current,
      postId: selectedPostIdRef.current,
      composer: "new",
    });
  }, [emptyForm, pushHistoryState]);

  const openEditComposer = useCallback((post: Post) => {
    setComposerValue(fromPost(post));
    setIsEditorOpen(true);
    pushHistoryState({
      bocchiSns: true,
      view: "detail",
      postId: post.id,
      composer: "edit",
    });
  }, [fromPost, pushHistoryState]);

  const closeComposer = useCallback(() => {
    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.bocchiSns && currentState.composer) {
      window.history.back();
      return;
    }
    setIsComposerOpen(false);
    setIsEditorOpen(false);
  }, []);

  const replaceToHome = useCallback(() => {
    const homeState: AppHistoryState = { bocchiSns: true, view: "home" };
    replaceHistoryState(homeState);
    applyHistoryState(homeState);
  }, [applyHistoryState, replaceHistoryState]);

  const replaceToDetail = useCallback((postId: string) => {
    const detailState: AppHistoryState = { bocchiSns: true, view: "detail", postId };
    replaceHistoryState(detailState);
    applyHistoryState(detailState);
  }, [applyHistoryState, replaceHistoryState]);

  // 画像選択ハンドラー
  const handleImagesSelect = useCallback((files: File[]) => {
    let currentError = "";
    const validFiles: File[] = [];

    for (const file of files) {
      const error = validateImageFile(file);
      if (error) {
        currentError = error;
        break;
      }
      validFiles.push(file);
    }

    setImageError(currentError);
    if (!currentError && validFiles.length > 0) {
      setComposerValue((prev) => {
        const existingBlobs = prev.imageBlobs || [];
        const nextBlobs = [...existingBlobs, ...validFiles];
        if (nextBlobs.length > 4) {
          setImageError("画像は最大4枚まで選択できます。");
          return prev;
        }
        return { ...prev, imageBlobs: nextBlobs };
      });
    }
  }, []);

  const composerPreviewUrls = useMemo(
    () => (composerValue.imageBlobs || []).map((blob) => URL.createObjectURL(blob)),
    [composerValue.imageBlobs],
  );

  useEffect(() => {
    return () => composerPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [composerPreviewUrls]);

  // 投稿送信ハンドラー
  const handleSubmit = async () => {
    const success = await createPost(composerValue);
    if (success) {
      setComposerValue(emptyForm);
      replaceToHome();
    }
  };

  // 詳細画面からの操作
  const handleCopyForX = async () => {
    if (!selectedPost) return;
    const copied = await copyTextToClipboard(buildTweetText(selectedPost));
    alert(copied ? "X投稿用テキストをコピーしました。" : "コピーできませんでした。");
  };

  const handleOpenX = () => {
    if (!selectedPost) return;
    const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildTweetText(selectedPost))}`;
    window.open(tweetUrl, "_blank", "noopener,noreferrer");
  };

  const handleMarkAsPosted = async () => {
    if (!selectedPost) return;
    const nextType = selectedPost.type === "posted" ? (selectedPost.postedFrom ?? "post") : "posted";
    const postedFrom = selectedPost.type === "posted" ? selectedPost.postedFrom : selectedPost.type;
    await updatePost(selectedPost.id, { ...fromPost(selectedPost), type: nextType, postedFrom }, selectedPost.source);
  };

  const handlePostTypeChange = async (post: Post, nextType: PostType) => {
    await updatePost(post.id, { ...fromPost(post), type: nextType }, post.source);
  };

  const handleDelete = async () => {
    if (!selectedPost) return;
    if (confirm("本当に削除しますか？")) {
      await deletePost(selectedPost.id);
      replaceToHome();
    }
  };

  const handleImportShare = async (postData: { body: string; url: string; tags: string[]; type: PostType }) => {
    const success = await createPost({
      type: postData.type,
      body: postData.body,
      url: postData.url,
      tagsText: postData.tags.join(", "),
    });
    if (success) replaceToHome();
  };

  /* detail / share 画面は全画面で展開 */
  if (activeView === "detail" && selectedPost) {
    return (
      <main className="flex flex-col flex-1">
        <PostDetail
          post={selectedPost}
          imageUrls={postImageUrlMap[selectedPost.id]}
          onBack={goBackOrHome}
          onCopyForX={handleCopyForX}
          onOpenX={handleOpenX}
          onMarkAsPosted={handleMarkAsPosted}
          onEdit={() => openEditComposer(selectedPost)}
          onDelete={handleDelete}
          onTagClick={(tag) => {
            setActiveTag(tag);
            pushHistoryState({ bocchiSns: true, view: "home" });
          }}
          onPostTypeChange={handlePostTypeChange}
          onPostOgpFetched={(post, ogp) => {
            if (ogp) updatePostOgp(post, ogp);
          }}
          isBusy={isBusy}
        />
        <ComposerModal
          isOpen={isComposerOpen}
          onClose={closeComposer}
          onSubmit={async () => {
            if (isEditorOpen && selectedPost) {
              const success = await updatePost(selectedPost.id, composerValue, selectedPost.source);
              if (success) replaceToDetail(selectedPost.id);
            } else {
              await handleSubmit();
            }
          }}
          value={composerValue}
          onChange={setComposerValue}
          onImagesSelect={handleImagesSelect}
          imageError={imageError}
          isBusy={isBusy}
          imagePreviewUrls={composerPreviewUrls}
        />
      </main>
    );
  }

  if (activeView === "share") {
    return (
      <main className="flex flex-col flex-1">
        <ShareImport
          onBack={goBackOrHome}
          onImport={handleImportShare}
          isBusy={isBusy}
        />
      </main>
    );
  }

  if (activeView === "settings") {
    return (
      <main className="flex flex-col flex-1">
        <SettingsView
          onBack={goBackOrHome}
          themeMode={themeMode}
          onThemeChange={setTheme}
          hidePostedInSourceTabs={hidePostedInSourceTabs}
          onHidePostedInSourceTabsChange={setHidePostedInSourceTabs}
        />
      </main>
    );
  }

  return (
    <main className="flex flex-col flex-1 relative">
      {/* 画像エラー表示エリア */}
      {imageError && (
        <div className="absolute top-20 left-0 right-0 z-50 px-4 pointer-events-none">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 shadow-lg pointer-events-auto">
            {imageError}
          </div>
        </div>
      )}

      {activeView === "home" && (
        <>
          <PostFeed
            posts={visiblePosts}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            activeTag={activeTag}
            availableTags={availableTags}
            onTagChange={setActiveTag}
            postImageUrlMap={postImageUrlMap}
            onPostClick={(id) => {
              pushHistoryState({ bocchiSns: true, view: "detail", postId: id });
            }}
            onPostTypeChange={handlePostTypeChange}
            onPostOgpFetched={(post, ogp) => {
              if (ogp) updatePostOgp(post, ogp);
            }}
            onPostDelete={deletePost}
            isBooting={isBooting}
            header={
              <AppHeader
                onRefresh={loadPosts}
                isBusy={isBusy}
                onTimelineTopRequest={requestTimelineTop}
                onSettingsClick={() => pushHistoryState({ bocchiSns: true, view: "settings" })}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            }
          />
        </>
      )}

      {activeView === "profile" && (
        <div className="p-10 text-center">プロフィール機能は準備中です。</div>
      )}

      <BottomNav
        activeView={activeView === "profile" ? "profile" : "home"}
        onViewChange={(view) => {
          if (view === "post") {
            openNewComposer();
          } else if (view === "home" && activeViewRef.current === "home") {
            requestTimelineTop();
          } else {
            setTimelineChromeHidden(false);
            pushHistoryState({ bocchiSns: true, view });
          }
        }}
        onPostClick={openNewComposer}
        onHomeClick={requestTimelineTop}
      />

      <ComposerModal
        isOpen={isComposerOpen}
        onClose={closeComposer}
        onSubmit={async () => {
          if (isEditorOpen && selectedPost) {
            const success = await updatePost(selectedPost.id, composerValue, selectedPost.source);
            if (success) replaceToDetail(selectedPost.id);
          } else {
            await handleSubmit();
          }
        }}
        value={composerValue}
        onChange={setComposerValue}
        onImagesSelect={handleImagesSelect}
        imageError={imageError}
        isBusy={isBusy}
        imagePreviewUrls={composerPreviewUrls}
      />
    </main>
  );
}
