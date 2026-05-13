"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

type TabSwitcherProps = {
  tabs: Array<{
    label: string;
    value: string;
    count?: number;
    activeClassName?: string;
    activeCountClassName?: string;
    activeIndicatorClassName?: string;
    inactiveClassName?: string;
    inactiveCountClassName?: string;
  }>;
  value: string;
  onChange: (nextTab: string) => void;
};

export function TabSwitcher({ tabs, value, onChange }: TabSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const suppressNextOutsideClickRef = useRef(false);
  const suppressResetTimerRef = useRef<number | null>(null);

  // メインタブ（最大3つ）とそれ以外（ドロップダウン行き）に分ける
  const mainTabs = tabs.slice(0, 3);
  const moreTabs = tabs.slice(3);

  // 現在の選択がドロップダウンの中にあるかどうか
  const activeMoreTab = moreTabs.find((t) => t.value === value);
  const isMoreActive = !!activeMoreTab;

  useEffect(() => {
    const blockClickAfterClose = (event: MouseEvent) => {
      if (!suppressNextOutsideClickRef.current) return;
      if (dropdownRef.current?.contains(event.target as Node)) return;

      suppressNextOutsideClickRef.current = false;
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
        suppressResetTimerRef.current = null;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    document.addEventListener("click", blockClickAfterClose, true);
    return () => {
      document.removeEventListener("click", blockClickAfterClose, true);
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const closeBeforeBackgroundHandlesTap = (event: PointerEvent) => {
      if (dropdownRef.current?.contains(event.target as Node)) return;

      suppressNextOutsideClickRef.current = true;
      if (suppressResetTimerRef.current !== null) {
        window.clearTimeout(suppressResetTimerRef.current);
      }
      suppressResetTimerRef.current = window.setTimeout(() => {
        suppressNextOutsideClickRef.current = false;
        suppressResetTimerRef.current = null;
      }, 700);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeBeforeBackgroundHandlesTap, true);
    return () => {
      document.removeEventListener("pointerdown", closeBeforeBackgroundHandlesTap, true);
    };
  }, [isOpen]);

  return (
    <div className="min-w-0 overflow-visible border-b border-border">
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="flex min-w-0 items-end gap-4 sm:gap-6">
          {mainTabs.map((tab) => {
            const active = tab.value === value;
            const activeClassName = tab.activeClassName ?? "text-foreground border-primary";
            const activeCountClassName = tab.activeCountClassName ?? "bg-primary/12 text-primary";
            const inactiveClassName = tab.inactiveClassName ?? "text-muted-foreground hover:text-foreground";
            const inactiveCountClassName = tab.inactiveCountClassName ?? "bg-secondary text-muted-foreground";
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  onChange(tab.value);
                  setIsOpen(false);
                }}
                className={`inline-flex min-w-0 items-center justify-center pb-2 px-1 whitespace-nowrap transition-colors ${
                  active
                    ? `border-b-2 font-medium ${activeClassName}`
                    : inactiveClassName
                }`}
                style={{ fontSize: 12, lineHeight: "17px" }}
              >
                <span className="truncate">{tab.label}</span>
                {typeof tab.count === "number" && (
                  <span className={`ml-1 shrink-0 rounded-full px-1.5 py-[1px] text-[11px] leading-none ${
                    active ? activeCountClassName : inactiveCountClassName
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {moreTabs.length > 0 && (
          <div className="relative shrink-0 pb-2" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                isMoreActive
                  ? activeMoreTab.activeCountClassName ?? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              aria-label="その他のタブ"
            >
              {isMoreActive ? (
                <ChevronDown
                  size={16}
                  className={isOpen ? "rotate-180 transition-transform" : "transition-transform"}
                />
              ) : (
                <MoreHorizontal size={20} />
              )}
            </button>

            {isMoreActive && (
              <div className={`absolute bottom-0 left-1 right-1 h-[2px] ${activeMoreTab.activeIndicatorClassName ?? "bg-primary"}`} />
            )}

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
                      className={`flex w-full items-center px-4 py-3 text-left text-sm transition-colors ${
                        tab.value === value
                          ? `font-medium ${tab.activeCountClassName ?? "bg-primary/5 text-primary"}`
                          : tab.inactiveClassName ?? "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" && (
                        <span className={`ml-2 rounded-full px-1.5 py-[1px] text-[11px] leading-none ${
                          tab.value === value
                            ? tab.activeCountClassName ?? "bg-primary/12 text-primary"
                            : tab.inactiveCountClassName ?? "bg-secondary text-muted-foreground"
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
