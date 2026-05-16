"use client";

import { useState } from "react";
import { Search, RefreshCcw, X } from "lucide-react";

type AppHeaderProps = {
  onRefresh: () => void | Promise<void>;
  onTimelineTopRequest: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isBusy?: boolean;
};

export function AppHeader({
  onRefresh,
  onTimelineTopRequest,
  searchQuery,
  onSearchChange,
  isBusy,
}: AppHeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRefreshActive = isBusy || isRefreshing;

  const handleRefresh = async () => {
    onTimelineTopRequest();
    setIsRefreshing(true);
    try {
      await Promise.all([
        Promise.resolve(onRefresh()),
        new Promise((resolve) => setTimeout(resolve, 450)),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between px-4 py-2">
        <h1 className="text-lg font-normal text-foreground">Hollog</h1>
        <div className="flex items-center gap-2">
          {/*
            ネイティブアプリ化した時に共有シートから受け取るための入口。
            Web版では不要なので、外部から保存ボタンは非表示にしておく。
          */}
          <button
            onClick={() => setIsSearchOpen((prev) => !prev)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-muted hover:text-foreground active:scale-95 ${
              isSearchOpen || searchQuery ? "text-foreground" : "text-muted-foreground"
            }`}
            title="検索"
          >
            {isSearchOpen ? <X size={20} /> : <Search size={20} />}
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshActive}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            title="更新"
          >
            <RefreshCcw size={20} className={isRefreshActive ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
      {isSearchOpen && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-1.5">
            <Search size={16} className="shrink-0 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="本文・URL・タグを検索"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95"
                aria-label="検索をクリア"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
