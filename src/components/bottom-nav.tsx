"use client";

import { CalendarDays, Home, Plus, User } from "lucide-react";

type BottomNavProps = {
  activeView: "home" | "calendar" | "post" | "profile";
  onViewChange: (view: "home" | "calendar" | "post" | "profile") => void;
  onPostClick: () => void;
  onHomeClick?: () => void;
};

export function BottomNav({ activeView, onViewChange, onPostClick, onHomeClick }: BottomNavProps) {
  return (
    <>
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
        onClick={onPostClick}
        className="timeline-post-fab fixed bottom-20 right-[max(1rem,calc((100vw-28rem)/2+1rem))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-black/20 will-change-transform transition duration-[260ms] ease-out hover:bg-primary/90 active:scale-95"
        aria-label="新規ポスト"
      >
        <Plus size={28} />
      </button>
    </>
  );
}
