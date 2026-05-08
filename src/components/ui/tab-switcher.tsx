"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

type TabSwitcherProps = {
  tabs: Array<{ label: string; value: string }>;
  value: string;
  onChange: (nextTab: string) => void;
};

export function TabSwitcher({ tabs, value, onChange }: TabSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // メインタブ（最大3つ）とそれ以外（ドロップダウン行き）に分ける
  const mainTabs = tabs.slice(0, 3);
  const moreTabs = tabs.slice(3);

  // 現在の選択がドロップダウンの中にあるかどうか
  const activeMoreTab = moreTabs.find((t) => t.value === value);
  const isMoreActive = !!activeMoreTab;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-end justify-between border-b border-border">
      {/* メインタブ */}
      <div className="flex gap-4 sm:gap-6">
        {mainTabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                onChange(tab.value);
                setIsOpen(false);
              }}
              className={`pb-2 px-1 text-sm whitespace-nowrap transition-colors ${
                active
                  ? "text-foreground border-b-2 border-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* その他（ドロップダウン） */}
      {moreTabs.length > 0 && (
        <div className="relative pb-2" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center gap-1 px-1 text-sm whitespace-nowrap transition-colors ${
              isMoreActive
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isMoreActive ? (
              <>
                {activeMoreTab.label}
                <ChevronDown
                  size={16}
                  className={isOpen ? "rotate-180 transition-transform" : "transition-transform"}
                />
              </>
            ) : (
              <MoreHorizontal size={20} />
            )}
          </button>

          {/* アクティブな場合は下線表示 */}
          {isMoreActive && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
          )}

          {/* ドロップダウンメニュー */}
          {isOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              {moreTabs.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    onChange(tab.value);
                    setIsOpen(false);
                  }}
                  className={`block w-full px-4 py-3 text-left text-sm transition-colors ${
                    tab.value === value
                      ? "bg-primary/5 text-primary font-medium"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
