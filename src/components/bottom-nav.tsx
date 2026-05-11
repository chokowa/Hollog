"use client";

import { CalendarDays, Camera, Clipboard, Home, ImagePlus, Plus, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type BottomNavProps = {
  activeView: "home" | "calendar" | "post" | "profile";
  onViewChange: (view: "home" | "calendar" | "post" | "profile") => void;
  onPostClick: () => void;
  onHomeClick?: () => void;
  onQuickImagePost?: () => void;
  onQuickCameraPost?: () => void;
  onQuickClipboardPost?: () => void;
};

const LONG_PRESS_MS = 420;

export function BottomNav({
  activeView,
  onViewChange,
  onPostClick,
  onHomeClick,
  onQuickImagePost,
  onQuickCameraPost,
  onQuickClipboardPost,
}: BottomNavProps) {
  const [isQuickMenuOpen, setIsQuickMenuOpen] = useState(false);
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const hasQuickActions = Boolean(onQuickImagePost || onQuickCameraPost || onQuickClipboardPost);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const openQuickMenu = useCallback(() => {
    if (!hasQuickActions) return;
    didLongPressRef.current = true;
    setIsQuickMenuOpen(true);
    if (navigator.vibrate) {
      navigator.vibrate(12);
    }
  }, [hasQuickActions]);

  const runQuickAction = useCallback((action?: () => void) => {
    setIsQuickMenuOpen(false);
    action?.();
  }, []);

  useEffect(() => {
    const suppressOutsideClick = (event: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    window.addEventListener("click", suppressOutsideClick, true);
    return () => window.removeEventListener("click", suppressOutsideClick, true);
  }, []);

  useEffect(() => {
    if (!isQuickMenuOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (quickMenuRef.current?.contains(target) || fabRef.current?.contains(target)) return;
      suppressNextClickRef.current = true;
      setIsQuickMenuOpen(false);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    window.addEventListener("pointerdown", closeOnOutsidePointerDown, true);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePointerDown, true);
  }, [isQuickMenuOpen]);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setIsQuickMenuOpen(false);
      suppressNextClickRef.current = false;
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [activeView]);

  return (
    <>
      {isQuickMenuOpen && (
        <div
          className="fixed inset-0 z-40 cursor-default bg-transparent"
          aria-hidden="true"
        />
      )}

      {isQuickMenuOpen && (
        <div ref={quickMenuRef} className="fixed bottom-36 right-[max(1rem,calc((100vw-28rem)/2+1rem))] z-50 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => runQuickAction(onQuickImagePost)}
            className="flex h-11 min-w-28 items-center justify-end gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-lg shadow-black/20 active:scale-95"
          >
            <span>画像</span>
            <ImagePlus size={18} />
          </button>
          <button
            type="button"
            onClick={() => runQuickAction(onQuickCameraPost)}
            className="flex h-11 min-w-28 items-center justify-end gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-lg shadow-black/20 active:scale-95"
          >
            <span>カメラ</span>
            <Camera size={18} />
          </button>
          <button
            type="button"
            onClick={() => runQuickAction(onQuickClipboardPost)}
            className="flex h-11 min-w-28 items-center justify-end gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-lg shadow-black/20 active:scale-95"
          >
            <span>クリップボード</span>
            <Clipboard size={18} />
          </button>
        </div>
      )}

      <nav
        className="timeline-bottom-nav fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-border bg-card/95 pb-safe will-change-transform transition-transform duration-[260ms] ease-out"
      >
        <div className="grid grid-cols-3 px-6">
          <button
            onClick={() => {
              if (activeView === "home") {
                onHomeClick?.();
                return;
              }
              onViewChange("home");
            }}
            className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 ${
              activeView === "home" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Home size={21} />
            <span className="text-[10px] font-medium text-inherit">ホーム</span>
          </button>

          <button
            onClick={() => onViewChange("calendar")}
            className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 ${
              activeView === "calendar" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <CalendarDays size={21} />
            <span className="text-[10px] font-medium text-inherit">カレンダー</span>
          </button>

          <button
            onClick={() => onViewChange("profile")}
            className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl transition active:scale-95 ${
              activeView === "profile" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <User size={21} />
            <span className="text-[10px] font-medium text-inherit">プロフィール</span>
          </button>
        </div>
      </nav>

      <button
        ref={fabRef}
        onPointerDown={(event) => {
          if (!hasQuickActions || (event.pointerType === "mouse" && event.button !== 0)) return;
          clearLongPressTimer();
          didLongPressRef.current = false;
          longPressTimerRef.current = window.setTimeout(openQuickMenu, LONG_PRESS_MS);
        }}
        onPointerUp={clearLongPressTimer}
        onPointerCancel={clearLongPressTimer}
        onPointerLeave={clearLongPressTimer}
        onClick={(event) => {
          clearLongPressTimer();
          if (didLongPressRef.current) {
            event.preventDefault();
            didLongPressRef.current = false;
            return;
          }
          setIsQuickMenuOpen(false);
          onPostClick();
        }}
        className="timeline-post-fab fixed bottom-20 right-[max(1rem,calc((100vw-28rem)/2+1rem))] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 will-change-transform transition duration-[260ms] ease-out hover:bg-primary/90 active:scale-95"
        aria-label="新規ポスト"
      >
        <Plus size={28} />
      </button>
    </>
  );
}
